import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ENRICHMENT_QUEUE } from '../queue/queue.constants';
import { EnrichmentJobPayload } from '../queue/queue.types';
import { EnrichmentService } from '../modules/enrichment/enrichment.service';

@Injectable()
@Processor(ENRICHMENT_QUEUE)
export class EnrichmentWorker extends WorkerHost {
  private readonly logger = new Logger(EnrichmentWorker.name);

  constructor(private readonly enrichmentService: EnrichmentService) {
    super();
  }

  async process(job: Job<EnrichmentJobPayload>): Promise<void> {
    await this.enrichmentService.enrichBusiness(
      job.data.businessId,
      job.data.website,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      `Enrichment worker failed for job ${job?.id ?? 'unknown'}: ${error.message}`,
    );
  }
}
