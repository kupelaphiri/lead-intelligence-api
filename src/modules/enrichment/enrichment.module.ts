import { Module } from '@nestjs/common';
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
