import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { Project, ServiceOrder } from '@prisma/client';

export class UpsertProjectDto {
  @ApiProperty({ maxLength: 40, example: 'PRJ-001' })
  @IsString()
  @MaxLength(40)
  code!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Planned effort in hours; null = no plan. */
  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  planHours?: number | null;
}

export class UpsertServiceOrderDto {
  @ApiProperty({ maxLength: 60, example: 'SA-2026-001' })
  @IsString()
  @MaxLength(60)
  orderNo!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Planned effort in hours; null = no plan. */
  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  planHours?: number | null;
}

export interface ServiceOrderDto {
  id: string;
  projectId: string;
  orderNo: string;
  title: string;
  isActive: boolean;
  planHours: number | null;
  /** Gross minutes booked onto this order (closed, non-rejected entries). */
  bookedMinutes: number;
}

export interface ProjectDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  planHours: number | null;
  /** Gross minutes booked onto the project incl. order-less entries. */
  bookedMinutes: number;
  serviceOrders: ServiceOrderDto[];
  assignedEmployeeCount: number;
  updatedAt: string;
}

export interface ProjectAssignmentDto {
  employeeId: string;
  projectId: string;
}

export interface BookableServiceOrderDto {
  id: string;
  orderNo: string;
  title: string;
}

/** Slim shape for the booking selector: active projects assigned to the employee. */
export interface BookableProjectDto {
  id: string;
  code: string;
  name: string;
  /** Active service orders — when non-empty, one MUST be chosen on booking. */
  serviceOrders: BookableServiceOrderDto[];
}

export interface ProjectReportRow {
  /** Booking day, YYYY-MM-DD in server-local time (Europe/Berlin). */
  date: string;
  employeeName: string;
  orderNo: string | null;
  orderTitle: string | null;
  grossMinutes: number;
  activity: string | null;
}

export interface ProjectReportDto {
  projectCode: string;
  projectName: string;
  from: string | null;
  to: string | null;
  rows: ProjectReportRow[];
  totalGrossMinutes: number;
}

/** Booked gross minutes for one project, total and per service order. */
export interface ProjectIstStats {
  totalMinutes: number;
  byOrder: ReadonlyMap<string, number>;
}

export const EMPTY_IST_STATS: ProjectIstStats = { totalMinutes: 0, byOrder: new Map() };

function decimalToNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function toServiceOrderDto(o: ServiceOrder, bookedMinutes: number): ServiceOrderDto {
  return {
    id: o.id,
    projectId: o.projectId,
    orderNo: o.orderNo,
    title: o.title,
    isActive: o.isActive,
    planHours: decimalToNumber(o.planHours),
    bookedMinutes,
  };
}

export function toProjectDto(
  p: Project & { serviceOrders: ServiceOrder[] },
  assignedEmployeeCount: number,
  stats: ProjectIstStats = EMPTY_IST_STATS,
): ProjectDto {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    isActive: p.isActive,
    planHours: decimalToNumber(p.planHours),
    bookedMinutes: stats.totalMinutes,
    serviceOrders: p.serviceOrders.map((o) =>
      toServiceOrderDto(o, stats.byOrder.get(o.id) ?? 0),
    ),
    assignedEmployeeCount,
    updatedAt: p.updatedAt.toISOString(),
  };
}
