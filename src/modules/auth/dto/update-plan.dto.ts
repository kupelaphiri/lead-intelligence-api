import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePlanDto {
  @ApiProperty({
    example: 'Growth',
    description: 'Free | Starter | Growth | Pro | Enterprise',
  })
  plan!: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Rotate and return a new API key after plan change',
  })
  rotateApiKey?: boolean;
}
