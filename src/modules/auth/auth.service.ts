import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
    private readonly jwtService: JwtService,
  ) {}

  async signup(payload: SignupDto): Promise<{
    apiKey: string;
    accessToken: string;
    user: unknown;
  }> {
    const user = await this.usersService.createUser(payload);
    const apiKey = await this.apiKeysService.createForUser(user.id);
    const accessToken = await this.signAccessToken(user.id, user.email);

    return {
      apiKey: apiKey.key,
      accessToken,
      user: this.toPublicUser(user),
    };
  }

  async login(payload: LoginDto): Promise<{
    apiKey: string;
    accessToken: string;
    user: unknown;
  }> {
    const user = await this.usersService.validateCredentials(
      payload.email,
      payload.password,
    );

    const apiKey = await this.apiKeysService.findLatestByUserId(user.id);
    const resolvedApiKey =
      apiKey ?? (await this.apiKeysService.createForUser(user.id));
    const accessToken = await this.signAccessToken(user.id, user.email);

    return {
      apiKey: resolvedApiKey.key,
      accessToken,
      user: this.toPublicUser(user),
    };
  }

  async me(userId: number | undefined): Promise<unknown> {
    if (!userId) {
      throw new UnauthorizedException('User context missing');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.toPublicUser(user);
  }

  async updatePlan(
    userId: number | undefined,
    payload: UpdatePlanDto,
  ): Promise<{ apiKey: string | null; user: unknown }> {
    if (!userId) {
      throw new UnauthorizedException('User context missing');
    }

    const user = await this.usersService.updatePlan(userId, payload.plan);

    if (payload.rotateApiKey) {
      const rotated = await this.apiKeysService.rotateForUser(userId);
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
    userId: number | undefined,
  ): Promise<{ user: unknown }> {
    if (!userId) {
      throw new UnauthorizedException('User context missing');
    }

    const user = await this.usersService.cancelSubscription(userId);
    return {
      user: this.toPublicUser(user),
    };
  }

  signAccessToken(userId: number, email: string): Promise<string> {
    return this.jwtService.signAsync({ sub: userId, email });
  }

  private toPublicUser(user: {
    id: number;
    email: string;
    name: string | null;
    createdAt: Date;
    leadsCollected: number;
    leadsUsedThisPeriod: number;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
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
    leadsUsedThisPeriod: number;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
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
      leadsUsedThisPeriod: user.leadsUsedThisPeriod,
      currentPeriodStart: user.currentPeriodStart,
      currentPeriodEnd: user.currentPeriodEnd,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionCanceledAt: user.subscriptionCanceledAt,
      plan: user.plan ?? null,
    };
  }
}
