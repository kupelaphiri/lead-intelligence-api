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
  }): Promise<UserWithPlanRecord> {
    const email = input.email.trim().toLowerCase();
    if (!email || !input.password) {
      throw new BadRequestException('email and password are required');
    }

    const existing = await this.prisma.findUserByEmail(email);
    if (existing) {
      throw new ConflictException('User already exists');
    }

    const starterPlan = await this.prisma.findDefaultStarterPlan();
    if (!starterPlan) {
      throw new BadRequestException('Default Starter plan is not configured');
    }

    return this.prisma.createUser({
      email,
      passwordHash: hashPassword(input.password),
      name: input.name?.trim() || null,
      planId: starterPlan.id,
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
    const plan = await this.prisma.findPlanByName(planName);
    if (!plan) {
      throw new BadRequestException('Invalid plan selected');
    }

    return this.prisma.updateUserPlan(userId, plan.id);
  }

  async cancelSubscription(userId: number): Promise<UserWithPlanRecord> {
    return this.prisma.cancelUserSubscription(userId);
  }
}
