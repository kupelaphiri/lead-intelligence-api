import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { ExtractedContact } from './contact.extractor';

interface StructuredDataResult {
  emails: string[];
  phones: string[];
  socials: {
    instagram: string | null;
    facebook: string | null;
    linkedin: string | null;
  };
  contacts: ExtractedContact[];
}

@Injectable()
export class StructuredDataExtractor {
  extract(
    html: string,
    sourceUrl: string,
    businessWebsite?: string,
  ): StructuredDataResult {
    const $ = cheerio.load(html);
    const contacts = new Map<string, ExtractedContact>();
    const emails = new Set<string>();
    const phones = new Set<string>();
    const socials = {
      instagram: null as string | null,
      facebook: null as string | null,
      linkedin: null as string | null,
    };

    $('script[type="application/ld+json"]').each((_, element) => {
      const content = $(element).html()?.trim();
      if (!content) {
        return;
      }

      for (const item of this.parseJsonLd(content)) {
        this.walkNode(item, (node) => {
          const email = this.extractEmail(node);
          const phone = this.extractPhone(node);

          if (email) {
            emails.add(email);
          }

          if (phone) {
            phones.add(phone);
          }

          const sameAsLinks = this.extractSameAs(node, sourceUrl);
          socials.instagram ??= sameAsLinks.instagram;
          socials.facebook ??= sameAsLinks.facebook;
          socials.linkedin ??= sameAsLinks.linkedin;

          const contact = this.extractContact(node, sourceUrl, businessWebsite);
          if (!contact) {
            return;
          }

          const key = [
            contact.email ?? '',
            contact.linkedin ?? '',
            contact.name ?? '',
            contact.sourceUrl,
          ].join('|');
          const previous = contacts.get(key);
          if (!previous || previous.confidence < contact.confidence) {
            contacts.set(key, contact);
          }
        });
      }
    });

    return {
      emails: [...emails],
      phones: [...phones],
      socials,
      contacts: [...contacts.values()].sort(
        (a, b) => b.confidence - a.confidence,
      ),
    };
  }

