import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { MAPS_SCRAPE_JOB, MAPS_SCRAPE_QUEUE } from './queue.constants';
import { MapsScrapeJobPayload } from './queue.types';

@Injectable()
export class MapsQueue {
  constructor(
    @InjectQueue(MAPS_SCRAPE_QUEUE)
    private readonly queue: Queue<MapsScrapeJobPayload>,
  ) {}

  async enqueueScrape(payload: MapsScrapeJobPayload): Promise<string> {
    const normalizedJobId = `${payload.query}-${payload.city}-${payload.limit}`
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-');

    await this.queue.add(MAPS_SCRAPE_JOB, payload, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      jobId: normalizedJobId,
    });

    return normalizedJobId;
  }
}
