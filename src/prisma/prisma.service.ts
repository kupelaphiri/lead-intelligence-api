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
  leadsUsedThisPeriod: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
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
  twitter: string | null;
  youtube: string | null;
  tiktok: string | null;
  lastChecked: Date;
}

export interface BusinessContactRecord {
  id: number;
  businessId: number;
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  twitter: string | null;
  sourceUrl: string;
  sourceType: string;
  sourcePage: string | null;
  emailType: string | null;
  roleCategory: string | null;
  domainMatches: boolean;
  confidence: number;
  lastSeenAt: Date;
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
  address: string | null;
  businessCategory: string | null;
  priceLevel: string | null;
  scrapedAt: Date;
}

export interface BusinessWithEnrichment extends BusinessRecord {
  enrichment: EnrichmentRecord | null;
  contacts: BusinessContactRecord[];
}

export interface LeadDeliveryRecord {
  id: number;
  userId: number;
  businessId: number;
  deliveredAt: Date;
}

export interface JobRunRecord {
  id: number;
  queueName: string;
  jobId: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  processedCount: number | null;
  errorMessage: string | null;
  metadata: unknown;
  webhookUrl: string | null;
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
      { name: 'Free', priceMonthlyUsd: 0, leadsLimit: 1000 },
      { name: 'Basic', priceMonthlyUsd: 9, leadsLimit: 2500 },
      { name: 'Starter', priceMonthlyUsd: 29, leadsLimit: 10000 },
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

