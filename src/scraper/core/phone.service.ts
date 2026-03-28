import { Injectable } from '@nestjs/common';
import {
  parsePhoneNumberFromString,
  CountryCode,
  PhoneNumber,
} from 'libphonenumber-js';

export interface NormalizedPhone {
  /** E.164 format, e.g. "+12025551234" */
  e164: string;
  /** National format, e.g. "(202) 555-1234" */
  national: string;
  /** International format, e.g. "+1 202-555-1234" */
  international: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "US" */
  country: string | null;
  /** Whether the number is valid according to libphonenumber */
  valid: boolean;
}

@Injectable()
export class PhoneService {
  private readonly defaultCountry: CountryCode =
    (process.env.DEFAULT_PHONE_COUNTRY as CountryCode) || 'US';

  /**
   * Parse and normalize a phone number string.
   * Returns null if the string cannot be parsed at all.
   */
  normalize(raw: string, countryHint?: string): NormalizedPhone | null {
    if (!raw || raw.trim().length < 5) return null;

    const cleaned = raw.replace(/[^\d+() .\-]/g, '').trim();

    const country = (countryHint as CountryCode) || this.defaultCountry;
    const parsed: PhoneNumber | undefined = parsePhoneNumberFromString(
      cleaned,
      country,
    );

    if (!parsed) return null;

    return {
      e164: parsed.format('E.164'),
      national: parsed.format('NATIONAL'),
      international: parsed.format('INTERNATIONAL'),
      country: parsed.country ?? null,
      valid: parsed.isValid(),
    };
  }

  /**
   * Attempt to extract and normalize the first valid phone number
   * from a block of text.
   */
  extractFirst(text: string, countryHint?: string): NormalizedPhone | null {
    const phoneRegex =
      /(?:\+?\d{1,3}[\s().-]*)?\(?\d{2,4}\)?[\s().-]*\d{2,4}[\s().-]*\d{2,9}/g;

    const matches = text.match(phoneRegex);
    if (!matches) return null;

    for (const match of matches) {
      const digits = match.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) continue;

      const result = this.normalize(match, countryHint);
      if (result) return result;
    }

    return null;
  }

  /**
   * Extract all valid phone numbers from text.
   */
  extractAll(text: string, countryHint?: string): NormalizedPhone[] {
    const phoneRegex =
      /(?:\+?\d{1,3}[\s().-]*)?\(?\d{2,4}\)?[\s().-]*\d{2,4}[\s().-]*\d{2,9}/g;

    const matches = text.match(phoneRegex);
    if (!matches) return [];

    const results: NormalizedPhone[] = [];
    const seen = new Set<string>();

    for (const match of matches) {
      const digits = match.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) continue;

      const result = this.normalize(match, countryHint);
      if (result && !seen.has(result.e164)) {
        seen.add(result.e164);
        results.push(result);
      }
    }

    return results;
  }
}
