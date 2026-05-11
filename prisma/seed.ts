import { PrismaClient, type Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = 'openclockwork';

async function ensureEmployee(input: {
  personalNo: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'Employee' | 'Manager' | 'HRAdmin';
  timeModel: 'Teilzeit' | 'Vollzeit' | 'Vertrauensarbeitszeit' | 'Gleitzeit';
  weeklyHours: number;
  annualLeaveDays: number;
  managerEmail?: string;
}) {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const manager = input.managerEmail
    ? await prisma.employee.findUnique({ where: { email: input.managerEmail } })
    : null;
  const data: Prisma.EmployeeCreateInput = {
    personalNo: input.personalNo,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    passwordHash,
    role: input.role,
    timeModel: input.timeModel,
    weeklyHours: input.weeklyHours,
    annualLeaveDays: input.annualLeaveDays,
    isActive: true,
    ...(manager ? { manager: { connect: { id: manager.id } } } : {}),
  };
  return prisma.employee.upsert({
    where: { email: input.email },
    create: data,
    update: {
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      timeModel: input.timeModel,
      weeklyHours: input.weeklyHours,
      annualLeaveDays: input.annualLeaveDays,
      ...(manager ? { manager: { connect: { id: manager.id } } } : {}),
    },
  });
}

async function ensureLeaveAllowance(employeeId: string, year: number, baseDays: number) {
  await prisma.employeeLeaveAllowance.upsert({
    where: { employeeId_year: { employeeId, year } },
    create: { employeeId, year, baseDays, carryOverDays: 0, adjustmentDays: 0 },
    update: {},
  });
}

async function ensureTimeEntry(employeeId: string, clockIn: Date, clockOut: Date) {
  const existing = await prisma.timeEntry.findFirst({
    where: { employeeId, clockIn },
  });
  if (existing) return;
  await prisma.timeEntry.create({
    data: {
      employeeId,
      clockIn,
      clockOut,
      source: 'Manual',
      status: 'Approved',
      requiresApproval: false,
    },
  });
}

async function main() {
  // HR-Admin
  const hr = await ensureEmployee({
    personalNo: '0001',
    firstName: 'Hannah',
    lastName: 'Roth',
    email: 'hannah.roth@openclockwork.test',
    role: 'HRAdmin',
    timeModel: 'Vollzeit',
    weeklyHours: 40,
    annualLeaveDays: 30,
  });

  // Managers
  const manager1 = await ensureEmployee({
    personalNo: '0010',
    firstName: 'Marc',
    lastName: 'Becker',
    email: 'marc.becker@openclockwork.test',
    role: 'Manager',
    timeModel: 'Vollzeit',
    weeklyHours: 40,
    annualLeaveDays: 30,
    managerEmail: hr.email,
  });
  const manager2 = await ensureEmployee({
    personalNo: '0011',
    firstName: 'Stefanie',
    lastName: 'Weiss',
    email: 'stefanie.weiss@openclockwork.test',
    role: 'Manager',
    timeModel: 'Vollzeit',
    weeklyHours: 40,
    annualLeaveDays: 30,
    managerEmail: hr.email,
  });

  // Employees
  const employees = [
    { personalNo: '1001', firstName: 'Anna',   lastName: 'Müller',     mgr: manager1.email, weeklyHours: 40, model: 'Vollzeit'   as const },
    { personalNo: '1002', firstName: 'Bernd',  lastName: 'Schulz',     mgr: manager1.email, weeklyHours: 32, model: 'Teilzeit'   as const },
    { personalNo: '1003', firstName: 'Cengiz', lastName: 'Yilmaz',     mgr: manager1.email, weeklyHours: 40, model: 'Gleitzeit'  as const },
    { personalNo: '1004', firstName: 'Diana',  lastName: 'Fischer',    mgr: manager2.email, weeklyHours: 40, model: 'Vollzeit'   as const },
    { personalNo: '1005', firstName: 'Erik',   lastName: 'Lindgren',   mgr: manager2.email, weeklyHours: 40, model: 'Vertrauensarbeitszeit' as const },
    { personalNo: '1006', firstName: 'Fatma',  lastName: 'Demir',      mgr: manager2.email, weeklyHours: 20, model: 'Teilzeit'   as const },
  ];

  const created = [hr, manager1, manager2];
  for (const e of employees) {
    const c = await ensureEmployee({
      personalNo: e.personalNo,
      firstName: e.firstName,
      lastName: e.lastName,
      email: `${e.firstName.toLowerCase()}.${e.lastName.toLowerCase().replace(/[^a-z]/g, '')}@openclockwork.test`,
      role: 'Employee',
      timeModel: e.model,
      weeklyHours: e.weeklyHours,
      annualLeaveDays: 30,
      managerEmail: e.mgr,
    });
    created.push(c);
  }

  // Leave allowances (current year)
  const year = new Date().getUTCFullYear();
  for (const c of created) {
    await ensureLeaveAllowance(c.id, year, Number(c.annualLeaveDays));
  }

  // A handful of plausible time entries for the first employee, last 5 weekdays.
  const anna = created.find((e) => e.email.startsWith('anna.'));
  if (anna) {
    for (let i = 1; i <= 5; i += 1) {
      const day = new Date();
      day.setUTCDate(day.getUTCDate() - i);
      // 09:00 → 17:30 UTC
      const clockIn = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 9, 0, 0));
      const clockOut = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 17, 30, 0));
      await ensureTimeEntry(anna.id, clockIn, clockOut);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Seed complete: ${created.length} employees (default password: "${DEFAULT_PASSWORD}")`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
