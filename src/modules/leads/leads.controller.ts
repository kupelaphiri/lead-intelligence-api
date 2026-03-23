import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LeadsService } from './leads.service';

interface AuthRequest extends Request {
  authUserId?: number;
}

interface LeadsResponse {
  status: 'ready' | 'processing';
  data: unknown[];
  message?: string;
  jobId?: string;
  partial?: boolean;
  limit: number;
  query: string;
  city: string;
}

@ApiTags('Leads')
@ApiBearerAuth()
@ApiCookieAuth('li_auth')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @ApiOperation({
    summary:
      'Get leads from cache or trigger background scraping if data is not ready',
  })
  @ApiQuery({ name: 'query', required: true, example: 'dentists' })
  @ApiQuery({ name: 'city', required: true, example: 'Johannesburg' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Defaults to 100, max 100',
    example: 100,
  })
  @ApiQuery({
    name: 'hasEmail',
    required: false,
    description: 'Return only leads with at least one email',
    example: 'true',
  })
  @ApiQuery({
    name: 'hasContacts',
    required: false,
    description: 'Return only leads with extracted person/contact records',
    example: 'true',
  })
  @ApiQuery({
    name: 'minLeadScore',
    required: false,
    description: 'Minimum computed lead score from 0 to 100',
    example: 50,
  })
  @ApiQuery({
    name: 'refreshStale',
    required: false,
    description:
      'Whether to queue refreshes for stale enrichment in background',
    example: 'true',
  })
  @ApiQuery({
    name: 'highQualityOnly',
    required: false,
    description:
      'Return only leads with at least one high-quality contact or email',
    example: 'true',
  })
  @ApiResponse({ status: 200, description: 'Leads ready or processing status' })
  @Get()
  async getLeads(
    @Req() request: AuthRequest,
    @Query('query') query?: string,
    @Query('city') city?: string,
    @Query('limit') limit = '100',
    @Query('hasEmail') hasEmail?: string,
    @Query('hasContacts') hasContacts?: string,
    @Query('minLeadScore') minLeadScore?: string,
    @Query('refreshStale') refreshStale?: string,
    @Query('highQualityOnly') highQualityOnly?: string,
  ): Promise<LeadsResponse> {
    if (!query || !city) {
      throw new BadRequestException('query and city are required');
    }

    const parsedLimit = Number.parseInt(limit, 10);
    const boundedLimit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 100))
      : 100;
    const parsedMinLeadScore = Number.parseInt(minLeadScore ?? '', 10);

    return this.leadsService.getLeads(
      request.authUserId,
      query.trim(),
      city.trim(),
      boundedLimit,
      {
        hasEmail: this.parseBoolean(hasEmail),
        hasContacts: this.parseBoolean(hasContacts),
        minLeadScore: Number.isFinite(parsedMinLeadScore)
          ? Math.max(0, Math.min(parsedMinLeadScore, 100))
          : undefined,
        refreshStale: this.parseBoolean(refreshStale),
        highQualityOnly: this.parseBoolean(highQualityOnly),
      },
    );
  }

  private parseBoolean(value?: string): boolean | undefined {
    if (!value) {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no'].includes(normalized)) {
      return false;
    }

    return undefined;
  }
}
