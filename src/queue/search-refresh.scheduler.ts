import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  SEARCH_REFRESH_QUEUE,
  SEARCH_REFRESH_TICK_JOB,
} from './queue.constants';

@Injectable()
export class SearchRefreshScheduler implements OnModuleInit {
  private readonly logger = new Logger(SearchRefreshScheduler.name);
  private readonly tickEveryMs = 1000 * 60 * 60;

  constructor(
    @InjectQueue(SEARCH_REFRESH_QUEUE)
    private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    const repeatable = await this.queue.getRepeatableJobs();
    for (const existing of repeatable) {
      if (existing.name === SEARCH_REFRESH_TICK_JOB) {
        await this.queue.removeRepeatableByKey(existing.key);
      }
    }

    await this.queue.add(
      SEARCH_REFRESH_TICK_JOB,
      {},
      {
        repeat: { every: this.tickEveryMs },
        jobId: SEARCH_REFRESH_TICK_JOB,
      },
    );

    this.logger.log(
      `Search-refresh tick scheduled every ${Math.round(this.tickEveryMs / 60000)} minutes`,
    );
  }
}
