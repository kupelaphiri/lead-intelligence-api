import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from './prisma/prisma.service';
import { ENRICHMENT_QUEUE, MAPS_SCRAPE_QUEUE } from './queue/queue.constants';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(MAPS_SCRAPE_QUEUE)
    private readonly mapsQueue: Queue,
    @InjectQueue(ENRICHMENT_QUEUE)
    private readonly enrichmentQueue: Queue,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getMetrics(): Promise<{
    queues: {
      maps: Record<string, number>;
      enrichment: Record<string, number>;
    };
    jobs: Awaited<ReturnType<PrismaService['getJobRunSummary']>>;
  }> {
    const [mapsCounts, enrichmentCounts, jobs] = await Promise.all([
      this.mapsQueue.getJobCounts(),
      this.enrichmentQueue.getJobCounts(),
      this.prisma.getJobRunSummary(),
    ]);

    return {
      queues: {
        maps: mapsCounts,
        enrichment: enrichmentCounts,
      },
      jobs,
    };
  }
}
