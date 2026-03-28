import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { MAPS_SCRAPE_QUEUE, ENRICHMENT_QUEUE } from '../../queue/queue.constants';

interface ComponentHealth {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  components: {
    database: ComponentHealth;
    redis: ComponentHealth;
    queues: {
      mapsScrape: { waiting: number; active: number; failed: number } | null;
      enrichment: { waiting: number; active: number; failed: number } | null;
    };
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(MAPS_SCRAPE_QUEUE)
    private readonly mapsQueue: Queue,
    @InjectQueue(ENRICHMENT_QUEUE)
    private readonly enrichmentQueue: Queue,
  ) {}

  async check(): Promise<HealthCheckResult> {
    const [database, redis, queues] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkQueues(),
    ]);

    const allUp = database.status === 'up' && redis.status === 'up';
    const anyDown = database.status === 'down' || redis.status === 'down';

    return {
      status: anyDown ? 'unhealthy' : allUp ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      components: {
        database,
        redis,
        queues,
      },
    };
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await this.prisma.findDefaultFreePlan();
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      this.logger.warn(
        `Database health check failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'unknown',
      };
    }
  }

  private async checkRedis(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      // Ping Redis via one of the queues
      await this.mapsQueue.getJobCounts();
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      this.logger.warn(
        `Redis health check failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'unknown',
      };
    }
  }

  private async checkQueues(): Promise<{
    mapsScrape: { waiting: number; active: number; failed: number } | null;
    enrichment: { waiting: number; active: number; failed: number } | null;
  }> {
    const getQueueStats = async (queue: Queue) => {
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'failed');
        return {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          failed: counts.failed ?? 0,
        };
      } catch {
        return null;
      }
    };

    const [mapsScrape, enrichment] = await Promise.all([
      getQueueStats(this.mapsQueue),
      getQueueStats(this.enrichmentQueue),
    ]);

    return { mapsScrape, enrichment };
  }
}
