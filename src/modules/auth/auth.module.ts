import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { UsersModule } from '../users/users.module';
import { ApiKeyGuard } from './api-key.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const jwtExpirySeconds = Number.parseInt(
  process.env.JWT_EXPIRES_IN_SECONDS ?? '604800',
  10,
);

@Module({
  imports: [
    ApiKeysModule,
    UsersModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-jwt-secret',
      signOptions: {
        expiresIn: jwtExpirySeconds,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AuthModule {}
