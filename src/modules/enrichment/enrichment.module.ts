import { Module } from '@nestjs/common';
import { EmailExtractor } from '../../scraper/email.extractor';
import { SocialExtractor } from '../../scraper/social.extractor';
import { WebsiteCrawler } from '../../scraper/website.crawler';
import { QueueModule } from '../../queue/queue.module';
import { EnrichmentWorker } from '../../workers/enrichment.worker';
import { EnrichmentService } from './enrichment.service';

@Module({
  imports: [QueueModule],
  providers: [
    EnrichmentService,
    WebsiteCrawler,
    EmailExtractor,
    SocialExtractor,
    EnrichmentWorker,
  ],
  exports: [EnrichmentService],
})
export class EnrichmentModule {}
