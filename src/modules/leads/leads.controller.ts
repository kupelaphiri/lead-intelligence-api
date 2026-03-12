import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { LeadsService } from './leads.service';

interface AuthRequest extends Request {
  authUserId?: number;
}

interface LeadsResponse {
  status: 'ready' | 'processing';
  data: unknown[];
  message?: string;
  jobId?: string;
  limit: number;
  query: string;
  city: string;
}

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  async getLeads(
    @Req() request: AuthRequest,
    @Query('query') query?: string,
    @Query('city') city?: string,
    @Query('limit') limit = '100',
  ): Promise<LeadsResponse> {
    if (!query || !city) {
      throw new BadRequestException('query and city are required');
    }

    const parsedLimit = Number.parseInt(limit, 10);
    const boundedLimit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 100))
      : 100;

    return this.leadsService.getLeads(
      request.authUserId,
      query.trim(),
      city.trim(),
      boundedLimit,
    );
  }
}
