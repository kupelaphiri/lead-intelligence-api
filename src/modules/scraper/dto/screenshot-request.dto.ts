import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUrl, IsOptional, IsBoolean, IsInt, Min, Max } from 'class-validator';

export class ScreenshotRequestDto {
  @ApiProperty({
    description: 'The URL to capture.',
    example: 'https://example.com',
  })
  @IsUrl({ require_tld: true })
  url: string;

  @ApiPropertyOptional({
    description: 'Capture the full scrollable page (default true).',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  fullPage?: boolean;

  @ApiPropertyOptional({ description: 'Viewport width in pixels.', default: 1280 })
  @IsOptional()
  @IsInt()
  @Min(320)
  @Max(3840)
  width?: number;

  @ApiPropertyOptional({ description: 'Viewport height in pixels.', default: 800 })
  @IsOptional()
  @IsInt()
  @Min(240)
  @Max(2160)
  height?: number;
}
