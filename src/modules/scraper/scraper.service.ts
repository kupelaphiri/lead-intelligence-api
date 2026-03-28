import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { AntiDetectionService } from '../../scraper/core/anti-detection.service';
import { ProxyService } from '../../scraper/core/proxy.service';
import { RateLimiterService } from '../../scraper/core/rate-limiter.service';
import { MapsScraper, ScrapedBusiness } from '../../scraper/maps.scraper';
import { YelpScraper } from '../../scraper/scrapers/yelp.scraper';
import { YellowPagesScraper } from '../../scraper/scrapers/yellowpages.scraper';
import { ScraperMode } from './dto/crawl-request.dto';
import { SelectorDefinition } from './dto/extract-request.dto';
import { BusinessSource } from './dto/business-search-request.dto';

export interface CrawledPageResult {
  url: string;
  title: string | null;
  text: string;
  html: string;
  statusCode: number;
  contentType: string | null;
}

export interface ExtractedData {
  url: string;
  data: Record<string, string | string[] | null>;
}

export interface ScreenshotResult {
  url: string;
  imageBase64: string;
  mimeType: 'image/png';
  width: number;
  height: number;
}

export interface BusinessSearchResult {
  source: string;
  businesses: ScrapedBusiness[];
  error?: string;
}

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  constructor(
    private readonly antiDetection: AntiDetectionService,
    private readonly proxyService: ProxyService,
    private readonly rateLimiter: RateLimiterService,
    private readonly mapsScraper: MapsScraper,
    private readonly yelpScraper: YelpScraper,
    private readonly yellowPagesScraper: YellowPagesScraper,
  ) {}

  // ───────────────────────────── Generic Crawl ──────────────────────────────

  async crawl(
    startUrl: string,
    maxPages = 10,
    mode: ScraperMode = ScraperMode.AUTO,
    waitForSelector?: string,
  ): Promise<CrawledPageResult[]> {
    const normalizedStart = this.normalizeUrl(startUrl);
    if (!normalizedStart) return [];

    const pages: CrawledPageResult[] = [];
    const queue = [normalizedStart];
    const visited = new Set<string>();

    while (queue.length > 0 && pages.length < maxPages) {
      const url = queue.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);

      try {
        await this.rateLimiter.throttle(url, 800);
        const page = await this.fetchPage(url, mode, waitForSelector);
        if (!page) continue;

        pages.push(page);

        // Discover internal links
        const links = this.extractInternalLinks(url, page.html);
        for (const link of links) {
          if (!visited.has(link) && !queue.includes(link)) {
            queue.push(link);
          }
        }
      } catch (error) {
        this.logger.debug(
          `Crawl error for ${url}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    return pages;
  }

  // ────────────────────────── Generic Extract ───────────────────────────────

  async extract(
    url: string,
    selectors: SelectorDefinition[],
    mode: ScraperMode = ScraperMode.AUTO,
    waitForSelector?: string,
  ): Promise<ExtractedData> {
    const normalized = this.normalizeUrl(url);
    if (!normalized) {
      return { url, data: {} };
    }

    const page = await this.fetchPage(normalized, mode, waitForSelector);
    if (!page) {
      return { url: normalized, data: {} };
    }

    const $ = cheerio.load(page.html);
    const data: Record<string, string | string[] | null> = {};

    for (const def of selectors) {
      const attr = def.attribute ?? 'text';

      if (def.multiple) {
        const values: string[] = [];
        $(def.selector).each((_, el) => {
          const value = this.extractAttribute($, el, attr);
          if (value) values.push(value);
        });
        data[def.name] = values.length > 0 ? values : null;
      } else {
        const el = $(def.selector).first();
        data[def.name] = el.length ? (this.extractAttribute($, el[0], attr) ?? null) : null;
      }
    }

    return { url: normalized, data };
  }

  // ─────────────────────────── Screenshot ───────────────────────────────────

  async screenshot(
    url: string,
    fullPage = true,
    width = 1280,
    height = 800,
  ): Promise<ScreenshotResult> {
    const normalized = this.normalizeUrl(url) ?? url;

    const proxy = this.proxyService.random();
    const browser = await chromium.launch({
      headless: true,
      args: this.antiDetection.stealthLaunchArgs(),
      ...(proxy ? { proxy: this.proxyService.toPlaywrightProxy(proxy) } : {}),
    });

    try {
      const ctx = await browser.newContext({
        userAgent: this.antiDetection.randomUserAgent(),
        viewport: { width, height },
      });
      await ctx.addInitScript(this.antiDetection.stealthInitScript());
      const page = await ctx.newPage();
      await page.goto(normalized, { waitUntil: 'networkidle', timeout: 30000 });

      const buffer = await page.screenshot({ fullPage, type: 'png' });
      const imageBase64 = buffer.toString('base64');

      return { url: normalized, imageBase64, mimeType: 'image/png', width, height };
    } finally {
      await browser.close();
    }
  }

  // ───────────────────────── Business Search ────────────────────────────────

  async searchBusinesses(
    query: string,
    location: string,
    limit = 20,
    sources: BusinessSource[] = [
      BusinessSource.GOOGLE_MAPS,
      BusinessSource.YELP,
      BusinessSource.YELLOW_PAGES,
    ],
  ): Promise<{ combined: ScrapedBusiness[]; bySource: BusinessSearchResult[] }> {
    const tasks = sources.map((source) =>
      this.scrapeSource(source, query, location, limit),
    );

    const results = await Promise.allSettled(tasks);
    const bySource: BusinessSearchResult[] = results.map((result, i) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        source: sources[i],
        businesses: [],
        error: result.reason instanceof Error ? result.reason.message : 'unknown error',
      };
    });

    const combined = this.mergeAndDeduplicate(
      bySource.flatMap((r) => r.businesses),
    );

    return { combined, bySource };
  }

  private async scrapeSource(
    source: BusinessSource,
    query: string,
    location: string,
    limit: number,
  ): Promise<BusinessSearchResult> {
    switch (source) {
      case BusinessSource.GOOGLE_MAPS: {
        const businesses = await this.mapsScraper.scrape(query, location, limit);
        return { source: BusinessSource.GOOGLE_MAPS, businesses };
      }
      case BusinessSource.YELP: {
        const businesses = await this.yelpScraper.scrape(query, location, limit);
        return { source: BusinessSource.YELP, businesses };
      }
      case BusinessSource.YELLOW_PAGES: {
        const businesses = await this.yellowPagesScraper.scrape(query, location, limit);
        return { source: BusinessSource.YELLOW_PAGES, businesses };
      }
    }
  }

  // ───────────────────────────── Internals ──────────────────────────────────

  private async fetchPage(
    url: string,
    mode: ScraperMode,
    waitForSelector?: string,
  ): Promise<CrawledPageResult | null> {
    if (mode === ScraperMode.PLAYWRIGHT) {
      return this.fetchWithPlaywright(url, waitForSelector);
    }

    if (mode === ScraperMode.AXIOS) {
      return this.fetchWithAxios(url);
    }

    // AUTO mode: try Axios first, fall back to Playwright if page looks JS-rendered
    const axiosResult = await this.fetchWithAxios(url);
    if (axiosResult && !this.looksJsRendered(axiosResult)) {
      return axiosResult;
    }

    this.logger.debug(
      `Auto-detected JS-rendered page at ${url}, falling back to Playwright`,
    );
    return this.fetchWithPlaywright(url, waitForSelector);
  }

  /**
   * Heuristic: detect pages that are likely JS-rendered SPAs
   * and returned an empty shell via Axios.
   */
  private looksJsRendered(page: CrawledPageResult): boolean {
    // Very little visible text = JS-rendered shell
    if (page.text.length < 150) return true;

    const html = page.html.toLowerCase();

    // Common SPA framework root divs with no content
    if (
      (html.includes('id="root"') || html.includes('id="app"') || html.includes('id="__next"')) &&
      page.text.length < 500
    ) {
      return true;
    }

    // Lots of script tags relative to content
    const scriptCount = (html.match(/<script[\s>]/g) ?? []).length;
    if (scriptCount > 5 && page.text.length < 300) return true;

    // Noscript warning present = page relies heavily on JS
    if (html.includes('<noscript') && page.text.length < 400) return true;

    return false;
  }

  private async fetchWithAxios(url: string): Promise<CrawledPageResult | null> {
    try {
      const proxy = this.proxyService.next();
      const axiosProxy = proxy
        ? this.proxyService.toAxiosProxy(proxy)
        : undefined;

      const response = await axios.get<string>(url, {
        timeout: 12000,
        headers: this.antiDetection.httpHeaders(),
        maxRedirects: 5,
        validateStatus: (s) => s < 500,
        responseType: 'text',
        ...(axiosProxy ? { proxy: axiosProxy } : {}),
      });

      const html = String(response.data);
      const $ = cheerio.load(html);
      const title = $('title').first().text().trim() || null;
      const text = $('body').text().replace(/\s+/g, ' ').trim();

      return {
        url,
        title,
        text,
        html,
        statusCode: response.status,
        contentType: String(response.headers['content-type'] ?? ''),
      };
    } catch {
      return null;
    }
  }

  private async fetchWithPlaywright(
    url: string,
    waitForSelector?: string,
  ): Promise<CrawledPageResult | null> {
    const proxy = this.proxyService.random();
    const browser = await chromium.launch({
      headless: true,
      args: this.antiDetection.stealthLaunchArgs(),
      ...(proxy ? { proxy: this.proxyService.toPlaywrightProxy(proxy) } : {}),
    });

    try {
      const viewport = this.antiDetection.jitteredViewport();
      const ctx = await browser.newContext({
        userAgent: this.antiDetection.randomUserAgent(),
        viewport,
      });
      await ctx.addInitScript(this.antiDetection.stealthInitScript());
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: 8000 }).catch(() => null);
      }

      await this.antiDetection.randomDelay(300, 800);

      const html = await page.content();
      const title = await page.title().catch(() => null);
      const text = await page
        .locator('body')
        .innerText()
        .catch(() => '');

      return {
        url: page.url(),
        title,
        text: text.replace(/\s+/g, ' ').trim(),
        html,
        statusCode: 200,
        contentType: 'text/html',
      };
    } catch {
      return null;
    } finally {
      await browser.close();
    }
  }

  private extractAttribute(
    $: cheerio.CheerioAPI,
    el: any,
    attr: string,
  ): string | null {
    if (attr === 'text') {
      return $(el).text().trim() || null;
    }
    if (attr === 'html') {
      return $(el).html() || null;
    }
    return $(el).attr(attr)?.trim() ?? null;
  }

  private extractInternalLinks(baseUrl: string, html: string): string[] {
    const $ = cheerio.load(html);
    const base = new URL(baseUrl);
    const links = new Set<string>();

    $('a[href]').each((_, el) => {
      const href = ($(el).attr('href') ?? '').trim();
      if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) return;

      try {
        const resolved = new URL(href, baseUrl);
        if (resolved.hostname !== base.hostname) return;
        resolved.hash = '';
        links.add(resolved.toString());
      } catch {
        // ignore
      }
    });

    return [...links];
  }

  private mergeAndDeduplicate(businesses: ScrapedBusiness[]): ScrapedBusiness[] {
    const seen = new Map<string, ScrapedBusiness>();

    for (const b of businesses) {
      const key = b.name.toLowerCase().trim();
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, b);
      } else {
        // Merge: prefer entries with more data
        seen.set(key, this.mergeBusiness(existing, b));
      }
    }

    return [...seen.values()];
  }

  private mergeBusiness(a: ScrapedBusiness, b: ScrapedBusiness): ScrapedBusiness {
    return {
      ...a,
      phone: a.phone ?? b.phone,
      website: a.website ?? b.website,
      enrichmentTarget: a.enrichmentTarget ?? b.enrichmentTarget,
      rating: a.rating ?? b.rating,
      reviews: a.reviews ?? b.reviews,
      googleMapsUrl: a.googleMapsUrl ?? b.googleMapsUrl,
    };
  }

  private normalizeUrl(raw: string): string | null {
    const trimmed = raw.trim();
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
