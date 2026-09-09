import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
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

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  defaultBillable?: boolean;
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

  @ApiPropertyOptional({
    nullable: true,
    description: 'Null inherits the project default.',
  })
  @IsOptional()
  @IsBoolean()
  defaultBillable?: boolean | null;
}

export class ServiceOrderDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  projectId!: string;
  @ApiProperty()
  orderNo!: string;
  @ApiProperty()
  title!: string;
  @ApiProperty()
  isActive!: boolean;
  @ApiProperty({ type: Number, nullable: true })
  planHours!: number | null;
  /** Gross minutes booked onto this order (closed, non-rejected entries). */
  @ApiProperty()
  bookedMinutes!: number;
  @ApiProperty({ type: Boolean, nullable: true })
  defaultBillable!: boolean | null;
  /** Exact net minutes in the Solo owner's report; absent in Team mode. */
  @ApiPropertyOptional()
  bookedNetMinutes?: number;
}

export class ProjectDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  code!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty({ type: String, nullable: true })
  description!: string | null;
  @ApiProperty()
  isActive!: boolean;
  @ApiProperty({ type: Number, nullable: true })
  planHours!: number | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  customerId!: string | null;
  @ApiProperty({ type: String, nullable: true })
  customerName!: string | null;
  @ApiProperty()
  defaultBillable!: boolean;
  /** Exact net minutes in the Solo owner's report; absent in Team mode. */
  @ApiPropertyOptional()
  bookedNetMinutes?: number;
  /** Gross minutes booked onto the project incl. order-less entries. */
  @ApiProperty()
  bookedMinutes!: number;
  @ApiProperty({ type: [ServiceOrderDto] })
  serviceOrders!: ServiceOrderDto[];
  @ApiProperty()
  assignedEmployeeCount!: number;
  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export interface ProjectAssignmentDto {
  employeeId: string;
  projectId: string;
}

export class BookableServiceOrderDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  orderNo!: string;
  @ApiProperty()
  title!: string;
  @ApiProperty({ type: Boolean, nullable: true })
  defaultBillable!: boolean | null;
}

/** Slim shape for the booking selector: active projects assigned to the employee. */
export class BookableProjectDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  code!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  customerId!: string | null;
  @ApiProperty({ type: String, nullable: true })
  customerName!: string | null;
  @ApiProperty()
  defaultBillable!: boolean;
  /** Active service orders — when non-empty, one MUST be chosen on booking. */
  @ApiProperty({ type: [BookableServiceOrderDto] })
  serviceOrders!: BookableServiceOrderDto[];
}

export interface ProjectReportRow {
  /** Booking day, YYYY-MM-DD in the deployment’s configured local timezone. */
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
  netMinutes?: number;
  netByOrder?: ReadonlyMap<string, number>;
}

export const EMPTY_IST_STATS: ProjectIstStats = {
  totalMinutes: 0,
  byOrder: new Map(),
};

function decimalToNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function toServiceOrderDto(
  o: ServiceOrder,
  bookedMinutes: number,
  bookedNetMinutes?: number,
): ServiceOrderDto {
  return {
    id: o.id,
    projectId: o.projectId,
    orderNo: o.orderNo,
    title: o.title,
    isActive: o.isActive,
    planHours: decimalToNumber(o.planHours),
    bookedMinutes,
    defaultBillable: o.defaultBillable,
    ...(bookedNetMinutes === undefined ? {} : { bookedNetMinutes }),
  };
}

export function toProjectDto(
  p: Project & {
    serviceOrders: ServiceOrder[];
    customer?: { name: string } | null;
  },
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
    customerId: p.customerId,
    customerName: p.customer?.name ?? null,
    defaultBillable: p.defaultBillable,
    bookedMinutes: stats.totalMinutes,
    ...(stats.netMinutes === undefined
      ? {}
      : { bookedNetMinutes: stats.netMinutes }),
    serviceOrders: p.serviceOrders.map((o) =>
      toServiceOrderDto(
        o,
        stats.byOrder.get(o.id) ?? 0,
        stats.netByOrder?.get(o.id) ??
          (stats.netMinutes === undefined ? undefined : 0),
      ),
    ),
    assignedEmployeeCount,
    updatedAt: p.updatedAt.toISOString(),
  };
}
