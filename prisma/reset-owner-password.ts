import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  OwnerRecoveryRefusedError,
  parseOwnerRecoveryArguments,
  resetOwnerPassword,
} from './reset-owner-password-lib';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    process.stdout.write(`
Reset the existing active OpenClockwork Solo owner's password locally.

Usage:
  node --import tsx prisma/reset-owner-password.ts --email owner@example.com

The email must match the stored owner email exactly. This command requires
local operator access to the configured DATABASE_URL. It does not create an
account, reactivate anyone, switch mode, or grant roles in a Team installation.
It generates a strong random password and displays it once after committing.
Existing access and refresh tokens become invalid. Store the password in your
password manager, then sign in and change it in Settings > Password.
Do not redirect or copy the password output into shared logs.
`);
    return;
  }
  const email = parseOwnerRecoveryArguments(args);
  const prisma = new PrismaClient();
  try {
    const recovered = await resetOwnerPassword(prisma, email);
    process.stdout.write(
      `Solo owner password reset. Existing sessions are invalid.\nEmail: ${recovered.email}\nRecovery password: ${recovered.password}\nStore it securely; it will not be displayed again. Sign in and change it in Settings > Password.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Raw ORM errors may contain connection details. Keep operational failures
  // generic and never echo a password/hash or DATABASE_URL through stderr.
  process.stderr.write(
    error instanceof OwnerRecoveryRefusedError
      ? `Owner password recovery refused: ${error.message}\n`
      : 'Owner password recovery failed. Check local database availability and migration state, then retry.\n',
  );
  process.exitCode = 1;
});
