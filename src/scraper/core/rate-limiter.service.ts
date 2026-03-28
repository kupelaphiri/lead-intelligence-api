import { Injectable } from '@nestjs/common';

@Injectable()
export class RateLimiterService {
  /** Tracks the timestamp of the last request per domain. */
  private readonly lastRequest = new Map<string, number>();

  /**
   * Wait until it is safe to make a request to the given URL's domain.
   * Default minimum gap between requests to the same domain: 1 second.
   */
  async throttle(url: string, minDelayMs = 1000): Promise<void> {
    const domain = this.extractDomain(url);
    if (!domain) return;

    const last = this.lastRequest.get(domain) ?? 0;
    const now = Date.now();
    const elapsed = now - last;

    if (elapsed < minDelayMs) {
      const wait = minDelayMs - elapsed + Math.floor(Math.random() * 300);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }

    this.lastRequest.set(domain, Date.now());
  }

  /**
   * Record that a request was just made to this URL (without waiting).
   */
  touch(url: string): void {
    const domain = this.extractDomain(url);
    if (domain) {
      this.lastRequest.set(domain, Date.now());
    }
  }

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
}
