import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ContactExtractor,
  ExtractedContact,
} from '../../scraper/contact.extractor';
import { EmailExtractor } from '../../scraper/email.extractor';
import { EmailQualityService } from '../../scraper/email-quality.service';
import { SocialExtractor } from '../../scraper/social.extractor';
import { StructuredDataExtractor } from '../../scraper/structured-data.extractor';
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
    private readonly contactExtractor: ContactExtractor,
    private readonly emailExtractor: EmailExtractor,
    private readonly emailQualityService: EmailQualityService,
    private readonly socialExtractor: SocialExtractor,
    private readonly structuredDataExtractor: StructuredDataExtractor,
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
    const contacts = new Map<string, ExtractedContact>();
    const socialProfiles: {
      instagram: string | null;
      facebook: string | null;
      linkedin: string | null;
      twitter: string | null;
      youtube: string | null;
      tiktok: string | null;
    } = {
      instagram: directSocialProfiles.instagram,
      facebook: directSocialProfiles.facebook,
      linkedin: directSocialProfiles.linkedin,
      twitter: null,
      youtube: null,
      tiktok: null,
    };

    for (const page of pages) {
      const structured = this.structuredDataExtractor.extract(
        page.html,
        page.url,
        website,
      );

      for (const email of this.emailExtractor.extract(page.html)) {
        const assessment = this.emailQualityService.assess(email, website);
        if (!assessment.suppressed) {
          emails.add(assessment.email);
        }
      }

      for (const email of structured.emails) {
        const assessment = this.emailQualityService.assess(email, website);
        if (!assessment.suppressed) {
          emails.add(assessment.email);
        }
      }

      for (const contact of this.contactExtractor.extract(
        page.html,
        page.url,
        website,
      )) {
        const normalizedContact = this.normalizeContact(contact, website);
        if (!normalizedContact) {
          continue;
        }

        if (normalizedContact.email) {
          emails.add(normalizedContact.email);
        }

        const contactKey = [
          normalizedContact.email ?? '',
          normalizedContact.linkedin ?? '',
          normalizedContact.name ?? '',
          normalizedContact.sourceUrl,
        ].join('|');
        const existing = contacts.get(contactKey);
        if (!existing || existing.confidence < normalizedContact.confidence) {
          contacts.set(contactKey, normalizedContact);
        }
      }

      for (const contact of structured.contacts) {
        const normalizedContact = this.normalizeContact(contact, website);
        if (!normalizedContact) {
          continue;
        }

        if (normalizedContact.email) {
          emails.add(normalizedContact.email);
        }

        const contactKey = [
          normalizedContact.email ?? '',
          normalizedContact.linkedin ?? '',
          normalizedContact.name ?? '',
          normalizedContact.sourceUrl,
        ].join('|');
        const existing = contacts.get(contactKey);
        if (!existing || existing.confidence < normalizedContact.confidence) {
          contacts.set(contactKey, normalizedContact);
        }
      }

      const social = this.socialExtractor.extract(page.html, page.url);
      socialProfiles.instagram ??=
        structured.socials.instagram ?? social.instagram;
      socialProfiles.facebook ??=
        structured.socials.facebook ?? social.facebook;
      socialProfiles.linkedin ??=
        structured.socials.linkedin ?? social.linkedin;
      socialProfiles.twitter ??= social.twitter;
      socialProfiles.youtube ??= social.youtube;
      socialProfiles.tiktok ??= social.tiktok;
    }

    await this.saveResult(businessId, [...emails], socialProfiles, [
      ...contacts.values(),
    ]);

    if (this.hasAnyData([...emails], socialProfiles, [...contacts.values()])) {
      this.logger.log(
        `Enrichment completed for business ${businessId}: emails=${emails.size}, contacts=${contacts.size}, instagram=${Boolean(
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
      twitter?: string | null;
      youtube?: string | null;
      tiktok?: string | null;
    },
    contacts: ExtractedContact[] = [],
  ): Promise<void> {
    await this.prisma.upsertEnrichment({
      businessId,
      emails,
      instagram: social.instagram,
      facebook: social.facebook,
      linkedin: social.linkedin,
      twitter: social.twitter ?? null,
      youtube: social.youtube ?? null,
      tiktok: social.tiktok ?? null,
    });

    await this.prisma.replaceBusinessContacts({
      businessId,
      contacts: contacts.map((contact) => ({
        name: contact.name,
        title: contact.title,
        email: contact.email,
        phone: contact.phone,
        linkedin: contact.linkedin,
        twitter: (contact as any).twitter ?? null,
        sourceUrl: contact.sourceUrl,
        sourceType: contact.sourceType,
        sourcePage: contact.sourcePage,
        emailType: contact.emailType,
        roleCategory: contact.roleCategory,
        domainMatches: contact.domainMatches,
        confidence: contact.confidence,
      })),
    });
  }

  private extractDirectSocialProfiles(website: string): {
    instagram: string | null;
    facebook: string | null;
    linkedin: string | null;
    twitter: string | null;
    youtube: string | null;
    tiktok: string | null;
  } {
    const normalized = this.normalizeUrl(website);
    if (!normalized) {
      return {
        instagram: null,
        facebook: null,
        linkedin: null,
        twitter: null,
        youtube: null,
        tiktok: null,
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
      twitter: null,
      youtube: null,
      tiktok: null,
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
    contacts: ExtractedContact[] = [],
  ): boolean {
    return Boolean(
      emails.length > 0 ||
      contacts.length > 0 ||
      social.instagram ||
      social.facebook ||
      social.linkedin,
    );
  }

  private normalizeContact(
    contact: ExtractedContact,
    website: string,
  ): ExtractedContact | null {
    if (!contact.email) {
      return contact.phone || contact.linkedin ? contact : null;
    }

    const assessment = this.emailQualityService.assess(contact.email, website);
    if (assessment.suppressed && !contact.phone && !contact.linkedin) {
      return null;
    }

    return {
      ...contact,
      email: assessment.suppressed ? null : assessment.email,
      confidence: Math.max(
        0,
        Math.min(
          assessment.suppressed
            ? contact.confidence - 30
            : Math.round((contact.confidence + assessment.score) / 2),
          100,
        ),
      ),
    };
  }
}
