import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  ApiKeyRecord,
  ApiKeyWithUserRecord,
  PrismaService,
} from '../../prisma/prisma.service';

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

    const subscription = await this.prisma.findApiKeyWithUserByKey(rawKey);
    if (subscription?.user?.subscriptionStatus === 'canceled') {
      throw new ForbiddenException('Subscription is canceled');
    }

    return this.prisma.incrementApiKeyRequests(apiKey.id);
  }

  async findByKey(rawKey: string | undefined): Promise<ApiKeyRecord | null> {
    if (!rawKey) {
      return null;
    }
    return this.prisma.findApiKeyByKey(rawKey);
  }

  async findWithUserByKey(
    rawKey: string | undefined,
  ): Promise<ApiKeyWithUserRecord | null> {
    if (!rawKey) {
      return null;
    }
    return this.prisma.findApiKeyWithUserByKey(rawKey);
  }

  async createForUser(userId: number): Promise<ApiKeyRecord> {
    return this.prisma.createApiKey({
      key: this.generateApiKey(),
      userId,
    });
  }

  async findLatestByUserId(userId: number): Promise<ApiKeyRecord | null> {
    return this.prisma.findLatestApiKeyByUserId(userId);
  }

  async rotateForUser(userId: number): Promise<ApiKeyRecord> {
    await this.prisma.deleteApiKeysByUserId(userId);
    return this.prisma.createApiKey({
      key: this.generateApiKey(),
      userId,
    });
  }

  private generateApiKey(): string {
    return `li_${randomBytes(24).toString('hex')}`;
  }
}
