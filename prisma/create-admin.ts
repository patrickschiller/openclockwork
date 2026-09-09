import { PrismaClient } from '@prisma/client';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import {
  createInitialAdmin,
  generateInitialPassword,
  InitialAdminAlreadyExistsError,
  INITIAL_ADMIN_HOLIDAY_CALENDARS,
  INITIAL_ADMIN_TIME_MODELS,
  type InitialAdminInput,
} from './create-admin-lib';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  output.write(
    [
      '',
      'Create the first OpenClockwork owner or team administrator',
      '------------------------------------------------',
      'This command works only while the employee table is empty.',
      '',
    ].join('\n'),
  );

  const adminInput =
    args.length > 0 ? parseArguments(args) : await promptForInitialAdminInput();
  const initialPassword = generateInitialPassword();
  const employee = await createInitialAdmin(
    prisma,
    adminInput,
    initialPassword,
  );

  output.write(
    [
      '',
      adminInput.mode === 'Solo'
        ? 'Solo owner created successfully.'
        : 'HR administrator created successfully.',
      `Email: ${employee.email}`,
      `Initial password: ${initialPassword}`,
      '',
      'Store the password securely, sign in, and replace it immediately in',
      adminInput.mode === 'Solo'
        ? 'Settings > Password. It will not be shown again.'
        : 'Administration > Employees. It will not be shown again.',
      '',
    ].join('\n'),
  );
}

async function promptForInitialAdminInput(): Promise<InitialAdminInput> {
  if (!input.isTTY || !output.isTTY) {
    throw new Error(
      'An interactive terminal is required. Run without docker compose exec -T, or provide all required command-line options. Use --help for details.',
    );
  }

  const rl = createInterface({ input, output });
  try {
    const today = new Date().toISOString().slice(0, 10);
    const mode = await askChoice(
      rl,
      'Mode (Solo / Team)',
      ['Solo', 'Team'] as const,
      'Solo',
    );
    if (mode === 'Solo')
      return {
        mode,
        personalNo: 'OWNER',
        firstName: await askRequired(rl, 'First name'),
        lastName: await askRequired(rl, 'Last name'),
        email: await askRequired(rl, 'Email'),
        timeModel: 'Vertrauensarbeitszeit',
        weeklyHours: 0,
        annualLeaveDays: 0,
        startDate: today,
        holidayCalendar: 'NONE',
      };
    return {
      mode,
      personalNo: await askRequired(rl, 'Personal number'),
      firstName: await askRequired(rl, 'First name'),
      lastName: await askRequired(rl, 'Last name'),
      email: await askRequired(rl, 'Email'),
      timeModel: await askChoice(
        rl,
        'Time model',
        INITIAL_ADMIN_TIME_MODELS,
        'Vollzeit',
      ),
      weeklyHours: await askNonNegativeNumber(rl, 'Weekly hours', 40),
      annualLeaveDays: await askNonNegativeNumber(rl, 'Annual leave days', 0),
      startDate: await askDate(rl, 'Start date', today),
      holidayCalendar: await askChoice(
        rl,
        'Holiday calendar',
        INITIAL_ADMIN_HOLIDAY_CALENDARS,
        'NONE',
      ),
    };
  } finally {
    rl.close();
  }
}

