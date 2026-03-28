import { Module } from '@nestjs/common';
import { AntiDetectionService } from '../../scraper/core/anti-detection.service';
import { PhoneService } from '../../scraper/core/phone.service';
import { ProxyService } from '../../scraper/core/proxy.service';
import { RateLimiterService } from '../../scraper/core/rate-limiter.service';
import { ContactExtractor } from '../../scraper/contact.extractor';
import { EmailExtractor } from '../../scraper/email.extractor';
import { EmailQualityService } from '../../scraper/email-quality.service';
import { SocialExtractor } from '../../scraper/social.extractor';
import { StructuredDataExtractor } from '../../scraper/structured-data.extractor';
import { WebsiteCrawler } from '../../scraper/website.crawler';
import { QueueModule } from '../../queue/queue.module';
import { EnrichmentWorker } from '../../workers/enrichment.worker';
import { EnrichmentService } from './enrichment.service';

@Module({
  imports: [QueueModule],
  providers: [
    AntiDetectionService,
    PhoneService,
    ProxyService,
    RateLimiterService,
    EnrichmentService,
    WebsiteCrawler,
    ContactExtractor,
    EmailExtractor,
    EmailQualityService,
    SocialExtractor,
    StructuredDataExtractor,
    EnrichmentWorker,
  ],
  exports: [EnrichmentService],
})
export class EnrichmentModule {}
