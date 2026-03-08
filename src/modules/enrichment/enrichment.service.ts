import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailExtractor } from '../../scraper/email.extractor';
import { SocialExtractor } from '../../scraper/social.extractor';
import { WebsiteCrawler } from '../../scraper/website.crawler';

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly websiteCrawler: WebsiteCrawler,
    private readonly emailExtractor: EmailExtractor,
    private readonly socialExtractor: SocialExtractor,
  ) {}

  async enrichBusiness(businessId: number, website: string): Promise<void> {
    const pages = await this.websiteCrawler.crawl(website);
    if (pages.length === 0) {
      await this.saveResult(businessId, [], {
        instagram: null,
        facebook: null,
        linkedin: null,
      });
      this.logger.log(`Enrichment completed for business ${businessId}`);
      return;
    }

    const emails = new Set<string>();
    let instagram: string | null = null;
    let facebook: string | null = null;
    let linkedin: string | null = null;

    for (const page of pages) {
      for (const email of this.emailExtractor.extract(page.html)) {
        emails.add(email);
      }

      const social = this.socialExtractor.extract(page.html);
      instagram ??= social.instagram;
      facebook ??= social.facebook;
      linkedin ??= social.linkedin;
    }

    await this.saveResult(businessId, [...emails], {
      instagram,
      facebook,
      linkedin,
    });

    this.logger.log(`Enrichment completed for business ${businessId}`);
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
}
