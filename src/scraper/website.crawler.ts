import axios from 'axios';
import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { AntiDetectionService } from './core/anti-detection.service';
import { ProxyService } from './core/proxy.service';
import { RateLimiterService } from './core/rate-limiter.service';

export interface CrawledPage {
  url: string;
  html: string;
}

@Injectable()
export class WebsiteCrawler {
  private readonly logger = new Logger(WebsiteCrawler.name);

  /** Pages whose URL path contains any of these keywords are crawled first. */
  private readonly priorityKeywords = [
    'contact',
    'about',
    'team',
    'leadership',
    'founder',
    'staff',
    'our-people',
    'meet-the-team',
    'our-story',
    'who-we-are',
    'management',
    'executives',
    'board',
    'people',
    'support',
    'directory',
  ];

  /** Pages whose URL path contains these keywords are skipped entirely. */
  private readonly skipKeywords = [
    'cdn-cgi',
    'wp-login',
    'wp-admin',
    'login',
    'register',
    'cart',
    'checkout',
    'privacy',
    'cookie',
    'terms',
    'legal',
    '.pdf',
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.svg',
    '.webp',
    '.css',
    '.js',
  ];

  private readonly maxPages = 20;

  constructor(
    private readonly antiDetection: AntiDetectionService,
    private readonly rateLimiter: RateLimiterService,
    private readonly proxyService: ProxyService,
  ) {}

  async crawl(startUrl: string): Promise<CrawledPage[]> {
    const normalizedStart = this.normalizeUrl(startUrl);
    if (!normalizedStart) return [];

    const pages: CrawledPage[] = [];
    const queue: string[] = [normalizedStart];
    const visited = new Set<string>();

    // Try to discover URLs from sitemap.xml first
    const sitemapUrls = await this.parseSitemap(normalizedStart);
    const prioritySitemapUrls = this.sortByPriority(sitemapUrls);
    for (const url of prioritySitemapUrls) {
      if (!queue.includes(url)) {
        queue.push(url);
      }
    }

    while (queue.length > 0 && pages.length < this.maxPages) {
      const currentUrl = queue.shift();
      if (!currentUrl || visited.has(currentUrl)) continue;

      if (this.shouldSkip(currentUrl)) {
        visited.add(currentUrl);
        continue;
      }

      visited.add(currentUrl);

      try {
        await this.rateLimiter.throttle(currentUrl, 600);

        const proxy = this.proxyService.next();
        const axiosProxy = proxy
          ? this.proxyService.toAxiosProxy(proxy)
          : undefined;

        const response = await axios.get<string>(currentUrl, {
          timeout: 12000,
          headers: this.antiDetection.httpHeaders(startUrl),
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 400,
          responseType: 'text',
          ...(axiosProxy ? { proxy: axiosProxy } : {}),
        });

        // Skip non-HTML responses
        const contentType = String(response.headers['content-type'] ?? '');
        if (!contentType.includes('html')) continue;

        const html = String(response.data);
        pages.push({ url: currentUrl, html });

        const nextLinks = this.extractInternalLinks(currentUrl, html);
        const sortedLinks = this.sortByPriority(nextLinks);

        for (const link of sortedLinks) {
          if (!visited.has(link) && !queue.includes(link)) {
            queue.push(link);
          }
          if (queue.length + pages.length >= this.maxPages * 2) break;
        }
      } catch (error) {
        this.logger.debug(
          `Crawler failed for ${currentUrl}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    return pages;
  }

  private extractInternalLinks(baseUrl: string, html: string): string[] {
    const $ = cheerio.load(html);
    const base = new URL(baseUrl);
    const links = new Set<string>();

    $('a[href]').each((_, element) => {
      const rawHref = ($(element).attr('href') ?? '').trim();

      if (
        !rawHref ||
        rawHref.startsWith('mailto:') ||
        rawHref.startsWith('tel:') ||
        rawHref.startsWith('javascript:') ||
        rawHref.startsWith('#')
      ) {
        return;
      }

      try {
        const resolved = new URL(rawHref, baseUrl);
        if (resolved.hostname !== base.hostname) return;
        resolved.hash = '';
        // Strip query strings from non-priority pages to reduce duplicates
        const pathLower = resolved.pathname.toLowerCase();
        const isPriority = this.priorityKeywords.some((kw) =>
          pathLower.includes(kw),
        );
        if (!isPriority) resolved.search = '';
        links.add(resolved.toString());
      } catch {
        // ignore malformed hrefs
      }
    });

    // Also follow canonical / next-page links
    $('link[rel="canonical"], link[rel="next"]').each((_, element) => {
      const href = ($(element).attr('href') ?? '').trim();
      try {
        const resolved = new URL(href, baseUrl);
        if (resolved.hostname === base.hostname) {
          resolved.hash = '';
          links.add(resolved.toString());
        }
      } catch {
        // ignore
      }
    });

    return [...links];
  }

  private sortByPriority(links: string[]): string[] {
    return [...links].sort((a, b) => this.priorityScore(a) - this.priorityScore(b));
  }

  private priorityScore(url: string): number {
    const lower = url.toLowerCase();
    const index = this.priorityKeywords.findIndex((keyword) =>
      lower.includes(keyword),
    );
    return index === -1 ? this.priorityKeywords.length : index;
  }

  private shouldSkip(url: string): boolean {
    const lower = url.toLowerCase();
    return this.skipKeywords.some((kw) => lower.includes(kw));
  }

  /**
   * Attempt to fetch and parse sitemap.xml from the site root.
   * Returns internal URLs found in the sitemap, filtered to priority pages.
   */
  private async parseSitemap(startUrl: string): Promise<string[]> {
    try {
      const base = new URL(startUrl);
      const sitemapUrl = `${base.origin}/sitemap.xml`;

      const response = await axios.get<string>(sitemapUrl, {
        timeout: 8000,
        headers: this.antiDetection.httpHeaders(),
        maxRedirects: 3,
        validateStatus: (s) => s >= 200 && s < 400,
        responseType: 'text',
      });

      const xml = response.data;
      const urls: string[] = [];

      // Extract <loc> entries from sitemap XML
      const locRegex = /<loc>\s*(.*?)\s*<\/loc>/gi;
      let match: RegExpExecArray | null;
      while ((match = locRegex.exec(xml)) !== null) {
        const url = match[1];
        if (!url) continue;

        try {
          const parsed = new URL(url);
          if (parsed.hostname === base.hostname && !this.shouldSkip(url)) {
            urls.push(parsed.toString());
          }
        } catch {
          // ignore malformed URLs
        }
      }

      this.logger.debug(
        `Sitemap for ${base.origin}: found ${urls.length} URLs`,
      );
      return urls;
    } catch {
      // Sitemap not available or can't be parsed — that's fine
      return [];
    }
  }

  private normalizeUrl(rawUrl: string): string | null {
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;

    try {
      return new URL(trimmed).toString();
    } catch {
      try {
        return new URL(`https://${trimmed}`).toString();
      } catch {
        return null;
      }
    }
  }
}
