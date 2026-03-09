import { Body, Controller, Get, Headers, Patch, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  async signup(
    @Body() payload: SignupDto,
  ): Promise<{ apiKey: string; user: unknown }> {
    return this.authService.signup(payload);
  }

  @Public()
  @Post('login')
  async login(
    @Body() payload: LoginDto,
  ): Promise<{ apiKey: string; user: unknown }> {
    return this.authService.login(payload);
  }

  @Get('me')
  async me(@Headers('x-api-key') apiKey: string | undefined): Promise<unknown> {
    return this.authService.me(apiKey);
  }

  @Patch('plan')
  async updatePlan(
    @Headers('x-api-key') apiKey: string | undefined,
    @Body() payload: UpdatePlanDto,
  ): Promise<{ apiKey: string | null; user: unknown }> {
    return this.authService.updatePlan(apiKey, payload);
  }

  @Patch('subscription/cancel')
  async cancelSubscription(
    @Headers('x-api-key') apiKey: string | undefined,
  ): Promise<{ user: unknown }> {
    return this.authService.cancelSubscription(apiKey);
  }
}
