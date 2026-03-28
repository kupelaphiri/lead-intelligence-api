import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUrl,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  Max,
  IsEnum,
  IsString,
} from 'class-validator';

export enum ScraperMode {
  AUTO = 'auto',
  PLAYWRIGHT = 'playwright',
  AXIOS = 'axios',
}

export class CrawlRequestDto {
  @ApiProperty({
    description: 'The URL to crawl.',
    example: 'https://example.com',
  })
  @IsUrl({ require_tld: true })
  url: string;

  @ApiPropertyOptional({
    description: 'Maximum number of pages to crawl (default 10, max 50).',
    example: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxPages?: number;

  @ApiPropertyOptional({
    description:
      'Scraper mode: "auto" chooses the best strategy, "playwright" forces headless browser, "axios" forces HTTP fetch.',
    enum: ScraperMode,
    default: ScraperMode.AUTO,
  })
  @IsOptional()
  @IsEnum(ScraperMode)
  mode?: ScraperMode;

  @ApiPropertyOptional({
    description: 'CSS selector to wait for before extracting content (Playwright mode only).',
    example: '.product-list',
  })
  @IsOptional()
  @IsString()
  waitForSelector?: string;

  @ApiPropertyOptional({
    description: 'Include raw HTML in the response. Defaults to false to reduce payload size.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  includeHtml?: boolean;
}