  private parseJsonLd(content: string): unknown[] {
    try {
      const parsed = JSON.parse(content) as unknown;
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }

  private walkNode(
    node: unknown,
    visitor: (value: Record<string, unknown>) => void,
  ): void {
    if (Array.isArray(node)) {
      for (const item of node) {
        this.walkNode(item, visitor);
      }
      return;
    }

    if (!node || typeof node !== 'object') {
      return;
    }

    const value = node as Record<string, unknown>;
    visitor(value);

    for (const child of Object.values(value)) {
      this.walkNode(child, visitor);
    }
  }

  private extractContact(
    node: Record<string, unknown>,
    sourceUrl: string,
    businessWebsite?: string,
  ): ExtractedContact | null {
    const type = this.readString(node['@type'])?.toLowerCase() ?? '';
    const name = this.readString(node.name);
    const title =
      this.readString(node.jobTitle) ??
      this.readString(node.roleName) ??
      this.readString(node.description);
    const email = this.extractEmail(node);
    const phone = this.extractPhone(node);
    const linkedin = this.extractPreferredSocial(node, 'linkedin', sourceUrl);

    if (
      !['person', 'employee', 'founder', 'organization', 'localbusiness'].some(
        (candidate) => type.includes(candidate),
      )
    ) {
      return null;
    }

    if (!name && !email && !linkedin && !phone) {
      return null;
    }

    const roleCategory = this.classifyRoleCategory(title);
    const emailType = this.classifyEmailType(email);
    const domainMatches = this.domainMatchesBusiness(email, businessWebsite);
    const confidence = this.scoreContact({
      type,
      name,
      title,
      email,
      phone,
      linkedin,
      roleCategory,
      emailType,
      domainMatches,
    });

    if (confidence < 30) {
      return null;
    }

    return {
      name,
      title,
      email,
      phone,
      linkedin,
      twitter: null,
      sourceUrl,
      sourceType: 'structured-data',
      sourcePage: 'structured-data',
      emailType,
      roleCategory,
      domainMatches,
      confidence,
    };
  }

  private extractSameAs(
    node: Record<string, unknown>,
    sourceUrl: string,
  ): StructuredDataResult['socials'] {
    return {
      instagram: this.extractPreferredSocial(node, 'instagram', sourceUrl),
      facebook: this.extractPreferredSocial(node, 'facebook', sourceUrl),
      linkedin: this.extractPreferredSocial(node, 'linkedin', sourceUrl),
    };
  }

  private extractPreferredSocial(
    node: Record<string, unknown>,
    platform: 'instagram' | 'facebook' | 'linkedin',
    sourceUrl: string,
  ): string | null {
    const values = this.readStringArray(node.sameAs);
    for (const value of values) {
      try {
        const url = new URL(value, sourceUrl);
        if (url.hostname.toLowerCase().includes(platform)) {
          return url.toString();
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private extractEmail(node: Record<string, unknown>): string | null {
    const email = this.readString(node.email);
    if (!email) {
      return null;
    }

    return email
      .replace(/^mailto:/i, '')
      .trim()
      .toLowerCase();
  }

  private extractPhone(node: Record<string, unknown>): string | null {
    return this.readString(node.telephone)?.trim() ?? null;
  }

  private classifyEmailType(email: string | null): string | null {
    if (!email) {
      return null;
    }

    const localPart = (email.split('@')[0] ?? '').toLowerCase();
    if (
      /^(info|sales|hello|support|contact|admin|office|team)$/.test(localPart)
    ) {
      return 'role-based';
    }

    return 'person-based';
  }

  private classifyRoleCategory(title: string | null): string | null {
    if (!title) {
      return null;
    }

    const lower = title.toLowerCase();
    if (
      ['owner', 'founder', 'co-founder', 'ceo', 'director', 'principal'].some(
        (keyword) => lower.includes(keyword),
      )
    ) {
      return 'decision-maker';
    }

    if (
      ['marketing', 'sales', 'business development'].some((keyword) =>
        lower.includes(keyword),
      )
    ) {
      return 'commercial';
    }

    if (['manager', 'head of'].some((keyword) => lower.includes(keyword))) {
      return 'manager';
    }

    return 'staff';
  }

  private domainMatchesBusiness(
    email: string | null,
    businessWebsite?: string,
  ): boolean {
    if (!email || !businessWebsite) {
      return false;
    }

    try {
      const emailDomain = email.split('@')[1]?.toLowerCase();
      const websiteHost = new URL(
        businessWebsite.startsWith('http')
          ? businessWebsite
          : `https://${businessWebsite}`,
      ).hostname
        .toLowerCase()
        .replace(/^www\./, '');

      if (!emailDomain) {
        return false;
      }

      return (
        emailDomain === websiteHost || emailDomain.endsWith(`.${websiteHost}`)
      );
    } catch {
      return false;
    }
  }

  private scoreContact(input: {
    type: string;
    name: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
    linkedin: string | null;
    roleCategory: string | null;
    emailType: string | null;
    domainMatches: boolean;
  }): number {
    let score = 20;

    if (input.type.includes('person') || input.type.includes('employee')) {
      score += 20;
    }

    if (input.email) {
      score += input.emailType === 'person-based' ? 25 : 10;
    }

    if (input.phone) {
      score += 10;
    }

    if (input.linkedin) {
      score += 10;
    }

    if (input.name) {
      score += 10;
    }

    if (input.roleCategory === 'decision-maker') {
      score += 10;
    }

    if (input.domainMatches) {
      score += 10;
    }

    return Math.max(0, Math.min(score, 100));
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }

    if (typeof value === 'string') {
      return [value];
    }

    return [];
  }
}
