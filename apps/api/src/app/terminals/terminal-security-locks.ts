import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** All terminal mutations share the installation lock with mode/employee writes.
 * Lock order: installation -> employee -> audit. Hashing never holds these locks. */
export async function lockTerminalSecurity(
  tx: Prisma.TransactionClient,
  employeeId?: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7261500)`;
  if (employeeId)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${employeeId}, 0))`;
  const settings = await tx.installationSettings.findUnique({
    where: { id: 1 },
    select: { mode: true },
  });
  if (settings?.mode === 'Solo')
    throw new ForbiddenException({
      code: 'TERMINAL_TEAM_ONLY',
      message: 'Terminals require Team mode',
    });
}

export async function assertTerminalAdmin(
  tx: Prisma.TransactionClient,
  actorId: string,
) {
  const actor = await tx.employee.findUnique({
    where: { id: actorId },
    select: { isActive: true, role: true },
  });
  if (!actor?.isActive || actor.role !== 'HRAdmin')
    throw new ForbiddenException('Current HR administrator required');
}
