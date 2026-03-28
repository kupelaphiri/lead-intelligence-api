import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ScraperService } from './scraper.service';
import { CrawlRequestDto, ScraperMode } from './dto/crawl-request.dto';
import { ExtractRequestDto } from './dto/extract-request.dto';
import { ScreenshotRequestDto } from './dto/screenshot-request.dto';
import { BusinessSearchRequestDto, BusinessSource } from './dto/business-search-request.dto';

@ApiTags('scraper')
@ApiSecurity('api-key')
@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post('crawl')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Crawl a website',
    description:
      'Crawls a URL and returns each discovered page with extracted text and title. Set includeHtml=true to get raw HTML (large payloads).',
  })
  @ApiBody({ type: CrawlRequestDto })
  @ApiResponse({ status: 200, description: 'Crawl completed successfully.' })
  async crawl(@Body() dto: CrawlRequestDto) {
    const pages = await this.scraperService.crawl(
      dto.url,
      dto.maxPages ?? 10,
      dto.mode ?? ScraperMode.AUTO,
      dto.waitForSelector,
    );

    const includeHtml = dto.includeHtml ?? false;

    return {
      url: dto.url,
      pagesScraped: pages.length,
      pages: pages.map((p) => ({
        url: p.url,
        title: p.title,
        statusCode: p.statusCode,
        contentType: p.contentType,
        textLength: p.text.length,
        text: p.text,
        ...(includeHtml ? { html: p.html } : {}),
      })),
    };
  }

  @Post('extract')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Extract structured data from a URL',
    description:
      'Fetches a page and applies your CSS selector definitions to extract specific data fields.',
  })
  @ApiBody({ type: ExtractRequestDto })
  @ApiResponse({ status: 200, description: 'Data extracted successfully.' })
  async extract(@Body() dto: ExtractRequestDto) {
    const result = await this.scraperService.extract(
      dto.url,
      dto.selectors,
      dto.mode ?? ScraperMode.AUTO,
      dto.waitForSelector,
    );

    return {
      url: result.url,
      data: result.data,
      fieldsExtracted: Object.keys(result.data).filter((k) => result.data[k] !== null).length,
    };
  }

  @Post('screenshot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Capture a screenshot of a page',
    description:
      'Renders a URL in a headless browser and returns a base64-encoded PNG screenshot.',
  })
  @ApiBody({ type: ScreenshotRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Screenshot captured. Returns base64-encoded PNG.',
  })
  async screenshot(@Body() dto: ScreenshotRequestDto) {
    const result = await this.scraperService.screenshot(
      dto.url,
      dto.fullPage ?? true,
      dto.width ?? 1280,
      dto.height ?? 800,
    );

    return {
      url: result.url,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      imageBase64: result.imageBase64,
    };
  }

  @Post('businesses')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Search for businesses across multiple sources',
    description:
      'Queries Google Maps, Yelp, and/or Yellow Pages. Supports JSON and CSV output, and field filtering.',
  })
  @ApiBody({ type: BusinessSearchRequestDto })
  @ApiResponse({ status: 200, description: 'Business search results.' })
  async searchBusinesses(
    @Body() dto: BusinessSearchRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sources = dto.sources ?? [
      BusinessSource.GOOGLE_MAPS,
      BusinessSource.YELP,
      BusinessSource.YELLOW_PAGES,
    ];

    const { combined, bySource } = await this.scraperService.searchBusinesses(
      dto.query,
      dto.location,
      dto.limit ?? 20,
      sources,
    );

    // Apply field filtering
    const fields = dto.fields
      ? dto.fields.split(',').map((f) => f.trim()).filter(Boolean)
      : null;

    const filteredBusinesses = fields
      ? combined.map((b) => this.pickFields(b, fields))
      : combined;

    // CSV export
    if (dto.format === 'csv') {
      const csv = this.toCsv(filteredBusinesses, fields);
      res.header('Content-Type', 'text/csv');
      res.header(
        'Content-Disposition',
        `attachment; filename="businesses-${dto.query}-${dto.location}.csv"`,
      );
      return csv;
    }

    return {
      query: dto.query,
      location: dto.location,
      totalResults: filteredBusinesses.length,
      businesses: filteredBusinesses,
      sourceBreakdown: bySource.map((s) => ({
        source: s.source,
        count: s.businesses.length,
        error: s.error ?? null,
      })),
    };
  }

  private pickFields(
    business: Record<string, any>,
    fields: string[],
  ): Record<string, any> {
    const result: Record<string, any> = {};
    for (const field of fields) {
      if (field in business) {
        result[field] = business[field];
      }
    }
    return result;
  }

  private toCsv(
    items: Record<string, any>[],
    fields?: string[] | null,
  ): string {
    if (items.length === 0) return '';

    const headers = fields ?? Object.keys(items[0]);
    const escape = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = items.map((item) =>
      headers.map((h) => escape(item[h])).join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }
}
