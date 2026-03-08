/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('@prisma/client');

export interface ApiKeyRecord {
  id: number;
  key: string;
  userId: number | null;
  plan: string;
  requestsUsed: number;
  createdAt: Date;
}

export interface UserRecord {
  id: number;
  email: string;
  passwordHash: string;
  name: string | null;
  plan: string;
  createdAt: Date;
}

export interface EnrichmentRecord {
  id: number;
  businessId: number;
  emails: string[];
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  lastChecked: Date;
}

export interface BusinessRecord {
  id: number;
  name: string;
  phone: string | null;
  website: string | null;
  city: string;
  category: string;
  rating: number | null;
  reviews: number | null;
  googleMapsUrl: string | null;
  scrapedAt: Date;
}

export interface BusinessWithEnrichment extends BusinessRecord {
  enrichment: EnrichmentRecord | null;
}

@Injectable()
export class PrismaService implements OnModuleInit {
  // Prisma client types are generated at runtime via `prisma generate`.
  // Keep this surface typed in our app layer for compile-time safety.
  private readonly client: any = new PrismaClient();

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  enableShutdownHooks(app: INestApplication): void {
    this.client.$on('beforeExit', async () => {
      await app.close();
    });
  }

  async findApiKeyByKey(key: string): Promise<ApiKeyRecord | null> {
    return this.client.apiKey.findUnique({ where: { key } });
  }

  async incrementApiKeyRequests(id: number): Promise<ApiKeyRecord> {
    return this.client.apiKey.update({
      where: { id },
      data: { requestsUsed: { increment: 1 } },
    });
  }

  async createApiKey(data: {
    key: string;
    userId: number;
    plan: string;
  }): Promise<ApiKeyRecord> {
    return this.client.apiKey.create({ data });
  }

  async findLatestApiKeyByUserId(userId: number): Promise<ApiKeyRecord | null> {
    return this.client.apiKey.findFirst({
      where: { userId },
      orderBy: { id: 'desc' },
    });
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.client.user.findUnique({ where: { email } });
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    name: string | null;
    plan: string;
  }): Promise<UserRecord> {
    return this.client.user.create({ data });
  }

  async findUserById(id: number): Promise<UserRecord | null> {
    return this.client.user.findUnique({ where: { id } });
  }

  async findBusinessesByQueryCity(
    query: string,
    city: string,
    limit: number,
  ): Promise<BusinessWithEnrichment[]> {
    return this.client.business.findMany({
      where: {
        city: { equals: city, mode: 'insensitive' },
        category: { equals: query, mode: 'insensitive' },
      },
      orderBy: { scrapedAt: 'desc' },
      take: limit,
      include: { enrichment: true },
    });
  }

  async upsertBusiness(data: {
    name: string;
    phone: string | null;
    website: string | null;
    city: string;
    category: string;
    rating: number | null;
    reviews: number | null;
    googleMapsUrl: string | null;
  }): Promise<BusinessRecord> {
    return this.client.business.upsert({
      where: {
        name_city_category: {
          name: data.name,
          city: data.city,
          category: data.category,
        },
      },
      create: {
        ...data,
        scrapedAt: new Date(),
      },
      update: {
        phone: data.phone,
        website: data.website,
        rating: data.rating,
        reviews: data.reviews,
        googleMapsUrl: data.googleMapsUrl,
        scrapedAt: new Date(),
      },
    });
  }

  async upsertEnrichment(data: {
    businessId: number;
    emails: string[];
    instagram: string | null;
    facebook: string | null;
    linkedin: string | null;
  }): Promise<EnrichmentRecord> {
    return this.client.enrichment.upsert({
      where: { businessId: data.businessId },
      create: {
        ...data,
        lastChecked: new Date(),
      },
      update: {
        emails: data.emails,
        instagram: data.instagram,
        facebook: data.facebook,
        linkedin: data.linkedin,
        lastChecked: new Date(),
      },
    });
  }
}
