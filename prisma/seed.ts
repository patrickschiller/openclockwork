import { PrismaClient, type Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = 'openclockwork';

const UMLAUT_MAP: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
};

function toEmailLocalPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[äöüß]/g, (ch) => UMLAUT_MAP[ch] ?? ch)
    .replace(/[^a-z]/g, '');
}

function emailFor(firstName: string, lastName: string): string {
  return `${toEmailLocalPart(firstName)}.${toEmailLocalPart(lastName)}@openclockwork.test`;
}

async function ensureEmployee(input: {
  personalNo: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'Employee' | 'Manager' | 'HRAdmin';
  timeModel: 'Teilzeit' | 'Vollzeit' | 'Vertrauensarbeitszeit' | 'Gleitzeit';
  weeklyHours: number;
  annualLeaveDays: number;
  startDate: Date;
  overtimeOpeningBalanceMinutes?: number;
  bundesland?: string;
  managerEmail?: string;
}) {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const manager = input.managerEmail
    ? await prisma.employee.findUnique({ where: { email: input.managerEmail } })
    : null;
  const opening = input.overtimeOpeningBalanceMinutes ?? 0;
  const bundesland = input.bundesland ?? 'NW';
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
    startDate: input.startDate,
    overtimeOpeningBalanceMinutes: opening,
    bundesland,
    isActive: true,
    ...(manager ? { manager: { connect: { id: manager.id } } } : {}),
  };
  return prisma.employee.upsert({
    where: { personalNo: input.personalNo },
    create: data,
    update: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      role: input.role,
      timeModel: input.timeModel,
      weeklyHours: input.weeklyHours,
      annualLeaveDays: input.annualLeaveDays,
      startDate: input.startDate,
      overtimeOpeningBalanceMinutes: opening,
      bundesland,
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

const WEEKDAYS_MON_TO_FRI = 31;

interface CoreSeed {
  label: string;
  start: string;
  end: string;
  weekdays: number;
}

interface ScheduleSeed {
  name: string;
  description: string;
  frameStart: string;
  frameEnd: string;
  isDefault?: boolean;
  cores: CoreSeed[];
}

async function ensureWorkSchedule(seed: ScheduleSeed) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.workSchedule.findUnique({ where: { name: seed.name } });
    const data = {
      description: seed.description,
      frameStart: seed.frameStart,
      frameEnd: seed.frameEnd,
      isDefault: !!seed.isDefault,
    };
    const schedule = existing
      ? await tx.workSchedule.update({ where: { id: existing.id }, data })
      : await tx.workSchedule.create({ data: { name: seed.name, ...data } });
    // Replace cores idempotently.
    await tx.workScheduleCoreTime.deleteMany({ where: { scheduleId: schedule.id } });
    if (seed.cores.length > 0) {
      await tx.workScheduleCoreTime.createMany({
        data: seed.cores.map((c) => ({ ...c, scheduleId: schedule.id })),
      });
    }
    return schedule;
  });
}

async function ensureTimeEntry(
  employeeId: string,
  clockIn: Date,
  clockOut: Date,
  projectId?: string,
) {
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
      projectId: projectId ?? null,
    },
  });
}

interface ServiceOrderSeed {
  orderNo: string;
  title: string;
  isActive?: boolean;
}

interface ProjectSeed {
  code: string;
  name: string;
  description: string;
  isActive?: boolean;
  serviceOrders: ServiceOrderSeed[];
}

async function ensureProject(seed: ProjectSeed) {
  const data = {
    name: seed.name,
    description: seed.description,
    isActive: seed.isActive ?? true,
  };
  const project = await prisma.project.upsert({
    where: { code: seed.code },
    create: { code: seed.code, ...data },
    update: data,
  });
  for (const o of seed.serviceOrders) {
    await prisma.serviceOrder.upsert({
      where: { projectId_orderNo: { projectId: project.id, orderNo: o.orderNo } },
      create: {
        projectId: project.id,
        orderNo: o.orderNo,
        title: o.title,
        isActive: o.isActive ?? true,
      },
      update: { title: o.title, isActive: o.isActive ?? true },
    });
  }
  return project;
}

