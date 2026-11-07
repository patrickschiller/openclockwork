import { TimeEntriesService } from '../../../api/src/app/time-entries/time-entries.service';
import {
  createTestApp,
  login,
  seedEmployee,
  type TestContext,
} from '../support/test-app';

describe('Outside-frame TimeEntry approvals (#41)', () => {
  let ctx: TestContext;
  type Person = { id: string; token: string };
  let manager: Person,
    otherManager: Person,
    owner: Person,
    other: Person,
    hr: Person,
    secondHr: Person;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    async function person(
      name: string,
      role: 'Employee' | 'Manager' | 'HRAdmin',
      managerId?: string,
    ) {
      const e = await seedEmployee(ctx.prisma, {
        personalNo: name,
        firstName: name,
        lastName: 'Example',
        email: `${name}@test.local`,
        role,
        managerId,
      });
      return { id: e.id, token: await login(ctx.http, e.email) };
    }
    manager = await person('manager', 'Manager');
    otherManager = await person('other-manager', 'Manager');
    owner = await person('owner', 'Employee', manager.id);
    other = await person('other', 'Employee', otherManager.id);
    hr = await person('hr', 'HRAdmin', manager.id);
    secondHr = await person('second-hr', 'HRAdmin');
  });

  async function entry(employeeId = owner.id, extra = {}) {
    return ctx.prisma.timeEntry.create({
      data: {
        employeeId,
        clockIn: new Date('2026-05-04T04:00:00Z'),
        clockOut: new Date('2026-05-04T06:00:00Z'),
        status: 'Pending',
        requiresApproval: true,
        source: 'Pwa',
        ...extra,
      },
    });
  }
  function list(who: Person, scope = 'review') {
    return ctx.http
      .get(`/api/timeentries/approvals?scope=${scope}`)
      .set('Authorization', `Bearer ${who.token}`);
  }
  function decide(
    id: string,
    who: Person,
    revision = 0,
    stage = 'Manager',
    outcome = 'Approve',
    extra = {},
  ) {
    return ctx.http
      .post(`/api/timeentries/${id}/approval`)
      .set('Authorization', `Bearer ${who.token}`)
      .send({ revision, stage, outcome, ...extra });
  }
  function history(id: string, who: Person) {
    return ctx.http
      .get(`/api/timeentries/${id}/approval-history`)
      .set('Authorization', `Bearer ${who.token}`);
  }
  async function managerApproved(id: string) {
    return (await decide(id, manager).expect(201)).body;
  }

  it('reviews legacy Pending/null mode entries through manager then HR with versioned audit and same ID', async () => {
    const row = await entry();
    expect(row.approvalMode).toBeNull();
    expect((await list(manager).expect(200)).body[0]).toMatchObject({
      revision: 0,
      state: 'PendingManager',
      canDecide: true,
      managerId: manager.id,
      employeeName: 'owner Example',
    });
    const managed = await managerApproved(row.id);
    expect(managed).toMatchObject({
      revision: 1,
      state: 'PendingHr',
      canDecide: false,
      entry: { id: row.id, status: 'Pending' },
    });
    expect((await list(hr).expect(200)).body[0]).toMatchObject({
      state: 'PendingHr',
      canDecide: true,
    });
    const final = await decide(row.id, hr, 1, 'HR', 'Approve', {
      note: 'HR checked',
    }).expect(201);
    expect(final.body).toMatchObject({
      revision: 2,
      state: 'Approved',
      entry: { id: row.id, status: 'Approved', requiresApproval: true },
    });
    expect(await ctx.prisma.timeEntry.count()).toBe(1);
    const events = (await history(row.id, owner).expect(200)).body;
    expect(events).toMatchObject([
      {
        actorId: manager.id,
        actorName: 'manager Example',
        action: 'FrameManagerApproved',
      },
      { actorId: hr.id, action: 'FrameHrConfirmed', reason: 'HR checked' },
    ]);
    expect(
      events.every(
        (e: { occurredAt: string }) => !Number.isNaN(Date.parse(e.occurredAt)),
      ),
    ).toBe(true);
  });

  it.each(['Manager', 'HR'])(
    'supports %s rejection with mandatory reason and no approval afterward',
    async (stage) => {
      const row = await entry();
      const actor = stage === 'Manager' ? manager : hr;
      const revision =
        stage === 'Manager' ? 0 : (await managerApproved(row.id)).revision;
      await decide(row.id, actor, revision, stage, 'Reject', {
        note: '  ',
      }).expect(400);
      const rejected = await decide(row.id, actor, revision, stage, 'Reject', {
        note: 'Not authorized work',
      }).expect(201);
      expect(rejected.body).toMatchObject({
        state: 'Rejected',
        canDecide: false,
        entry: { status: 'Rejected' },
      });
      await decide(row.id, actor, revision + 1, stage).expect(409);
      const events = (await history(row.id, owner).expect(200)).body;
      expect(events.at(-1)).toMatchObject({
        action:
          stage === 'Manager' ? 'FrameManagerRejected' : 'FrameHrRejected',
        reason: 'Not authorized work',
      });
    },
  );

  it('scopes review to direct team and own list to bearer identity; employeeId/actorId cannot forge ownership', async () => {
    const own = await entry();
    const foreign = await entry(other.id);
    expect(
      (await list(manager).expect(200)).body.map(
        (r: { entry: { id: string } }) => r.entry.id,
      ),
    ).toEqual([own.id]);
    const response = await ctx.http
      .get(`/api/timeentries/approvals?scope=own&employeeId=${other.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(
      response.body.map((r: { entry: { id: string } }) => r.entry.id),
    ).toEqual([own.id]);
    await list(owner).expect(403);
    await decide(own.id, otherManager, 0, 'Manager', 'Approve', {
      actorId: manager.id,
      employeeId: owner.id,
    }).expect(403);
    await decide(foreign.id, manager).expect(403);
    await history(foreign.id, manager).expect(403);
    await history(own.id, other).expect(403);
    await decide(own.id, owner).expect(403);
    await list(owner, 'invalid').expect(400);
    await ctx.http.get('/api/timeentries/approvals').expect(401);
    await ctx.http
      .post(`/api/timeentries/${own.id}/approval`)
      .send({ revision: 0, stage: 'Manager', outcome: 'Approve' })
      .expect(401);
  });

  it('does not let HR skip manager stage, managers act as HR, or owners self-authorize through a broad role', async () => {
    const row = await entry();
    await decide(row.id, hr, 0, 'HR').expect(409);
    await decide(row.id, hr, 0, 'Manager').expect(403);
    await decide(row.id, manager, 0, 'HR').expect(403);
    await managerApproved(row.id);
    await decide(row.id, manager, 1, 'HR').expect(403);
    const ownManager = await entry(manager.id);
    await ctx.prisma.employee.update({
      where: { id: manager.id },
      data: { managerId: manager.id },
    });
    await decide(ownManager.id, manager).expect(403);
    const ownHr = await entry(hr.id);
    await decide(ownHr.id, manager).expect(201);
    await decide(ownHr.id, hr, 1, 'HR').expect(403);
    await decide(ownHr.id, secondHr, 1, 'HR').expect(201);
    expect(
      (await list(hr).expect(200)).body.some(
        (r: { entry: { id: string } }) => r.entry.id === ownHr.id,
      ),
    ).toBe(false);
  });

  it.each(['missing', 'inactive', 'wrong-role', 'self'])(
    'blocks %s manager configuration until HR assigns a valid manager',
    async (kind) => {
      const row = await entry();
      if (kind === 'missing')
        await ctx.prisma.employee.update({
          where: { id: owner.id },
          data: { managerId: null },
        });
      if (kind === 'inactive')
        await ctx.prisma.employee.update({
          where: { id: manager.id },
          data: { isActive: false },
        });
      if (kind === 'wrong-role')
        await ctx.prisma.employee.update({
          where: { id: owner.id },
          data: { managerId: hr.id },
        });
      if (kind === 'self')
        await ctx.prisma.employee.update({
          where: { id: owner.id },
          data: { managerId: owner.id },
        });
      expect((await list(owner, 'own').expect(200)).body[0]).toMatchObject({
        state: 'BlockedManager',
        canDecide: false,
      });
      await decide(row.id, hr, 0, 'HR').expect(409);
      await ctx.prisma.employee.update({
        where: { id: owner.id },
        data: { managerId: otherManager.id },
      });
      const response = await decide(row.id, otherManager).expect(201);
      expect(response.body.state).toBe('PendingHr');
      await decide(row.id, hr, 1, 'HR').expect(201);
    },
  );

  it('manager reassignment invalidates the pending HR stage and denies the old manager and stale HR tab', async () => {
    const row = await entry();
    await managerApproved(row.id);
    await ctx.prisma.employee.update({
      where: { id: owner.id },
      data: { managerId: otherManager.id },
    });
    expect((await list(hr).expect(200)).body[0]).toMatchObject({
      state: 'PendingManager',
      canDecide: false,
    });
    await decide(row.id, hr, 1, 'HR').expect(409);
    await decide(row.id, manager, 1).expect(403);
    await decide(row.id, otherManager, 1).expect(201);
    await decide(row.id, hr, 2, 'HR').expect(201);
  });

  it('manager role change invalidates their sign-off and cannot promote the same person to HR confirmer', async () => {
    const row = await entry();
    await managerApproved(row.id);
    await ctx.prisma.employee.update({
      where: { id: manager.id },
      data: { role: 'HRAdmin' },
    });
    await decide(row.id, manager, 1, 'HR').expect(409);
    expect((await list(owner, 'own').expect(200)).body[0].state).toBe(
      'BlockedManager',
    );
  });

  it.each(['Open', 'Approved', 'Rejected', 'Voided', 'InFrame', 'Solo'])(
    'cannot approve %s entries',
    async (kind) => {
      const row = await entry(owner.id, {
        ...(kind === 'Open' ? { clockOut: null, status: 'Open' } : {}),
        ...(kind === 'Approved' || kind === 'Rejected' ? { status: kind } : {}),
        ...(kind === 'Voided' ? { voidedAt: new Date() } : {}),
        ...(kind === 'InFrame'
          ? { requiresApproval: false, status: 'Approved' }
          : {}),
        ...(kind === 'Solo' ? { approvalMode: 'Solo' } : {}),
      });
      await decide(row.id, manager).expect(409);
      if (kind === 'InFrame' || kind === 'Solo')
        expect((await list(manager).expect(200)).body).toEqual([]);
    },
  );

  it('requires exact revision/stage and only one parallel manager decision succeeds', async () => {
    const row = await entry();
    const replies = await Promise.all([
      decide(row.id, manager),
      decide(row.id, manager),
    ]);
    expect(replies.map((r) => r.status).sort()).toEqual([201, 409]);
    await decide(row.id, manager, 0).expect(409);
    expect(
      await ctx.prisma.timeEntryAudit.count({ where: { timeEntryId: row.id } }),
    ).toBe(1);
    const hrs = await Promise.all([
      decide(row.id, hr, 1, 'HR'),
      decide(row.id, secondHr, 1, 'HR'),
    ]);
    expect(hrs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await ctx.prisma.timeEntryAudit.count({ where: { timeEntryId: row.id } }),
    ).toBe(2);
  });

  it('validates missing/bad versions and enums without modifying the entry', async () => {
    const row = await entry();
    for (const body of [
      { stage: 'Manager', outcome: 'Approve' },
      { revision: -1, stage: 'Manager', outcome: 'Approve' },
      { revision: 0, stage: 'Employee', outcome: 'Approve' },
    ]) {
      await ctx.http
        .post(`/api/timeentries/${row.id}/approval`)
        .set('Authorization', `Bearer ${manager.token}`)
        .send(body)
        .expect(400);
    }
    expect(
      (await ctx.prisma.timeEntry.findUniqueOrThrow({ where: { id: row.id } }))
        .revision,
    ).toBe(0);
  });

  it('editing manager-approved or HR-confirmed booking restarts manager review and audits invalidation', async () => {
    const row = await entry();
    await managerApproved(row.id);
    const edit = () =>
      ctx.http
        .patch(`/api/timeentries/${row.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ activity: 'Corrected description' })
        .expect(200);
    await edit();
    await decide(row.id, hr, 1, 'HR').expect(409);
    expect((await list(owner, 'own').expect(200)).body[0]).toMatchObject({
      state: 'PendingManager',
      revision: 2,
    });
    await decide(row.id, manager, 2).expect(201);
    await decide(row.id, hr, 3, 'HR').expect(201);
    await edit();
    expect((await list(owner, 'own').expect(200)).body[0]).toMatchObject({
      state: 'PendingManager',
      revision: 5,
      entry: { status: 'Pending' },
    });
    expect(
      (await history(row.id, owner).expect(200)).body.filter(
        (r: { action: string }) => r.action === 'FrameApprovalInvalidated',
      ),
    ).toHaveLength(2);
  });

  it('serializes an edit against approval without allowing stale decisions to corrupt the result', async () => {
    const row = await entry();
    const replies = await Promise.all([
      decide(row.id, manager),
      ctx.http
        .patch(`/api/timeentries/${row.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ activity: 'New activity', revision: 0 }),
    ]);
    expect(replies.filter((r) => r.status === 409)).toHaveLength(1);
    expect(
      replies.filter((r) => r.status === 200 || r.status === 201),
    ).toHaveLength(1);
    const current = await ctx.prisma.timeEntry.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(current.revision).toBe(1);
    expect(await ctx.prisma.timeEntryAudit.count()).toBe(1);
  });

  it('split invalidates prior sign-off, recalculates frame per segment, and never launders a rejection', async () => {
    const row = await entry();
    await managerApproved(row.id);
    const split = await ctx.http
      .post(`/api/timeentries/${row.id}/split`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ at: '2026-05-04T05:00:00Z' })
      .expect(201);
    expect(split.body.first).toMatchObject({
      requiresApproval: true,
      status: 'Pending',
    });
    expect(split.body.second).toMatchObject({
      requiresApproval: false,
      status: 'Approved',
    });
    expect(
      (await list(manager).expect(200)).body.find(
        (item: { entry: { id: string } }) => item.entry.id === row.id,
      ).state,
    ).toBe('PendingManager');
    await decide(row.id, manager, 2, 'Manager', 'Reject', {
      note: 'No',
    }).expect(201);
    const again = await ctx.http
      .post(`/api/timeentries/${row.id}/split`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ at: '2026-05-04T04:30:00Z' })
      .expect(201);
    expect(again.body.first.status).toBe('Rejected');
    expect(again.body.second.status).toBe('Rejected');
  });

  it('closed PWA booking computes actual frame and enters manager review', async () => {
    // Controlled clock-out via the service; production controller calls same method.
    const service = ctx.app.get(TimeEntriesService);
    const schedule = await ctx.prisma.workSchedule.create({
      data: { name: 'Narrow', frameStart: '07:00', frameEnd: '08:00' },
    });
    await ctx.prisma.employee.update({
      where: { id: owner.id },
      data: { workScheduleId: schedule.id },
    });
    const start = new Date();
    start.setDate(start.getDate() - 1);
    start.setHours(6, 0, 0, 0);
    const open = await entry(owner.id, {
      clockIn: start,
      clockOut: null,
      status: 'Open',
      requiresApproval: true,
    });
    expect((await list(manager).expect(200)).body[0]).toMatchObject({
      state: 'Open',
      canDecide: false,
    });
    const closed = await service.clockOut(owner.id);
    expect(closed).toMatchObject({
      id: open.id,
      requiresApproval: true,
      status: 'Pending',
    });
    expect((await list(manager).expect(200)).body[0].state).toBe(
      'PendingManager',
    );
  });

  it('leaves ordinary in-frame and Solo creation unchanged and does not list them for review', async () => {
    await entry(owner.id, {
      clockIn: new Date('2026-05-04T06:00:00Z'),
      clockOut: new Date('2026-05-04T14:00:00Z'),
      status: 'Approved',
      requiresApproval: false,
    });
    await entry(owner.id, {
      approvalMode: 'Solo',
      status: 'Approved',
      requiresApproval: false,
    });
    expect((await list(manager).expect(200)).body).toEqual([]);
    expect((await list(owner, 'own').expect(200)).body).toEqual([]);
  });

  it('project-range segmentation invalidates a prior manager sign-off for every outside-frame segment', async () => {
    const row = await entry();
    await managerApproved(row.id);
    const project = await ctx.prisma.project.create({
      data: { code: 'FRAME', name: 'Synthetic project' },
    });
    await ctx.prisma.projectAssignment.create({
      data: { projectId: project.id, employeeId: owner.id },
    });
    await ctx.http
      .post('/api/timeentries/book-project')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        employeeId: owner.id,
        from: '2026-05-04T04:15:00Z',
        to: '2026-05-04T05:30:00Z',
        projectId: project.id,
      })
      .expect(201);
    const rows = (await list(manager).expect(200)).body;
    expect(rows).toHaveLength(3);
    const pending = rows.filter(
      (item: { entry: { requiresApproval: boolean } }) =>
        item.entry.requiresApproval,
    );
    expect(pending).toHaveLength(2);
    expect(
      pending.every(
        (item: { state: string }) => item.state === 'PendingManager',
      ),
    ).toBe(true);
    expect(
      rows.filter((item: { state: string }) => item.state === 'Approved'),
    ).toHaveLength(1);
    await decide(row.id, hr, 1, 'HR').expect(409);
    const invalidations = await ctx.prisma.timeEntryAudit.findMany({
      where: { action: { startsWith: 'Frame' } },
    });
    expect(
      invalidations.some(
        (event) => event.action === 'FrameApprovalInvalidated',
      ),
    ).toBe(true);
  });

  it('retains discoverable decision history when a split moves the original ID wholly inside the frame', async () => {
    const row = await entry(owner.id, {
      clockIn: new Date('2026-05-04T06:00:00Z'),
      clockOut: new Date('2026-05-04T22:00:00Z'),
    });
    await managerApproved(row.id);
    await ctx.http
      .post(`/api/timeentries/${row.id}/split`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ at: '2026-05-04T20:00:00Z' })
      .expect(201);
    const views = (await list(owner, 'own').expect(200)).body;
    expect(views).toHaveLength(2);
    expect(
      views.find((item: { entry: { id: string } }) => item.entry.id === row.id),
    ).toMatchObject({
      state: 'Approved',
      canDecide: false,
      entry: { requiresApproval: false },
    });
    const events = (await history(row.id, owner).expect(200)).body;
    expect(events.map((event: { action: string }) => event.action)).toEqual([
      'FrameManagerApproved',
      'FrameApprovalInvalidated',
    ]);
    await decide(row.id, manager, 2).expect(409);
  });

  it('Solo installation cannot expose or approve archived Team entries', async () => {
    const row = await entry();
    await ctx.prisma.installationSettings.create({
      data: {
        id: 1,
        mode: 'Solo',
        ownerEmployeeId: hr.id,
        setupCompleted: true,
      },
    });
    await list(hr).expect(403);
    await list(hr, 'own').expect(403);
    await decide(row.id, hr, 0, 'HR').expect(403);
    await history(row.id, hr).expect(403);
    expect(
      (await ctx.prisma.timeEntry.findUniqueOrThrow({ where: { id: row.id } }))
        .status,
    ).toBe('Pending');
  });
});
