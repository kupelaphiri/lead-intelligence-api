import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MapsQueue } from '../../queue/maps.queue';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapsQueue: MapsQueue,
  ) {}

  async getLeads(
    query: string,
    city: string,
    limit: number,
  ): Promise<unknown[]> {
    const businesses = await this.prisma.findBusinessesByQueryCity(
      query,
      city,
      limit,
    );

    if (businesses.length > 0) {
      return businesses;
    }

    await this.mapsQueue.enqueueScrape({ query, city });
    return [];
  }
}
