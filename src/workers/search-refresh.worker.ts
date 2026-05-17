import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MapsQueue } from '../queue/maps.queue';
import { SEARCH_REFRESH_QUEUE } from '../queue/queue.constants';

@Injectable()
@Processor(SEARCH_REFRESH_QUEUE)
export class SearchRefreshWorker extends WorkerHost {
  private readonly logger = new Logger(SearchRefreshWorker.name);
  private readonly staleMs = 1000 * 60 * 60 * 24 * 3;
  private readonly minSearchCount = 2;
  private readonly maxRefreshesPerTick = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mapsQueue: MapsQueue,
  ) {
    super();
  }

  async process(): Promise<void> {
    const stale = await this.prisma.findStalePopularSearches({
      staleMs: this.staleMs,
      minSearchCount: this.minSearchCount,
      limit: this.maxRefreshesPerTick,
    });

    if (stale.length === 0) {
      this.logger.debug('Search-refresh tick: no stale popular searches');
      return;
    }

    for (const snapshot of stale) {
      const limit = snapshot.lastRequestedLimit > 0
        ? snapshot.lastRequestedLimit
        : 100;

      const jobId = await this.mapsQueue.enqueueScrape({
        query: snapshot.query,
        city: snapshot.city,
        limit,
      });

      await this.prisma.markSearchSnapshotEnqueued({
        query: snapshot.query,
        city: snapshot.city,
        jobId,
        requestedLimit: limit,
      });

      this.logger.log(
        `Refresh enqueued: query="${snapshot.query}" city="${snapshot.city}" limit=${limit} searchCount=${snapshot.searchCount}`,
      );
    }
  }
}
