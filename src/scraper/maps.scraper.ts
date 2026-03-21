import { Injectable, Logger } from '@nestjs/common';
import { chromium } from 'playwright';

export interface ScrapedBusiness {
  name: string;
  phone: string | null;
  website: string | null;
  enrichmentTarget: string | null;
  city: string;
  category: string;
  rating: number | null;
  reviews: number | null;
  googleMapsUrl: string | null;
}

@Injectable()
export class MapsScraper {
  private readonly logger = new Logger(MapsScraper.name);

  async scrape(
    query: string,
    city: string,
    maxResults = 100,
  ): Promise<ScrapedBusiness[]> {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const collected: ScrapedBusiness[] = [];

    try {
      const targetUrl = `https://www.google.com/maps/search/${encodeURIComponent(
        `${query} ${city}`,
      )}`;

      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(1500);

      const feed = page.locator('div[role="feed"]');
      if ((await feed.count()) > 0) {
        const scrollIterations = Math.max(6, Math.ceil(maxResults / 8));
        for (let i = 0; i < scrollIterations; i++) {
          await feed.first().evaluate((node) => {
            node.scrollBy(0, node.scrollHeight);
          });
          await page.waitForTimeout(700);
        }
      }

      const cards = page.locator('div[role="article"]');
      const cardCount = Math.min(await cards.count(), maxResults);

      for (let i = 0; i < cardCount; i++) {
        if (collected.length >= maxResults) {
          break;
        }

        const card = cards.nth(i);
        try {
          await card.click({ timeout: 3500 });
          await page.waitForTimeout(400);

          const details = await this.extractDetailsFromDetailsPane(page);
          if (!details.name) {
            continue;
          }

          collected.push({
            name: details.name,
            phone: details.phone,
            website: details.website,
            enrichmentTarget: details.enrichmentTarget,
            city,
            category: query,
            rating: details.rating,
            reviews: details.reviews,
            googleMapsUrl: page.url(),
          });
        } catch (error) {
          this.logger.debug(
            `Failed to parse map card ${i}: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        }
      }

      return this.uniqueByName(collected).slice(0, maxResults);
    } finally {
      await context.close();
      await browser.close();
    }
  }

  private async extractDetailsFromDetailsPane(page: {
    locator: (selector: string) => {
      first: () => {
        textContent: (options?: { timeout?: number }) => Promise<string | null>;
        getAttribute: (
          name: string,
          options?: { timeout?: number },
        ) => Promise<string | null>;
      };
    };
  }): Promise<{
    name: string;
    website: string | null;
    enrichmentTarget: string | null;
    phone: string | null;
    rating: number | null;
    reviews: number | null;
  }> {
    const safeText = async (
      selector: string,
      timeoutMs = 1200,
    ): Promise<string | null> => {
      try {
        const text = await page
          .locator(selector)
          .first()
          .textContent({ timeout: timeoutMs });
        const cleaned = text?.trim();
        return cleaned && cleaned.length > 0 ? cleaned : null;
      } catch {
        return null;
      }
    };

    const safeAttribute = async (
      selector: string,
      attribute: string,
      timeoutMs = 1200,
    ): Promise<string | null> => {
      try {
        const value = await page
          .locator(selector)
          .first()
          .getAttribute(attribute, { timeout: timeoutMs });
        const cleaned = value?.trim();
        return cleaned && cleaned.length > 0 ? cleaned : null;
      } catch {
        return null;
      }
    };

    const name = (await safeText('h1.DUwDvf', 2500)) ?? '';

    const authorityUrl = await safeAttribute(
      'a[data-item-id="authority"]',
      'href',
    );
    const classifiedAuthority = this.classifyAuthorityUrl(authorityUrl);

    const phone =
      (await safeText('button[data-item-id^="phone"] .Io6YTe')) ??
      (await safeText('button[data-item-id^="phone"]'));

    const ratingRaw = await safeText('div.F7nice span[aria-hidden="true"]');
    const reviewsRaw = await safeText('div.F7nice span span span');

    const rating = ratingRaw
      ? Number.parseFloat(ratingRaw.replace(',', '.'))
      : null;
    const reviews = reviewsRaw
      ? Number.parseInt(reviewsRaw.replace(/[^0-9]/g, ''), 10)
      : null;

    return {
      name,
      website: classifiedAuthority.website,
      enrichmentTarget: classifiedAuthority.enrichmentTarget,
      phone,
      rating: Number.isFinite(rating) ? rating : null,
      reviews: Number.isFinite(reviews) ? reviews : null,
    };
  }

  private classifyAuthorityUrl(authorityUrl: string | null): {
    website: string | null;
    enrichmentTarget: string | null;
  } {
    const normalized = this.normalizeUrl(authorityUrl);
    if (!normalized) {
      return {
        website: null,
        enrichmentTarget: null,
      };
    }

    if (this.isSocialDomain(normalized)) {
      return {
        website: null,
        enrichmentTarget: normalized,
      };
    }

    return {
      website: normalized,
      enrichmentTarget: normalized,
    };
  }

  private normalizeUrl(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const url = new URL(
        trimmed.startsWith('http') ? trimmed : `https://${trimmed}`,
      );
      url.hash = '';
      return url.toString();
    } catch {
      return null;
    }
  }

  private isSocialDomain(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      const socialDomains = [
        'facebook.com',
        'fb.com',
        'instagram.com',
        'linkedin.com',
      ];

      return socialDomains.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      );
    } catch {
      return false;
    }
  }

  private uniqueByName(items: ScrapedBusiness[]): ScrapedBusiness[] {
    const seen = new Set<string>();
    const output: ScrapedBusiness[] = [];

    for (const item of items) {
      const key = `${item.name.toLowerCase()}|${item.city.toLowerCase()}|${item.category.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      output.push(item);
    }

    return output;
  }
}
