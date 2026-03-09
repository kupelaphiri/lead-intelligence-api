import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async signup(payload: SignupDto): Promise<{ apiKey: string; user: unknown }> {
    const user = await this.usersService.createUser(payload);
    const apiKey = await this.apiKeysService.createForUser(user.id);

    return {
      apiKey: apiKey.key,
      user: this.toPublicUser(user),
    };
  }

  async login(payload: LoginDto): Promise<{ apiKey: string; user: unknown }> {
    const user = await this.usersService.validateCredentials(
      payload.email,
      payload.password,
    );

    const apiKey = await this.apiKeysService.findLatestByUserId(user.id);
    const resolvedApiKey =
      apiKey ?? (await this.apiKeysService.createForUser(user.id));

    return {
      apiKey: resolvedApiKey.key,
      user: this.toPublicUser(user),
    };
  }

  async me(apiKey: string | undefined): Promise<unknown> {
    const key = await this.apiKeysService.findByKey(apiKey);
    if (!key?.userId) {
      throw new UnauthorizedException('No user linked to this API key');
    }

    const user = await this.usersService.findById(key.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.toPublicUser(user);
  }

  async updatePlan(
    apiKey: string | undefined,
    payload: UpdatePlanDto,
  ): Promise<{ apiKey: string | null; user: unknown }> {
    const key = await this.apiKeysService.findByKey(apiKey);
    if (!key?.userId) {
      throw new UnauthorizedException('No user linked to this API key');
    }

    const user = await this.usersService.updatePlan(key.userId, payload.plan);

    if (payload.rotateApiKey) {
      const rotated = await this.apiKeysService.rotateForUser(key.userId);
      return {
        apiKey: rotated.key,
        user: this.toPublicUser(user),
      };
    }

    return {
      apiKey: null,
      user: this.toPublicUser(user),
    };
  }

  async cancelSubscription(
    apiKey: string | undefined,
  ): Promise<{ user: unknown }> {
    const key = await this.apiKeysService.findByKey(apiKey);
    if (!key?.userId) {
      throw new UnauthorizedException('No user linked to this API key');
    }

    const user = await this.usersService.cancelSubscription(key.userId);
    return {
      user: this.toPublicUser(user),
    };
  }

  private toPublicUser(user: {
    id: number;
    email: string;
    name: string | null;
    createdAt: Date;
    leadsCollected: number;
    subscriptionStatus: string;
    subscriptionCanceledAt: Date | null;
    plan?: {
      id: number;
      name: string;
      priceMonthlyUsd: number | null;
      leadsLimit: number | null;
    } | null;
  }): {
    id: number;
    email: string;
    name: string | null;
    createdAt: Date;
    leadsCollected: number;
    subscriptionStatus: string;
    subscriptionCanceledAt: Date | null;
    plan: {
      id: number;
      name: string;
      priceMonthlyUsd: number | null;
      leadsLimit: number | null;
    } | null;
  } {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      leadsCollected: user.leadsCollected,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionCanceledAt: user.subscriptionCanceledAt,
      plan: user.plan ?? null,
    };
  }
}
