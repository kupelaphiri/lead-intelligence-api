import { Module } from '@nestjs/common';
import { EmailQualityService } from '../../scraper/email-quality.service';
import { QueueModule } from '../../queue/queue.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [QueueModule],
  controllers: [LeadsController],
  providers: [LeadsService, EmailQualityService],
  exports: [LeadsService],
})
export class LeadsModule {}
