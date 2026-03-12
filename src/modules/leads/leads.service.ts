import {
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MapsQueue } from '../../queue/maps.queue';

interface LeadsResponse {
  status: 'ready' | 'processing';
  data: unknown[];
  message?: string;
  jobId?: string;
  limit: number;
  query: string;
  city: string;
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapsQueue: MapsQueue,
  ) {}

  async getLeads(
    userId: number | undefined,
    query: string,
    city: string,
    limit: number,
  ): Promise<LeadsResponse> {
    if (!userId) {
      throw new UnauthorizedException('User context missing');
    }

    const user = await this.prisma.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.subscriptionStatus === 'canceled') {
      throw new HttpException('Subscription is canceled', 403);
    }

    const leadsLimit = user.plan?.leadsLimit ?? null;
    if (leadsLimit !== null && user.leadsCollected >= leadsLimit) {
      throw new HttpException(
        `Lead limit reached for ${user.plan?.name ?? 'current'} plan (${leadsLimit} leads).`,
        429,
      );
    }

    const businesses = await this.prisma.findBusinessesByQueryCity(
      query,
      city,
      limit,
    );

    if (businesses.length > 0) {
      await this.prisma.incrementUserLeads(user.id, businesses.length);
      return {
        status: 'ready',
        data: businesses,
        limit,
        query,
        city,
      };
    }

    const jobId = await this.mapsQueue.enqueueScrape({ query, city, limit });
    return {
      status: 'processing',
      message:
        'No cached leads yet. Scraping has started in the background. Retry shortly.',
      data: [],
      jobId,
      limit,
      query,
      city,
    };
  }
}
