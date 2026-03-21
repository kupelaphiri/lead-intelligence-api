import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailExtractor } from '../../scraper/email.extractor';
import { SocialExtractor } from '../../scraper/social.extractor';
import { WebsiteCrawler } from '../../scraper/website.crawler';

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);
  private readonly socialDomains = {
    instagram: ['instagram.com'],
    facebook: ['facebook.com', 'fb.com'],
    linkedin: ['linkedin.com'],
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly websiteCrawler: WebsiteCrawler,
    private readonly emailExtractor: EmailExtractor,
    private readonly socialExtractor: SocialExtractor,
  ) {}

  async enrichBusiness(businessId: number, website: string): Promise<void> {
    const directSocialProfiles = this.extractDirectSocialProfiles(website);
    if (this.hasAnyData([], directSocialProfiles)) {
      await this.saveResult(businessId, [], directSocialProfiles);
      this.logger.log(
        `Enrichment completed for business ${businessId} using direct social URL`,
      );
      return;
    }

    const pages = await this.websiteCrawler.crawl(website);
    if (pages.length === 0) {
      const emptyResult = {
        instagram: null,
        facebook: null,
        linkedin: null,
      };

      await this.saveResult(businessId, [], emptyResult);
      this.logger.warn(
        `Enrichment finished for business ${businessId} but no crawlable pages or social profiles were found`,
      );
      return;
    }

    const emails = new Set<string>();
    const socialProfiles: {
      instagram: string | null;
      facebook: string | null;
      linkedin: string | null;
    } = {
      instagram: directSocialProfiles.instagram,
      facebook: directSocialProfiles.facebook,
      linkedin: directSocialProfiles.linkedin,
    };

    for (const page of pages) {
      for (const email of this.emailExtractor.extract(page.html)) {
        emails.add(email);
      }

      const social = this.socialExtractor.extract(page.html, page.url);
      socialProfiles.instagram ??= social.instagram;
      socialProfiles.facebook ??= social.facebook;
      socialProfiles.linkedin ??= social.linkedin;
    }

    await this.saveResult(businessId, [...emails], socialProfiles);

    if (this.hasAnyData([...emails], socialProfiles)) {
      this.logger.log(
        `Enrichment completed for business ${businessId}: emails=${emails.size}, instagram=${Boolean(
          socialProfiles.instagram,
        )}, facebook=${Boolean(socialProfiles.facebook)}, linkedin=${Boolean(
          socialProfiles.linkedin,
        )}`,
      );
      return;
    }

    this.logger.warn(
      `Enrichment completed for business ${businessId} but no relevant contact or social data was extracted from ${website}`,
    );
  }

  private async saveResult(
    businessId: number,
    emails: string[],
    social: {
      instagram: string | null;
      facebook: string | null;
      linkedin: string | null;
    },
  ): Promise<void> {
    await this.prisma.upsertEnrichment({
      businessId,
      emails,
      instagram: social.instagram,
      facebook: social.facebook,
      linkedin: social.linkedin,
    });
  }

  private extractDirectSocialProfiles(website: string): {
    instagram: string | null;
    facebook: string | null;
    linkedin: string | null;
  } {
    const normalized = this.normalizeUrl(website);
    if (!normalized) {
      return {
        instagram: null,
        facebook: null,
        linkedin: null,
      };
    }

    return {
      instagram: this.isSocialDomain(normalized, this.socialDomains.instagram)
        ? normalized
        : null,
      facebook: this.isSocialDomain(normalized, this.socialDomains.facebook)
        ? normalized
        : null,
      linkedin: this.isSocialDomain(normalized, this.socialDomains.linkedin)
        ? normalized
        : null,
    };
  }

  private normalizeUrl(value: string): string | null {
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

  private isSocialDomain(url: string, domains: readonly string[]): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return domains.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      );
    } catch {
      return false;
    }
  }

  private hasAnyData(
    emails: string[],
    social: {
      instagram: string | null;
      facebook: string | null;
      linkedin: string | null;
    },
  ): boolean {
    return Boolean(
      emails.length > 0 ||
      social.instagram ||
      social.facebook ||
      social.linkedin,
    );
  }
}
