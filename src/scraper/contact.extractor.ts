import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

export interface ExtractedContact {
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  sourceUrl: string;
  sourceType: string;
  sourcePage: string | null;
  emailType: string | null;
  roleCategory: string | null;
  domainMatches: boolean;
  confidence: number;
}

@Injectable()
export class ContactExtractor {
  private readonly emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  private readonly phoneRegex =
    /(?:\+?\d{1,3}[\s().-]*)?(?:\d[\s().-]*){7,15}/g;
  private readonly titleKeywords = [
    'owner',
    'founder',
    'co-founder',
    'ceo',
    'chief executive officer',
    'director',
    'managing director',
    'marketing',
    'head of',
    'manager',
    'sales',
    'business development',
    'principal',
  ];

  extract(
    html: string,
    sourceUrl: string,
    businessWebsite?: string,
  ): ExtractedContact[] {
    const $ = cheerio.load(html);
    const candidates = new Map<string, ExtractedContact>();
    const blocks = new Set<any>();

    $(
      '[href^="mailto:"], [href*="linkedin.com/"], .team, .member, .staff, .person',
    ).each((_, element) => {
      const block =
        $(element).closest(
          'article, section, li, div, tr, td, main, aside',
        )[0] ?? element;
      blocks.add(block);
    });

    if (blocks.size === 0) {
      $('main, body').each((_, element) => {
        blocks.add(element);
      });
    }

    for (const block of blocks) {
      const node = $(block);
      const text = this.cleanText(node.text());
      if (!text) {
        continue;
      }

      const email =
        this.extractFirstEmail(node.html() ?? '') ??
        this.extractFirstEmail(text);
      const linkedin = this.extractLinkedin(node, sourceUrl);
      const phone =
        this.extractFirstPhone(node.html() ?? '') ??
        this.extractFirstPhone(text);
      const title = this.extractTitle(text);
      const name = this.extractName(text, email);
      const sourcePage = this.classifySourcePage(sourceUrl);
      const emailType = this.classifyEmailType(email);
      const roleCategory = this.classifyRoleCategory(title);
      const domainMatches = this.domainMatchesBusiness(email, businessWebsite);

      if (!email && !linkedin && !phone) {
        continue;
      }

      const contact: ExtractedContact = {
        name,
        title,
        email,
        phone,
        linkedin,
        sourceUrl,
        sourceType: 'website',
        sourcePage,
        emailType,
        roleCategory,
        domainMatches,
        confidence: this.scoreContact({
          sourceUrl,
          name,
          title,
          email,
          phone,
          linkedin,
          sourcePage,
          emailType,
          roleCategory,
          domainMatches,
        }),
      };

      if (contact.confidence < 25) {
        continue;
      }

      const key = [
        contact.email ?? '',
        contact.linkedin ?? '',
        contact.name ?? '',
        contact.sourceUrl,
      ].join('|');
      const previous = candidates.get(key);
      if (!previous || previous.confidence < contact.confidence) {
        candidates.set(key, contact);
      }
    }

    return [...candidates.values()].sort((a, b) => b.confidence - a.confidence);
  }

  private extractFirstEmail(value: string): string | null {
    const match = value.match(this.emailRegex);
    if (!match) {
      return null;
    }

    return match[0]?.toLowerCase() ?? null;
  }

  private extractFirstPhone(value: string): string | null {
    const matches = value.match(this.phoneRegex);
    if (!matches) {
      return null;
    }

    const candidate = matches
      .map((match) => match.trim())
      .find((match) => match.replace(/\D/g, '').length >= 7);

    return candidate ?? null;
  }

  private extractLinkedin(
    node: cheerio.Cheerio<any>,
    sourceUrl: string,
  ): string | null {
    const href =
      node.find('a[href*="linkedin.com/"]').first().attr('href') ?? null;
    if (!href) {
      return null;
    }

    try {
      const url = new URL(href, sourceUrl);
      url.hash = '';
      return url.toString();
    } catch {
      return null;
    }
  }

  private extractTitle(text: string): string | null {
    const lowered = text.toLowerCase();
    const matches = this.titleKeywords.filter((keyword) =>
      lowered.includes(keyword),
    );
    if (matches.length === 0) {
      return null;
    }

    const lines = text
      .split('\n')
      .map((line) => this.cleanText(line))
      .filter(Boolean);

    for (const line of lines) {
      if (matches.some((keyword) => line.toLowerCase().includes(keyword))) {
        return line.slice(0, 120);
      }
    }

    return matches[0] ?? null;
  }

  private extractName(text: string, email: string | null): string | null {
    const lines = text
      .split('\n')
      .map((line) => this.cleanText(line))
      .filter(Boolean);

    for (const line of lines.slice(0, 6)) {
      if (line.length < 3 || line.length > 80) {
        continue;
      }

      if (email && line.toLowerCase().includes(email.toLowerCase())) {
        continue;
      }

      if (/[^A-Za-z.' -]/.test(line)) {
        continue;
      }

      const words = line.split(/\s+/).filter(Boolean);
      if (words.length < 2 || words.length > 4) {
        continue;
      }

      if (
        words.every(
          (word) =>
            /^[A-Z][A-Za-z.'-]+$/.test(word) ||
            ['de', 'van', 'von', 'da', 'di'].includes(word.toLowerCase()),
        )
      ) {
        return line;
      }
    }

    if (!email) {
      return null;
    }

    const localPart = email.split('@')[0] ?? '';
    const normalized = localPart.replace(/[._-]+/g, ' ').trim();
    if (
      !normalized ||
      /^(info|sales|hello|support|contact|admin)$/.test(normalized)
    ) {
      return null;
    }

    return normalized
      .split(/\s+/)
      .map((part) =>
        part.length > 1 ? part[0].toUpperCase() + part.slice(1) : part,
      )
      .join(' ');
  }

  private scoreContact(contact: {
    sourceUrl: string;
    name: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
    linkedin: string | null;
    sourcePage: string | null;
    emailType: string | null;
    roleCategory: string | null;
    domainMatches: boolean;
  }): number {
    let score = 10;
    const lowerUrl = contact.sourceUrl.toLowerCase();

    if (contact.email) {
      score += 35;

      if (contact.emailType === 'role-based') {
        score -= 10;
      } else {
        score += 10;
      }
    }

    if (contact.linkedin) {
      score += 20;
    }

    if (contact.phone) {
      score += 10;
    }

    if (contact.name) {
      score += 15;
    }

    if (contact.title) {
      score += 15;
    }

    if (contact.roleCategory === 'decision-maker') {
      score += 10;
    }

    if (contact.domainMatches) {
      score += 10;
    }

    if (contact.sourcePage === 'team' || contact.sourcePage === 'leadership') {
      score += 10;
    }

    if (
      ['team', 'about', 'leadership', 'founder', 'contact'].some((keyword) =>
        lowerUrl.includes(keyword),
      )
    ) {
      score += 10;
    }

    return Math.max(0, Math.min(score, 100));
  }

  private cleanText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private classifySourcePage(sourceUrl: string): string | null {
    const lower = sourceUrl.toLowerCase();

    if (lower.includes('leadership') || lower.includes('founder')) {
      return 'leadership';
    }

    if (
      ['team', 'staff', 'our-people', 'meet-the-team'].some((keyword) =>
        lower.includes(keyword),
      )
    ) {
      return 'team';
    }

    if (lower.includes('contact')) {
      return 'contact';
    }

    if (lower.includes('about') || lower.includes('our-story')) {
      return 'about';
    }

    return 'website';
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
}
