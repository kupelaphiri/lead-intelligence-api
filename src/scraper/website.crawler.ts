import axios from 'axios';
import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';

export interface CrawledPage {
  url: string;
  html: string;
}

@Injectable()
export class WebsiteCrawler {
  private readonly logger = new Logger(WebsiteCrawler.name);
  private readonly preferredKeywords = ['contact', 'about', 'team', 'support'];
  private readonly maxPages = 10;

  async crawl(startUrl: string): Promise<CrawledPage[]> {
    const normalizedStart = this.normalizeUrl(startUrl);
    if (!normalizedStart) {
      return [];
    }

    const pages: CrawledPage[] = [];
    const queue: string[] = [normalizedStart];
    const visited = new Set<string>();

    while (queue.length > 0 && pages.length < this.maxPages) {
      const currentUrl = queue.shift();
      if (!currentUrl || visited.has(currentUrl)) {
        continue;
      }

      visited.add(currentUrl);

      try {
        const response = await axios.get<string>(currentUrl, {
          timeout: 10000,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          },
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 400,
        });

        const html = response.data;
        pages.push({ url: currentUrl, html });

        const nextLinks = this.extractInternalLinks(currentUrl, html);
        const sortedLinks = this.sortByPriority(nextLinks);

        for (const link of sortedLinks) {
          if (!visited.has(link) && !queue.includes(link)) {
            queue.push(link);
          }
          if (queue.length + pages.length >= this.maxPages * 2) {
            break;
          }
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
        rawHref.startsWith('tel:')
      ) {
        return;
      }

      try {
        const resolved = new URL(rawHref, baseUrl);
        if (resolved.hostname !== base.hostname) {
          return;
        }

        resolved.hash = '';
        links.add(resolved.toString());
      } catch {
        return;
      }
    });

    return [...links];
  }

  private sortByPriority(links: string[]): string[] {
    return links.sort((a, b) => this.priorityScore(a) - this.priorityScore(b));
  }

  private priorityScore(url: string): number {
    const lower = url.toLowerCase();
    const index = this.preferredKeywords.findIndex((keyword) =>
      lower.includes(keyword),
    );
    return index === -1 ? this.preferredKeywords.length : index;
  }

  private normalizeUrl(rawUrl: string): string | null {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return null;
    }

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
