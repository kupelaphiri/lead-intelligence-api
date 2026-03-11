import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService, UserWithPlanRecord } from '../../prisma/prisma.service';
import { hashPassword, verifyPassword } from './password.util';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(input: {
    email: string;
    password: string;
    name?: string;
    plan?: string;
  }): Promise<UserWithPlanRecord> {
    const email = input.email.trim().toLowerCase();
    if (!email || !input.password) {
      throw new BadRequestException('email and password are required');
    }

    const existing = await this.prisma.findUserByEmail(email);
    if (existing) {
      throw new ConflictException('User already exists');
    }

    const requestedPlanName = this.normalizePlanName(input.plan);
    const selectedPlan =
      requestedPlanName === 'Free'
        ? await this.prisma.findDefaultFreePlan()
        : await this.prisma.findPlanByName(requestedPlanName);

    if (!selectedPlan) {
      throw new BadRequestException('Selected plan is not configured');
    }

    return this.prisma.createUser({
      email,
      passwordHash: hashPassword(input.password),
      name: input.name?.trim() || null,
      planId: selectedPlan.id,
    });
  }

  async validateCredentials(
    email: string,
    password: string,
  ): Promise<UserWithPlanRecord> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.findUserByEmail(normalizedEmail);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }

  async findById(id: number): Promise<UserWithPlanRecord | null> {
    return this.prisma.findUserById(id);
  }

  async updatePlan(
    userId: number,
    planName: string,
  ): Promise<UserWithPlanRecord> {
    const normalizedPlanName = this.normalizePlanName(planName);
    const plan = await this.prisma.findPlanByName(normalizedPlanName);
    if (!plan) {
      throw new BadRequestException('Invalid plan selected');
    }

    return this.prisma.updateUserPlan(userId, plan.id);
  }

  async cancelSubscription(userId: number): Promise<UserWithPlanRecord> {
    return this.prisma.cancelUserSubscription(userId);
  }

  private normalizePlanName(plan: string | undefined): string {
    const normalized = (plan ?? 'Free').trim().toLowerCase();
    const mapping: Record<string, string> = {
      free: 'Free',
      starter: 'Starter',
      growth: 'Growth',
      pro: 'Pro',
      enterprise: 'Enterprise',
    };

    const mapped = mapping[normalized];
    if (!mapped) {
      throw new BadRequestException(
        'Invalid plan selected. Use Free, Starter, Growth, Pro, or Enterprise.',
      );
    }

    return mapped;
  }
}
