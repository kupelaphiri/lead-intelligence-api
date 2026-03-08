import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailExtractor {
  private readonly emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

  extract(content: string): string[] {
    const matches = content.match(this.emailRegex);
    if (!matches) {
      return [];
    }

    const normalized = matches.map((email) => email.toLowerCase());
    return [...new Set(normalized)];
  }
}
