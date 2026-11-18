import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const PROXY_REQUEST_TYPES = ['Vacation', 'HomeOffice', 'SpecialLeave'] as const;

/** No owner/actor, correction target, or approval state is accepted from the body. */
export class ProxyRequestDto {
  @ApiProperty({ enum: PROXY_REQUEST_TYPES })
  @IsEnum(PROXY_REQUEST_TYPES)
  type!: (typeof PROXY_REQUEST_TYPES)[number];

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  from!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  to!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  halfDayStart?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  halfDayEnd?: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  substituteId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string | null;

  @ApiProperty({
    minLength: 5,
    maxLength: 1000,
    description: 'Operational reason for acting on behalf of the employee.',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  proxyReason!: string;
}
