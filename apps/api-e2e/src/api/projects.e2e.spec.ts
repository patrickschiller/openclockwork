import {
  createTestApp,
  login,
  seedEmployee,
  seedProject,
  type TestContext,
} from '../support/test-app';

describe('Projects — CRUD, service orders, assignment matrix', () => {
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
    const hr = await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hr',
      lastName: 'Admin',
      email: 'hr@test.local',
      role: 'HRAdmin',
    });
    const manager = await seedEmployee(ctx.prisma, {
      personalNo: '0010',
      firstName: 'Mara',
      lastName: 'Manager',
      email: 'manager@test.local',
      role: 'Manager',
    });
    const worker = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Willi',
      lastName: 'Worker',
      email: 'worker@test.local',
    });
    return { hr, manager, worker };
  }

  it('GET /projects is readable without a token; mutations are role-guarded', async () => {
    const { manager, worker } = await fixture();

    await ctx.http.get('/api/projects').expect(200);
    await ctx.http.post('/api/projects').send({ code: 'P-1', name: 'One' }).expect(401);

    const workerToken = await login(ctx.http, worker.email);
    await ctx.http
      .post('/api/projects')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ code: 'P-1', name: 'One' })
      .expect(403);

    const managerToken = await login(ctx.http, manager.email);
    const created = await ctx.http
      .post('/api/projects')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'P-1', name: 'One', description: 'First project' })
      .expect(201);
    expect(created.body.code).toBe('P-1');
    expect(created.body.isActive).toBe(true);
    expect(created.body.assignedEmployeeCount).toBe(0);
  });

  it('HRAdmin may create; duplicate codes are rejected with 409', async () => {
    const { hr } = await fixture();
    const token = await login(ctx.http, hr.email);
    await ctx.http
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'P-1', name: 'One' })
      .expect(201);
    await ctx.http
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'P-1', name: 'Other name, same code' })
      .expect(409);
  });

  it('PUT updates fields including isActive; list filters inactive by default', async () => {
    const { hr } = await fixture();
    const token = await login(ctx.http, hr.email);
    const project = await seedProject(ctx.prisma, { code: 'P-1', name: 'One' });

    const updated = await ctx.http
      .put(`/api/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'P-1', name: 'One (archived)', isActive: false })
      .expect(200);
    expect(updated.body.isActive).toBe(false);

    const activeOnly = await ctx.http.get('/api/projects').expect(200);
    expect(activeOnly.body.length).toBe(0);
    const all = await ctx.http.get('/api/projects?includeInactive=true').expect(200);
    expect(all.body.length).toBe(1);
  });

  it('DELETE removes an unbooked project but is blocked (409) once time is booked', async () => {
    const { hr, worker } = await fixture();
    const token = await login(ctx.http, hr.email);
    const unbooked = await seedProject(ctx.prisma, { code: 'P-EMPTY' });
    const booked = await seedProject(ctx.prisma, { code: 'P-BOOKED' });
    await ctx.prisma.timeEntry.create({
      data: {
        employeeId: worker.id,
        clockIn: new Date(Date.now() - 2 * 60 * 60 * 1000),
        clockOut: new Date(Date.now() - 60 * 60 * 1000),
        status: 'Pending',
        projectId: booked.id,
      },
    });

    await ctx.http
      .delete(`/api/projects/${unbooked.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await ctx.http
      .delete(`/api/projects/${booked.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('service orders: CRUD with per-project unique orderNo', async () => {
    const { manager } = await fixture();
    const token = await login(ctx.http, manager.email);
    const p1 = await seedProject(ctx.prisma, { code: 'P-1' });
    const p2 = await seedProject(ctx.prisma, { code: 'P-2' });

    const created = await ctx.http
      .post(`/api/projects/${p1.id}/service-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNo: 'SA-1', title: 'Design' })
      .expect(201);
    expect(created.body.orderNo).toBe('SA-1');

    // Same orderNo in the same project → conflict; in another project → fine.
    await ctx.http
      .post(`/api/projects/${p1.id}/service-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNo: 'SA-1', title: 'Duplicate' })
      .expect(409);
    await ctx.http
      .post(`/api/projects/${p2.id}/service-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNo: 'SA-1', title: 'Other project' })
      .expect(201);

    const updated = await ctx.http
      .put(`/api/projects/${p1.id}/service-orders/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNo: 'SA-1', title: 'Design & Konzept', isActive: false })
      .expect(200);
    expect(updated.body.title).toBe('Design & Konzept');
    expect(updated.body.isActive).toBe(false);

    await ctx.http
      .delete(`/api/projects/${p1.id}/service-orders/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    const after = await ctx.http.get(`/api/projects/${p1.id}`).expect(200);
    expect(after.body.serviceOrders.length).toBe(0);
  });

  it('assignments are idempotent and reflected in the matrix endpoint', async () => {
    const { manager, worker } = await fixture();
    const token = await login(ctx.http, manager.email);
    const project = await seedProject(ctx.prisma, { code: 'P-1' });

    // Assigning twice succeeds both times (upsert) and yields one row.
    await ctx.http
      .put(`/api/projects/${project.id}/assignments/${worker.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await ctx.http
      .put(`/api/projects/${project.id}/assignments/${worker.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const matrix = await ctx.http
      .get('/api/projects/assignments')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(matrix.body).toEqual([{ employeeId: worker.id, projectId: project.id }]);

    // Unassigning is idempotent too.
    await ctx.http
      .delete(`/api/projects/${project.id}/assignments/${worker.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await ctx.http
      .delete(`/api/projects/${project.id}/assignments/${worker.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    const empty = await ctx.http
      .get('/api/projects/assignments')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(empty.body.length).toBe(0);
  });

  it('the matrix endpoint is not visible to plain employees', async () => {
    const { worker } = await fixture();
    const token = await login(ctx.http, worker.email);
    await ctx.http.get('/api/projects/assignments').expect(401);
    await ctx.http
      .get('/api/projects/assignments')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('bookable returns only active, assigned projects with their active orders', async () => {
    const { worker } = await fixture();
    const active = await seedProject(ctx.prisma, {
      code: 'P-ACTIVE',
      assigneeIds: [worker.id],
      serviceOrders: [
        { orderNo: 'SA-1', title: 'Aktiv' },
        { orderNo: 'SA-2', title: 'Inaktiv', isActive: false },
      ],
    });
    await seedProject(ctx.prisma, {
      code: 'P-INACTIVE',
      isActive: false,
      assigneeIds: [worker.id],
    });
    await seedProject(ctx.prisma, { code: 'P-FOREIGN' });

    const res = await ctx.http
      .get(`/api/projects/bookable?employeeId=${worker.id}`)
      .expect(200);
    expect(res.body).toEqual([
      {
        id: active.id,
        code: 'P-ACTIVE',
        name: 'P-ACTIVE',
        serviceOrders: [
          { id: active.serviceOrders[0].id, orderNo: 'SA-1', title: 'Aktiv' },
        ],
      },
    ]);
  });

  it('service orders with booked time cannot be deleted (409), only deactivated', async () => {
    const { hr, worker } = await fixture();
    const token = await login(ctx.http, hr.email);
    const project = await seedProject(ctx.prisma, {
      code: 'P-1',
      assigneeIds: [worker.id],
      serviceOrders: [{ orderNo: 'SA-1', title: 'Gebucht' }],
    });
    const order = project.serviceOrders[0];
    await ctx.prisma.timeEntry.create({
      data: {
        employeeId: worker.id,
        clockIn: new Date(Date.now() - 2 * 60 * 60 * 1000),
        clockOut: new Date(Date.now() - 60 * 60 * 1000),
        status: 'Pending',
        projectId: project.id,
        serviceOrderId: order.id,
      },
    });

    await ctx.http
      .delete(`/api/projects/${project.id}/service-orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
    await ctx.http
      .put(`/api/projects/${project.id}/service-orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNo: 'SA-1', title: 'Gebucht', isActive: false })
      .expect(200);
  });

  it('enforces the plan-hours invariant: order plans must fit the project plan', async () => {
    const { hr } = await fixture();
    const token = await login(ctx.http, hr.email);
    const planned = await ctx.http
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'P-PLAN', name: 'Planned', planHours: 100 })
      .expect(201);
    expect(planned.body.planHours).toBe(100);

    const first = await ctx.http
      .post(`/api/projects/${planned.body.id}/service-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNo: 'SA-1', title: 'A', planHours: 60 })
      .expect(201);
    // 60 + 50 > 100 → conflict.
    await ctx.http
      .post(`/api/projects/${planned.body.id}/service-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNo: 'SA-2', title: 'B', planHours: 50 })
      .expect(409);
    await ctx.http
      .post(`/api/projects/${planned.body.id}/service-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNo: 'SA-2', title: 'B', planHours: 40 })
      .expect(201);
    // Raising an order beyond the remaining budget → conflict.
    await ctx.http
      .put(`/api/projects/${planned.body.id}/service-orders/${first.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNo: 'SA-1', title: 'A', planHours: 70 })
      .expect(409);
    // Reducing the project plan below the order total → conflict.
    await ctx.http
      .put(`/api/projects/${planned.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'P-PLAN', name: 'Planned', planHours: 80 })
      .expect(409);

    // Without a project plan, order plans are unconstrained.
    const unplanned = await seedProject(ctx.prisma, { code: 'P-FREE' });
    await ctx.http
      .post(`/api/projects/${unplanned.id}/service-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNo: 'SA-1', title: 'Frei', planHours: 9999 })
      .expect(201);
  });

  it('reports gross booked minutes per project and order (closed, non-rejected)', async () => {
    const { worker } = await fixture();
    const project = await seedProject(ctx.prisma, {
      code: 'P-IST',
      assigneeIds: [worker.id],
      serviceOrders: [{ orderNo: 'SA-1', title: 'Order' }],
    });
    const order = project.serviceOrders[0];
    const now = new Date();
    const mk = (hoursAgo: number, lengthHours: number, extra: Record<string, unknown> = {}) =>
      ctx.prisma.timeEntry.create({
        data: {
          employeeId: worker.id,
          clockIn: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000),
          clockOut: new Date(now.getTime() - (hoursAgo - lengthHours) * 60 * 60 * 1000),
          status: 'Pending',
          projectId: project.id,
          ...extra,
        },
      });
    await mk(10, 2, { serviceOrderId: order.id }); // 120 min on the order
    await mk(7, 2); // 120 min project-level
    await mk(4, 1, { status: 'Rejected' }); // ignored
    await ctx.prisma.timeEntry.create({
      data: { employeeId: worker.id, clockIn: now, clockOut: null, projectId: project.id },
    }); // open → ignored

    const res = await ctx.http.get(`/api/projects/${project.id}`).expect(200);
    expect(res.body.bookedMinutes).toBe(240);
    expect(res.body.serviceOrders[0].bookedMinutes).toBe(120);
  });

  it('project report lists activities for Manager/HRAdmin only', async () => {
    const { manager, worker } = await fixture();
    const managerToken = await login(ctx.http, manager.email);
    const workerToken = await login(ctx.http, worker.email);
    const project = await seedProject(ctx.prisma, {
      code: 'P-REPORT',
      assigneeIds: [worker.id],
      serviceOrders: [{ orderNo: 'SA-1', title: 'Beratung' }],
    });
    const order = project.serviceOrders[0];
    const clockIn = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await ctx.prisma.timeEntry.create({
      data: {
        employeeId: worker.id,
        clockIn,
        clockOut: new Date(clockIn.getTime() + 90 * 60 * 1000),
        status: 'Approved',
        projectId: project.id,
        serviceOrderId: order.id,
        activity: 'Kundentermin vorbereitet',
      },
    });

    await ctx.http.get(`/api/projects/${project.id}/report`).expect(401);
    await ctx.http
      .get(`/api/projects/${project.id}/report`)
      .set('Authorization', `Bearer ${workerToken}`)
      .expect(403);
    const res = await ctx.http
      .get(`/api/projects/${project.id}/report`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(res.body.projectCode).toBe('P-REPORT');
    expect(res.body.rows.length).toBe(1);
    expect(res.body.rows[0].employeeName).toBe('Willi Worker');
    expect(res.body.rows[0].orderNo).toBe('SA-1');
    expect(res.body.rows[0].grossMinutes).toBe(90);
    expect(res.body.rows[0].activity).toBe('Kundentermin vorbereitet');
    expect(res.body.totalGrossMinutes).toBe(90);

    // A window in the past excludes the entry.
    const filtered = await ctx.http
      .get(
        `/api/projects/${project.id}/report?from=2000-01-01T00:00:00.000Z&to=2000-12-31T00:00:00.000Z`,
      )
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(filtered.body.rows.length).toBe(0);
  });
});
