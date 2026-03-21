import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

export interface SocialProfiles {
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
}

@Injectable()
export class SocialExtractor {
  private readonly platforms: Record<keyof SocialProfiles, string[]> = {
    instagram: ['instagram.com'],
    facebook: ['facebook.com', 'fb.com'],
    linkedin: ['linkedin.com'],
  };

  extract(html: string, baseUrl?: string): SocialProfiles {
    const $ = cheerio.load(html);
    const candidates = new Set<string>();

    $('a[href], link[href], meta[content]').each((_, element) => {
      const href = $(element).attr('href');
      const content = $(element).attr('content');

      if (href) {
        candidates.add(href.trim());
      }

      if (content) {
        candidates.add(content.trim());
      }
    });

    $('script').each((_, element) => {
      const content = $(element).html();
      if (content) {
        candidates.add(content);
      }
    });

    const links = [...candidates];

    return {
      instagram: this.findSocial(links, this.platforms.instagram, baseUrl),
      facebook: this.findSocial(links, this.platforms.facebook, baseUrl),
      linkedin: this.findSocial(links, this.platforms.linkedin, baseUrl),
    };
  }

  private findSocial(
    links: string[],
    needles: string[],
    baseUrl?: string,
  ): string | null {
    const matches = new Set<string>();

    for (const link of links) {
      for (const candidate of this.extractUrls(link, baseUrl)) {
        if (this.matchesPlatform(candidate, needles)) {
          matches.add(candidate);
        }
      }
    }

    const ranked = [...matches].sort(
      (a, b) => this.scoreUrl(a, needles) - this.scoreUrl(b, needles),
    );

    return ranked[0] ?? null;
  }

  private extractUrls(value: string, baseUrl?: string): string[] {
    const matches = value.match(
      /https?:\/\/[^\s"'<>]+|www\.[^\s"'<>]+|\/[A-Za-z0-9?=_%./-]+/g,
    );
    if (!matches) {
      return [];
    }

    const urls = new Set<string>();

    for (const match of matches) {
      const normalized = this.normalizeCandidate(match, baseUrl);
      if (normalized) {
        urls.add(normalized);
      }
    }

    return [...urls];
  }

  private normalizeCandidate(value: string, baseUrl?: string): string | null {
    const trimmed = value
      .trim()
      .replace(/&amp;/g, '&')
      .replace(/^['"(]+|['")]+$/g, '');

    if (
      !trimmed ||
      trimmed.startsWith('mailto:') ||
      trimmed.startsWith('tel:') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('javascript:')
    ) {
      return null;
    }

    try {
      const resolved = trimmed.startsWith('http')
        ? new URL(trimmed)
        : trimmed.startsWith('www.')
          ? new URL(`https://${trimmed}`)
          : baseUrl
            ? new URL(trimmed, baseUrl)
            : null;

      if (!resolved) {
        return null;
      }

      const redirected = this.unwrapRedirect(resolved);
      redirected.hash = '';
      return redirected.toString();
    } catch {
      return null;
    }
  }

  private unwrapRedirect(url: URL): URL {
    const redirectParamKeys = ['u', 'url', 'q'];

    for (const key of redirectParamKeys) {
      const value = url.searchParams.get(key);
      if (!value) {
        continue;
      }

      try {
        return new URL(decodeURIComponent(value));
      } catch {
        continue;
      }
    }

    return url;
  }

  private matchesPlatform(url: string, needles: string[]): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return needles.some(
        (needle) => hostname === needle || hostname.endsWith(`.${needle}`),
      );
    } catch {
      return false;
    }
  }

  private scoreUrl(url: string, needles: string[]): number {
    const lower = url.toLowerCase();
    let score = 0;

    if (lower.includes('/sharer') || lower.includes('/share')) {
      score += 50;
    }

    if (lower.includes('/dialog/')) {
      score += 50;
    }

    if (lower.includes('/intent/')) {
      score += 50;
    }

    if (needles.some((needle) => lower.includes(`www.${needle}`))) {
      score -= 2;
    }

    if (lower.includes('?')) {
      score += 5;
    }

    return score;
  }
}
