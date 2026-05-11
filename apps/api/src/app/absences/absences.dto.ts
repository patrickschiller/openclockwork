import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Absence } from '@prisma/client';

const ABSENCE_KINDS = ['Sickness', 'Training', 'Flextime'] as const;

export class CreateAbsenceDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsEnum(ABSENCE_KINDS)
  kind?: (typeof ABSENCE_KINDS)[number];

  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsBoolean()
  certified?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class UpdateAbsenceDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsBoolean()
  certified?: boolean;

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
