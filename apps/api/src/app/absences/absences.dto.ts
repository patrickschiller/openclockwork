import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Absence } from '@prisma/client';

const ABSENCE_KINDS = ['Sickness', 'Training', 'Flextime'] as const;

export class CreateAbsenceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId!: string;

  @ApiPropertyOptional({ enum: ABSENCE_KINDS, default: 'Sickness' })
  @IsOptional()
  @IsEnum(ABSENCE_KINDS)
  kind?: (typeof ABSENCE_KINDS)[number];

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  from!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  to!: string;

  @ApiPropertyOptional({ default: false, description: 'Sickness only: ärztliches Attest vorgelegt.' })
  @IsOptional()
  @IsBoolean()
  certified?: boolean;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class UpdateAbsenceDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  certified?: boolean;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export interface AbsenceDto {
  id: string;
  employeeId: string;
  kind: string;
  from: string;
  to: string;
  certified: boolean;
  note: string | null;
  createdAt: string;
}

function toDateOnlyIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toAbsenceDto(a: Absence): AbsenceDto {
  return {
    id: a.id,
    employeeId: a.employeeId,
    kind: a.kind,
    from: toDateOnlyIso(a.from),
    to: toDateOnlyIso(a.to),
    certified: a.certified,
    note: a.note,
    createdAt: a.createdAt.toISOString(),
  };
}
