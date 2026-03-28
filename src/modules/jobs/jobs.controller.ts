import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('jobs')
@ApiSecurity('api-key')
@Controller('jobs')
export class JobsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':jobId')
  @ApiOperation({
    summary: 'Get job status by ID',
    description:
      'Returns the current status and metadata of a background scraping or enrichment job. Use the jobId returned from /leads or /scraper/businesses to poll for completion.',
  })
  @ApiResponse({ status: 200, description: 'Job found.' })
  @ApiResponse({ status: 404, description: 'Job not found.' })
  async getJobStatus(@Param('jobId') jobId: string) {
    const job = await this.prisma.findJobRunByJobId(jobId);

    if (!job) {
      throw new NotFoundException(`Job "${jobId}" not found`);
    }

    return {
      jobId: job.jobId,
      queueName: job.queueName,
      status: job.status,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      durationMs: job.durationMs,
      processedCount: job.processedCount,
      errorMessage: job.errorMessage,
      metadata: job.metadata,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'Get job run summary',
    description:
      'Returns aggregate stats by queue and recent job runs.',
  })
  @ApiResponse({ status: 200, description: 'Summary returned.' })
  async getJobSummary() {
    return this.prisma.getJobRunSummary();
  }
}
