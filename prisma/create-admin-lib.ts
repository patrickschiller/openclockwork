import { randomBytes } from 'crypto';
import { Prisma, type Employee, type PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10;
const MIN_INITIAL_PASSWORD_LENGTH = 16;

export const INITIAL_ADMIN_TIME_MODELS = [
  'Teilzeit',
  'Vollzeit',
  'Vertrauensarbeitszeit',
  'Gleitzeit',
] as const;

export const INITIAL_ADMIN_BUNDESLAENDER = [
  'BW',
  'BY',
  'BE',
  'BB',
  'HB',
  'HH',
  'HE',
  'MV',
  'NI',
  'NW',
  'RP',
  'SL',
  'SN',
  'ST',
  'SH',
  'TH',
] as const;

export interface InitialAdminInput {
  personalNo: string;
  firstName: string;
  lastName: string;
  email: string;
  timeModel: (typeof INITIAL_ADMIN_TIME_MODELS)[number];
  weeklyHours: number;
  annualLeaveDays: number;
  startDate: string;
  bundesland: (typeof INITIAL_ADMIN_BUNDESLAENDER)[number];
}

export class InitialAdminAlreadyExistsError extends Error {
  constructor() {
    super(
      'Initial administrator creation is only allowed while the employee table is empty.',
    );
    this.name = 'InitialAdminAlreadyExistsError';
  }
}

export function generateInitialPassword(): string {
  return randomBytes(18).toString('base64url');
}

export async function createInitialAdmin(
  prisma: PrismaClient,
  input: InitialAdminInput,
  initialPassword: string,
): Promise<Employee> {
  const normalized = validateInitialAdminInput(input);
  if (initialPassword.length < MIN_INITIAL_PASSWORD_LENGTH) {
    throw new Error(
      `The initial password must contain at least ${MIN_INITIAL_PASSWORD_LENGTH} characters.`,
    );
  }

  // Keep bcrypt outside the transaction so concurrent setup attempts do not
  // hold a database transaction open while CPU-intensive hashing runs.
  const passwordHash = await bcrypt.hash(initialPassword, BCRYPT_ROUNDS);

  // Serializable isolation makes the empty-table check and first insert one
  // atomic operation. If two operators race, PostgreSQL aborts one of them;
  // retrying once turns that write conflict into the clear "already exists"
  // refusal below.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const existingEmployee = await tx.employee.findFirst({
            select: { id: true },
          });
          if (existingEmployee) throw new InitialAdminAlreadyExistsError();

          return tx.employee.create({
            data: {
              personalNo: normalized.personalNo,
              firstName: normalized.firstName,
              lastName: normalized.lastName,
              email: normalized.email,
              passwordHash,
              role: 'HRAdmin',
              timeModel: normalized.timeModel,
              weeklyHours: normalized.weeklyHours,
              annualLeaveDays: normalized.annualLeaveDays,
              startDate: new Date(`${normalized.startDate}T00:00:00.000Z`),
              bundesland: normalized.bundesland,
              isActive: true,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof InitialAdminAlreadyExistsError) throw error;
      if (isRetryableBootstrapConflict(error) && attempt === 0) continue;
      throw error;
    }
  }

  // The loop either returns or throws. This keeps TypeScript's control-flow
  // analysis explicit if its retry reasoning changes in a future release.
  throw new Error('Initial administrator creation failed.');
}

function validateInitialAdminInput(
  input: InitialAdminInput,
): InitialAdminInput {
  const personalNo = requiredText(input.personalNo, 'Personal number', 40);
  const firstName = requiredText(input.firstName, 'First name', 120);
  const lastName = requiredText(input.lastName, 'Last name', 120);
  const email = requiredText(input.email, 'Email', 200).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Email must be a valid email address.');
  }
  if (!INITIAL_ADMIN_TIME_MODELS.includes(input.timeModel)) {
    throw new Error(
      `Time model must be one of: ${INITIAL_ADMIN_TIME_MODELS.join(', ')}.`,
    );
  }
  if (!INITIAL_ADMIN_BUNDESLAENDER.includes(input.bundesland)) {
    throw new Error(
      `Bundesland must be one of: ${INITIAL_ADMIN_BUNDESLAENDER.join(', ')}.`,
    );
  }
  assertNonNegativeNumber(input.weeklyHours, 'Weekly hours');
  assertNonNegativeNumber(input.annualLeaveDays, 'Annual leave days');
  assertDateOnly(input.startDate);

  return {
    ...input,
    personalNo,
    firstName,
    lastName,
    email,
  };
}

function requiredText(value: string, label: string, maxLength: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > maxLength) {
    throw new Error(`${label} must not exceed ${maxLength} characters.`);
  }
  return trimmed;
}

function assertNonNegativeNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
}

function assertDateOnly(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Start date must use YYYY-MM-DD.');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('Start date must be a valid calendar date.');
  }
}

function isRetryableBootstrapConflict(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === 'P2034' || code === 'P2002';
}
