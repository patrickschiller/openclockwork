import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
// AppModule import is loaded lazily so that env vars set in globalSetup are
// already in place by the time @nestjs/config / PrismaService construct.
import { AppModule } from '../../../api/src/app/app.module';
import { PrismaService } from '../../../api/src/app/prisma/prisma.service';
import * as request from 'supertest';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  http: request.Agent;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

const RESET_SQL = `
  TRUNCATE TABLE
    "Absence",
    "RequestAttachment",
    "RequestEvent",
    "Request",
    "EmployeeLeaveAllowance",
    "TimeEntry",
    "ProjectAssignment",
    "ServiceOrder",
    "Project",
    "WorkScheduleCoreTime",
    "WorkSchedule",
    "Employee"
  RESTART IDENTITY CASCADE;
`;

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();

  const prisma = app.get(PrismaService);
  const http = request.agent(app.getHttpServer());

  return {
    app,
    prisma,
    http,
    reset: async () => {
      await prisma.$executeRawUnsafe(RESET_SQL);
    },
    close: async () => {
      await app.close();
    },
  };
}

export interface SeedEmployeeInput {
  personalNo: string;
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  role?: 'Employee' | 'Manager' | 'HRAdmin';
  timeModel?: 'Vollzeit' | 'Teilzeit' | 'Gleitzeit' | 'Vertrauensarbeitszeit';
  weeklyHours?: number;
  annualLeaveDays?: number;
  startDate?: Date;
  overtimeOpeningBalanceMinutes?: number;
  managerId?: string | null;
}

export async function seedEmployee(prisma: PrismaService, input: SeedEmployeeInput) {
  const passwordHash = await bcrypt.hash(input.password ?? 'test1234', 4);
  // Default startDate is "Jan 1 of three years ago" so most tests don't have
  // to think about it; specs that care override it explicitly.
  const defaultStart = new Date(Date.UTC(new Date().getUTCFullYear() - 3, 0, 1));
  return prisma.employee.create({
    data: {
      personalNo: input.personalNo,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      passwordHash,
      role: input.role ?? 'Employee',
      timeModel: input.timeModel ?? 'Vollzeit',
      weeklyHours: input.weeklyHours ?? 40,
      annualLeaveDays: input.annualLeaveDays ?? 30,
      startDate: input.startDate ?? defaultStart,
      overtimeOpeningBalanceMinutes: input.overtimeOpeningBalanceMinutes ?? 0,
      isActive: true,
      managerId: input.managerId ?? null,
    },
  });
}

export async function seedLeaveAllowance(
  prisma: PrismaService,
  employeeId: string,
  year: number,
  baseDays = 30,
) {
  return prisma.employeeLeaveAllowance.upsert({
    where: { employeeId_year: { employeeId, year } },
    create: { employeeId, year, baseDays, carryOverDays: 0, adjustmentDays: 0 },
    update: { baseDays, carryOverDays: 0, adjustmentDays: 0 },
  });
}

export interface SeedProjectInput {
  code: string;
  name?: string;
  isActive?: boolean;
  /** Employees to assign via the booking matrix. */
  assigneeIds?: string[];
  serviceOrders?: Array<{ orderNo: string; title: string; isActive?: boolean }>;
}

export async function seedProject(prisma: PrismaService, input: SeedProjectInput) {
  const project = await prisma.project.create({
    data: {
      code: input.code,
      name: input.name ?? input.code,
      isActive: input.isActive ?? true,
      serviceOrders: input.serviceOrders
        ? {
            create: input.serviceOrders.map((o) => ({
              orderNo: o.orderNo,
              title: o.title,
              isActive: o.isActive ?? true,
            })),
          }
        : undefined,
      assignments: input.assigneeIds
        ? { create: input.assigneeIds.map((employeeId) => ({ employeeId })) }
        : undefined,
    },
    include: { serviceOrders: true, assignments: true },
  });
  return project;
}

export async function login(
  http: request.Agent,
  email: string,
  password = 'test1234',
): Promise<string> {
  const res = await http
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return (res.body as { accessToken: string }).accessToken;
}
