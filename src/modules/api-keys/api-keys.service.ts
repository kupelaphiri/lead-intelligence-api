import {
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ApiKeyRecord, PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async validateAndTrack(rawKey: string | undefined): Promise<ApiKeyRecord> {
    if (!rawKey) {
      throw new UnauthorizedException('Missing x-api-key header');
    }

    const apiKey = await this.prisma.findApiKeyByKey(rawKey);
    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    const limit = this.getPlanLimit(apiKey.plan);
    if (limit !== null && apiKey.requestsUsed >= limit) {
      throw new HttpException(
        `Plan limit reached for '${apiKey.plan}' (${limit} requests).`,
        429,
      );
    }

    return this.prisma.incrementApiKeyRequests(apiKey.id);
  }

  async findByKey(rawKey: string | undefined): Promise<ApiKeyRecord | null> {
    if (!rawKey) {
      return null;
    }
    return this.prisma.findApiKeyByKey(rawKey);
  }

  async createForUser(userId: number, plan: string): Promise<ApiKeyRecord> {
    return this.prisma.createApiKey({
      key: this.generateApiKey(),
      userId,
      plan,
    });
  }

  async findLatestByUserId(userId: number): Promise<ApiKeyRecord | null> {
    return this.prisma.findLatestApiKeyByUserId(userId);
  }

  private generateApiKey(): string {
    return `li_${randomBytes(24).toString('hex')}`;
  }

  private getPlanLimit(plan: string): number | null {
    const normalizedPlan = plan.trim().toLowerCase();
    const limits: Record<string, number | null> = {
      free: Number.parseInt(process.env.FREE_PLAN_REQUEST_LIMIT ?? '1000', 10),
      pro: Number.parseInt(process.env.PRO_PLAN_REQUEST_LIMIT ?? '50000', 10),
      enterprise: null,
    };

    return limits[normalizedPlan] ?? limits.free;
  }
}
