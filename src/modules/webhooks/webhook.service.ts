import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface WebhookPayload {
  event: 'job.completed' | 'job.failed';
  jobId: string;
  queueName: string;
  status: string;
  processedCount?: number | null;
  errorMessage?: string | null;
  completedAt: string;
  durationMs?: number | null;
  metadata?: unknown;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  async send(url: string, payload: WebhookPayload): Promise<void> {
    try {
      await axios.post(url, payload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'LeadIntelligence-Webhook/1.0',
        },
        validateStatus: (s) => s < 500,
      });

      this.logger.log(`Webhook delivered to ${url} for job ${payload.jobId}`);
    } catch (error) {
      this.logger.warn(
        `Webhook delivery failed for ${url}: ${error instanceof Error ? error.message : 'unknown'}`,
      );

      // Retry once after 3 seconds
      try {
        await new Promise((r) => setTimeout(r, 3000));
        await axios.post(url, payload, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'LeadIntelligence-Webhook/1.0',
          },
          validateStatus: (s) => s < 500,
        });
        this.logger.log(`Webhook retry succeeded for ${url}`);
      } catch (retryError) {
        this.logger.error(
          `Webhook retry also failed for ${url}: ${retryError instanceof Error ? retryError.message : 'unknown'}`,
        );
      }
    }
  }
}
