import {
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MapsQueue } from '../../queue/maps.queue';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapsQueue: MapsQueue,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async getLeads(
    apiKey: string | undefined,
    query: string,
    city: string,
    limit: number,
  ): Promise<unknown[]> {
    const subscription = await this.apiKeysService.findWithUserByKey(apiKey);
    const user = subscription?.user;

    if (!user) {
      throw new UnauthorizedException('No user linked to this API key');
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
      return businesses;
    }

    await this.mapsQueue.enqueueScrape({ query, city });
    return [];
  }
}
