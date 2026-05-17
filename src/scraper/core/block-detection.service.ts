import { Injectable, Logger } from '@nestjs/common';

export type BlockSignal =
  | 'captcha'
  | 'unusual_traffic'
  | 'rate_limited'
  | 'forbidden'
  | 'soft_block'
  | 'empty_response';

export interface BlockInspectInput {
  source: string;
  url: string;
  statusCode?: number;
  html?: string;
  finalUrl?: string;
  resultCount?: number;
}

export interface BlockInspectResult {
  signal: BlockSignal | null;
  reason?: string;
}

@Injectable()
export class BlockDetectionService {
  private readonly logger = new Logger(BlockDetectionService.name);

  inspect(input: BlockInspectInput): BlockInspectResult {
    const result = this.detect(input);
    if (result.signal) {
      const parts: string[] = [
        `[block-detection] source=${input.source}`,
        `signal=${result.signal}`,
        `url=${input.url}`,
      ];
      if (input.statusCode !== undefined) parts.push(`status=${input.statusCode}`);
      if (input.finalUrl && input.finalUrl !== input.url) {
        parts.push(`finalUrl=${input.finalUrl}`);
      }
      if (typeof input.resultCount === 'number') {
        parts.push(`results=${input.resultCount}`);
      }
      if (result.reason) parts.push(`reason="${result.reason}"`);

      const message = parts.join(' ');
      // empty_response is a soft signal — could be a legitimate "no results"
      // or a stealth block. Log at debug to avoid alarming on sparse queries.
      if (result.signal === 'empty_response') {
        this.logger.debug(message);
      } else {
        this.logger.warn(message);
      }
    }
    return result;
  }

  private detect(input: BlockInspectInput): BlockInspectResult {
    const { statusCode, html, finalUrl, url, resultCount } = input;

    if (statusCode === 429) return { signal: 'rate_limited', reason: 'HTTP 429' };
    if (statusCode === 503) return { signal: 'rate_limited', reason: 'HTTP 503' };
    if (statusCode === 403) return { signal: 'forbidden', reason: 'HTTP 403' };

    const checkedUrl = (finalUrl ?? url).toLowerCase();
    if (
      checkedUrl.includes('/sorry/') ||
      checkedUrl.includes('consent.google') ||
      checkedUrl.includes('/interstitial') ||
      checkedUrl.includes('ipv4.google.com')
    ) {
      return { signal: 'soft_block', reason: 'redirected to Google interstitial' };
    }
    if (
      checkedUrl.includes('/captcha') ||
      checkedUrl.includes('/robot-check') ||
      checkedUrl.includes('/challenge')
    ) {
      return { signal: 'captcha', reason: 'redirected to captcha URL' };
    }

    if (html) {
      const lower = html.toLowerCase();

      if (
        lower.includes('g-recaptcha') ||
        lower.includes('recaptcha/api') ||
        lower.includes('h-captcha') ||
        lower.includes('hcaptcha.com')
      ) {
        return { signal: 'captcha', reason: 'captcha widget present in HTML' };
      }

      if (
        lower.includes('unusual traffic') ||
        lower.includes("verify you're not a robot") ||
        lower.includes('verify you are human') ||
        lower.includes('our systems have detected')
      ) {
        return { signal: 'unusual_traffic', reason: 'unusual-traffic interstitial' };
      }

      if (
        lower.includes('cf-browser-verification') ||
        lower.includes('cf-error-details') ||
        lower.includes('attention required! | cloudflare') ||
        lower.includes('checking your browser before accessing')
      ) {
        return { signal: 'soft_block', reason: 'Cloudflare challenge' };
      }

      if (
        lower.includes('access denied') ||
        lower.includes('you have been blocked') ||
        lower.includes('your access is restricted')
      ) {
        return { signal: 'forbidden', reason: 'access denied page' };
      }

      if (
        lower.includes('rate limit exceeded') ||
        lower.includes('too many requests')
      ) {
        return { signal: 'rate_limited', reason: 'rate-limit page' };
      }
    }

    if (
      resultCount === 0 &&
      typeof statusCode === 'number' &&
      statusCode >= 200 &&
      statusCode < 300
    ) {
      return { signal: 'empty_response', reason: 'parsed 0 results from a 2xx response' };
    }

    return { signal: null };
  }

  /** Whether a signal should halt further requests against the same source. */
  isHardBlock(signal: BlockSignal | null): boolean {
    return (
      signal === 'captcha' ||
      signal === 'unusual_traffic' ||
      signal === 'rate_limited' ||
      signal === 'forbidden' ||
      signal === 'soft_block'
    );
  }
}
