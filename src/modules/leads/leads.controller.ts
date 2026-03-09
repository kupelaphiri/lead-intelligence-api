import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Query,
} from '@nestjs/common';
import { LeadsService } from './leads.service';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  async getLeads(
    @Headers('x-api-key') apiKey: string | undefined,
    @Query('query') query?: string,
    @Query('city') city?: string,
    @Query('limit') limit = '20',
  ): Promise<unknown[]> {
    if (!query || !city) {
      throw new BadRequestException('query and city are required');
    }

    const parsedLimit = Number.parseInt(limit, 10);
    const boundedLimit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 100))
      : 20;

    return this.leadsService.getLeads(
      apiKey,
      query.trim(),
      city.trim(),
      boundedLimit,
    );
  }
}
