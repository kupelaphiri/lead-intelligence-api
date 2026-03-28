import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EnrichmentModule } from './modules/enrichment/enrichment.module';
import { ScraperModule } from './modules/scraper/scraper.module';
import { WebhookModule } from './modules/webhooks/webhook.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { buildRedisConnection } from './config/redis.config';

@Module({
  imports: [
    PrismaModule,
    BullModule.forRoot({
      connection: buildRedisConnection(),
    }),
    QueueModule,
    ScraperModule,
    EnrichmentModule,
    WebhookModule,
  ],
})
export class WorkerModule {}
