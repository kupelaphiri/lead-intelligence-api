import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsArray,
  IsEnum,
  IsIn,
} from 'class-validator';

export enum BusinessSource {
  GOOGLE_MAPS = 'google-maps',
  YELP = 'yelp',
  YELLOW_PAGES = 'yellow-pages',
}

export class BusinessSearchRequestDto {
  @ApiProperty({
    description: 'Type of business to search for.',
    example: 'dentists',
  })
  @IsString()
  query: string;

  @ApiProperty({
    description: 'City or location to search in.',
    example: 'Cape Town',
  })
  @IsString()
  location: string;

  @ApiPropertyOptional({
    description: 'Maximum results per source (default 20, max 100).',
    default: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Data sources to query. Defaults to all available sources.',
    enum: BusinessSource,
    isArray: true,
    example: ['google-maps', 'yelp'],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(BusinessSource, { each: true })
  sources?: BusinessSource[];

  @ApiPropertyOptional({
    description: 'Response format: "json" (default) or "csv".',
    default: 'json',
  })
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv';

  @ApiPropertyOptional({
    description:
      'Comma-separated list of fields to include. If omitted, all fields are returned. Example: "name,phone,website,rating".',
    example: 'name,phone,website,rating',
  })
  @IsOptional()
  @IsString()
  fields?: string;
}
