import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async signup(payload: SignupDto): Promise<{ apiKey: string; user: unknown }> {
    const user = await this.usersService.createUser(payload);
    const apiKey = await this.apiKeysService.createForUser(user.id, user.plan);

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
      apiKey ?? (await this.apiKeysService.createForUser(user.id, user.plan));

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

  private toPublicUser(user: {
    id: number;
    email: string;
    name: string | null;
    plan: string;
    createdAt: Date;
  }): {
    id: number;
    email: string;
    name: string | null;
    plan: string;
    createdAt: Date;
  } {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      createdAt: user.createdAt,
    };
  }
}
