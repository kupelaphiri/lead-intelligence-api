import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module';
import { MapsScraper } from '../../scraper/maps.scraper';
import { MapsWorker } from '../../workers/maps.worker';

@Module({
  imports: [QueueModule],
  providers: [MapsScraper, MapsWorker],
  exports: [MapsScraper],
})
export class ScraperModule {}
