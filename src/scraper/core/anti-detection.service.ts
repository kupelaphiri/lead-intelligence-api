import { Injectable } from '@nestjs/common';
import { ALL_STEALTH_SCRIPTS } from './stealth.scripts';
import { getRandomUserAgent } from './user-agents';

export interface BrowserViewport {
  width: number;
  height: number;
}

const VIEWPORTS: BrowserViewport[] = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1536, height: 864 },
  { width: 1600, height: 900 },
];

@Injectable()
export class AntiDetectionService {
  randomDelay(minMs = 500, maxMs = 1500): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  randomUserAgent(): string {
    return getRandomUserAgent();
  }

  randomViewport(): BrowserViewport {
    return VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
  }

  /**
   * Slightly randomizes the target viewport to avoid fingerprinting.
   */
  jitteredViewport(base?: BrowserViewport): BrowserViewport {
    const viewport = base ?? this.randomViewport();
    return {
      width: viewport.width + Math.floor(Math.random() * 41) - 20,
      height: viewport.height + Math.floor(Math.random() * 41) - 20,
    };
  }

  /**
   * Returns browser launch args that reduce bot-detection signals.
   */
  stealthLaunchArgs(): string[] {
    return [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--allow-running-insecure-content',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ];
  }

  /**
   * Returns the combined stealth init script to inject into browser contexts.
   * Call `context.addInitScript(antiDetection.stealthInitScript())` after creating a context.
   */
  stealthInitScript(): string {
    return ALL_STEALTH_SCRIPTS;
  }

  /**
   * Realistic HTTP request headers for Axios-based scrapers.
   */
  httpHeaders(referer?: string): Record<string, string> {
    const ua = this.randomUserAgent();
    const headers: Record<string, string> = {
      'User-Agent': ua,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    };

    if (referer) {
      headers['Referer'] = referer;
    }

    return headers;
  }
}
