import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import {
  IsEmpty,
  IsEnum,
  IsISO8601,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const PROXY_ABSENCE_KINDS = ['Sickness', 'Training', 'Flextime'] as const;

/** Recorded operational absence; no medical documentation or diagnosis. */
export class ProxyAbsenceDto {
  @ApiProperty({ enum: PROXY_ABSENCE_KINDS })
  @IsEnum(PROXY_ABSENCE_KINDS)
  kind!: (typeof PROXY_ABSENCE_KINDS)[number];

  @ApiProperty({ format: 'date', example: '2026-08-03' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  from!: string;

  @ApiProperty({ format: 'date', example: '2026-08-04' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  to!: string;

  @ApiProperty({
    minLength: 5,
    maxLength: 1000,
    description:
      'Operational reason for recording on behalf of the employee; do not include medical details.',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  proxyReason!: string;

  // Explicitly reject legacy medical fields instead of silently accepting them.
  @ApiHideProperty()
  @IsEmpty()
  note?: never;

  @ApiHideProperty()
  @IsEmpty()
  certified?: never;

  @ApiHideProperty()
  @IsEmpty()
  diagnosis?: never;
}
