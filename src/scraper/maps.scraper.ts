import { Injectable, Logger } from '@nestjs/common';
import { chromium } from 'playwright';

export interface ScrapedBusiness {
  name: string;
  phone: string | null;
  website: string | null;
  city: string;
  category: string;
  rating: number | null;
  reviews: number | null;
  googleMapsUrl: string | null;
}

@Injectable()
export class MapsScraper {
  private readonly logger = new Logger(MapsScraper.name);

  async scrape(query: string, city: string): Promise<ScrapedBusiness[]> {
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
      await page.waitForTimeout(3000);

      const feed = page.locator('div[role="feed"]');
      if ((await feed.count()) > 0) {
        for (let i = 0; i < 10; i++) {
          await feed.first().evaluate((node) => {
            node.scrollBy(0, node.scrollHeight);
          });
          await page.waitForTimeout(1200);
        }
      }

      const cards = page.locator('div[role="article"]');
      const cardCount = Math.min(await cards.count(), 50);

      for (let i = 0; i < cardCount; i++) {
        const card = cards.nth(i);
        try {
          await card.click({ timeout: 5000 });
          await page.waitForTimeout(800);

          const details = await this.extractDetailsFromDetailsPane(page);
          if (!details.name) {
            continue;
          }

          collected.push({
            name: details.name,
            phone: details.phone,
            website: details.website,
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

      return this.uniqueByName(collected);
    } finally {
      await context.close();
      await browser.close();
    }
  }

  private async extractDetailsFromDetailsPane(page: {
    locator: (selector: string) => {
      first: () => {
        textContent: () => Promise<string | null>;
        getAttribute: (name: string) => Promise<string | null>;
      };
    };
  }): Promise<{
    name: string;
    website: string | null;
    phone: string | null;
    rating: number | null;
    reviews: number | null;
  }> {
    const safeText = async (selector: string): Promise<string | null> => {
      const text = await page.locator(selector).first().textContent();
      const cleaned = text?.trim();
      return cleaned && cleaned.length > 0 ? cleaned : null;
    };

    const name = (await safeText('h1.DUwDvf')) ?? '';

    const website =
      (await page
        .locator('a[data-item-id="authority"]')
        .first()
        .getAttribute('href')) ?? null;

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
      website,
      phone,
      rating: Number.isFinite(rating) ? rating : null,
      reviews: Number.isFinite(reviews) ? reviews : null,
    };
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
