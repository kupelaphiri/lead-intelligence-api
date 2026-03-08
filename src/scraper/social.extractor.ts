import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

export interface SocialProfiles {
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
}

@Injectable()
export class SocialExtractor {
  extract(html: string): SocialProfiles {
    const $ = cheerio.load(html);

    const links = $('a[href]')
      .map((_, element) => ($(element).attr('href') ?? '').trim())
      .get();

    return {
      instagram: this.findSocial(links, 'instagram.com'),
      facebook: this.findSocial(links, 'facebook.com'),
      linkedin: this.findSocial(links, 'linkedin.com'),
    };
  }

  private findSocial(links: string[], needle: string): string | null {
    const match = links.find((link) => link.includes(needle));
    return match ?? null;
  }
}
