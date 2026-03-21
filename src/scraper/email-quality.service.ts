import { Injectable } from '@nestjs/common';

export interface EmailAssessment {
  email: string;
  score: number;
  quality: 'high' | 'medium' | 'low' | 'suppressed';
  suppressed: boolean;
  reasons: string[];
}

@Injectable()
export class EmailQualityService {
  private readonly syntaxRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
  private readonly suppressedLocalPartPatterns = [
    /^no-?reply$/,
    /^do-?not-?reply$/,
    /^test$/,
    /^example$/,
    /^dummy$/,
  ];
  private readonly disposableDomains = new Set([
    'mailinator.com',
    'guerrillamail.com',
    '10minutemail.com',
    'temp-mail.org',
    'tempmail.com',
    'yopmail.com',
  ]);
  private readonly freeEmailDomains = new Set([
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'live.com',
    'icloud.com',
    'aol.com',
    'proton.me',
    'protonmail.com',
  ]);
  private readonly roleBasedLocalParts = new Set([
    'info',
    'sales',
    'hello',
    'support',
    'contact',
    'admin',
    'office',
    'team',
    'marketing',
  ]);

  assess(email: string, businessWebsite?: string | null): EmailAssessment {
    const normalized = email.trim().toLowerCase();
    const reasons: string[] = [];

    if (!normalized || !this.syntaxRegex.test(normalized)) {
      return {
        email: normalized,
        score: 0,
        quality: 'suppressed',
        suppressed: true,
        reasons: ['invalid-format'],
      };
    }

    const [localPart, domain] = normalized.split('@');
    let score = 40;

    if (!localPart || !domain) {
      return {
        email: normalized,
        score: 0,
        quality: 'suppressed',
        suppressed: true,
        reasons: ['invalid-format'],
      };
    }

    if (
      this.suppressedLocalPartPatterns.some((pattern) =>
        pattern.test(localPart),
      )
    ) {
      reasons.push('suppressed-local-part');
      return {
        email: normalized,
        score: 0,
        quality: 'suppressed',
        suppressed: true,
        reasons,
      };
    }

    if (this.disposableDomains.has(domain)) {
      reasons.push('disposable-domain');
      return {
        email: normalized,
        score: 0,
        quality: 'suppressed',
        suppressed: true,
        reasons,
      };
    }

    if (this.roleBasedLocalParts.has(localPart)) {
      score -= 10;
      reasons.push('role-based');
    } else {
      score += 15;
      reasons.push('person-like');
    }

    if (this.freeEmailDomains.has(domain)) {
      score -= 10;
      reasons.push('free-provider');
    }

    const businessDomainMatch = this.matchesBusinessDomain(
      domain,
      businessWebsite,
    );
    if (businessDomainMatch) {
      score += 20;
      reasons.push('domain-match');
    } else if (businessWebsite) {
      score -= 5;
      reasons.push('domain-mismatch');
    }

    const quality = score >= 65 ? 'high' : score >= 45 ? 'medium' : 'low';

    return {
      email: normalized,
      score: Math.max(0, Math.min(score, 100)),
      quality,
      suppressed: false,
      reasons,
    };
  }

  private matchesBusinessDomain(
    emailDomain: string,
    businessWebsite?: string | null,
  ): boolean {
    if (!businessWebsite) {
      return false;
    }

    try {
      const websiteHost = new URL(
        businessWebsite.startsWith('http')
          ? businessWebsite
          : `https://${businessWebsite}`,
      ).hostname
        .toLowerCase()
        .replace(/^www\./, '');

      return (
        emailDomain === websiteHost || emailDomain.endsWith(`.${websiteHost}`)
      );
    } catch {
      return false;
    }
  }
}
