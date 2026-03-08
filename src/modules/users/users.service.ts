import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService, UserRecord } from '../../prisma/prisma.service';
import { hashPassword, verifyPassword } from './password.util';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(input: {
    email: string;
    password: string;
    name?: string;
    plan?: string;
  }): Promise<UserRecord> {
    const email = input.email.trim().toLowerCase();
    if (!email || !input.password) {
      throw new BadRequestException('email and password are required');
    }

    const existing = await this.prisma.findUserByEmail(email);
    if (existing) {
      throw new ConflictException('User already exists');
    }

    return this.prisma.createUser({
      email,
      passwordHash: hashPassword(input.password),
      name: input.name?.trim() || null,
      plan: input.plan?.trim() || 'free',
    });
  }

  async validateCredentials(
    email: string,
    password: string,
  ): Promise<UserRecord> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.findUserByEmail(normalizedEmail);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }

  async findById(id: number): Promise<UserRecord | null> {
    return this.prisma.findUserById(id);
  }
}
