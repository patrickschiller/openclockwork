import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export class OwnerRecoveryRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OwnerRecoveryRefusedError';
  }
}

export function parseOwnerRecoveryArguments(args: string[]): string {
  if (
    args.length !== 2 ||
    args[0] !== '--email' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args[1]) ||
    args[1].length > 200
  ) {
    throw new OwnerRecoveryRefusedError(
      'Supply only --email with the exact existing Solo owner email. Use --help for usage.',
    );
  }
  return args[1];
}

/**
 * Local database-operator recovery. The caller cannot choose a password,
 * identity, role or mode. Only the one existing active Solo owner is eligible.
 * The plaintext is returned once to the CLI and never persisted or audited.
 */
export async function resetOwnerPassword(
  prisma: PrismaClient,
  confirmedEmail: string,
): Promise<{
  ownerId: string;
  email: string;
  password: string;
  authVersion: number;
}> {
  parseOwnerRecoveryArguments(['--email', confirmedEmail]);
  const initialSettings = await prisma.installationSettings.findUnique({
    where: { id: 1 },
  });
  if (initialSettings?.mode !== 'Solo' || !initialSettings.ownerEmployeeId)
    throw new OwnerRecoveryRefusedError(
      'Recovery is available only for an existing Solo installation.',
    );
  const initial = await prisma.employee.findUnique({
    where: { id: initialSettings.ownerEmployeeId },
  });
  if (
    !initial?.isActive ||
    initial.role !== 'HRAdmin' ||
    initial.email !== confirmedEmail
  )
    throw new OwnerRecoveryRefusedError(
      'The confirmation must match the existing active Solo owner email exactly.',
    );

  // Keep the slow hash outside the lock. The version/hash predicates below
  // prevent this operation from overwriting a password changed while hashing.
  const password = randomBytes(24).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 10);
  const authVersion = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7261500)`;
    const settings = await tx.installationSettings.findUnique({
      where: { id: 1 },
    });
    if (
      settings?.mode !== 'Solo' ||
      settings.ownerEmployeeId !== initial.id ||
      settings.revision !== initialSettings.revision
    )
      throw new OwnerRecoveryRefusedError(
        'Installation changed during recovery; rerun after checking its mode and owner.',
      );
    const changed = await tx.employee.updateMany({
      where: {
        id: initial.id,
        email: confirmedEmail,
        isActive: true,
        role: 'HRAdmin',
        authVersion: initial.authVersion,
        passwordHash: initial.passwordHash,
      },
      data: { passwordHash, authVersion: { increment: 1 } },
    });
    if (changed.count !== 1)
      throw new OwnerRecoveryRefusedError(
        'Owner credentials or identity changed during recovery; no password was replaced.',
      );
    const nextVersion = initial.authVersion + 1;
    await tx.installationEvent.create({
      data: {
        actorId: null,
        action: 'OwnerPasswordRecovered',
        before: {
          ownerEmployeeId: initial.id,
          authVersion: initial.authVersion,
        },
        after: {
          ownerEmployeeId: initial.id,
          authVersion: nextVersion,
          source: 'LocalRecovery',
        },
      },
    });
    return nextVersion;
  });
  return { ownerId: initial.id, email: confirmedEmail, password, authVersion };
}
