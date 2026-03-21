import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { getAuthCookieName } from '../../config/app.config';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { IS_PUBLIC_KEY } from './public.decorator';

interface AuthRequest extends Request {
  authUserId?: number;
  authMethod?: 'jwt' | 'apiKey';
  apiKey?: string;
  apiKeyId?: number;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();

    const jwtToken = this.extractJwtToken(request);
    if (jwtToken) {
      try {
        const payload = await this.jwtService.verifyAsync<{ sub: number }>(
          jwtToken,
        );
        request.authUserId = payload.sub;
        request.authMethod = 'jwt';
        return true;
      } catch {
        // fall through to API key auth
      }
    }

    const apiKeyHeader = request.header('x-api-key');
    const apiKey = await this.apiKeysService.validateAndTrack(apiKeyHeader);
    request.apiKey = apiKey.key;
    request.apiKeyId = apiKey.id;
    request.authMethod = 'apiKey';

    if (apiKey.userId) {
      request.authUserId = apiKey.userId;
    }

    if (!request.authUserId) {
      throw new UnauthorizedException('No user linked to credentials');
    }

    return true;
  }

  private extractJwtToken(request: Request): string | null {
    const cookieName = getAuthCookieName();
    const cookieToken = (
      request.cookies as Record<string, string> | undefined
    )?.[cookieName];
    if (cookieToken) {
      return cookieToken;
    }

    const authHeader = request.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    return authHeader.slice(7).trim() || null;
  }
}
