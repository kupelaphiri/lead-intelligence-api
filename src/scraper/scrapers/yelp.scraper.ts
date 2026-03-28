import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScrapedBusiness } from '../maps.scraper';
import { AntiDetectionService } from '../core/anti-detection.service';
import { RateLimiterService } from '../core/rate-limiter.service';

@Injectable()
export class YelpScraper {
  private readonly logger = new Logger(YelpScraper.name);
  private readonly baseUrl = 'https://www.yelp.com';

  constructor(
    private readonly antiDetection: AntiDetectionService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async scrape(
    query: string,
    location: string,
    maxResults = 50,
  ): Promise<ScrapedBusiness[]> {
    this.logger.log(`Yelp scrape: query="${query}" location="${location}"`);

    const collected: ScrapedBusiness[] = [];
    let offset = 0;
    const pageSize = 10;

    while (collected.length < maxResults) {
      const url = this.buildSearchUrl(query, location, offset);

      try {
        await this.rateLimiter.throttle(url, 2000);

        const response = await axios.get<string>(url, {
          timeout: 15000,
          headers: this.antiDetection.httpHeaders(this.baseUrl),
          maxRedirects: 5,
          validateStatus: (s) => s >= 200 && s < 400,
        });

        const businesses = this.parseSearchResults(
          response.data,
          location,
          query,
        );

        if (businesses.length === 0) {
          break;
        }

        collected.push(...businesses);
        offset += pageSize;

        if (businesses.length < pageSize) {
          break;
        }

        await this.antiDetection.randomDelay(1000, 2500);
      } catch (error) {
        this.logger.warn(
          `Yelp fetch failed for offset=${offset}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
        break;
      }
    }

    this.logger.log(`Yelp scrape complete: ${collected.length} businesses`);
    return this.deduplicate(collected).slice(0, maxResults);
  }

  private buildSearchUrl(query: string, location: string, offset: number): string {
    const params = new URLSearchParams({
      find_desc: query,
      find_loc: location,
      start: String(offset),
    });
    return `${this.baseUrl}/search?${params.toString()}`;
  }

  private parseSearchResults(
    html: string,
    city: string,
    category: string,
  ): ScrapedBusiness[] {
    const $ = cheerio.load(html);
    const businesses: ScrapedBusiness[] = [];

    // Yelp search result cards
    $('[data-testid="serp-ia-card"], .businessName, [class*="businessName"]').each((_, el) => {
      const card = $(el).closest('li, [class*="container"], [class*="result"]');
      const name = card.find('[class*="businessName"] a, h3 a').first().text().trim();
      if (!name) return;

      const website = this.extractWebsite(card);
      const phone = this.extractPhone(card);
      const rating = this.extractRating(card);
      const reviews = this.extractReviewCount(card);

      businesses.push({
        name,
        phone,
        website,
        enrichmentTarget: website,
        city,
        category,
        rating,
        reviews,
        googleMapsUrl: null,
      });
    });

    // Fallback: try script-based JSON-LD data
    if (businesses.length === 0) {
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const data = JSON.parse($(el).html() ?? '{}');
          const items: any[] = Array.isArray(data)
            ? data
            : data['@type'] === 'ItemList'
              ? (data.itemListElement ?? []).map((i: any) => i.item)
              : [];

          for (const item of items) {
            if (!item?.name) continue;
            const website = item.url ?? null;
            businesses.push({
              name: String(item.name),
              phone: item.telephone ?? null,
              website,
              enrichmentTarget: website,
              city,
              category,
              rating: item.aggregateRating?.ratingValue
                ? Number(item.aggregateRating.ratingValue)
                : null,
              reviews: item.aggregateRating?.reviewCount
                ? Number(item.aggregateRating.reviewCount)
                : null,
              googleMapsUrl: null,
            });
          }
        } catch {
          // ignore malformed JSON-LD
        }
      });
    }

    return businesses;
  }

  private extractWebsite(card: cheerio.Cheerio<any>): string | null {
    const href = card.find('a[href*="biz_redir"], a[href*="redirect_url"]').first().attr('href');
    if (!href) return null;

    try {
      const url = new URL(href, this.baseUrl);
      const target = url.searchParams.get('url') ?? url.searchParams.get('redirect_url');
      if (target) {
        return new URL(decodeURIComponent(target)).toString();
      }
    } catch {
      // ignore
    }
    return null;
  }

  private extractPhone(card: cheerio.Cheerio<any>): string | null {
    const text = card.find('[class*="phone"], p').filter((_, el) => {
      return /\d{3}[\s().-]\d{3}/.test(cheerio.load(el).text() ?? '');
    }).first().text().trim();
    return text || null;
  }

  private extractRating(card: cheerio.Cheerio<any>): number | null {
    const ratingEl = card.find('[aria-label*="star rating"], [class*="rating"]').first();
    const label = ratingEl.attr('aria-label') ?? ratingEl.text();
    const match = label?.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : null;
  }

  private extractReviewCount(card: cheerio.Cheerio<any>): number | null {
    const text = card.find('[class*="reviewCount"], a[href*="reviews"]').first().text();
    const match = text?.match(/(\d[\d,]*)/);
    return match ? parseInt(match[1].replace(/,/g, ''), 10) : null;
  }

  private deduplicate(items: ScrapedBusiness[]): ScrapedBusiness[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.name.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
