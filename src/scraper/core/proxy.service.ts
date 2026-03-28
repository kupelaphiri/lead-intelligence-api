import { Injectable, Logger } from '@nestjs/common';

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

/**
 * Manages proxy rotation for scraper requests.
 *
 * Configure via environment variables:
 *   PROXY_URLS — comma-separated proxy URLs
 *     e.g. "http://user:pass@proxy1.example.com:8080,http://proxy2.example.com:3128"
 *
 * When no proxies are configured, all methods return null and scraping
 * proceeds without a proxy (direct connection).
 */
@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);
  private readonly proxies: ProxyConfig[] = [];
  private currentIndex = 0;

  constructor() {
    const raw = process.env.PROXY_URLS ?? '';
    const urls = raw
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    for (const url of urls) {
      const parsed = this.parseProxyUrl(url);
      if (parsed) {
        this.proxies.push(parsed);
      }
    }

    if (this.proxies.length > 0) {
      this.logger.log(`Loaded ${this.proxies.length} proxy server(s)`);
    } else {
      this.logger.warn(
        'No PROXY_URLS configured — scraping will use direct connections',
      );
    }
  }

  /** Returns the next proxy in rotation, or null when none are configured. */
  next(): ProxyConfig | null {
    if (this.proxies.length === 0) return null;
    const proxy = this.proxies[this.currentIndex % this.proxies.length];
    this.currentIndex++;
    return proxy;
  }

  /** Returns a random proxy, or null when none are configured. */
  random(): ProxyConfig | null {
    if (this.proxies.length === 0) return null;
    return this.proxies[Math.floor(Math.random() * this.proxies.length)];
  }

  /** Whether at least one proxy is available. */
  hasProxies(): boolean {
    return this.proxies.length > 0;
  }

  /** Build Axios proxy config from a ProxyConfig. */
  toAxiosProxy(
    proxy: ProxyConfig,
  ): { host: string; port: number; auth?: { username: string; password: string } } | undefined {
    try {
      const url = new URL(proxy.server);
      const config: {
        host: string;
        port: number;
        protocol: string;
        auth?: { username: string; password: string };
      } = {
        host: url.hostname,
        port: parseInt(url.port, 10) || 8080,
        protocol: url.protocol.replace(':', ''),
      };

      if (proxy.username && proxy.password) {
        config.auth = { username: proxy.username, password: proxy.password };
      } else if (url.username && url.password) {
        config.auth = {
          username: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password),
        };
      }

      return config;
    } catch {
      return undefined;
    }
  }

  /** Build Playwright browser context proxy config. */
  toPlaywrightProxy(
    proxy: ProxyConfig,
  ): { server: string; username?: string; password?: string } {
    return {
      server: proxy.server,
      username: proxy.username,
      password: proxy.password,
    };
  }

  private parseProxyUrl(raw: string): ProxyConfig | null {
    try {
      const url = new URL(raw);
      return {
        server: `${url.protocol}//${url.hostname}:${url.port || 8080}`,
        username: url.username ? decodeURIComponent(url.username) : undefined,
        password: url.password ? decodeURIComponent(url.password) : undefined,
      };
    } catch {
      this.logger.warn(`Invalid proxy URL: ${raw}`);
      return null;
    }
  }
}
