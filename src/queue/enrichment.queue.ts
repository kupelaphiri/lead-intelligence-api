import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ENRICHMENT_JOB, ENRICHMENT_QUEUE } from './queue.constants';
import { EnrichmentJobPayload } from './queue.types';

@Injectable()
export class EnrichmentQueue {
  constructor(
    @InjectQueue(ENRICHMENT_QUEUE)
    private readonly queue: Queue<EnrichmentJobPayload>,
  ) {}

  async enqueueEnrichment(payload: EnrichmentJobPayload): Promise<void> {
    const jobId = `enrichment-${payload.businessId}`;

    await this.queue.add(ENRICHMENT_JOB, payload, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      jobId,
    });
  }
}
