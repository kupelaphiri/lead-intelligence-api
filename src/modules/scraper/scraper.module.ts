import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module';
import { AntiDetectionService } from '../../scraper/core/anti-detection.service';
import { ProxyService } from '../../scraper/core/proxy.service';
import { RateLimiterService } from '../../scraper/core/rate-limiter.service';
import { MapsScraper } from '../../scraper/maps.scraper';
import { YelpScraper } from '../../scraper/scrapers/yelp.scraper';
import { YellowPagesScraper } from '../../scraper/scrapers/yellowpages.scraper';
import { MapsWorker } from '../../workers/maps.worker';
import { ScraperController } from './scraper.controller';
import { ScraperService } from './scraper.service';

@Module({
  imports: [QueueModule],
  controllers: [ScraperController],
  providers: [
    AntiDetectionService,
    ProxyService,
    RateLimiterService,
    MapsScraper,
    MapsWorker,
    YelpScraper,
    YellowPagesScraper,
    ScraperService,
  ],
  exports: [MapsScraper, AntiDetectionService, ProxyService, RateLimiterService],
})
export class ScraperModule {}
