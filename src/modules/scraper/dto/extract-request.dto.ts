import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUrl,
  IsOptional,
  IsArray,
  IsString,
  IsBoolean,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ScraperMode } from './crawl-request.dto';

export class SelectorDefinition {
  @ApiProperty({
    description: 'A key name for the extracted value.',
    example: 'title',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'CSS selector to target the element.',
    example: 'h1.page-title',
  })
  @IsString()
  selector: string;

  @ApiPropertyOptional({
    description:
      'HTML attribute to extract. Use "text" (default) for inner text or "html" for raw HTML.',
    example: 'href',
    default: 'text',
  })
  @IsOptional()
  @IsString()
  attribute?: string;

  @ApiPropertyOptional({
    description: 'If true, extracts all matching elements as an array.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  multiple?: boolean;
}

export class ExtractRequestDto {
  @ApiProperty({
    description: 'The URL to extract data from.',
    example: 'https://quotes.toscrape.com',
  })
  @IsUrl({ require_tld: true })
  url: string;

  @ApiProperty({
    description: 'List of field definitions with CSS selectors to extract.',
    type: [SelectorDefinition],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectorDefinition)
  selectors: SelectorDefinition[];

  @ApiPropertyOptional({
    description: 'Scraper mode.',
    enum: ScraperMode,
    default: ScraperMode.AUTO,
  })
  @IsOptional()
  @IsEnum(ScraperMode)
  mode?: ScraperMode;

  @ApiPropertyOptional({
    description: 'CSS selector to wait for before extracting (Playwright mode only).',
  })
  @IsOptional()
  @IsString()
  waitForSelector?: string;
}
