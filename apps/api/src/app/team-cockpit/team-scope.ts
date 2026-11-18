import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Employee, Prisma } from '@prisma/client';
import type { JwtUser } from '../auth/jwt.strategy';

export async function assertCockpitActor(
  tx: Prisma.TransactionClient,
  identity: JwtUser,
): Promise<Employee> {
  const [actor, installation] = await Promise.all([
    tx.employee.findUnique({ where: { id: identity.id } }),
    tx.installationSettings.findUnique({ where: { id: 1 } }),
  ]);
  if (
    installation?.mode === 'Solo' ||
    !actor?.isActive ||
    !['Manager', 'HRAdmin'].includes(actor.role) ||
    actor.authVersion !== (identity.authVersion ?? 0)
  )
    throw new ForbiddenException(
      'An active authorized Team manager or HR session is required',
    );
  return actor;
}

export function cockpitScope(actor: Employee): Prisma.EmployeeWhereInput {
  return actor.role === 'HRAdmin'
    ? {}
    : { managerId: actor.id, NOT: { id: actor.id } };
}

export async function assertCockpitEmployee(
  tx: Prisma.TransactionClient,
  identity: JwtUser,
  employeeId: string,
) {
  const actor = await assertCockpitActor(tx, identity);
  const employee = await tx.employee.findUnique({ where: { id: employeeId } });
  if (
    actor.role !== 'HRAdmin' &&
    (!employee || employee.managerId !== actor.id || employee.id === actor.id)
  )
    throw new ForbiddenException(
      'Only current direct team members are visible in the cockpit',
    );
  if (!employee) throw new NotFoundException('Employee not found');
  return { actor, employee };
}

/** Call under global -> beneficiary advisory -> beneficiary row lock for writes. */
export async function assertProxyTarget(
  tx: Prisma.TransactionClient,
  identity: JwtUser,
  employeeId: string,
) {
  const pair = await assertCockpitEmployee(tx, identity, employeeId);
  if (!pair.employee.isActive || pair.employee.id === pair.actor.id)
    throw new ForbiddenException(
      'Proxy operations require another active assigned employee',
    );
  return pair;
}

export async function writeProxyAudit(
  tx: Prisma.TransactionClient,
  input: {
    actor: Employee;
    employee: Employee;
    resourceKind: 'TimeEntry' | 'Request' | 'Absence';
    resourceId: string;
    action: string;
    reason: string;
    values: Prisma.InputJsonObject;
  },
): Promise<void> {
  await tx.teamProxyAudit.create({
    data: {
      actorId: input.actor.id,
      employeeId: input.employee.id,
      resourceKind: input.resourceKind,
      resourceId: input.resourceId,
      action: input.action,
      reason: input.reason.trim(),
      values: {
        ...input.values,
        actor: {
          id: input.actor.id,
          firstName: input.actor.firstName,
          lastName: input.actor.lastName,
          role: input.actor.role,
        },
        employee: {
          id: input.employee.id,
          firstName: input.employee.firstName,
          lastName: input.employee.lastName,
        },
      },
    },
  });
}