function parseArguments(args: string[]): InitialAdminInput {
  const values = new Map<string, string>();
  const allowed = new Set([
    '--mode',
    '--personal-no',
    '--first-name',
    '--last-name',
    '--email',
    '--time-model',
    '--weekly-hours',
    '--annual-leave-days',
    '--start-date',
    '--bundesland',
    '--holiday-calendar',
  ]);

  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!allowed.has(option)) {
      throw new Error(`Unknown option: ${option}. Use --help.`);
    }
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${option}.`);
    }
    if (values.has(option)) {
      throw new Error(`Option ${option} was provided more than once.`);
    }
    values.set(option, value);
  }

  const today = new Date().toISOString().slice(0, 10);
  const mode = (values.get('--mode') ?? 'Team') as 'Solo' | 'Team';
  if (!['Solo', 'Team'].includes(mode))
    throw new Error('--mode must be Solo or Team');
  return {
    mode,
    personalNo:
      mode === 'Solo'
        ? (values.get('--personal-no') ?? 'OWNER')
        : requiredArgument(values, '--personal-no'),
    firstName: requiredArgument(values, '--first-name'),
    lastName: requiredArgument(values, '--last-name'),
    email: requiredArgument(values, '--email'),
    timeModel: (values.get('--time-model') ??
      (mode === 'Solo'
        ? 'Vertrauensarbeitszeit'
        : 'Vollzeit')) as InitialAdminInput['timeModel'],
    weeklyHours: parseNumericArgument(
      values,
      '--weekly-hours',
      mode === 'Solo' ? 0 : 40,
    ),
    annualLeaveDays: parseNumericArgument(values, '--annual-leave-days', 0),
    startDate: values.get('--start-date') ?? today,
    bundesland: values.get('--bundesland') as InitialAdminInput['bundesland'],
    holidayCalendar: values.get(
      '--holiday-calendar',
    ) as InitialAdminInput['holidayCalendar'],
  };
}

function requiredArgument(values: Map<string, string>, option: string): string {
  const value = values.get(option)?.trim();
  if (!value) throw new Error(`${option} is required in non-interactive mode.`);
  return value;
}

function parseNumericArgument(
  values: Map<string, string>,
  option: string,
  defaultValue: number,
): number {
  const raw = values.get(option);
  return raw === undefined ? defaultValue : Number(raw.replace(',', '.'));
}

function printHelp(): void {
  output.write(`
Usage:
  pnpm db:create-admin

Interactive mode prompts for all employee data and is recommended for a
manual production installation.

For unattended validation, provide the non-secret employee fields as options:
  --mode Solo|Team          Explicit mode (CLI default: Team for compatibility)
  --personal-no VALUE       Required for Team; automatic OWNER for Solo
  --first-name VALUE        Required
  --last-name VALUE         Required
  --email VALUE             Required
  --time-model VALUE        Default: Vollzeit
  --weekly-hours VALUE      Default: 40
  --annual-leave-days VALUE Default: 0 (set contractual entitlement)
  --start-date YYYY-MM-DD   Default: today
  --holiday-calendar CODE   Default: NONE; optional DE-XX regional preset
  --bundesland CODE         Deprecated German state alias (for existing scripts)

The command always generates the initial password itself. It never accepts a
password option, so a password cannot accidentally be stored in shell history.
`);
}

async function askRequired(
  rl: ReturnType<typeof createInterface>,
  label: string,
): Promise<string> {
  while (true) {
    const value = (await rl.question(`${label}: `)).trim();
    if (value) return value;
    output.write(`${label} is required.\n`);
  }
}

async function askChoice<const T extends readonly string[]>(
  rl: ReturnType<typeof createInterface>,
  label: string,
  choices: T,
  defaultValue: T[number],
): Promise<T[number]> {
  while (true) {
    const value =
      (await rl.question(`${label} [${defaultValue}]: `)).trim() ||
      defaultValue;
    if (choices.includes(value)) return value as T[number];
    output.write(`Choose one of: ${choices.join(', ')}.\n`);
  }
}

async function askNonNegativeNumber(
  rl: ReturnType<typeof createInterface>,
  label: string,
  defaultValue: number,
): Promise<number> {
  while (true) {
    const raw = (await rl.question(`${label} [${defaultValue}]: `)).trim();
    const value = raw ? Number(raw.replace(',', '.')) : defaultValue;
    if (Number.isFinite(value) && value >= 0) return value;
    output.write(`${label} must be a non-negative number.\n`);
  }
}

async function askDate(
  rl: ReturnType<typeof createInterface>,
  label: string,
  defaultValue: string,
): Promise<string> {
  while (true) {
    const value =
      (await rl.question(`${label} [${defaultValue}]: `)).trim() ||
      defaultValue;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value
    ) {
      return value;
    }
    output.write(`${label} must be a valid date in YYYY-MM-DD format.\n`);
  }
}

main()
  .catch((error: unknown) => {
    if (error instanceof InitialAdminAlreadyExistsError) {
      console.error(
        `Refusing initial administrator creation: ${error.message}`,
      );
    } else {
      console.error(
        'Initial administrator creation failed:',
        error instanceof Error ? error.message : error,
      );
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
