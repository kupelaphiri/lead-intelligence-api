import { Body, Controller, Get, Patch, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { Public } from './public.decorator';

interface AuthRequest extends Request {
  authUserId?: number;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  async signup(
    @Body() payload: SignupDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ apiKey: string; user: unknown }> {
    const result = await this.authService.signup(payload);
    this.setAuthCookie(response, result.accessToken);

    return {
      apiKey: result.apiKey,
      user: result.user,
    };
  }

  @Public()
  @Post('login')
  async login(
    @Body() payload: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ apiKey: string; user: unknown }> {
    const result = await this.authService.login(payload);
    this.setAuthCookie(response, result.accessToken);

    return {
      apiKey: result.apiKey,
      user: result.user,
    };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response): { success: true } {
    this.clearAuthCookie(response);
    return { success: true };
  }

  @Get('me')
  async me(@Req() request: AuthRequest): Promise<unknown> {
    return this.authService.me(request.authUserId);
  }

  @Patch('plan')
  async updatePlan(
    @Req() request: AuthRequest,
    @Body() payload: UpdatePlanDto,
  ): Promise<{ apiKey: string | null; user: unknown }> {
    return this.authService.updatePlan(request.authUserId, payload);
  }

  @Patch('subscription/cancel')
  async cancelSubscription(
    @Req() request: AuthRequest,
  ): Promise<{ user: unknown }> {
    return this.authService.cancelSubscription(request.authUserId);
  }

  private setAuthCookie(response: Response, token: string): void {
    const cookieName = process.env.AUTH_COOKIE_NAME ?? 'li_auth';
    response.cookie(cookieName, token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite:
        (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none') ?? 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearAuthCookie(response: Response): void {
    const cookieName = process.env.AUTH_COOKIE_NAME ?? 'li_auth';
    response.clearCookie(cookieName, {
      path: '/',
    });
  }
}
