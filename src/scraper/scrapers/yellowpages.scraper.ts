import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScrapedBusiness } from '../maps.scraper';
import { AntiDetectionService } from '../core/anti-detection.service';
import { RateLimiterService } from '../core/rate-limiter.service';

@Injectable()
export class YellowPagesScraper {
  private readonly logger = new Logger(YellowPagesScraper.name);
  private readonly baseUrl = 'https://www.yellowpages.com';

  constructor(
    private readonly antiDetection: AntiDetectionService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async scrape(
    query: string,
    location: string,
    maxResults = 50,
  ): Promise<ScrapedBusiness[]> {
    this.logger.log(
      `YellowPages scrape: query="${query}" location="${location}"`,
    );

    const collected: ScrapedBusiness[] = [];
    let page = 1;

    while (collected.length < maxResults) {
      const url = this.buildSearchUrl(query, location, page);

      try {
        await this.rateLimiter.throttle(url, 2500);

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
        page++;

        if (businesses.length < 5) {
          break;
        }

        await this.antiDetection.randomDelay(1200, 3000);
      } catch (error) {
        this.logger.warn(
          `YellowPages fetch failed for page=${page}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
        break;
      }
    }

    this.logger.log(`YellowPages scrape complete: ${collected.length} businesses`);
    return this.deduplicate(collected).slice(0, maxResults);
  }

  private buildSearchUrl(query: string, location: string, page: number): string {
    const params = new URLSearchParams({
      search_terms: query,
      geo_location_terms: location,
      page: String(page),
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

    $('.result, .organic, [class*="result "], .search-results .v-card').each((_, el) => {
      const card = $(el);

      const name = card
        .find('.business-name, h2.n, [class*="business-name"]')
        .first()
        .text()
        .trim();

      if (!name) return;

      const phone = this.normalizePhone(
        card.find('.phones, .phone, [class*="phone"]').first().text().trim(),
      );

      const website = this.extractWebsite(card);
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

    // Fallback: JSON-LD
    if (businesses.length === 0) {
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const data = JSON.parse($(el).html() ?? '{}');
          const nodes = Array.isArray(data) ? data : [data];

          for (const node of nodes) {
            if (!node?.name || node['@type'] === 'WebSite') continue;
            const website = node.url ?? null;
            businesses.push({
              name: String(node.name),
              phone: node.telephone ?? null,
              website,
              enrichmentTarget: website,
              city,
              category,
              rating: node.aggregateRating?.ratingValue
                ? Number(node.aggregateRating.ratingValue)
                : null,
              reviews: node.aggregateRating?.reviewCount
                ? Number(node.aggregateRating.reviewCount)
                : null,
              googleMapsUrl: null,
            });
          }
        } catch {
          // ignore
        }
      });
    }

    return businesses;
  }

  private extractWebsite(card: cheerio.Cheerio<any>): string | null {
    const href = card.find('a.track-visit-website, a[href*="http"]').first().attr('href');
    if (!href) return null;

    try {
      const url = new URL(href, this.baseUrl);
      // YellowPages wraps external links via /showmeurl.php?url=...
      const target =
        url.searchParams.get('url') ??
        url.searchParams.get('website') ??
        (href.startsWith('http') && !href.includes('yellowpages.com') ? href : null);

      if (target) {
        return new URL(decodeURIComponent(target)).toString();
      }
    } catch {
      // ignore
    }
    return null;
  }

  private extractRating(card: cheerio.Cheerio<any>): number | null {
    const label =
      card.find('[class*="star-rating"]').first().attr('title') ??
      card.find('[aria-label*="star"]').first().attr('aria-label');
    const match = label?.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : null;
  }

  private extractReviewCount(card: cheerio.Cheerio<any>): number | null {
    const text = card.find('.count, [class*="count"]').first().text();
    const match = text?.match(/(\d[\d,]*)/);
    return match ? parseInt(match[1].replace(/,/g, ''), 10) : null;
  }

  private normalizePhone(raw: string): string | null {
    if (!raw) return null;
    const cleaned = raw.replace(/[^\d+\s().-]/g, '').trim();
    return cleaned.length >= 7 ? cleaned : null;
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
