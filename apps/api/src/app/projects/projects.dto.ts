import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
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
}

export interface ServiceOrderDto {
  id: string;
  projectId: string;
  orderNo: string;
  title: string;
  isActive: boolean;
}

export interface ProjectDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  serviceOrders: ServiceOrderDto[];
  assignedEmployeeCount: number;
  updatedAt: string;
}

export interface ProjectAssignmentDto {
  employeeId: string;
  projectId: string;
}

/** Slim shape for the booking selector: active projects assigned to the employee. */
export interface BookableProjectDto {
  id: string;
  code: string;
  name: string;
}

export function toServiceOrderDto(o: ServiceOrder): ServiceOrderDto {
  return {
    id: o.id,
    projectId: o.projectId,
    orderNo: o.orderNo,
    title: o.title,
    isActive: o.isActive,
  };
}

export function toProjectDto(
  p: Project & { serviceOrders: ServiceOrder[] },
  assignedEmployeeCount: number,
): ProjectDto {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    isActive: p.isActive,
    serviceOrders: p.serviceOrders.map(toServiceOrderDto),
    assignedEmployeeCount,
    updatedAt: p.updatedAt.toISOString(),
  };
}
