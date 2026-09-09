import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Customer } from '@prisma/client';
import {
  INSTALLATION_LOCK,
  InstallationService,
} from '../installation/installation.service';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerDto, UpsertCustomerDto } from './customers.dto';
import type { JwtUser } from '../auth/jwt.strategy';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly installation: InstallationService,
  ) {}

  async list(
    actorId: string,
    includeInactive: boolean,
  ): Promise<CustomerDto[]> {
    await this.installation.requireOwner(actorId);
    const rows = await this.prisma.customer.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { projects: true } } },
    });
    return rows.map(toDto);
  }

  async get(actorId: string, id: string): Promise<CustomerDto> {
    await this.installation.requireOwner(actorId);
    return toDto(await this.findOrThrow(this.prisma, id));
  }

  async create(actor: JwtUser, dto: UpsertCustomerDto): Promise<CustomerDto> {
    await this.installation.requireOwner(actor.id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INSTALLATION_LOCK})`;
        await this.requireMutationActor(actor, tx);
        return toDto(
          await tx.customer.create({
            data: {
              name: dto.name.trim(),
              code: dto.code?.trim() || null,
              note: dto.note?.trim() || null,
              isActive: dto.isActive ?? true,
            },
            include: { _count: { select: { projects: true } } },
          }),
        );
      });
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  async update(
    actor: JwtUser,
    id: string,
    dto: UpsertCustomerDto,
  ): Promise<CustomerDto> {
    await this.installation.requireOwner(actor.id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INSTALLATION_LOCK})`;
        await this.requireMutationActor(actor, tx);
        await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const current = await this.findOrThrow(tx, id);
        if (current.isActive && dto.isActive === false) {
          const open = await tx.timeEntry.count({
            where: {
              project: { customerId: id },
              clockOut: null,
              voidedAt: null,
              status: { not: 'Rejected' },
            },
          });
          if (open > 0)
            throw new ConflictException(
              'Finish or reassign the running timer before archiving this customer',
            );
        }
        return toDto(
          await tx.customer.update({
            where: { id },
            data: {
              name: dto.name.trim(),
              code:
                dto.code === undefined ? undefined : dto.code?.trim() || null,
              note:
                dto.note === undefined ? undefined : dto.note?.trim() || null,
              isActive: dto.isActive,
            },
            include: { _count: { select: { projects: true } } },
          }),
        );
      });
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  async remove(actor: JwtUser, id: string): Promise<void> {
    await this.installation.requireOwner(actor.id);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INSTALLATION_LOCK})`;
        await this.requireMutationActor(actor, tx);
        await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const current = await this.findOrThrow(tx, id);
        if (current._count.projects > 0)
          throw new ConflictException(
            'Customer has projects and cannot be deleted; archive it instead',
          );
        await tx.customer.delete({ where: { id } });
      });
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  private async findOrThrow(tx: Prisma.TransactionClient, id: string) {
    const row = await tx.customer.findUnique({
      where: { id },
      include: { _count: { select: { projects: true } } },
    });
    if (!row) throw new NotFoundException('Customer not found');
    return row;
  }

  private async requireMutationActor(
    actor: JwtUser,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.installation.requireOwner(actor.id, tx);
    const employee = await tx.employee.findUniqueOrThrow({
      where: { id: actor.id },
    });
    if ((actor.authVersion ?? 0) !== employee.authVersion)
      throw new ForbiddenException(
        'Customer management session is no longer authorized',
      );
  }

  private rethrowConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException('A customer with this code already exists');
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    )
      throw new ConflictException(
        'Customer is referenced and cannot be deleted; archive it instead',
      );
    throw error;
  }
}

function toDto(row: Customer & { _count: { projects: number } }): CustomerDto {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    note: row.note,
    isActive: row.isActive,
    projectCount: row._count.projects,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
