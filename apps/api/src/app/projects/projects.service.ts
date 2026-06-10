import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import {
  toProjectDto,
  toServiceOrderDto,
  type BookableProjectDto,
  type ProjectAssignmentDto,
  type ProjectDto,
  type ServiceOrderDto,
  type UpsertProjectDto,
  type UpsertServiceOrderDto,
} from './projects.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  async list(includeInactive: boolean): Promise<ProjectDto[]> {
    const rows = await this.prisma.project.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { code: 'asc' },
      include: {
        serviceOrders: { orderBy: { orderNo: 'asc' } },
        _count: { select: { assignments: true } },
      },
    });
    return rows.map((r) => toProjectDto(r, r._count.assignments));
  }

  async getById(id: string): Promise<ProjectDto> {
    const row = await this.findOrThrow(id);
    return toProjectDto(row, row._count.assignments);
  }

  async create(dto: UpsertProjectDto): Promise<ProjectDto> {
    try {
      const created = await this.prisma.project.create({
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description ?? null,
          isActive: dto.isActive ?? true,
        },
        include: { serviceOrders: true },
      });
      this.broadcast(created.id);
      return toProjectDto(created, 0);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`A project with code "${dto.code}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpsertProjectDto): Promise<ProjectDto> {
    await this.findOrThrow(id);
    try {
      const updated = await this.prisma.project.update({
        where: { id },
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description ?? null,
          isActive: dto.isActive ?? true,
        },
        include: {
          serviceOrders: { orderBy: { orderNo: 'asc' } },
          _count: { select: { assignments: true } },
        },
      });
      this.broadcast(id);
      return toProjectDto(updated, updated._count.assignments);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`A project with code "${dto.code}" already exists`);
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    const bookedEntries = await this.prisma.timeEntry.count({ where: { projectId: id } });
    if (bookedEntries > 0) {
      throw new ConflictException(
        'Project has booked time entries and cannot be deleted — deactivate it instead',
      );
    }
    await this.prisma.project.delete({ where: { id } });
    this.broadcast(id);
  }

  async createServiceOrder(
    projectId: string,
    dto: UpsertServiceOrderDto,
  ): Promise<ServiceOrderDto> {
    await this.findOrThrow(projectId);
    try {
      const created = await this.prisma.serviceOrder.create({
        data: {
          projectId,
          orderNo: dto.orderNo,
          title: dto.title,
          isActive: dto.isActive ?? true,
        },
      });
      this.broadcast(projectId);
      return toServiceOrderDto(created);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `A service order "${dto.orderNo}" already exists in this project`,
        );
      }
      throw err;
    }
  }

  async updateServiceOrder(
    projectId: string,
    orderId: string,
    dto: UpsertServiceOrderDto,
  ): Promise<ServiceOrderDto> {
    await this.findServiceOrderOrThrow(projectId, orderId);
    try {
      const updated = await this.prisma.serviceOrder.update({
        where: { id: orderId },
        data: {
          orderNo: dto.orderNo,
          title: dto.title,
          isActive: dto.isActive ?? true,
        },
      });
      this.broadcast(projectId);
      return toServiceOrderDto(updated);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `A service order "${dto.orderNo}" already exists in this project`,
        );
      }
      throw err;
    }
  }

  async removeServiceOrder(projectId: string, orderId: string): Promise<void> {
    await this.findServiceOrderOrThrow(projectId, orderId);
    await this.prisma.serviceOrder.delete({ where: { id: orderId } });
    this.broadcast(projectId);
  }

  /** Idempotent: assigning an already-assigned employee is a no-op success. */
  async assign(projectId: string, employeeId: string): Promise<void> {
    await this.findOrThrow(projectId);
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);
    await this.prisma.projectAssignment.upsert({
      where: { employeeId_projectId: { employeeId, projectId } },
      create: { employeeId, projectId },
      update: {},
    });
    this.broadcast(projectId);
  }

  /** Idempotent: removing a non-existent assignment is a no-op success. */
  async unassign(projectId: string, employeeId: string): Promise<void> {
    await this.findOrThrow(projectId);
    await this.prisma.projectAssignment.deleteMany({ where: { employeeId, projectId } });
    this.broadcast(projectId);
  }

  /** Full matrix data: one row per existing employee↔project assignment. */
  async listAssignments(): Promise<ProjectAssignmentDto[]> {
    const rows = await this.prisma.projectAssignment.findMany({
      select: { employeeId: true, projectId: true },
    });
    return rows;
  }

  /** Active projects the employee is assigned to — the booking selector source. */
  async listBookable(employeeId: string): Promise<BookableProjectDto[]> {
    return this.prisma.project.findMany({
      where: { isActive: true, assignments: { some: { employeeId } } },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true },
    });
  }

  /**
   * Booking authorization used by clock-in, retroactive assignment, and split:
   * the project must exist (404), be active (400), and the employee must be
   * assigned via the admin matrix (403).
   */
  async assertBookable(employeeId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    if (!project.isActive) {
      throw new BadRequestException(`Project "${project.code}" is inactive`);
    }
    const assignment = await this.prisma.projectAssignment.findUnique({
      where: { employeeId_projectId: { employeeId, projectId } },
    });
    if (!assignment) {
      throw new ForbiddenException(`Employee is not assigned to project "${project.code}"`);
    }
  }

  private broadcast(projectId: string): void {
    this.events.broadcast('project:changed', { projectId });
  }

  private async findOrThrow(id: string) {
    const row = await this.prisma.project.findUnique({
      where: { id },
      include: {
        serviceOrders: { orderBy: { orderNo: 'asc' } },
        _count: { select: { assignments: true } },
      },
    });
    if (!row) throw new NotFoundException(`Project ${id} not found`);
    return row;
  }

  private async findServiceOrderOrThrow(projectId: string, orderId: string) {
    const row = await this.prisma.serviceOrder.findFirst({
      where: { id: orderId, projectId },
    });
    if (!row) {
      throw new NotFoundException(`Service order ${orderId} not found in project ${projectId}`);
    }
    return row;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
  );
}
