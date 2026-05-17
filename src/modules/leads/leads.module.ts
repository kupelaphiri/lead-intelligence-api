import { Module } from '@nestjs/common';
import { EmailQualityService } from '../../scraper/email-quality.service';
import { QueueModule } from '../../queue/queue.module';
import { SearchRefreshScheduler } from '../../queue/search-refresh.scheduler';
import { SearchRefreshWorker } from '../../workers/search-refresh.worker';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [QueueModule],
  controllers: [LeadsController],
  providers: [
    LeadsService,
    EmailQualityService,
    SearchRefreshScheduler,
    SearchRefreshWorker,
  ],
  exports: [LeadsService],
})
export class LeadsModule {}
