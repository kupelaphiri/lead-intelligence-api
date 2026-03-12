import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { EnrichmentQueue } from '../queue/enrichment.queue';
import { MAPS_SCRAPE_QUEUE } from '../queue/queue.constants';
import { MapsScrapeJobPayload } from '../queue/queue.types';
import { MapsScraper } from '../scraper/maps.scraper';

@Injectable()
@Processor(MAPS_SCRAPE_QUEUE)
export class MapsWorker extends WorkerHost {
  private readonly logger = new Logger(MapsWorker.name);

  constructor(
    private readonly mapsScraper: MapsScraper,
    private readonly prisma: PrismaService,
    private readonly enrichmentQueue: EnrichmentQueue,
  ) {
    super();
  }

  async process(job: Job<MapsScrapeJobPayload>): Promise<void> {
    const requestedLimit = Math.max(1, Math.min(job.data.limit ?? 100, 100));

    this.logger.log(
      `Scraping started: query=${job.data.query}, city=${job.data.city}, limit=${requestedLimit}`,
    );

    const scraped = await this.mapsScraper.scrape(
      job.data.query,
      job.data.city,
      requestedLimit,
    );

    for (const business of scraped) {
      const saved = await this.prisma.upsertBusiness(business);
      this.logger.log(`Business saved: ${saved.name}`);

      if (saved.website) {
        await this.enrichmentQueue.enqueueEnrichment({
          businessId: saved.id,
          website: saved.website,
        });
      }
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      `Maps worker failed for job ${job?.id ?? 'unknown'}: ${error.message}`,
    );
  }
}