async function ensureProjectAssignment(employeeId: string, projectId: string) {
  await prisma.projectAssignment.upsert({
    where: { employeeId_projectId: { employeeId, projectId } },
    create: { employeeId, projectId },
    update: {},
  });
}

async function main() {
  // Default startDates so seed employees have a sensible bookkeeping anchor.
  // The HR/managers were "always there"; some employees joined recently, one
  // is migrated from a legacy system and arrives with an overtime credit.
  const ALWAYS = new Date(Date.UTC(new Date().getUTCFullYear() - 3, 0, 1));
  const Y0401 = new Date(Date.UTC(new Date().getUTCFullYear(), 3, 1));
  const Y0501 = new Date(Date.UTC(new Date().getUTCFullYear(), 4, 1));

  // Work schedules (must exist before employees are assigned to them).
  const standard = await ensureWorkSchedule({
    name: 'Standard 09–17 mit Doppel-Kernzeit',
    description: 'Rahmen 07:00–23:00, Kernzeit 10:00–11:00 und 14:00–15:00 (Mo–Fr).',
    frameStart: '07:00',
    frameEnd: '23:00',
    isDefault: true,
    cores: [
      { label: 'Vormittag', start: '10:00', end: '11:00', weekdays: WEEKDAYS_MON_TO_FRI },
      { label: 'Nachmittag', start: '14:00', end: '15:00', weekdays: WEEKDAYS_MON_TO_FRI },
    ],
  });
  await ensureWorkSchedule({
    name: 'Vertrauensarbeitszeit',
    description: 'Voller Rahmen 00:00–24:00, keine Kernzeiten.',
    frameStart: '00:00',
    frameEnd: '23:59',
    cores: [],
  });
  await ensureWorkSchedule({
    name: 'Teilzeit Vormittag',
    description: 'Rahmen 07:00–14:00, Kernzeit 09:00–12:00 (Mo–Fr).',
    frameStart: '07:00',
    frameEnd: '14:00',
    cores: [{ label: 'Kernzeit', start: '09:00', end: '12:00', weekdays: WEEKDAYS_MON_TO_FRI }],
  });

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
    startDate: ALWAYS,
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
    startDate: ALWAYS,
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
    startDate: ALWAYS,
    managerEmail: hr.email,
  });

  // Employees — startDate + optional opening balance illustrate both new fields.
  const employees = [
    { personalNo: '1001', firstName: 'Anna',   lastName: 'Müller',     mgr: manager1.email, weeklyHours: 40, model: 'Vollzeit'   as const, startDate: ALWAYS, opening: 0,   bundesland: 'NW' },
    { personalNo: '1002', firstName: 'Bernd',  lastName: 'Schulz',     mgr: manager1.email, weeklyHours: 32, model: 'Teilzeit'   as const, startDate: ALWAYS, opening: 0,   bundesland: 'NW' },
    // Cengiz arbeitet im Außenbüro München — hat die BY-Feiertage (z.B. Fronleichnam, Mariä Himmelfahrt)
    { personalNo: '1003', firstName: 'Cengiz', lastName: 'Yilmaz',     mgr: manager1.email, weeklyHours: 40, model: 'Gleitzeit'  as const, startDate: ALWAYS, opening: 0,   bundesland: 'BY' },
    { personalNo: '1004', firstName: 'Diana',  lastName: 'Fischer',    mgr: manager2.email, weeklyHours: 40, model: 'Vollzeit'   as const, startDate: ALWAYS, opening: 0,   bundesland: 'NW' },
    { personalNo: '1005', firstName: 'Erik',   lastName: 'Lindgren',   mgr: manager2.email, weeklyHours: 40, model: 'Vertrauensarbeitszeit' as const, startDate: Y0401, opening: 0,   bundesland: 'NW' },
    { personalNo: '1006', firstName: 'Fatma',  lastName: 'Demir',      mgr: manager2.email, weeklyHours: 20, model: 'Teilzeit'   as const, startDate: Y0501, opening: 540, bundesland: 'NW' },
  ];

  const created = [hr, manager1, manager2];
  for (const e of employees) {
    const c = await ensureEmployee({
      personalNo: e.personalNo,
      firstName: e.firstName,
      lastName: e.lastName,
      email: emailFor(e.firstName, e.lastName),
      role: 'Employee',
      timeModel: e.model,
      weeklyHours: e.weeklyHours,
      annualLeaveDays: 30,
      startDate: e.startDate,
      overtimeOpeningBalanceMinutes: e.opening,
      bundesland: e.bundesland,
      managerEmail: e.mgr,
    });
    created.push(c);
  }

  // Leave allowances (current year)
  const year = new Date().getUTCFullYear();
  for (const c of created) {
    await ensureLeaveAllowance(c.id, year, Number(c.annualLeaveDays));
  }

  // Auto-assign schedules per TimeModel (only if employee has none yet, so HR
  // can override later without the seeder reverting their decision).
  const trustSchedule = await prisma.workSchedule.findUnique({
    where: { name: 'Vertrauensarbeitszeit' },
  });
  const partTimeSchedule = await prisma.workSchedule.findUnique({
    where: { name: 'Teilzeit Vormittag' },
  });
  await prisma.employee.updateMany({
    where: { workScheduleId: null, timeModel: { in: ['Vollzeit', 'Gleitzeit'] } },
    data: { workScheduleId: standard.id },
  });
  if (trustSchedule) {
    await prisma.employee.updateMany({
      where: { workScheduleId: null, timeModel: 'Vertrauensarbeitszeit' },
      data: { workScheduleId: trustSchedule.id },
    });
  }
  if (partTimeSchedule) {
    await prisma.employee.updateMany({
      where: { workScheduleId: null, timeModel: 'Teilzeit' },
      data: { workScheduleId: partTimeSchedule.id },
    });
  }

  // Projects with service orders + booking assignments (Epic 5). Two active
  // projects and one deactivated one so the admin UI and the booking selector
  // show both states.
  const website = await ensureProject({
    code: 'PRJ-001',
    name: 'Website Relaunch',
    description: 'Relaunch der Unternehmenswebsite inkl. CMS-Migration.',
    serviceOrders: [
      { orderNo: 'SA-001', title: 'Konzeption & Design' },
      { orderNo: 'SA-002', title: 'Umsetzung Frontend' },
    ],
  });
  const erpIntro = await ensureProject({
    code: 'PRJ-002',
    name: 'ERP-Einführung',
    description: 'Einführung und Anbindung des neuen ERP-Systems.',
    serviceOrders: [{ orderNo: 'SA-001', title: 'Datenmigration' }],
  });
  await ensureProject({
    code: 'PRJ-003',
    name: 'Altsystem-Wartung',
    description: 'Abgeschlossenes Wartungsprojekt (deaktiviert).',
    isActive: false,
    serviceOrders: [],
  });
  const byPersonalNo = (no: string) => created.find((e) => e.personalNo === no);
  const anna = byPersonalNo('1001');
  const bernd = byPersonalNo('1002');
  const diana = byPersonalNo('1004');
  if (anna) {
    await ensureProjectAssignment(anna.id, website.id);
    await ensureProjectAssignment(anna.id, erpIntro.id);
  }
  if (bernd) await ensureProjectAssignment(bernd.id, website.id);
  if (diana) await ensureProjectAssignment(diana.id, erpIntro.id);

  // A handful of plausible time entries for the first employee, last 5
  // weekdays — the two most recent ones booked onto the website project.
  if (anna) {
    for (let i = 1; i <= 5; i += 1) {
      const day = new Date();
      day.setUTCDate(day.getUTCDate() - i);
      // 09:00 → 17:30 UTC
      const clockIn = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 9, 0, 0));
      const clockOut = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 17, 30, 0));
      await ensureTimeEntry(anna.id, clockIn, clockOut, i <= 2 ? website.id : undefined);
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
