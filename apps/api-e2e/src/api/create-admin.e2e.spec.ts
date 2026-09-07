import { spawn } from 'child_process';
import * as bcrypt from 'bcrypt';
import { createTestApp, type TestContext } from '../support/test-app';

const ADA_ARGS = [
  '--personal-no',
  '0001',
  '--first-name',
  'Ada',
  '--last-name',
  'Lovelace',
  '--email',
  'ADA@EXAMPLE.COM',
  '--start-date',
  '2026-08-16',
];

describe('Initial administrator command', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
  });

  it('creates exactly one active HR administrator in an empty database', async () => {
    const result = await runCreateAdmin(ADA_ARGS);

    expect(result.code).toBe(0);
    const initialPassword = result.stdout.match(/Initial password: (\S+)/)?.[1];
    expect(initialPassword).toEqual(expect.any(String));
    if (!initialPassword) {
      throw new Error('Initial password missing from command output');
    }

    const created = await ctx.prisma.employee.findUniqueOrThrow({
      where: { email: 'ada@example.com' },
    });
    expect(created).toMatchObject({
      personalNo: '0001',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'HRAdmin',
      timeModel: 'Vollzeit',
      bundesland: null,
      holidayCalendar: 'NONE',
      holidayDates: [],
      isActive: true,
    });
    expect(Number(created.weeklyHours)).toBe(40);
    expect(Number(created.annualLeaveDays)).toBe(0);
    expect(await bcrypt.compare(initialPassword, created.passwordHash)).toBe(
      true,
    );
    expect(await ctx.prisma.employee.count()).toBe(1);
  });

  it('refuses to run again after the first administrator was created', async () => {
    expect((await runCreateAdmin(ADA_ARGS)).code).toBe(0);

    const second = await runCreateAdmin([
      '--personal-no',
      '0002',
      '--first-name',
      'Grace',
      '--last-name',
      'Hopper',
      '--email',
      'grace@example.com',
    ]);

    expect(second.code).toBe(1);
    expect(second.stderr).toMatch(
      /only allowed while the employee table is empty/i,
    );
    expect(await ctx.prisma.employee.count()).toBe(1);
  });

  it('validates command-line input before writing anything', async () => {
    const result = await runCreateAdmin([
      ...ADA_ARGS.slice(0, -3),
      'not-an-email',
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/valid email address/i);
    expect(await ctx.prisma.employee.count()).toBe(0);
  });

  it('allows only one of two concurrent bootstrap attempts to succeed', async () => {
    const results = await Promise.all([
      runCreateAdmin(ADA_ARGS),
      runCreateAdmin([
        '--personal-no',
        '0002',
        '--first-name',
        'Grace',
        '--last-name',
        'Hopper',
        '--email',
        'grace@example.com',
      ]),
    ]);

    expect(results.filter((result) => result.code === 0)).toHaveLength(1);
    expect(results.filter((result) => result.code === 1)).toHaveLength(1);
    expect(await ctx.prisma.employee.count()).toBe(1);
  });
});

function runCreateAdmin(args: string[]): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'prisma/create-admin.ts', ...args],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
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
