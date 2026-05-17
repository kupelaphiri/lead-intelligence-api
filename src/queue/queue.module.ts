import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EnrichmentQueue } from './enrichment.queue';
import { MapsQueue } from './maps.queue';
import {
  ENRICHMENT_QUEUE,
  MAPS_SCRAPE_QUEUE,
  SEARCH_REFRESH_QUEUE,
} from './queue.constants';

@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: MAPS_SCRAPE_QUEUE,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      },
      {
        name: ENRICHMENT_QUEUE,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      },
      {
        name: SEARCH_REFRESH_QUEUE,
        defaultJobOptions: {
          attempts: 1,
          removeOnComplete: 24,
          removeOnFail: 24,
        },
      },
    ),
  ],
  providers: [MapsQueue, EnrichmentQueue],
  exports: [BullModule, MapsQueue, EnrichmentQueue],
})
export class QueueModule {}
