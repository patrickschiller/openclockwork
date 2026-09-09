import { randomUUID } from 'node:crypto';
import {
  createTestApp,
  login,
  seedEmployee,
  seedProject,
  type TestContext,
} from '../support/test-app';

describe('Solo customers, project ownership and customer statements', () => {
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

  async function fixture() {
    const owner = await seedEmployee(ctx.prisma, {
      personalNo: 'SOLO',
      firstName: 'Solo',
      lastName: 'Owner',
      email: 'solo-owner@test.local',
      role: 'HRAdmin',
    });
    await ctx.prisma.installationSettings.upsert({
      where: { id: 1 },
      create: { mode: 'Solo', ownerEmployeeId: owner.id, setupCompleted: true },
      update: { mode: 'Solo', ownerEmployeeId: owner.id, setupCompleted: true },
    });
    const token = await login(ctx.http, owner.email);
    return { owner, authorization: `Bearer ${token}` };
  }

  async function customer(authorization: string, name = 'Example customer') {
    return (
      await ctx.http
        .post('/api/customers')
        .set('Authorization', authorization)
        .send({ name })
        .expect(201)
    ).body as { id: string; name: string };
  }

  it('requires Solo ownership and keeps legacy Team project reads public', async () => {
    const owner = await seedEmployee(ctx.prisma, {
      personalNo: 'TEAM',
      firstName: 'Team',
      lastName: 'Admin',
      email: 'team-admin@test.local',
      role: 'HRAdmin',
    });
    const token = await login(ctx.http, owner.email);
    await ctx.http.get('/api/projects').expect(200);
    await ctx.http
      .get('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    await ctx.http
      .get('/api/reports/solo?from=2026-09-01&to=2026-09-30')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    await ctx.prisma.installationSettings.upsert({
      where: { id: 1 },
      create: { mode: 'Solo', ownerEmployeeId: owner.id },
      update: { mode: 'Solo', ownerEmployeeId: owner.id },
    });
    await ctx.http.get('/api/projects').expect(401);
    await ctx.http.get('/api/customers').expect(401);
    await ctx.http
      .get('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('creates minimal customers and assigns new projects to the owner atomically', async () => {
    const { owner, authorization } = await fixture();
    const client = await customer(authorization);
    const response = await ctx.http
      .post('/api/projects')
      .set('Authorization', authorization)
      .send({
        code: 'OWN',
        name: 'Development',
        customerId: client.id,
        defaultBillable: true,
      })
      .expect(201);
    expect(response.body).toMatchObject({
      assignedEmployeeCount: 1,
      customerId: client.id,
      customerName: client.name,
      defaultBillable: true,
      bookedNetMinutes: 0,
    });
    expect(
      await ctx.prisma.projectAssignment.count({
        where: { projectId: response.body.id, employeeId: owner.id },
      }),
    ).toBe(1);
    const bookable = await ctx.http
      .get(`/api/projects/bookable?employeeId=${owner.id}`)
      .set('Authorization', authorization)
      .expect(200);
    expect(bookable.body[0]).toMatchObject({
      customerId: client.id,
      defaultBillable: true,
    });
    const order = await ctx.http
      .post(`/api/projects/${response.body.id}/service-orders`)
      .set('Authorization', authorization)
      .send({ orderNo: 'A1', title: 'Implementation', defaultBillable: false })
      .expect(201);
    expect(order.body.defaultBillable).toBe(false);
    const reset = await ctx.http
      .put(`/api/projects/${response.body.id}/service-orders/${order.body.id}`)
      .set('Authorization', authorization)
      .send({ orderNo: 'A1', title: 'Implementation', defaultBillable: null })
      .expect(200);
    expect(reset.body.defaultBillable).toBeNull();
    await ctx.http
      .delete(`/api/projects/${response.body.id}/assignments/${owner.id}`)
      .set('Authorization', authorization)
      .expect(409);
  });

  it('validates names and unique references, and deletes unused customers only', async () => {
    const { authorization } = await fixture();
    await ctx.http
      .post('/api/customers')
      .set('Authorization', authorization)
      .send({ name: '   ' })
      .expect(400);
    const created = await ctx.http
      .post('/api/customers')
      .set('Authorization', authorization)
      .send({ name: ' Client ', code: ' C-1 ', note: 'private' })
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'Client',
      code: 'C-1',
      note: 'private',
      projectCount: 0,
    });
    await ctx.http
      .post('/api/customers')
      .set('Authorization', authorization)
      .send({ name: 'Other', code: 'C-1' })
      .expect(409);
    await ctx.http
      .delete(`/api/customers/${created.body.id}`)
      .set('Authorization', authorization)
      .expect(204);
    await ctx.http
      .get(`/api/customers/${created.body.id}`)
      .set('Authorization', authorization)
      .expect(404);
  });

  it('preserves booked customer references, blocks archive of running work and hides archived booking targets', async () => {
    const { owner, authorization } = await fixture();
    const first = await customer(authorization, 'First');
    const second = await customer(authorization, 'Second');
    const project = await ctx.prisma.project.create({
      data: {
        code: 'P',
        name: 'Project',
        customerId: first.id,
        assignments: { create: { employeeId: owner.id } },
      },
    });
    const order = await ctx.prisma.serviceOrder.create({
      data: { projectId: project.id, orderNo: 'A', title: 'Order' },
    });
    const entry = await ctx.prisma.timeEntry.create({
      data: {
        employeeId: owner.id,
        projectId: project.id,
        serviceOrderId: order.id,
        clockIn: new Date('2026-09-08T08:00:00Z'),
      },
    });
    await ctx.http
      .put(`/api/projects/${project.id}`)
      .set('Authorization', authorization)
      .send({ code: 'P', name: 'Project', customerId: second.id })
      .expect(409);
    await ctx.http
      .delete(`/api/customers/${first.id}`)
      .set('Authorization', authorization)
      .expect(409);
    await ctx.http
      .put(`/api/customers/${first.id}`)
      .set('Authorization', authorization)
      .send({ name: 'First', isActive: false })
      .expect(409);
    await ctx.http
      .put(`/api/projects/${project.id}`)
      .set('Authorization', authorization)
      .send({ code: 'P', name: 'Project', isActive: false })
      .expect(409);
    await ctx.http
      .put(`/api/projects/${project.id}/service-orders/${order.id}`)
      .set('Authorization', authorization)
      .send({ orderNo: 'A', title: 'Order', isActive: false })
      .expect(409);
    await ctx.prisma.timeEntry.update({
      where: { id: entry.id },
      data: { clockOut: new Date('2026-09-08T09:00:00Z'), status: 'Approved' },
    });
    await ctx.http
      .put(`/api/customers/${first.id}`)
      .set('Authorization', authorization)
      .send({ name: 'First', isActive: false })
      .expect(200);
    const bookable = await ctx.http
      .get(`/api/projects/bookable?employeeId=${owner.id}`)
      .set('Authorization', authorization)
      .expect(200);
    expect(bookable.body).toHaveLength(0);
    await ctx.http
      .post('/api/projects')
      .set('Authorization', authorization)
      .send({ code: 'NEW', name: 'New', customerId: first.id })
      .expect(400);
    const report = await ctx.http
      .get(
        `/api/reports/solo?from=2026-09-08&to=2026-09-08&customerId=${first.id}`,
      )
      .set('Authorization', authorization)
      .expect(200);
    expect(report.body.rows).toHaveLength(1);
  });

  it('allocates one capture-group break across project filters, excludes invalid and foreign entries, and matches net progress', async () => {
    const { owner, authorization } = await fixture();
    const foreign = await seedEmployee(ctx.prisma, {
      personalNo: 'OLD',
      firstName: 'Historic',
      lastName: 'Employee',
      email: 'historic@test.local',
    });
    await ctx.prisma.employee.update({
      where: { id: foreign.id },
      data: { isActive: false },
    });
    const projectA = await seedProject(ctx.prisma, { code: 'A' });
    const projectB = await seedProject(ctx.prisma, { code: 'B' });
    const group = randomUUID();
    const common = {
      employeeId: owner.id,
      status: 'Approved' as const,
      captureGroupId: group,
      breakRules: [{ afterMinutes: 360, breakMinutes: 30 }],
    };
    await ctx.prisma.timeEntry.createMany({
      data: [
        {
          ...common,
          projectId: projectA.id,
          clockIn: new Date('2026-09-07T06:00:00Z'),
          clockOut: new Date('2026-09-07T11:00:00Z'),
          billable: true,
        },
        {
          ...common,
          projectId: projectB.id,
          clockIn: new Date('2026-09-07T11:00:00Z'),
          clockOut: new Date('2026-09-07T13:00:00Z'),
          billable: false,
        },
        {
          ...common,
          captureGroupId: randomUUID(),
          projectId: projectA.id,
          clockIn: new Date('2026-09-07T14:00:00Z'),
          clockOut: new Date('2026-09-07T15:00:00Z'),
          voidedAt: new Date(),
        },
        {
          ...common,
          captureGroupId: randomUUID(),
          projectId: projectA.id,
          clockIn: new Date('2026-09-07T15:00:00Z'),
          clockOut: new Date('2026-09-07T16:00:00Z'),
          status: 'Rejected',
        },
        {
          employeeId: foreign.id,
          projectId: projectA.id,
          clockIn: new Date('2026-09-07T06:00:00Z'),
          clockOut: new Date('2026-09-07T16:00:00Z'),
          status: 'Approved',
        },
        {
          employeeId: owner.id,
          clockIn: new Date('2026-09-07T17:00:00Z'),
          clockOut: null,
        },
      ],
    });
    const all = await ctx.http
      .get('/api/reports/solo?from=2026-09-07&to=2026-09-07')
      .set('Authorization', authorization)
      .expect(200);
    expect(all.body.rows).toHaveLength(2);
    expect(all.body.openTimerCount).toBe(1);
    expect(all.body.totals.grossMinutes).toBe(420);
    expect(all.body.totals.breakMinutes).toBe(30);
    expect(all.body.totals.netMinutes).toBe(390);
    const onlyA = await ctx.http
      .get(
        `/api/reports/solo?from=2026-09-07&to=2026-09-07&projectId=${projectA.id}&billable=true`,
      )
      .set('Authorization', authorization)
      .expect(200);
    expect(onlyA.body.totals.breakMinutes).toBeCloseTo((30 * 5) / 7, 10);
    expect(onlyA.body.totals.billableNetMinutes).toBeCloseTo((390 * 5) / 7, 10);
    const progress = await ctx.http
      .get(`/api/projects/${projectA.id}`)
      .set('Authorization', authorization)
      .expect(200);
    expect(progress.body.bookedNetMinutes).toBeCloseTo(
      onlyA.body.totals.netMinutes,
      10,
    );
    const unmatched = await ctx.http
      .get(`/api/reports/solo?from=2026-09-07&to=2026-09-07&unassigned=true`)
      .set('Authorization', authorization)
      .expect(200);
    expect(unmatched.body.rows).toHaveLength(0);
    expect(unmatched.body.openTimerCount).toBe(1);
  });

  it('clips local midnight and preserves exact UTC duration through DST and sub-minute fragments', async () => {
    const { owner, authorization } = await fixture();
    await ctx.prisma.timeEntry.createMany({
      data: [
        {
          employeeId: owner.id,
          status: 'Approved',
          captureGroupId: randomUUID(),
          breakRules: [],
          clockIn: new Date('2026-03-28T22:30:00Z'),
          clockOut: new Date('2026-03-29T02:30:00Z'),
        },
        {
          employeeId: owner.id,
          status: 'Approved',
          captureGroupId: randomUUID(),
          breakRules: [],
          clockIn: new Date('2026-10-25T00:30:00Z'),
          clockOut: new Date('2026-10-25T02:30:00Z'),
        },
        {
          employeeId: owner.id,
          status: 'Approved',
          captureGroupId: randomUUID(),
          breakRules: [],
          clockIn: new Date('2026-09-07T21:59:45Z'),
          clockOut: new Date('2026-09-07T22:00:15Z'),
        },
      ],
    });
    const spring = await ctx.http
      .get('/api/reports/solo?from=2026-03-29&to=2026-03-29')
      .set('Authorization', authorization)
      .expect(200);
    expect(spring.body.timeZone).toBe('Europe/Berlin');
    expect(spring.body.rows[0].clockIn).toBe('2026-03-28T23:00:00.000Z');
    expect(spring.body.totals.netMinutes).toBe(210);
    const autumn = await ctx.http
      .get('/api/reports/solo?from=2026-10-25&to=2026-10-25')
      .set('Authorization', authorization)
      .expect(200);
    expect(autumn.body.totals.netMinutes).toBe(120);
    const fragment = await ctx.http
      .get('/api/reports/solo?from=2026-09-07&to=2026-09-08')
      .set('Authorization', authorization)
      .expect(200);
    expect(
      fragment.body.rows.map((row: { netMinutes: number }) => row.netMinutes),
    ).toEqual([0.25, 0.25]);
    expect(fragment.body.totals.netMinutes).toBe(0.5);
  });

  it('exports customer-safe CSV with timezone, formula escaping and exact minutes', async () => {
    const { owner, authorization } = await fixture();
    const client = await customer(authorization, '=HYPERLINK("unsafe")');
    const project = await ctx.prisma.project.create({
      data: { code: 'CSV', name: 'CSV Project', customerId: client.id },
    });
    await ctx.prisma.timeEntry.create({
      data: {
        employeeId: owner.id,
        projectId: project.id,
        captureGroupId: randomUUID(),
        clockIn: new Date('2026-09-07T08:00:00Z'),
        clockOut: new Date('2026-09-07T08:00:30Z'),
        status: 'Approved',
        breakRules: [],
        activity: '@SUM(1,2)\nquoted "text"',
        note: 'PRIVATE-NOTE-SECRET',
        terminalLocationLabel: 'PRIVATE-LOCATION-SECRET',
        billable: true,
      },
    });
    const csv = await ctx.http
      .get('/api/reports/solo.csv?from=2026-09-07&to=2026-09-07')
      .set('Authorization', authorization)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain(
      'openclockwork-2026-09-07-2026-09-07.csv',
    );
    expect(csv.text).toContain('Europe/Berlin');
    expect(csv.text).toContain('"\'=HYPERLINK(""unsafe"")"');
    expect(csv.text).toContain('"\'@SUM(1,2)\nquoted ""text"""');
    expect(csv.text).toContain('"0.5"');
    expect(csv.text).not.toContain('PRIVATE-');
  });

  it('rejects invalid dates, incompatible filters and out-of-range statements', async () => {
    const { authorization } = await fixture();
    for (const query of [
      'from=2026-02-31&to=2026-03-01',
      'from=2026-09-08&to=2026-09-07',
      'from=2025-01-01&to=2026-12-31',
      'from=2026-09-07&to=2026-09-07&billable=yes',
      `from=2026-09-07&to=2026-09-07&unassigned=true&projectId=${randomUUID()}`,
    ]) {
      await ctx.http
        .get(`/api/reports/solo?${query}`)
        .set('Authorization', authorization)
        .expect(400);
    }
  });
});
