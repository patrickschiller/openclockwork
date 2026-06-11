import {
  createTestApp,
  login,
  seedEmployee,
  seedProject,
  type TestContext,
} from '../support/test-app';

// All wall-clock expectations assume TZ=Europe/Berlin (CI sets it; matches
// production). UTC fixtures are chosen so they stay inside/outside the
// 07:00–23:00 default frame in both CET and CEST.
describe('TimeEntries × Projects — clock-in, retroactive assignment, split', () => {
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
    const assigned = await seedProject(ctx.prisma, {
      code: 'P-ASSIGNED',
      assigneeIds: [worker.id],
    });
    const second = await seedProject(ctx.prisma, {
      code: 'P-SECOND',
      assigneeIds: [worker.id],
    });
    const inactive = await seedProject(ctx.prisma, {
      code: 'P-INACTIVE',
      isActive: false,
      assigneeIds: [worker.id],
    });
    const foreign = await seedProject(ctx.prisma, { code: 'P-FOREIGN' });
    // Project with one active and one inactive service order — booking onto
    // it requires picking the active order (conditional-mandatory rule).
    const ordered = await seedProject(ctx.prisma, {
      code: 'P-ORDERED',
      assigneeIds: [worker.id],
      serviceOrders: [
        { orderNo: 'SA-1', title: 'Design' },
        { orderNo: 'SA-2', title: 'Altauftrag', isActive: false },
      ],
    });
    return { worker, other, manager, assigned, second, inactive, foreign, ordered };
  }

  /** Closed mid-day entry (always inside the 07:00–23:00 frame): 09:00Z–15:00Z today. */
  async function seedClosedEntry(
    employeeId: string,
    opts: {
      status?: 'Pending' | 'Approved' | 'Rejected';
      projectId?: string;
      serviceOrderId?: string;
      activity?: string;
    } = {},
  ) {
    const now = new Date();
    const clockIn = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 0, 0),
    );
    const clockOut = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 15, 0, 0),
    );
    return ctx.prisma.timeEntry.create({
      data: {
        employeeId,
        clockIn,
        clockOut,
        status: opts.status ?? 'Pending',
        projectId: opts.projectId ?? null,
        serviceOrderId: opts.serviceOrderId ?? null,
        activity: opts.activity ?? null,
      },
    });
  }

  describe('clock-in with project', () => {
    it('books the entry onto an assigned active project', async () => {
      const { worker, assigned } = await fixture();
      const res = await ctx.http
        .post('/api/timeentries/clock-in')
        .send({ employeeId: worker.id, projectId: assigned.id })
        .expect(201);
      expect(res.body.projectId).toBe(assigned.id);
      expect(res.body.projectCode).toBe('P-ASSIGNED');
    });

    it('clock-in without a project still works (projectId null)', async () => {
      const { worker } = await fixture();
      const res = await ctx.http
        .post('/api/timeentries/clock-in')
        .send({ employeeId: worker.id })
        .expect(201);
      expect(res.body.projectId).toBeNull();
      expect(res.body.projectCode).toBeNull();
    });

    it('rejects unassigned (403), inactive (400), and unknown (404) projects', async () => {
      const { worker, foreign, inactive } = await fixture();
      await ctx.http
        .post('/api/timeentries/clock-in')
        .send({ employeeId: worker.id, projectId: foreign.id })
        .expect(403);
      await ctx.http
        .post('/api/timeentries/clock-in')
        .send({ employeeId: worker.id, projectId: inactive.id })
        .expect(400);
      await ctx.http
        .post('/api/timeentries/clock-in')
        .send({
          employeeId: worker.id,
          projectId: '00000000-0000-4000-8000-000000000000',
        })
        .expect(404);
    });
  });

  describe('PATCH /timeentries/:id — retroactive project assignment', () => {
    it('owner can set, change, and clear the project (also on open entries)', async () => {
      const { worker, assigned, second } = await fixture();
      const token = await login(ctx.http, worker.email);
      const entry = await seedClosedEntry(worker.id);

      const set = await ctx.http
        .patch(`/api/timeentries/${entry.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ projectId: assigned.id })
        .expect(200);
      expect(set.body.projectCode).toBe('P-ASSIGNED');

      const changed = await ctx.http
        .patch(`/api/timeentries/${entry.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ projectId: second.id })
        .expect(200);
      expect(changed.body.projectCode).toBe('P-SECOND');

      const cleared = await ctx.http
        .patch(`/api/timeentries/${entry.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ projectId: null })
        .expect(200);
      expect(cleared.body.projectId).toBeNull();

      // Open entries can be (re)assigned as well.
      const open = await ctx.http
        .post('/api/timeentries/clock-in')
        .send({ employeeId: worker.id })
        .expect(201);
      await ctx.http
        .patch(`/api/timeentries/${open.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ projectId: assigned.id })
        .expect(200);
    });

    it('requires auth, an explicit projectId, and rejects unassigned projects', async () => {
      const { worker, foreign } = await fixture();
      const token = await login(ctx.http, worker.email);
      const entry = await seedClosedEntry(worker.id);

      await ctx.http
        .patch(`/api/timeentries/${entry.id}`)
        .send({ projectId: null })
        .expect(401);
      await ctx.http
        .patch(`/api/timeentries/${entry.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
      await ctx.http
        .patch(`/api/timeentries/${entry.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ projectId: foreign.id })
        .expect(403);
    });

    it('approved entries are editable (lock removed); foreign entries need Manager/HRAdmin', async () => {
      const { worker, other, manager, assigned } = await fixture();
      const workerToken = await login(ctx.http, worker.email);
      const otherToken = await login(ctx.http, other.email);
      const managerToken = await login(ctx.http, manager.email);

      // Closed entries auto-approve, so retroactive booking must work on them.
      const approved = await seedClosedEntry(worker.id, { status: 'Approved' });
      const retargeted = await ctx.http
        .patch(`/api/timeentries/${approved.id}`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ projectId: assigned.id })
        .expect(200);
      expect(retargeted.body.projectCode).toBe('P-ASSIGNED');

      const entry = await seedClosedEntry(worker.id);
      await ctx.http
        .patch(`/api/timeentries/${entry.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ projectId: null })
        .expect(403);
      await ctx.http
        .patch(`/api/timeentries/${entry.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ projectId: assigned.id })
        .expect(200);
    });
  });

  describe('POST /timeentries/:id/split', () => {
    it('splits a closed entry into two seamless segments; omitted projectId inherits', async () => {
      const { worker, assigned } = await fixture();
      const token = await login(ctx.http, worker.email);
      const entry = await seedClosedEntry(worker.id, { projectId: assigned.id });
      const at = new Date(entry.clockIn.getTime() + 2 * 60 * 60 * 1000).toISOString();

      const res = await ctx.http
        .post(`/api/timeentries/${entry.id}/split`)
        .set('Authorization', `Bearer ${token}`)
        .send({ at })
        .expect(201);

      const { first, second } = res.body;
      expect(first.id).toBe(entry.id);
      expect(first.clockIn).toBe(entry.clockIn.toISOString());
      expect(first.clockOut).toBe(at);
      expect(second.clockIn).toBe(at);
      expect(second.clockOut).toBe(entry.clockOut?.toISOString());
      // Both mid-day segments fall inside the frame → auto-approved.
      expect(first.status).toBe('Approved');
      expect(second.status).toBe('Approved');
      // Omitted projectId → second segment inherits the original project.
      expect(first.projectCode).toBe('P-ASSIGNED');
      expect(second.projectCode).toBe('P-ASSIGNED');
    });

    it('explicit projectId books the second segment elsewhere; null clears it', async () => {
      const { worker, assigned, second: secondProject } = await fixture();
      const token = await login(ctx.http, worker.email);

      const a = await seedClosedEntry(worker.id, { projectId: assigned.id });
      const atA = new Date(a.clockIn.getTime() + 60 * 60 * 1000).toISOString();
      const resA = await ctx.http
        .post(`/api/timeentries/${a.id}/split`)
        .set('Authorization', `Bearer ${token}`)
        .send({ at: atA, projectId: secondProject.id })
        .expect(201);
      expect(resA.body.first.projectCode).toBe('P-ASSIGNED');
      expect(resA.body.second.projectCode).toBe('P-SECOND');

      const b = await seedClosedEntry(worker.id, { projectId: assigned.id });
      const atB = new Date(b.clockIn.getTime() + 60 * 60 * 1000).toISOString();
      const resB = await ctx.http
        .post(`/api/timeentries/${b.id}/split`)
        .set('Authorization', `Bearer ${token}`)
        .send({ at: atB, projectId: null })
        .expect(201);
      expect(resB.body.second.projectId).toBeNull();
    });

    it('GPS stays on the first segment only', async () => {
      const { worker } = await fixture();
      const token = await login(ctx.http, worker.email);
      const now = new Date();
      const entry = await ctx.prisma.timeEntry.create({
        data: {
          employeeId: worker.id,
          clockIn: new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 0, 0),
          ),
          clockOut: new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 15, 0, 0),
          ),
          status: 'Pending',
          latitude: 50.94,
          longitude: 6.96,
          accuracyMeters: 12.5,
        },
      });
      const at = new Date(entry.clockIn.getTime() + 60 * 60 * 1000).toISOString();
      const res = await ctx.http
        .post(`/api/timeentries/${entry.id}/split`)
        .set('Authorization', `Bearer ${token}`)
        .send({ at })
        .expect(201);
      expect(res.body.first.latitude).toBeCloseTo(50.94);
      expect(res.body.second.latitude).toBeNull();
      expect(res.body.second.longitude).toBeNull();
      expect(res.body.second.accuracyMeters).toBeNull();
    });

    it('validates the split point strictly inside the interval and the entry state', async () => {
      const { worker } = await fixture();
      const token = await login(ctx.http, worker.email);
      const entry = await seedClosedEntry(worker.id);

      for (const at of [
        entry.clockIn.toISOString(), // boundary: equals clock-in
        entry.clockOut?.toISOString(), // boundary: equals clock-out
        new Date(entry.clockIn.getTime() - 60_000).toISOString(), // before
        new Date((entry.clockOut as Date).getTime() + 60_000).toISOString(), // after
      ]) {
        await ctx.http
          .post(`/api/timeentries/${entry.id}/split`)
          .set('Authorization', `Bearer ${token}`)
          .send({ at })
          .expect(400);
      }

      // Open entries cannot be split.
      const open = await ctx.http
        .post('/api/timeentries/clock-in')
        .send({ employeeId: worker.id })
        .expect(201);
      await ctx.http
        .post(`/api/timeentries/${open.body.id}/split`)
        .set('Authorization', `Bearer ${token}`)
        .send({ at: new Date().toISOString() })
        .expect(400);

      // Approved entries can be split as well (lock removed with Epic 5.1).
      const approved = await seedClosedEntry(worker.id, { status: 'Approved' });
      const at = new Date(approved.clockIn.getTime() + 60 * 60 * 1000).toISOString();
      await ctx.http
        .post(`/api/timeentries/${approved.id}/split`)
        .set('Authorization', `Bearer ${token}`)
        .send({ at })
        .expect(201);

      // Unassigned project for the second segment is rejected.
      const { foreign } = await (async () => ({
        foreign: await ctx.prisma.project.create({ data: { code: 'P-LATE', name: 'P-LATE' } }),
      }))();
      const entry2 = await seedClosedEntry(worker.id);
      await ctx.http
        .post(`/api/timeentries/${entry2.id}/split`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          at: new Date(entry2.clockIn.getTime() + 60 * 60 * 1000).toISOString(),
          projectId: foreign.id,
        })
        .expect(403);
    });

    it('recomputes approval per segment: off-hours start stays Pending, rest is Approved', async () => {
      const { worker } = await fixture();
      const token = await login(ctx.http, worker.email);
      const now = new Date();
      // 04:00Z = 06:00 CEST / 05:00 CET — before the 07:00 frame start either way.
      const clockIn = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 4, 0, 0),
      );
      // 14:00Z = 16:00 CEST / 15:00 CET — inside the frame.
      const clockOut = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 14, 0, 0),
      );
      const entry = await ctx.prisma.timeEntry.create({
        data: {
          employeeId: worker.id,
          clockIn,
          clockOut,
          status: 'Pending',
          requiresApproval: true,
        },
      });
      // Split at 08:00Z = 10:00 CEST / 09:00 CET — after the frame start.
      const at = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0, 0),
      ).toISOString();

      const res = await ctx.http
        .post(`/api/timeentries/${entry.id}/split`)
        .set('Authorization', `Bearer ${token}`)
        .send({ at })
        .expect(201);
      expect(res.body.first.requiresApproval).toBe(true);
      expect(res.body.first.status).toBe('Pending');
      expect(res.body.second.requiresApproval).toBe(false);
      expect(res.body.second.status).toBe('Approved');
    });

    it('a rejected entry stays rejected in both segments', async () => {
      const { worker } = await fixture();
      const token = await login(ctx.http, worker.email);
      const entry = await seedClosedEntry(worker.id, { status: 'Rejected' });
      const at = new Date(entry.clockIn.getTime() + 60 * 60 * 1000).toISOString();
      const res = await ctx.http
        .post(`/api/timeentries/${entry.id}/split`)
        .set('Authorization', `Bearer ${token}`)
        .send({ at })
        .expect(201);
      expect(res.body.first.status).toBe('Rejected');
      expect(res.body.second.status).toBe('Rejected');
    });

    it('foreign entries can only be split by Manager/HRAdmin', async () => {
      const { worker, other, manager } = await fixture();
      const otherToken = await login(ctx.http, other.email);
      const managerToken = await login(ctx.http, manager.email);
      const entry = await seedClosedEntry(worker.id);
      const at = new Date(entry.clockIn.getTime() + 60 * 60 * 1000).toISOString();

      await ctx.http
        .post(`/api/timeentries/${entry.id}/split`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ at })
        .expect(403);
      await ctx.http
        .post(`/api/timeentries/${entry.id}/split`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ at })
        .expect(201);
    });
  });

  describe('service orders & activity (Epic 5.1)', () => {
    it('clock-in enforces the conditional-mandatory service order', async () => {
      const { worker, ordered, assigned } = await fixture();
      const activeOrder = ordered.serviceOrders.find((o) => o.isActive);
      const inactiveOrder = ordered.serviceOrders.find((o) => !o.isActive);

      // Project has an active order → picking one is mandatory.
      await ctx.http
        .post('/api/timeentries/clock-in')
        .send({ employeeId: worker.id, projectId: ordered.id })
        .expect(400);
      // Inactive orders are not bookable.
      await ctx.http
        .post('/api/timeentries/clock-in')
        .send({ employeeId: worker.id, projectId: ordered.id, serviceOrderId: inactiveOrder?.id })
        .expect(400);
      // Orders of another project are rejected.
      await ctx.http
        .post('/api/timeentries/clock-in')
        .send({ employeeId: worker.id, projectId: assigned.id, serviceOrderId: activeOrder?.id })
        .expect(404);
      // serviceOrderId without a project makes no sense.
      await ctx.http
        .post('/api/timeentries/clock-in')
        .send({ employeeId: worker.id, serviceOrderId: activeOrder?.id })
        .expect(400);

      const ok = await ctx.http
        .post('/api/timeentries/clock-in')
        .send({
          employeeId: worker.id,
          projectId: ordered.id,
          serviceOrderId: activeOrder?.id,
          activity: 'Designsystem überarbeitet',
        })
        .expect(201);
      expect(ok.body.serviceOrderNo).toBe('SA-1');
      expect(ok.body.serviceOrderTitle).toBe('Design');
      expect(ok.body.activity).toBe('Designsystem überarbeitet');
    });

    it('PATCH edits the activity alone without re-validating legacy bookings', async () => {
      const { worker, ordered } = await fixture();
      const token = await login(ctx.http, worker.email);
      // Legacy entry: booked on an ordered project WITHOUT an order (predates
      // the rule). Editing only the activity must not trigger validation.
      const legacy = await seedClosedEntry(worker.id, { projectId: ordered.id });

      const res = await ctx.http
        .patch(`/api/timeentries/${legacy.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ activity: 'Nachträglich dokumentiert' })
        .expect(200);
      expect(res.body.activity).toBe('Nachträglich dokumentiert');
      expect(res.body.projectCode).toBe('P-ORDERED');
      expect(res.body.serviceOrderId).toBeNull();
    });

    it('PATCH re-specifying the project applies the service-order rule', async () => {
      const { worker, ordered, assigned } = await fixture();
      const token = await login(ctx.http, worker.email);
      const activeOrder = ordered.serviceOrders.find((o) => o.isActive);
      const entry = await seedClosedEntry(worker.id, { projectId: assigned.id });

      // Switching to the ordered project without an order → 400.
      await ctx.http
        .patch(`/api/timeentries/${entry.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ projectId: ordered.id })
        .expect(400);
      // With the order → ok.
      const ok = await ctx.http
        .patch(`/api/timeentries/${entry.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ projectId: ordered.id, serviceOrderId: activeOrder?.id })
        .expect(200);
      expect(ok.body.serviceOrderNo).toBe('SA-1');
      // Clearing the project clears the order too; an order alongside
      // projectId: null is contradictory.
      await ctx.http
        .patch(`/api/timeentries/${entry.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ projectId: null, serviceOrderId: activeOrder?.id })
        .expect(400);
      const cleared = await ctx.http
        .patch(`/api/timeentries/${entry.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ projectId: null })
        .expect(200);
      expect(cleared.body.projectId).toBeNull();
      expect(cleared.body.serviceOrderId).toBeNull();
    });

    it('split inherits project, order, and activity when projectId is omitted', async () => {
      const { worker, ordered } = await fixture();
      const token = await login(ctx.http, worker.email);
      const activeOrder = ordered.serviceOrders.find((o) => o.isActive);
      const entry = await seedClosedEntry(worker.id, {
        projectId: ordered.id,
        serviceOrderId: activeOrder?.id,
        activity: 'Konzeptphase',
      });
      const at = new Date(entry.clockIn.getTime() + 60 * 60 * 1000).toISOString();

      const res = await ctx.http
        .post(`/api/timeentries/${entry.id}/split`)
        .set('Authorization', `Bearer ${token}`)
        .send({ at })
        .expect(201);
      expect(res.body.second.serviceOrderNo).toBe('SA-1');
      expect(res.body.second.activity).toBe('Konzeptphase');
    });

    it('split with an explicit ordered project requires the order and takes a fresh activity', async () => {
      const { worker, ordered } = await fixture();
      const token = await login(ctx.http, worker.email);
      const activeOrder = ordered.serviceOrders.find((o) => o.isActive);
      const entry = await seedClosedEntry(worker.id, { activity: 'Alt' });
      const at = new Date(entry.clockIn.getTime() + 60 * 60 * 1000).toISOString();

      await ctx.http
        .post(`/api/timeentries/${entry.id}/split`)
        .set('Authorization', `Bearer ${token}`)
        .send({ at, projectId: ordered.id })
        .expect(400);
      const res = await ctx.http
        .post(`/api/timeentries/${entry.id}/split`)
        .set('Authorization', `Bearer ${token}`)
        .send({ at, projectId: ordered.id, serviceOrderId: activeOrder?.id, activity: 'Neu' })
        .expect(201);
      expect(res.body.first.activity).toBe('Alt');
      expect(res.body.second.activity).toBe('Neu');
      expect(res.body.second.serviceOrderNo).toBe('SA-1');
    });
  });
});
