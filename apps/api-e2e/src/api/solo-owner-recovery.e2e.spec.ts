import { spawn } from 'node:child_process';
import type { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  createTestApp,
  seedEmployee,
  type TestContext,
} from '../support/test-app';

interface RecoveryLibrary {
  OwnerRecoveryRefusedError: new (message: string) => Error;
  parseOwnerRecoveryArguments(args: string[]): string;
  resetOwnerPassword(
    prisma: PrismaClient,
    confirmedEmail: string,
  ): Promise<{
    ownerId: string;
    email: string;
    password: string;
    authVersion: number;
  }>;
}

describe('Local Solo owner password recovery', () => {
  let ctx: TestContext;
  let OwnerRecoveryRefusedError: RecoveryLibrary['OwnerRecoveryRefusedError'];
  let parseOwnerRecoveryArguments: RecoveryLibrary['parseOwnerRecoveryArguments'];
  let resetOwnerPassword: RecoveryLibrary['resetOwnerPassword'];
  beforeAll(async () => {
    // The CLI library lives outside this project's compilation root. Load its
    // runtime contract without pulling the CLI sources into the E2E TS project.
    const recoveryLibraryPath = '../../../../prisma/reset-owner-password-lib';
    ({
      OwnerRecoveryRefusedError,
      parseOwnerRecoveryArguments,
      resetOwnerPassword,
    } = (await import(recoveryLibraryPath)) as RecoveryLibrary);
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
  });

  async function fixture(mode: 'Team' | 'Solo' = 'Solo') {
    const owner = await seedEmployee(ctx.prisma, {
      personalNo: 'OWNER',
      firstName: 'Recover',
      lastName: 'Owner',
      email: 'recovery@example.test',
      role: 'HRAdmin',
    });
    await ctx.prisma.installationSettings.upsert({
      where: { id: 1 },
      create: { mode, ownerEmployeeId: owner.id },
      update: { mode, ownerEmployeeId: owner.id },
    });
    return owner;
  }

  it('retains the owner ID and working data, generates a strong password and invalidates existing sessions', async () => {
    const owner = await fixture();
    const beforeLogin = await ctx.http
      .post('/api/auth/login')
      .send({ email: owner.email, password: 'test1234' })
      .expect(200);
    const time = await ctx.prisma.timeEntry.create({
      data: {
        employeeId: owner.id,
        clockIn: new Date('2025-01-01T08:00:00Z'),
        clockOut: new Date('2025-01-01T09:00:00Z'),
        status: 'Approved',
      },
    });
    const recovered = await resetOwnerPassword(ctx.prisma, owner.email);
    expect(recovered.ownerId).toBe(owner.id);
    expect(recovered.password).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const after = await ctx.prisma.employee.findUniqueOrThrow({
      where: { id: owner.id },
    });
    expect(after.authVersion).toBe(owner.authVersion + 1);
    expect(await bcrypt.compare(recovered.password, after.passwordHash)).toBe(
      true,
    );
    expect(await ctx.prisma.employee.count()).toBe(1);
    expect(
      await ctx.prisma.timeEntry.findUnique({ where: { id: time.id } }),
    ).toEqual(time);
    expect(after).toMatchObject({
      email: owner.email,
      role: owner.role,
      isActive: true,
      personalNo: owner.personalNo,
    });
    await ctx.http
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${beforeLogin.body.accessToken}`)
      .expect(401);
    await ctx.http
      .post('/api/auth/refresh')
      .send({ refreshToken: beforeLogin.body.refreshToken })
      .expect(401);
    await ctx.http
      .post('/api/auth/login')
      .send({ email: owner.email, password: 'test1234' })
      .expect(401);
    await ctx.http
      .post('/api/auth/login')
      .send({ email: owner.email, password: recovered.password })
      .expect(200);
    const event = await ctx.prisma.installationEvent.findFirstOrThrow({
      where: { action: 'OwnerPasswordRecovered' },
    });
    expect(event.actorId).toBeNull();
    expect(JSON.stringify(event)).not.toContain(recovered.password);
    expect(JSON.stringify(event)).not.toContain(after.passwordHash);
  });

  it('requires the exact current active owner and never turns Team recovery into privilege escalation', async () => {
    const owner = await fixture('Team');
    await expect(
      resetOwnerPassword(ctx.prisma, owner.email),
    ).rejects.toBeInstanceOf(OwnerRecoveryRefusedError);
    await ctx.prisma.installationSettings.update({
      where: { id: 1 },
      data: { mode: 'Solo' },
    });
    for (const email of ['different@example.test', owner.email.toUpperCase()])
      await expect(
        resetOwnerPassword(ctx.prisma, email),
      ).rejects.toBeInstanceOf(OwnerRecoveryRefusedError);
    await ctx.prisma.employee.update({
      where: { id: owner.id },
      data: { isActive: false },
    });
    await expect(
      resetOwnerPassword(ctx.prisma, owner.email),
    ).rejects.toBeInstanceOf(OwnerRecoveryRefusedError);
    await ctx.prisma.employee.update({
      where: { id: owner.id },
      data: { isActive: true, role: 'Employee' },
    });
    await expect(
      resetOwnerPassword(ctx.prisma, owner.email),
    ).rejects.toBeInstanceOf(OwnerRecoveryRefusedError);
    const after = await ctx.prisma.employee.findUniqueOrThrow({
      where: { id: owner.id },
    });
    expect(after.passwordHash).toBe(owner.passwordHash);
    expect(after.authVersion).toBe(owner.authVersion);
    expect(await ctx.prisma.employee.count()).toBe(1);
    expect(
      await ctx.prisma.installationEvent.count({
        where: { action: 'OwnerPasswordRecovered' },
      }),
    ).toBe(0);
  });

  it('allows only one concurrent recovery of the same credential version to succeed', async () => {
    const owner = await fixture();
    const results = await Promise.allSettled([
      resetOwnerPassword(ctx.prisma, owner.email),
      resetOwnerPassword(ctx.prisma, owner.email),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(
      (await ctx.prisma.employee.findUniqueOrThrow({ where: { id: owner.id } }))
        .authVersion,
    ).toBe(owner.authVersion + 1);
    expect(
      await ctx.prisma.installationEvent.count({
        where: { action: 'OwnerPasswordRecovered' },
      }),
    ).toBe(1);
  });

  it('prints the generated password once only after successful CLI recovery', async () => {
    const owner = await fixture();
    const result = await runRecovery(['--email', owner.email]);
    expect(result.code).toBe(0);
    const matches = [...result.stdout.matchAll(/Recovery password: (\S+)/g)];
    expect(matches).toHaveLength(1);
    const password = matches[0]?.[1];
    if (!password) throw new Error('Recovery output was missing');
    const after = await ctx.prisma.employee.findUniqueOrThrow({
      where: { id: owner.id },
    });
    expect(await bcrypt.compare(password, after.passwordHash)).toBe(true);
    expect(result.stderr).not.toMatch(
      /Owner password recovery (failed|refused)/,
    );
    expect(result.stderr).not.toContain(password);
    const denied = await runRecovery(['--email', 'wrong@example.test']);
    expect(denied.code).toBe(1);
    expect(denied.stdout).not.toContain('Recovery password:');
    expect(denied.stderr).not.toContain(after.passwordHash);
    expect(denied.stderr).not.toContain('postgresql://');
  });

  it('rejects missing confirmation and arbitrary flags before touching the database', () => {
    for (const args of [
      [],
      ['--email'],
      ['--email', 'not-an-email'],
      ['--email', 'owner@example.test', '--password', 'something'],
      ['--mode', 'Solo'],
    ]) {
      expect(() => parseOwnerRecoveryArguments(args)).toThrow(
        OwnerRecoveryRefusedError,
      );
    }
    expect(parseOwnerRecoveryArguments(['--email', 'owner@example.test'])).toBe(
      'owner@example.test',
    );
  });
});

function runRecovery(
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'prisma/reset-owner-password.ts', ...args],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '',
      stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}
