import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ServiceOrder } from '@prisma/client';
import { summarize } from 'shared';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import {
  INSTALLATION_LOCK,
  InstallationService,
} from '../installation/installation.service';
import { calculateCaptureSummaries } from '../time-entries/capture-summary';
import type { JwtUser } from '../auth/jwt.strategy';
import {
  EMPTY_IST_STATS,
  toProjectDto,
  toServiceOrderDto,
  type BookableProjectDto,
  type ProjectAssignmentDto,
  type ProjectDto,
  type ProjectIstStats,
  type ProjectReportDto,
  type ServiceOrderDto,
  type UpsertProjectDto,
  type UpsertServiceOrderDto,
} from './projects.dto';

interface IstRow {
  projectId: string;
  serviceOrderId: string | null;
  minutes: number;
}

/** Booking day in the deployment’s configured local timezone. */
function localDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly installation: InstallationService,
  ) {}

  async list(includeInactive: boolean): Promise<ProjectDto[]> {
    const [rows, stats] = await Promise.all([
      this.prisma.project.findMany({
        where: includeInactive ? undefined : { isActive: true },
        orderBy: { code: 'asc' },
        include: {
          customer: { select: { name: true } },
          serviceOrders: { orderBy: { orderNo: 'asc' } },
          _count: { select: { assignments: true } },
        },
      }),
      this.loadIstStats(),
    ]);
    return rows.map((r) =>
      toProjectDto(r, r._count.assignments, stats.get(r.id) ?? EMPTY_IST_STATS),
    );
  }

  async getById(id: string): Promise<ProjectDto> {
    const row = await this.findOrThrow(id);
    const stats = await this.loadIstStats(id);
    return toProjectDto(
      row,
      row._count.assignments,
      stats.get(id) ?? EMPTY_IST_STATS,
    );
  }

  async create(dto: UpsertProjectDto, actor: JwtUser): Promise<ProjectDto> {
    let solo = false;
    try {
      const created = await this.mutate(actor, async (tx, isSolo) => {
        solo = isSolo;
        if (dto.customerId) await this.assertCustomerActive(tx, dto.customerId);
        return tx.project.create({
          data: {
            code: dto.code,
            name: dto.name,
            description: dto.description ?? null,
            isActive: dto.isActive ?? true,
            planHours: dto.planHours ?? null,
            customerId: dto.customerId ?? null,
            defaultBillable: dto.defaultBillable ?? false,
            assignments: solo
              ? { create: { employeeId: actor.id } }
              : undefined,
          },
          include: {
            serviceOrders: true,
            customer: { select: { name: true } },
          },
        });
      });
      this.broadcast(created.id);
      return toProjectDto(
        created,
        solo ? 1 : 0,
        solo
          ? { ...EMPTY_IST_STATS, netMinutes: 0, netByOrder: new Map() }
          : EMPTY_IST_STATS,
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `A project with code "${dto.code}" already exists`,
        );
      }
      throw err;
    }
  }

  async update(
    id: string,
    dto: UpsertProjectDto,
    actor: JwtUser,
  ): Promise<ProjectDto> {
    // Reducing (or introducing) the project plan below the current sum of
    // service-order plans would silently break the invariant — reject.
    try {
      const updated = await this.mutate(actor, async (tx) => {
        const existing = await this.findOrThrow(id, tx);
        if (dto.planHours !== null && dto.planHours !== undefined) {
          const ordersTotal = sumPlanHours(existing.serviceOrders);
          if (ordersTotal > dto.planHours)
            throw new ConflictException(
              `Project plan of ${dto.planHours} h is below the service-order total of ${ordersTotal} h`,
            );
        }
        if (dto.customerId && dto.customerId !== existing.customerId)
          await this.assertCustomerActive(tx, dto.customerId);
        await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const current = await tx.project.findUniqueOrThrow({ where: { id } });
        if (
          dto.customerId !== undefined &&
          dto.customerId !== current.customerId
        ) {
          if (await tx.timeEntry.count({ where: { projectId: id } }))
            throw new ConflictException(
              'A booked project cannot change customer; create a new project instead',
            );
        }
        if (
          current.isActive &&
          dto.isActive === false &&
          (await tx.timeEntry.count({
            where: {
              projectId: id,
              clockOut: null,
              voidedAt: null,
              status: { not: 'Rejected' },
            },
          }))
        ) {
          throw new ConflictException(
            'Finish or reassign the running timer before archiving this project',
          );
        }
        return tx.project.update({
          where: { id },
          data: {
            code: dto.code,
            name: dto.name,
            description: dto.description ?? null,
            isActive: dto.isActive ?? true,
            planHours: dto.planHours ?? null,
            customerId: dto.customerId,
            defaultBillable: dto.defaultBillable,
          },
          include: {
            customer: { select: { name: true } },
            serviceOrders: { orderBy: { orderNo: 'asc' } },
            _count: { select: { assignments: true } },
          },
        });
      });
      this.broadcast(id);
      const stats = await this.loadIstStats(id);
      return toProjectDto(
        updated,
        updated._count.assignments,
        stats.get(id) ?? EMPTY_IST_STATS,
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `A project with code "${dto.code}" already exists`,
        );
      }
      throw err;
    }
  }

  async remove(id: string, actor: JwtUser): Promise<void> {
    await this.mutate(actor, async (tx) => {
      await this.findOrThrow(id, tx);
      const bookedEntries = await tx.timeEntry.count({
        where: { projectId: id },
      });
      if (bookedEntries > 0) {
        throw new ConflictException(
          'Project has booked time entries and cannot be deleted — deactivate it instead',
        );
      }
      await tx.project.delete({ where: { id } });
    });
    this.broadcast(id);
  }

  async createServiceOrder(
    projectId: string,
    dto: UpsertServiceOrderDto,
    actor: JwtUser,
  ): Promise<ServiceOrderDto> {
    try {
      const created = await this.mutate(actor, async (tx) => {
        const project = await this.findOrThrow(projectId, tx);
        this.assertOrderPlanFits(
          project,
          project.serviceOrders,
          dto.planHours ?? null,
        );
        return tx.serviceOrder.create({
          data: {
            projectId,
            orderNo: dto.orderNo,
            title: dto.title,
            isActive: dto.isActive ?? true,
            planHours: dto.planHours ?? null,
            defaultBillable: dto.defaultBillable ?? null,
          },
        });
      });
      this.broadcast(projectId);
      return toServiceOrderDto(created, 0);
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
    actor: JwtUser,
  ): Promise<ServiceOrderDto> {
    try {
      const updated = await this.mutate(actor, async (tx) => {
        await this.findServiceOrderOrThrow(projectId, orderId, tx);
        const project = await this.findOrThrow(projectId, tx);
        this.assertOrderPlanFits(
          project,
          project.serviceOrders.filter((order) => order.id !== orderId),
          dto.planHours ?? null,
        );
        await tx.$queryRaw`SELECT "id" FROM "ServiceOrder" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
        if (
          dto.isActive === false &&
          (await tx.timeEntry.count({
            where: {
              serviceOrderId: orderId,
              clockOut: null,
              voidedAt: null,
              status: { not: 'Rejected' },
            },
          }))
        ) {
          throw new ConflictException(
            'Finish or reassign the running timer before archiving this service order',
          );
        }
        return tx.serviceOrder.update({
          where: { id: orderId },
          data: {
            orderNo: dto.orderNo,
            title: dto.title,
            isActive: dto.isActive ?? true,
            planHours: dto.planHours ?? null,
            defaultBillable: dto.defaultBillable,
          },
        });
      });
      this.broadcast(projectId);
      const stats = await this.loadIstStats(projectId);
      const booked = stats.get(projectId)?.byOrder.get(orderId) ?? 0;
      return toServiceOrderDto(
        updated,
        booked,
        stats.get(projectId)?.netByOrder?.get(orderId),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `A service order "${dto.orderNo}" already exists in this project`,
        );
      }
      throw err;
    }
  }

  async removeServiceOrder(
    projectId: string,
    orderId: string,
    actor: JwtUser,
  ): Promise<void> {
    await this.mutate(actor, async (tx) => {
      await this.findServiceOrderOrThrow(projectId, orderId, tx);
      const bookedEntries = await tx.timeEntry.count({
        where: { serviceOrderId: orderId },
      });
      if (bookedEntries > 0) {
        throw new ConflictException(
          'Service order has booked time entries and cannot be deleted — deactivate it instead',
        );
      }
      await tx.serviceOrder.delete({ where: { id: orderId } });
    });
    this.broadcast(projectId);
  }

  /** Idempotent: assigning an already-assigned employee is a no-op success. */
  async assign(
    projectId: string,
    employeeId: string,
    actor: JwtUser,
  ): Promise<void> {
    await this.mutate(actor, async (tx, solo) => {
      if (solo && employeeId !== actor.id)
        throw new ForbiddenException(
          'Solo projects can only be assigned to the owner',
        );
      await this.findOrThrow(projectId, tx);
      const employee = await tx.employee.findUnique({
        where: { id: employeeId },
      });
      if (!employee)
        throw new NotFoundException(`Employee ${employeeId} not found`);
      await tx.projectAssignment.upsert({
        where: { employeeId_projectId: { employeeId, projectId } },
        create: { employeeId, projectId },
        update: {},
      });
    });
    this.broadcast(projectId);
  }

  /** Idempotent: removing a non-existent assignment is a no-op success. */
  async unassign(
    projectId: string,
    employeeId: string,
    actor: JwtUser,
  ): Promise<void> {
    await this.mutate(actor, async (tx, solo) => {
      if (solo)
        throw new ConflictException(
          'The Solo owner keeps access to their projects',
        );
      await this.findOrThrow(projectId, tx);
      await tx.projectAssignment.deleteMany({
        where: { employeeId, projectId },
      });
    });
    this.broadcast(projectId);
  }

  /** Full matrix data: one row per existing employee↔project assignment. */
  async listAssignments(): Promise<ProjectAssignmentDto[]> {
    const settings = await this.installation.getSettings();
    const rows = await this.prisma.projectAssignment.findMany({
      where:
        settings.mode === 'Solo'
          ? { employeeId: settings.ownerEmployeeId ?? undefined }
          : undefined,
      select: { employeeId: true, projectId: true },
    });
    return rows;
  }

  /** Active projects the employee is assigned to — the booking selector source. */
  async listBookable(employeeId: string): Promise<BookableProjectDto[]> {
    const rows = await this.prisma.project.findMany({
      where: {
        isActive: true,
        assignments: { some: { employeeId } },
        OR: [{ customerId: null }, { customer: { isActive: true } }],
      },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        customerId: true,
        customer: { select: { name: true } },
        defaultBillable: true,
        serviceOrders: {
          where: { isActive: true },
          orderBy: { orderNo: 'asc' },
          select: {
            id: true,
            orderNo: true,
            title: true,
            defaultBillable: true,
          },
        },
      },
    });
    return rows.map(({ customer, ...row }) => ({
      ...row,
      customerName: customer?.name ?? null,
    }));
  }

  /**
   * Booking authorization used by clock-in, retroactive assignment, and split:
   * the project must exist (404), be active (400), and the employee must be
   * assigned via the admin matrix (403).
   */
  async assertBookable(employeeId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { customer: { select: { isActive: true } } },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    if (!project.isActive) {
      throw new BadRequestException(`Project "${project.code}" is inactive`);
    }
    if (project.customer && !project.customer.isActive)
      throw new BadRequestException('The project customer is archived');
    const assignment = await this.prisma.projectAssignment.findUnique({
      where: { employeeId_projectId: { employeeId, projectId } },
    });
    if (!assignment) {
      throw new ForbiddenException(
        `Employee is not assigned to project "${project.code}"`,
      );
    }
  }

  /**
   * Conditional-mandatory service-order rule, shared by every booking path
   * (clock-in, retroactive PATCH, split, range booking):
   * - serviceOrderId given → must belong to the project (404) and be active (400)
   * - serviceOrderId null  → rejected (400) when the project has ≥1 ACTIVE order
   */
  async resolveServiceOrder(
    projectId: string,
    serviceOrderId: string | null,
  ): Promise<ServiceOrder | null> {
    if (serviceOrderId !== null) {
      const order = await this.prisma.serviceOrder.findFirst({
        where: { id: serviceOrderId, projectId },
      });
      if (!order) {
        throw new NotFoundException(
          `Service order ${serviceOrderId} not found in project ${projectId}`,
        );
      }
      if (!order.isActive) {
        throw new BadRequestException(
          `Service order "${order.orderNo}" is inactive`,
        );
      }
      return order;
    }
    const activeOrders = await this.prisma.serviceOrder.count({
      where: { projectId, isActive: true },
    });
    if (activeOrders > 0) {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { code: true },
      });
      throw new BadRequestException(
        `Project "${project?.code ?? projectId}" has active service orders — a serviceOrderId is required`,
      );
    }
    return null;
  }

  /** Customer-facing activity report: closed, non-rejected project bookings. */
  async report(id: string, from?: Date, to?: Date): Promise<ProjectReportDto> {
    const project = await this.findOrThrow(id);
    const settings = await this.installation.getSettings();
    const where: Prisma.TimeEntryWhereInput = {
      projectId: id,
      employeeId:
        settings.mode === 'Solo'
          ? (settings.ownerEmployeeId ?? undefined)
          : undefined,
      clockOut: { not: null },
      status: { not: 'Rejected' },
      voidedAt: null,
    };
    if (from || to) {
      where.clockIn = {};
      if (from) (where.clockIn as Prisma.DateTimeFilter).gte = from;
      if (to) (where.clockIn as Prisma.DateTimeFilter).lte = to;
    }
    const entries = await this.prisma.timeEntry.findMany({
      where,
      orderBy: { clockIn: 'asc' },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        serviceOrder: { select: { orderNo: true, title: true } },
      },
    });
    const rows = entries.map((e) => ({
      date: localDate(e.clockIn),
      employeeName: `${e.employee.firstName} ${e.employee.lastName}`,
      orderNo: e.serviceOrder?.orderNo ?? null,
      orderTitle: e.serviceOrder?.title ?? null,
      grossMinutes: summarize(e.clockIn, e.clockOut as Date).grossMinutes,
      activity: e.activity,
    }));
    return {
      projectCode: project.code,
      projectName: project.name,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      rows,
      totalGrossMinutes: rows.reduce((acc, r) => acc + r.grossMinutes, 0),
    };
  }

  /**
   * Gross booked minutes per project and service order (closed, non-rejected
   * entries). FLOOR-per-entry rounding matches summarize() in libs/shared.
   */
  private async loadIstStats(
    projectId?: string,
  ): Promise<Map<string, ProjectIstStats>> {
    if (await this.installation.isSolo())
      return this.loadSoloIstStats(projectId);
    const rows = projectId
      ? await this.prisma.$queryRaw<IstRow[]>`
          SELECT "projectId", "serviceOrderId",
                 COALESCE(SUM(FLOOR(EXTRACT(EPOCH FROM ("clockOut" - "clockIn")) / 60)), 0)::int AS minutes
          FROM "TimeEntry"
          WHERE "projectId" = ${projectId}::uuid
            AND "clockOut" IS NOT NULL
            AND "voidedAt" IS NULL
            AND "status" <> 'Rejected'::"EntryStatus"
          GROUP BY "projectId", "serviceOrderId"
        `
      : await this.prisma.$queryRaw<IstRow[]>`
          SELECT "projectId", "serviceOrderId",
                 COALESCE(SUM(FLOOR(EXTRACT(EPOCH FROM ("clockOut" - "clockIn")) / 60)), 0)::int AS minutes
          FROM "TimeEntry"
          WHERE "projectId" IS NOT NULL
            AND "clockOut" IS NOT NULL
            AND "voidedAt" IS NULL
            AND "status" <> 'Rejected'::"EntryStatus"
          GROUP BY "projectId", "serviceOrderId"
        `;
    const map = new Map<
      string,
      { totalMinutes: number; byOrder: Map<string, number> }
    >();
    for (const row of rows) {
      let stats = map.get(row.projectId);
      if (!stats) {
        stats = { totalMinutes: 0, byOrder: new Map() };
        map.set(row.projectId, stats);
      }
      stats.totalMinutes += row.minutes;
      if (row.serviceOrderId)
        stats.byOrder.set(row.serviceOrderId, row.minutes);
    }
    return map;
  }

  /** Load complete capture groups before narrowing to a project. */
  private async loadSoloIstStats(
    projectId?: string,
  ): Promise<Map<string, ProjectIstStats>> {
    const settings = await this.installation.getSettings();
    const ownerId = settings.ownerEmployeeId;
    const projects = await this.prisma.project.findMany({
      where: projectId ? { id: projectId } : undefined,
      select: { id: true },
    });
    const map = new Map<string, ProjectIstStats>(
      projects.map((project) => [
        project.id,
        {
          totalMinutes: 0,
          byOrder: new Map(),
          netMinutes: 0,
          netByOrder: new Map(),
        },
      ]),
    );
    if (!ownerId) return map;
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        employeeId: ownerId,
        clockOut: { not: null },
        status: { not: 'Rejected' },
        voidedAt: null,
      },
    });
    const summaries = calculateCaptureSummaries(entries);
    for (const entry of entries) {
      if (!entry.projectId) continue;
      const stats = map.get(entry.projectId);
      const summary = summaries.get(entry.id);
      if (!stats || !summary) continue;
      stats.totalMinutes += summary.grossMinutes;
      stats.netMinutes = (stats.netMinutes ?? 0) + summary.netMinutes;
      if (entry.serviceOrderId) {
        const grossByOrder = stats.byOrder as Map<string, number>;
        const netByOrder = stats.netByOrder as Map<string, number>;
        grossByOrder.set(
          entry.serviceOrderId,
          (grossByOrder.get(entry.serviceOrderId) ?? 0) + summary.grossMinutes,
        );
        netByOrder.set(
          entry.serviceOrderId,
          (netByOrder.get(entry.serviceOrderId) ?? 0) + summary.netMinutes,
        );
      }
    }
    return map;
  }

  private async assertCustomerActive(
    tx: Prisma.TransactionClient,
    customerId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${customerId}::uuid FOR UPDATE`;
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (!customer.isActive)
      throw new BadRequestException('The customer is archived');
  }

  /** Σ order plans (incl. a candidate value) must not exceed the project plan. */
  private assertOrderPlanFits(
    project: { code: string; planHours: unknown },
    otherOrders: ServiceOrder[],
    candidatePlanHours: number | null,
  ): void {
    if (project.planHours === null || project.planHours === undefined) return;
    const projectPlan = Number(project.planHours);
    const total = sumPlanHours(otherOrders) + (candidatePlanHours ?? 0);
    if (total > projectPlan) {
      throw new ConflictException(
        `Service order plan hours would exceed the project plan of ${projectPlan} h (orders total ${total} h)`,
      );
    }
  }

  private broadcast(projectId: string): void {
    this.events.broadcast('project:changed', { projectId });
  }

  /** Serialize writes with mode/account changes, then re-check live authority. */
  private async mutate<T>(
    actor: JwtUser,
    action: (tx: Prisma.TransactionClient, solo: boolean) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INSTALLATION_LOCK})`;
      const employee = await tx.employee.findUnique({
        where: { id: actor.id },
      });
      if (
        !employee?.isActive ||
        !['Manager', 'HRAdmin'].includes(employee.role) ||
        (actor.authVersion ?? 0) !== employee.authVersion
      )
        throw new ForbiddenException(
          'Project management session is no longer authorized',
        );
      const solo = (await this.installation.getSettings(tx)).mode === 'Solo';
      if (solo) await this.installation.requireOwner(actor.id, tx);
      return action(tx, solo);
    });
  }

  private async findOrThrow(
    id: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const row = await tx.project.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true } },
        serviceOrders: { orderBy: { orderNo: 'asc' } },
        _count: { select: { assignments: true } },
      },
    });
    if (!row) throw new NotFoundException(`Project ${id} not found`);
    return row;
  }

  private async findServiceOrderOrThrow(
    projectId: string,
    orderId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const row = await tx.serviceOrder.findFirst({
      where: { id: orderId, projectId },
    });
    if (!row) {
      throw new NotFoundException(
        `Service order ${orderId} not found in project ${projectId}`,
      );
    }
    return row;
  }
}

function sumPlanHours(orders: ServiceOrder[]): number {
  return orders.reduce(
    (acc, o) => acc + (o.planHours !== null ? Number(o.planHours) : 0),
    0,
  );
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'P2002'
  );
}
