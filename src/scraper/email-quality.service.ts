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
    /^bounce$/,
    /^postmaster$/,
    /^mailer-daemon$/,
    /^abuse$/,
    /^spam$/,
    /^webmaster$/,
  ];

  private readonly disposableDomains = new Set([
    'mailinator.com',
    'guerrillamail.com',
    '10minutemail.com',
    'temp-mail.org',
    'tempmail.com',
    'yopmail.com',
    'throwam.com',
    'sharklasers.com',
    'guerrillamailblock.com',
    'grr.la',
    'guerrillamail.info',
    'guerrillamail.biz',
    'guerrillamail.de',
    'guerrillamail.net',
    'guerrillamail.org',
    'spam4.me',
    'trashmail.at',
    'trashmail.com',
    'trashmail.io',
    'trashmail.me',
    'trashmail.net',
    'dispostable.com',
    'fakeinbox.com',
    'mailnull.com',
    'spamgourmet.com',
    'spamgourmet.net',
    'spamgourmet.org',
    'sspam.com',
    'jetable.fr.nf',
    'nomail.xl.cx',
    'maildrop.cc',
    'harakirimail.com',
    'mt2015.com',
  ]);

  private readonly freeEmailDomains = new Set([
    'gmail.com',
    'yahoo.com',
    'yahoo.co.uk',
    'yahoo.co.za',
    'yahoo.fr',
    'yahoo.de',
    'hotmail.com',
    'hotmail.co.uk',
    'hotmail.fr',
    'outlook.com',
    'outlook.co.za',
    'live.com',
    'live.co.uk',
    'msn.com',
    'icloud.com',
    'me.com',
    'mac.com',
    'aol.com',
    'proton.me',
    'protonmail.com',
    'pm.me',
    'zoho.com',
    'zohomail.com',
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
    'service',
    'help',
    'enquiries',
    'enquiry',
    'reception',
    'general',
    'mail',
    'booking',
    'bookings',
    'reservations',
    'billing',
    'accounts',
    'hr',
    'jobs',
    'careers',
    'press',
    'media',
    'privacy',
    'legal',
    'compliance',
    'security',
    'partnerships',
    'partner',
    'feedback',
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

    const [localPart, domain] = normalized.split('@') as [string, string];

    if (!localPart || !domain) {
      return {
        email: normalized,
        score: 0,
        quality: 'suppressed',
        suppressed: true,
        reasons: ['invalid-format'],
      };
    }

    // Hard suppressions
    if (
      this.suppressedLocalPartPatterns.some((pattern) =>
        pattern.test(localPart),
      )
    ) {
      return {
        email: normalized,
        score: 0,
        quality: 'suppressed',
        suppressed: true,
        reasons: ['suppressed-local-part'],
      };
    }

    if (this.disposableDomains.has(domain)) {
      return {
        email: normalized,
        score: 0,
        quality: 'suppressed',
        suppressed: true,
        reasons: ['disposable-domain'],
      };
    }

    // TLD sanity check — avoid numeric TLDs or very long ones
    const tld = domain.split('.').pop() ?? '';
    if (tld.length > 8 || /^\d+$/.test(tld)) {
      return {
        email: normalized,
        score: 0,
        quality: 'suppressed',
        suppressed: true,
        reasons: ['suspicious-tld'],
      };
    }

    let score = 40;

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

    // Bonus: short, clean local part suggests a real name (e.g. john.smith)
    if (/^[a-z]+\.[a-z]+$/.test(localPart) || /^[a-z]+_[a-z]+$/.test(localPart)) {
      score += 5;
      reasons.push('structured-name');
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
    if (!businessWebsite) return false;

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
