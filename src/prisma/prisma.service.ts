/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('@prisma/client');

export interface PlanRecord {
  id: number;
  name: string;
  priceMonthlyUsd: number | null;
  leadsLimit: number | null;
  createdAt: Date;
}

export interface ApiKeyRecord {
  id: number;
  key: string;
  userId: number | null;
  requestsUsed: number;
  createdAt: Date;
}

export interface UserRecord {
  id: number;
  email: string;
  passwordHash: string;
  name: string | null;
  planId: number | null;
  leadsCollected: number;
  subscriptionStatus: string;
  subscriptionCanceledAt: Date | null;
  createdAt: Date;
}

export interface UserWithPlanRecord extends UserRecord {
  plan: PlanRecord | null;
}

export interface ApiKeyWithUserRecord extends ApiKeyRecord {
  user: UserWithPlanRecord | null;
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
  private readonly client: any = new PrismaClient();

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    await this.seedDefaultPlans();
  }

  enableShutdownHooks(app: INestApplication): void {
    const shutdown = async (): Promise<void> => {
      await this.client.$disconnect();
      await app.close();
    };

    process.once('SIGINT', () => {
      void shutdown();
    });

    process.once('SIGTERM', () => {
      void shutdown();
    });
  }

  async seedDefaultPlans(): Promise<void> {
    const defaults: Array<{
      name: string;
      priceMonthlyUsd: number | null;
      leadsLimit: number | null;
    }> = [
      { name: 'Starter', priceMonthlyUsd: 49, leadsLimit: 10000 },
      { name: 'Growth', priceMonthlyUsd: 149, leadsLimit: 50000 },
      { name: 'Pro', priceMonthlyUsd: 399, leadsLimit: 200000 },
      { name: 'Enterprise', priceMonthlyUsd: null, leadsLimit: null },
    ];

    for (const plan of defaults) {
      await this.client.plan.upsert({
        where: { name: plan.name },
        update: {
          priceMonthlyUsd: plan.priceMonthlyUsd,
          leadsLimit: plan.leadsLimit,
        },
        create: plan,
      });
    }
  }

  async findPlanByName(name: string): Promise<PlanRecord | null> {
    return this.client.plan.findUnique({ where: { name } });
  }

  async findDefaultStarterPlan(): Promise<PlanRecord | null> {
    return this.client.plan.findUnique({ where: { name: 'Starter' } });
  }

  async findApiKeyByKey(key: string): Promise<ApiKeyRecord | null> {
    return this.client.apiKey.findUnique({ where: { key } });
  }

  async findApiKeyWithUserByKey(
    key: string,
  ): Promise<ApiKeyWithUserRecord | null> {
    return this.client.apiKey.findUnique({
      where: { key },
      include: {
        user: {
          include: {
            plan: true,
          },
        },
      },
    });
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
  }): Promise<ApiKeyRecord> {
    return this.client.apiKey.create({ data });
  }

  async findLatestApiKeyByUserId(userId: number): Promise<ApiKeyRecord | null> {
    return this.client.apiKey.findFirst({
      where: { userId },
      orderBy: { id: 'desc' },
    });
  }

  async deleteApiKeysByUserId(userId: number): Promise<void> {
    await this.client.apiKey.deleteMany({ where: { userId } });
  }

  async findUserByEmail(email: string): Promise<UserWithPlanRecord | null> {
    return this.client.user.findUnique({
      where: { email },
      include: {
        plan: true,
      },
    });
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    name: string | null;
    planId: number;
  }): Promise<UserWithPlanRecord> {
    return this.client.user.create({
      data,
      include: {
        plan: true,
      },
    });
  }

  async findUserById(id: number): Promise<UserWithPlanRecord | null> {
    return this.client.user.findUnique({
      where: { id },
      include: {
        plan: true,
      },
    });
  }

  async updateUserPlan(
    userId: number,
    planId: number,
  ): Promise<UserWithPlanRecord> {
    return this.client.user.update({
      where: { id: userId },
      data: {
        planId,
        subscriptionStatus: 'active',
        subscriptionCanceledAt: null,
      },
      include: {
        plan: true,
      },
    });
  }

  async cancelUserSubscription(userId: number): Promise<UserWithPlanRecord> {
    return this.client.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: 'canceled',
        subscriptionCanceledAt: new Date(),
      },
      include: {
        plan: true,
      },
    });
  }

  async incrementUserLeads(userId: number, amount: number): Promise<void> {
    if (amount <= 0) {
      return;
    }

    await this.client.user.update({
      where: { id: userId },
      data: {
        leadsCollected: {
          increment: amount,
        },
      },
    });
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
