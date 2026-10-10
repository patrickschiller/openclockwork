import { ProjectsService } from '../../../api/src/app/projects/projects.service';
import { CustomersService } from '../../../api/src/app/customers/customers.service';
import { INSTALLATION_LOCK } from '../../../api/src/app/installation/installation.service';
import type { JwtUser } from '../../../api/src/app/auth/jwt.strategy';
import {
  createTestApp,
  seedEmployee,
  seedProject,
  type TestContext,
} from '../support/test-app';

describe('Project mutations revalidate in-flight authority under the installation lock', () => {
  let ctx: TestContext;
  let service: ProjectsService;
  beforeAll(async () => {
    ctx = await createTestApp();
    service = ctx.app.get(ProjectsService);
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
  });

  async function fixture() {
    const admin = await seedEmployee(ctx.prisma, {
      personalNo: 'PROJECT-ADMIN',
      firstName: 'Project',
      lastName: 'Admin',
      email: 'project-boundary-admin@test.local',
      role: 'HRAdmin',
    });
    const worker = await seedEmployee(ctx.prisma, {
      personalNo: 'PROJECT-WORKER',
      firstName: 'Project',
      lastName: 'Worker',
      email: 'project-boundary-worker@test.local',
    });
    const project = await seedProject(ctx.prisma, {
      code: 'BOUNDARY',
      assigneeIds: [worker.id],
      serviceOrders: [{ orderNo: 'A1', title: 'Original' }],
    });
    const actor: JwtUser = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      authVersion: 0,
    };
    const actions: Array<() => Promise<unknown>> = [
      () => service.create({ code: 'NEW', name: 'Unauthorized' }, actor),
      () =>
        service.update(
          project.id,
          { code: 'BOUNDARY', name: 'Unauthorized' },
          actor,
        ),
      () => service.remove(project.id, actor),
      () =>
        service.createServiceOrder(
          project.id,
          { orderNo: 'NEW', title: 'Unauthorized' },
          actor,
        ),
      () =>
        service.updateServiceOrder(
          project.id,
          project.serviceOrders[0].id,
          { orderNo: 'A1', title: 'Unauthorized' },
          actor,
        ),
      () =>
        service.removeServiceOrder(
          project.id,
          project.serviceOrders[0].id,
          actor,
        ),
      () => service.assign(project.id, admin.id, actor),
      () => service.unassign(project.id, worker.id, actor),
    ];
    return { admin, worker, project, actor, actions };
  }

  it('rejects every mutation after the captured administrator role is revoked', async () => {
    const { admin, actions, project } = await fixture();
    await ctx.prisma.employee.update({
      where: { id: admin.id },
      data: { role: 'Employee' },
    });
    for (const action of actions)
      await expect(action()).rejects.toMatchObject({ status: 403 });
    expect(await ctx.prisma.project.count()).toBe(1);
    expect(await ctx.prisma.serviceOrder.count()).toBe(1);
    expect(
      (
        await ctx.prisma.project.findUniqueOrThrow({
          where: { id: project.id },
        })
      ).name,
    ).toBe('BOUNDARY');
  });

  it('rejects every mutation after a captured access-token version is invalidated', async () => {
    const { admin, actions } = await fixture();
    await ctx.prisma.employee.update({
      where: { id: admin.id },
      data: { authVersion: { increment: 1 } },
    });
    for (const action of actions)
      await expect(action()).rejects.toMatchObject({ status: 403 });
  });

  it('also rejects customer writes from an invalidated in-flight owner session', async () => {
    const { admin, actor } = await fixture();
    const customers = ctx.app.get(CustomersService);
    await ctx.prisma.installationSettings.upsert({
      where: { id: 1 },
      create: { mode: 'Solo', ownerEmployeeId: admin.id },
      update: { mode: 'Solo', ownerEmployeeId: admin.id },
    });
    const customer = await ctx.prisma.customer.create({
      data: { name: 'Original' },
    });
    await ctx.prisma.employee.update({
      where: { id: admin.id },
      data: { authVersion: { increment: 1 } },
    });
    await expect(
      customers.create(actor, { name: 'Unauthorized' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      customers.update(actor, customer.id, { name: 'Unauthorized' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(customers.remove(actor, customer.id)).rejects.toMatchObject({
      status: 403,
    });
    expect(
      (
        await ctx.prisma.customer.findUniqueOrThrow({
          where: { id: customer.id },
        })
      ).name,
    ).toBe('Original');
  });

  it('cannot finish a request with old Team rights after a concurrent deactivation and Solo switch', async () => {
    const { admin, worker, project, actions } = await fixture();
    let pending: Promise<unknown> | undefined;
    await ctx.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INSTALLATION_LOCK})`;
      // This represents an HTTP request that already passed its role guard,
      // but must now wait for the mode-changing transaction to finish.
      pending = actions[1]().catch((error: { status: number }) => ({
        status: error.status,
      }));
      await tx.employee.update({
        where: { id: admin.id },
        data: { isActive: false },
      });
      await tx.employee.update({
        where: { id: worker.id },
        data: { role: 'HRAdmin' },
      });
      await tx.installationSettings.upsert({
        where: { id: 1 },
        create: { mode: 'Solo', ownerEmployeeId: worker.id },
        update: { mode: 'Solo', ownerEmployeeId: worker.id },
      });
    });
    expect(await pending).toEqual({ status: 403 });
    expect(
      (
        await ctx.prisma.project.findUniqueOrThrow({
          where: { id: project.id },
        })
      ).name,
    ).toBe('BOUNDARY');
  });
});
