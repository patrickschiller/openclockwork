import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Only booking metadata is shared: identity, GPS and approvals are never input. */
export class ProxyClockInDto {
  @ApiProperty({ minLength: 5, maxLength: 1000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  serviceOrderId?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  activity?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  billable?: boolean;

  @ApiPropertyOptional({ type: String, maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  // Whitelisting must not silently discard explicit break-policy overrides.
  @Equals(undefined, { message: 'Break overrides are not permitted' })
  breakRules?: never;

  @Equals(undefined, { message: 'Break overrides are not permitted' })
  breakMinutes?: never;

  @Equals(undefined, { message: 'Break overrides are not permitted' })
  breakOverride?: never;
}

export class ProxyManualTimeEntryDto extends ProxyClockInDto {
  @ApiProperty({
    format: 'date-time',
    description: 'Absolute past instant with UTC Z or explicit offset.',
  })
  @IsDateString({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  clockIn!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Absolute instant after clockIn and no later than now.',
  })
  @IsDateString({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  clockOut!: string;
}
