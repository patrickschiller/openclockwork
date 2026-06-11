import {
  createTestApp,
  login,
  seedEmployee,
  seedProject,
  type TestContext,
} from '../support/test-app';

// Retroactive project booking (Nachtrag): carves existing closed entries so
// the requested range carries the project. UTC fixtures are chosen to stay on
// the same side of the 07:00/23:00 Europe/Berlin frame in CET and CEST.
describe('POST /timeentries/book-project — retroactive range booking', () => {
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
    const worker = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Willi',
      lastName: 'Worker',
      email: 'worker@test.local',
    });
    const other = await seedEmployee(ctx.prisma, {
      personalNo: '1002',
      firstName: 'Olga',
      lastName: 'Other',
      email: 'other@test.local',
    });
    const manager = await seedEmployee(ctx.prisma, {
      personalNo: '0010',
      firstName: 'Mara',
      lastName: 'Manager',
      email: 'manager@test.local',
      role: 'Manager',
    });
    const project = await seedProject(ctx.prisma, {
      code: 'P-RANGE',
      assigneeIds: [worker.id],
    });
    const ordered = await seedProject(ctx.prisma, {
      code: 'P-ORDERED',
      assigneeIds: [worker.id],
      serviceOrders: [{ orderNo: 'SA-1', title: 'Design' }],
    });
    const foreign = await seedProject(ctx.prisma, { code: 'P-FOREIGN' });
    return { worker, other, manager, project, ordered, foreign };
  }

  /** Today at the given UTC hour (fractions allowed, e.g. 12.5 = 12:30Z). */
  function todayUtc(hour: number): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, hour * 60, 0),
    );
  }

  async function seedEntry(
    employeeId: string,
    fromHour: number,
    toHour: number,
    extra: Record<string, unknown> = {},
  ) {
    return ctx.prisma.timeEntry.create({
      data: {
        employeeId,
        clockIn: todayUtc(fromHour),
        clockOut: todayUtc(toHour),
        status: 'Pending',
        ...extra,
      },
    });
  }

  it('case A: exact match retargets the entry in place', async () => {
    const { worker, project } = await fixture();
    const token = await login(ctx.http, worker.email);
    const entry = await seedEntry(worker.id, 9, 15);

    const res = await ctx.http
      .post('/api/timeentries/book-project')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId: worker.id,
        from: todayUtc(9).toISOString(),
        to: todayUtc(15).toISOString(),
        projectId: project.id,
        activity: 'Migration durchgeführt',
      })
      .expect(201);

    expect(res.body.entries.length).toBe(1);
    expect(res.body.entries[0].id).toBe(entry.id);
    expect(res.body.entries[0].projectCode).toBe('P-RANGE');
    expect(res.body.entries[0].activity).toBe('Migration durchgeführt');
    // Mid-day segment inside the frame → auto-approved.
    expect(res.body.entries[0].status).toBe('Approved');
  });

  it('case D: a mid-entry range carves three segments; GPS stays on the first', async () => {
    const { worker, project } = await fixture();
    const token = await login(ctx.http, worker.email);
    const entry = await seedEntry(worker.id, 9, 15, {
      latitude: 50.94,
      longitude: 6.96,
      note: 'Onsite',
      activity: 'Alt',
    });

    const res = await ctx.http
      .post('/api/timeentries/book-project')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId: worker.id,
        from: todayUtc(11).toISOString(),
        to: todayUtc(13).toISOString(),
        projectId: project.id,
      })
      .expect(201);

    const segments = res.body.entries;
    expect(segments.length).toBe(3);
    expect(segments[0].id).toBe(entry.id);
    expect(segments[0].clockOut).toBe(todayUtc(11).toISOString());
    expect(segments[0].projectId).toBeNull();
    expect(segments[0].activity).toBe('Alt');
    expect(segments[0].latitude).toBeCloseTo(50.94);
    expect(segments[1].clockIn).toBe(todayUtc(11).toISOString());
    expect(segments[1].clockOut).toBe(todayUtc(13).toISOString());
    expect(segments[1].projectCode).toBe('P-RANGE');
    expect(segments[1].latitude).toBeNull();
    expect(segments[2].clockIn).toBe(todayUtc(13).toISOString());
    expect(segments[2].clockOut).toBe(todayUtc(15).toISOString());
    expect(segments[2].projectId).toBeNull();
    expect(segments[2].activity).toBe('Alt');
  });

  it('cases B+C: a range across two contiguous entries carves both', async () => {
    const { worker, project } = await fixture();
    const token = await login(ctx.http, worker.email);
    await seedEntry(worker.id, 8, 12);
    await seedEntry(worker.id, 12, 16);

    const res = await ctx.http
      .post('/api/timeentries/book-project')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId: worker.id,
        from: todayUtc(10).toISOString(),
        to: todayUtc(14).toISOString(),
        projectId: project.id,
      })
      .expect(201);

    const segments = res.body.entries;
    expect(segments.length).toBe(4);
    const booked = segments.filter(
      (s: { projectCode: string | null }) => s.projectCode === 'P-RANGE',
    );
    expect(booked.map((s: { clockIn: string; clockOut: string }) => [s.clockIn, s.clockOut])).toEqual([
      [todayUtc(10).toISOString(), todayUtc(12).toISOString()],
      [todayUtc(12).toISOString(), todayUtc(14).toISOString()],
    ]);
  });

  it('rejects ranges with coverage gaps and reports the covered windows', async () => {
    const { worker, project } = await fixture();
    const token = await login(ctx.http, worker.email);
    await seedEntry(worker.id, 9, 12);

    const res = await ctx.http
      .post('/api/timeentries/book-project')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId: worker.id,
        from: todayUtc(10).toISOString(),
        to: todayUtc(14).toISOString(),
        projectId: project.id,
      })
      .expect(400);
    expect(res.body.message).toContain('Covered:');
    expect(res.body.message).toContain(todayUtc(12).toISOString());
  });

  it('rejected and open entries never count as coverage', async () => {
    const { worker, project } = await fixture();
    const token = await login(ctx.http, worker.email);
    await seedEntry(worker.id, 9, 15, { status: 'Rejected' });
    await ctx.prisma.timeEntry.create({
      data: { employeeId: worker.id, clockIn: todayUtc(15), clockOut: null, status: 'Open' },
    });

    for (const [from, to] of [
      [10, 11], // inside the rejected entry
      [15.5, 16], // inside the open entry
    ]) {
      await ctx.http
        .post('/api/timeentries/book-project')
        .set('Authorization', `Bearer ${token}`)
        .send({
          employeeId: worker.id,
          from: todayUtc(from).toISOString(),
          to: todayUtc(to).toISOString(),
          projectId: project.id,
        })
        .expect(400);
    }
  });

  it('validates target rules: assignment, conditional-mandatory order, from<to', async () => {
    const { worker, ordered, foreign } = await fixture();
    const token = await login(ctx.http, worker.email);
    await seedEntry(worker.id, 9, 15);

    const base = {
      employeeId: worker.id,
      from: todayUtc(10).toISOString(),
      to: todayUtc(12).toISOString(),
    };
    await ctx.http
      .post('/api/timeentries/book-project')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...base, projectId: foreign.id })
      .expect(403);
    await ctx.http
      .post('/api/timeentries/book-project')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...base, projectId: ordered.id })
      .expect(400);
    await ctx.http
      .post('/api/timeentries/book-project')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...base, from: base.to, to: base.from, projectId: ordered.id })
      .expect(400);

    const order = ordered.serviceOrders[0];
    const ok = await ctx.http
      .post('/api/timeentries/book-project')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...base, projectId: ordered.id, serviceOrderId: order.id })
      .expect(201);
    expect(ok.body.entries.some((e: { serviceOrderNo: string | null }) => e.serviceOrderNo === 'SA-1')).toBe(
      true,
    );
  });

  it('foreign ranges need Manager/HRAdmin', async () => {
    const { worker, other, manager, project } = await fixture();
    const otherToken = await login(ctx.http, other.email);
    const managerToken = await login(ctx.http, manager.email);
    await seedEntry(worker.id, 9, 15);

    const payload = {
      employeeId: worker.id,
      from: todayUtc(10).toISOString(),
      to: todayUtc(11).toISOString(),
      projectId: project.id,
    };
    await ctx.http.post('/api/timeentries/book-project').send(payload).expect(401);
    await ctx.http
      .post('/api/timeentries/book-project')
      .set('Authorization', `Bearer ${otherToken}`)
      .send(payload)
      .expect(403);
    await ctx.http
      .post('/api/timeentries/book-project')
      .set('Authorization', `Bearer ${managerToken}`)
      .send(payload)
      .expect(201);
  });

  it('recomputes approval per carved segment (off-hours edge stays Pending)', async () => {
    const { worker, project } = await fixture();
    const token = await login(ctx.http, worker.email);
    // 04:00Z = 06:00 CEST / 05:00 CET — before the 07:00 frame start either way.
    await seedEntry(worker.id, 4, 14, { requiresApproval: true });

    const res = await ctx.http
      .post('/api/timeentries/book-project')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId: worker.id,
        from: todayUtc(4).toISOString(),
        // 08:00Z = 10:00 CEST / 09:00 CET — after the frame start.
        to: todayUtc(8).toISOString(),
        projectId: project.id,
      })
      .expect(201);

    const [first, rest] = res.body.entries;
    expect(first.projectCode).toBe('P-RANGE');
    expect(first.requiresApproval).toBe(true);
    expect(first.status).toBe('Pending');
    expect(rest.projectId).toBeNull();
    expect(rest.requiresApproval).toBe(false);
    expect(rest.status).toBe('Approved');
  });
});
