import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdatePlanDto {
  @ApiProperty({
    example: 'Growth',
    description: 'Free | Basic | Starter | Growth | Pro | Enterprise',
  })
  @IsString()
  plan!: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Rotate and return a new API key after plan change',
  })
  @IsOptional()
  @IsBoolean()
  rotateApiKey?: boolean;
}