  async findDefaultFreePlan(): Promise<PlanRecord | null> {
    return this.client.plan.findUnique({ where: { name: 'Free' } });
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
    const { start, end } = this.createBillingPeriodWindow();
    return this.client.user.create({
      data: {
        ...data,
        leadsUsedThisPeriod: 0,
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
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
    const { start, end } = this.createBillingPeriodWindow();
    return this.client.user.update({
      where: { id: userId },
      data: {
        planId,
        leadsUsedThisPeriod: 0,
        currentPeriodStart: start,
        currentPeriodEnd: end,
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
        leadsUsedThisPeriod: {
          increment: amount,
        },
      },
    });
  }

  async refreshUserLeadPeriod(
    userId: number,
  ): Promise<UserWithPlanRecord | null> {
    const user = await this.findUserById(userId);
    if (!user) {
      return null;
    }

    const now = new Date();
    if (user.currentPeriodEnd && new Date(user.currentPeriodEnd) > now) {
      return user;
    }

    const { start, end } = this.createBillingPeriodWindow(now);
    return this.client.user.update({
      where: { id: userId },
      data: {
        leadsUsedThisPeriod: 0,
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
      include: {
        plan: true,
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
      include: {
        enrichment: true,
        contacts: {
          orderBy: [{ confidence: 'desc' }, { lastSeenAt: 'desc' }],
        },
      },
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
    address?: string | null;
    businessCategory?: string | null;
    priceLevel?: string | null;
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
        address: data.address ?? null,
        businessCategory: data.businessCategory ?? null,
        priceLevel: data.priceLevel ?? null,
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
    twitter?: string | null;
    youtube?: string | null;
    tiktok?: string | null;
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
        twitter: data.twitter ?? null,
        youtube: data.youtube ?? null,
        tiktok: data.tiktok ?? null,
        lastChecked: new Date(),
      },
    });
  }

  async replaceBusinessContacts(data: {
    businessId: number;
    contacts: Array<{
      name: string | null;
      title: string | null;
      email: string | null;
      phone: string | null;
      linkedin: string | null;
      twitter?: string | null;
      sourceUrl: string;
      sourceType: string;
      sourcePage: string | null;
      emailType: string | null;
      roleCategory: string | null;
      domainMatches: boolean;
      confidence: number;
    }>;
  }): Promise<void> {
    await this.client.$transaction(async (tx: any) => {
      await tx.businessContact.deleteMany({
        where: { businessId: data.businessId },
      });

      if (data.contacts.length === 0) {
        return;
      }

      await tx.businessContact.createMany({
        data: data.contacts.map((contact) => ({
          businessId: data.businessId,
          name: contact.name,
          title: contact.title,
          email: contact.email,
          phone: contact.phone,
          linkedin: contact.linkedin,
          twitter: contact.twitter ?? null,
          sourceUrl: contact.sourceUrl,
          sourceType: contact.sourceType,
          sourcePage: contact.sourcePage,
          emailType: contact.emailType,
          roleCategory: contact.roleCategory,
          domainMatches: contact.domainMatches,
          confidence: contact.confidence,
          lastSeenAt: new Date(),
        })),
      });
    });
  }

  async recordLeadDeliveries(
    userId: number,
    businessIds: number[],
  ): Promise<number> {
    const uniqueBusinessIds = [...new Set(businessIds)].filter((id) => id > 0);
    if (uniqueBusinessIds.length === 0) {
      return 0;
    }

    const existing = await this.client.leadDelivery.findMany({
      where: {
        userId,
        businessId: { in: uniqueBusinessIds },
      },
      select: { businessId: true },
    });

    const existingIds = new Set<number>(
      existing.map((delivery: { businessId: number }) => delivery.businessId),
    );
    const newBusinessIds = uniqueBusinessIds.filter(
      (id) => !existingIds.has(id),
    );

    if (newBusinessIds.length === 0) {
      return 0;
    }

    await this.client.leadDelivery.createMany({
      data: newBusinessIds.map((businessId) => ({
        userId,
        businessId,
        deliveredAt: new Date(),
      })),
      skipDuplicates: true,
    });

    return newBusinessIds.length;
  }

  async startJobRun(data: {
    queueName: string;
    jobId: string;
    metadata?: unknown;
    webhookUrl?: string | null;
  }): Promise<JobRunRecord> {
    return this.client.jobRun.upsert({
      where: {
        queueName_jobId: {
          queueName: data.queueName,
          jobId: data.jobId,
        },
      },
      create: {
        queueName: data.queueName,
        jobId: data.jobId,
        status: 'running',
        startedAt: new Date(),
        metadata: data.metadata,
        webhookUrl: data.webhookUrl ?? null,
      },
      update: {
        status: 'running',
        startedAt: new Date(),
        completedAt: null,
        durationMs: null,
        processedCount: null,
        errorMessage: null,
        metadata: data.metadata,
        webhookUrl: data.webhookUrl ?? null,
      },
    });
  }

  async finishJobRun(data: {
    queueName: string;
    jobId: string;
    status: 'completed' | 'failed';
    processedCount?: number;
    errorMessage?: string | null;
  }): Promise<JobRunRecord> {
    const existing = await this.client.jobRun.findUnique({
      where: {
        queueName_jobId: {
          queueName: data.queueName,
          jobId: data.jobId,
        },
      },
    });

    const startedAt = existing?.startedAt
      ? new Date(existing.startedAt).getTime()
      : Date.now();
    const completedAt = new Date();

    return this.client.jobRun.upsert({
      where: {
        queueName_jobId: {
          queueName: data.queueName,
          jobId: data.jobId,
        },
      },
      create: {
        queueName: data.queueName,
        jobId: data.jobId,
        status: data.status,
        startedAt: new Date(startedAt),
        completedAt,
        durationMs: completedAt.getTime() - startedAt,
        processedCount: data.processedCount ?? null,
        errorMessage: data.errorMessage ?? null,
      },
      update: {
        status: data.status,
        completedAt,
        durationMs: completedAt.getTime() - startedAt,
        processedCount: data.processedCount ?? null,
        errorMessage: data.errorMessage ?? null,
      },
    });
  }

  async getJobRunSummary(): Promise<{
    totalsByQueue: Array<{
      queueName: string;
      total: number;
      completed: number;
      failed: number;
      avgDurationMs: number;
    }>;
    recentRuns: JobRunRecord[];
  }> {
    const runs = (await this.client.jobRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 100,
    })) as JobRunRecord[];

    const grouped = new Map<
      string,
      {
        total: number;
        completed: number;
        failed: number;
        durationSum: number;
        durationCount: number;
      }
    >();

    for (const run of runs) {
      const current = grouped.get(run.queueName) ?? {
        total: 0,
        completed: 0,
        failed: 0,
        durationSum: 0,
        durationCount: 0,
      };

      current.total += 1;
      if (run.status === 'completed') {
        current.completed += 1;
      }
      if (run.status === 'failed') {
        current.failed += 1;
      }
      if (typeof run.durationMs === 'number') {
        current.durationSum += run.durationMs;
        current.durationCount += 1;
      }

      grouped.set(run.queueName, current);
    }

    return {
      totalsByQueue: [...grouped.entries()].map(([queueName, value]) => ({
        queueName,
        total: value.total,
        completed: value.completed,
        failed: value.failed,
        avgDurationMs:
          value.durationCount > 0
            ? Math.round(value.durationSum / value.durationCount)
            : 0,
      })),
      recentRuns: runs,
    };
  }

  async findJobRunByJobId(jobId: string): Promise<JobRunRecord | null> {
    return this.client.jobRun.findFirst({
      where: { jobId },
      orderBy: { startedAt: 'desc' },
    });
  }

  async findJobRunsByJobIds(jobIds: string[]): Promise<JobRunRecord[]> {
    return this.client.jobRun.findMany({
      where: { jobId: { in: jobIds } },
      orderBy: { startedAt: 'desc' },
    });
  }

  private createBillingPeriodWindow(baseDate = new Date()): {
    start: Date;
    end: Date;
  } {
    const start = new Date(baseDate);
    const end = new Date(baseDate);
    end.setUTCDate(end.getUTCDate() + 30);

    return { start, end };
  }
}
