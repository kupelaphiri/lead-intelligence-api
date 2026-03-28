import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WebhookService } from '../modules/webhooks/webhook.service';
import { ENRICHMENT_QUEUE } from '../queue/queue.constants';
import { EnrichmentJobPayload } from '../queue/queue.types';
import { EnrichmentService } from '../modules/enrichment/enrichment.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
@Processor(ENRICHMENT_QUEUE)
export class EnrichmentWorker extends WorkerHost {
  private readonly logger = new Logger(EnrichmentWorker.name);

  constructor(
    private readonly enrichmentService: EnrichmentService,
    private readonly prisma: PrismaService,
    private readonly webhookService: WebhookService,
  ) {
    super();
  }

  async process(job: Job<EnrichmentJobPayload>): Promise<void> {
    const jobId = String(job.id ?? `enrichment-${job.data.businessId}`);

    await this.prisma.startJobRun({
      queueName: ENRICHMENT_QUEUE,
      jobId,
      metadata: {
        businessId: job.data.businessId,
        website: job.data.website,
      },
    });

    try {
      await this.enrichmentService.enrichBusiness(
        job.data.businessId,
        job.data.website,
      );

      const completedRun = await this.prisma.finishJobRun({
        queueName: ENRICHMENT_QUEUE,
        jobId,
        status: 'completed',
        processedCount: 1,
      });

      if (completedRun.webhookUrl) {
        void this.webhookService.send(completedRun.webhookUrl, {
          event: 'job.completed',
          jobId,
          queueName: ENRICHMENT_QUEUE,
          status: 'completed',
          processedCount: 1,
          completedAt: new Date().toISOString(),
          durationMs: completedRun.durationMs,
          metadata: completedRun.metadata,
        });
      }
    } catch (error) {
      const failedRun = await this.prisma.finishJobRun({
        queueName: ENRICHMENT_QUEUE,
        jobId,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'unknown error',
      });

      if (failedRun.webhookUrl) {
        void this.webhookService.send(failedRun.webhookUrl, {
          event: 'job.failed',
          jobId,
          queueName: ENRICHMENT_QUEUE,
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'unknown error',
          completedAt: new Date().toISOString(),
          durationMs: failedRun.durationMs,
          metadata: failedRun.metadata,
        });
      }

      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      `Enrichment worker failed for job ${job?.id ?? 'unknown'}: ${error.message}`,
    );
  }
}
