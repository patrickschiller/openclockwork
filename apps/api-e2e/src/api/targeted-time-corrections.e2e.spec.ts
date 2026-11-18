import { randomUUID } from 'node:crypto';
import type { Prisma, TimeEntry } from '@prisma/client';
import { EmployeesService } from '../../../api/src/app/employees/employees.service';
import type { RequestDto } from '../../../api/src/app/requests/requests.dto';
import { TimeAdjustmentsService } from '../../../api/src/app/requests/time-adjustments.service';
import {
  createTestApp,
  login,
  seedEmployee,
  seedProject,
  type TestContext,
} from '../support/test-app';

const IN = '2026-05-04T06:00:00.000Z'; // 08:00 Europe/Berlin
const OUT = '2026-05-04T14:00:00.000Z'; // 16:00 Europe/Berlin
const EXTENDED = '2026-05-04T15:00:00.000Z';
const LATER = '2026-05-04T07:00:00.000Z';
const EARLY = '2026-05-04T04:00:00.000Z'; // outside the explicit 07–18 frame
const RULES = [
  { afterMinutes: 360, breakMinutes: 30 },
  { afterMinutes: 540, breakMinutes: 45 },
];
type Person = { id: string; token: string };
type Body = Record<string, unknown>;
type EntryExtra = Partial<Prisma.TimeEntryUncheckedCreateInput>;

describe('Targeted TimeAdjustment corrections (#43)', () => {
  let ctx: TestContext;
  let owner: Person, manager: Person, other: Person, hr: Person;
  let scheduleId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  beforeEach(async () => {
    await ctx.reset();
    const schedule = await ctx.prisma.workSchedule.create({
      data: {
        name: 'Correction frame',
        frameStart: '07:00',
        frameEnd: '18:00',
        breakRules: RULES,
      },
    });
    scheduleId = schedule.id;
    async function person(
      name: string,
      role: 'Employee' | 'Manager' | 'HRAdmin',
      managerId?: string,
    ): Promise<Person> {
      const row = await seedEmployee(ctx.prisma, {
        personalNo: name,
        firstName: name,
        lastName: 'Example',
        email: `${name}@test.local`,
        role,
        managerId,
        workScheduleId: scheduleId,
      });
      return { id: row.id, token: await login(ctx.http, row.email) };
    }
    manager = await person('correction-manager', 'Manager');
    owner = await person('correction-owner', 'Employee', manager.id);
    other = await person('correction-other', 'Employee', manager.id);
    hr = await person('correction-hr', 'HRAdmin');
    await ctx.prisma.installationSettings.create({
      data: { id: 1, mode: 'Team', setupCompleted: true },
    });
  });

  function entry(extra: EntryExtra = {}): Promise<TimeEntry> {
    return ctx.prisma.timeEntry.create({
      data: {
        employeeId: owner.id,
        clockIn: new Date(IN),
        clockOut: new Date(OUT),
        source: 'Pwa',
        status: 'Approved',
        approvalMode: 'Team',
        breakRules: RULES,
        ...extra,
      },
    });
  }
  function postRequest(extra: Body = {}, who = owner) {
    return ctx.http
      .post('/api/requests')
      .set('Authorization', `Bearer ${who.token}`)
      .send({
        employeeId: who.id,
        type: 'TimeAdjustment',
        from: IN,
        to: EXTENDED,
        reason: 'Correct recorded working time',
        ...extra,
      });
  }
  async function correction(row: TimeEntry, extra: Body = {}) {
    const response = await postRequest({
      targetTimeEntryId: row.id,
      expectedTargetRevision: row.revision,
      ...extra,
    }).expect(201);
    return response.body as RequestDto;
  }
  function decide(
    id: string,
    route = 'manager-approve',
    who = manager,
    extra: Body = {},
  ) {
    return ctx.http
      .post(`/api/requests/${id}/${route}`)
      .set('Authorization', `Bearer ${who.token}`)
      .send({ actorId: who.id, note: 'Checked correction', ...extra });
  }
  function frameDecision(id: string, revision = 0, stage = 'Manager') {
    const who = stage === 'HR' ? hr : manager;
    return ctx.http
      .post(`/api/timeentries/${id}/approval`)
      .set('Authorization', `Bearer ${who.token}`)
      .send({ revision, stage, outcome: 'Approve' });
  }
  function targets(who = owner) {
    return ctx.http
      .get('/api/requests/time-adjustment-targets')
      .set('Authorization', `Bearer ${who.token}`);
  }
  function linkedAudit(id: string, who = owner) {
    return ctx.http
      .get(`/api/requests/${id}/time-entry-audit`)
      .set('Authorization', `Bearer ${who.token}`);
  }
  function listEntries() {
    return ctx.http
      .get(`/api/timeentries?employeeId=${owner.id}`)
      .set('Authorization', `Bearer ${owner.token}`);
  }
  function account() {
    return ctx.http
      .get(`/api/accounts/${owner.id}`)
      .set('Authorization', `Bearer ${owner.token}`);
  }
  function currentEntry(id: string) {
    return ctx.prisma.timeEntry.findUniqueOrThrow({ where: { id } });
  }
  function currentRequest(id: string) {
    return ctx.prisma.request.findUniqueOrThrow({ where: { id } });
  }
  function events(id: string) {
    return ctx.prisma.requestEvent.findMany({
      where: { requestId: id },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
  }
  function audits(id: string) {
    return ctx.prisma.timeEntryAudit.findMany({
      where: { timeEntryId: id },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
  }
  async function returned(row: TimeEntry, extra: Body = {}) {
    const request = await correction(row, extra);
    const response = await decide(request.id, 'return', manager, {
      note: 'Please explain the change',
    }).expect(201);
    expect(response.body.workflowState).toBe('Draft');
    return response.body as RequestDto;
  }
  function draftValues(request: RequestDto, extra: Body = {}) {
    return {
      from: request.from,
      to: request.to,
      reason: 'Reason clarified without rebinding',
      expectedUpdatedAt: request.updatedAt,
      ...extra,
    };
  }
  function save(request: RequestDto, extra: Body = {}) {
    return ctx.http
      .patch(`/api/requests/${request.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send(draftValues(request, extra));
  }
  function resubmit(request: RequestDto, extra: Body = {}) {
    return ctx.http
      .post(`/api/requests/${request.id}/resubmit`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send(draftValues(request, extra));
  }
  async function unchangedDecisionState(id: string, timeEntryId: string) {
    return {
      request: await currentRequest(id),
      entry: await currentEntry(timeEntryId),
      events: await events(id),
      audits: await audits(timeEntryId),
    };
  }

  it.each([
    {
      label: '08–16 → 08–17',
      from: IN,
      to: EXTENDED,
      gross: 540,
      breaks: 45,
      net: 495,
      route: 'approve',
    },
    {
      label: '08–16 → 09–16',
      from: LATER,
      to: OUT,
      gross: 420,
      breaks: 30,
      net: 390,
      route: 'manager-approve',
    },
  ])(
    '$label updates the same ID once, preserves metadata/policy/history and recalculates views',
    async ({ from, to, gross, breaks, net, route }) => {
      const project = await seedProject(ctx.prisma, {
        code: 'CORRECT',
        assigneeIds: [owner.id],
        serviceOrders: [{ orderNo: 'C-1', title: 'Existing order' }],
      });
      const group = randomUUID();
      const row = await entry({
        projectId: project.id,
        serviceOrderId: project.serviceOrders[0].id,
        status: route === 'manager-approve' ? 'Pending' : 'Approved',
        approvalMode: route === 'manager-approve' ? null : 'Team',
        activity: 'Original activity',
        note: 'Original private note',
        billable: true,
        captureGroupId: group,
      });
      const originalAudit = await ctx.prisma.timeEntryAudit.create({
        data: {
          timeEntryId: row.id,
          actorId: owner.id,
          action: 'BookingCreated',
          after: { clockIn: IN, clockOut: OUT },
        },
      });
      const beforeAccount = (await account().expect(200)).body;
      const request = await correction(row, { from, to });
      expect(request).toMatchObject({
        targetTimeEntryId: row.id,
        expectedTargetRevision: 0,
        requiresApproval: false,
        workflowState: 'PendingManager',
        targetTimeEntryBefore: {
          id: row.id,
          revision: 0,
          clockIn: IN,
          clockOut: OUT,
          summary: { grossMinutes: 480, breakMinutes: 30, netMinutes: 450 },
        },
      });
      expect(await currentEntry(row.id)).toEqual(row);
      expect((await linkedAudit(request.id).expect(200)).body).toEqual([]);
      // Current schedule changes must not replace the booked break-policy snapshot.
      await ctx.prisma.workSchedule.update({
        where: { id: scheduleId },
        data: { breakRules: [] },
      });
      const started = Date.now();
      const final = await decide(request.id, route).expect(201);
      expect(final.body).toMatchObject({
        id: request.id,
        status: 'Approved',
        workflowState: 'Approved',
        hrConfirmedAt: null,
        approverId: manager.id,
      });
      expect(final.body.targetTimeEntryBefore).toEqual(
        request.targetTimeEntryBefore,
      );
      expect(await ctx.prisma.timeEntry.count()).toBe(1);
      expect(await currentEntry(row.id)).toMatchObject({
        id: row.id,
        revision: 1,
        clockIn: new Date(from),
        clockOut: new Date(to),
        projectId: row.projectId,
        serviceOrderId: row.serviceOrderId,
        activity: row.activity,
        note: row.note,
        billable: true,
        captureGroupId: group,
        breakRules: RULES,
        source: 'Pwa',
        approvalMode: row.approvalMode,
        status: 'Approved',
      });
      const listed = (await listEntries().expect(200)).body;
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        id: row.id,
        summary: { grossMinutes: gross, breakMinutes: breaks, netMinutes: net },
      });
      const report = await ctx.http
        .get(
          `/api/reports/working-times?from=2026-05-04&to=2026-05-04&employeeId=${owner.id}`,
        )
        .set('Authorization', `Bearer ${hr.token}`)
        .expect(200);
      expect(report.body.rows).toHaveLength(1);
      expect(report.body.rows[0].id).toBe(row.id);
      expect(report.body.totals).toEqual({
        grossMinutes: gross,
        breakMinutes: breaks,
        netMinutes: net,
      });
      const afterAccount = (await account().expect(200)).body;
      expect(afterAccount.overtimeMinutes - beforeAccount.overtimeMinutes).toBe(
        net - 450,
      );
      const history = await audits(row.id);
      expect(history).toHaveLength(2);
      expect(history.find((event) => event.id === originalAudit.id)).toEqual(
        originalAudit,
      );
      const linked = (await linkedAudit(request.id).expect(200)).body;
      expect(linked).toHaveLength(1);
      expect(linked[0]).toMatchObject({
        requestId: request.id,
        timeEntryId: row.id,
        actorId: manager.id,
        action: 'FrameRequestCorrected',
        reason: request.reason,
        before: request.targetTimeEntryBefore,
        after: {
          id: row.id,
          revision: 1,
          clockIn: from,
          clockOut: to,
          summary: {
            grossMinutes: gross,
            breakMinutes: breaks,
            netMinutes: net,
          },
        },
      });
      expect(Date.parse(linked[0].occurredAt)).toBeGreaterThanOrEqual(started);
      expect(Date.parse(linked[0].occurredAt)).toBeLessThanOrEqual(Date.now());
      expect((await events(request.id)).map((event) => event.kind)).toEqual([
        'Submitted',
        'ManagerApproved',
      ]);
    },
  );

  it('captures the server original, ignores forged before/owner, and authorizes linked audit by JWT', async () => {
    const row = await entry();
    const request = await correction(row, {
      employeeId: other.id,
      targetTimeEntryBefore: { id: other.id, revision: 999, clockIn: EARLY },
    });
    expect(request).toMatchObject({
      employeeId: owner.id,
      targetTimeEntryBefore: {
        id: row.id,
        revision: 0,
        clockIn: IN,
        clockOut: OUT,
      },
    });
    expect((await currentRequest(request.id)).targetTimeEntryBefore).toEqual(
      request.targetTimeEntryBefore,
    );
    await decide(request.id, 'manager-approve', manager, {
      actorId: hr.id,
    }).expect(201);
    const linked = (await linkedAudit(request.id, manager).expect(200)).body;
    expect(linked[0].actorId).toBe(manager.id);
    expect((await linkedAudit(request.id, hr).expect(200)).body).toEqual(
      linked,
    );
    await linkedAudit(request.id, other).expect(403);
    await ctx.http
      .get(`/api/requests/${request.id}/time-entry-audit`)
      .expect(401);
  });

  it('retains the omitted-pair missing-booking flow and links its newly added entry audit', async () => {
    const response = await postRequest({ to: OUT }).expect(201);
    const request = response.body as RequestDto;
    expect(request).toMatchObject({
      targetTimeEntryId: null,
      expectedTargetRevision: null,
      targetTimeEntryBefore: null,
    });
    expect(await ctx.prisma.timeEntry.count()).toBe(0);
    await decide(request.id, 'approve').expect(201);
    expect(await ctx.prisma.timeEntry.count()).toBe(1);
    const rows = await ctx.prisma.timeEntry.findMany();
    expect(rows[0]).toMatchObject({
      employeeId: owner.id,
      clockIn: new Date(IN),
      clockOut: new Date(OUT),
      source: 'Manual',
      status: 'Approved',
      approvalMode: 'Team',
      breakRules: RULES,
    });
    expect((await linkedAudit(request.id).expect(200)).body).toEqual([
      expect.objectContaining({
        requestId: request.id,
        timeEntryId: rows[0].id,
        actorId: manager.id,
        action: 'RequestMissingBookingAdded',
        before: null,
        after: expect.objectContaining({ clockIn: IN, clockOut: OUT }),
      }),
    ]);
  });

  it('lists only own closed nonvoided Pending/Approved Team or legacy-null targets', async () => {
    const eligible = [
      await entry(),
      await entry({
        status: 'Pending',
        requiresApproval: true,
        clockIn: new Date('2026-05-05T06:00:00Z'),
        clockOut: new Date('2026-05-05T14:00:00Z'),
      }),
      await entry({
        approvalMode: null,
        clockIn: new Date('2026-05-06T06:00:00Z'),
        clockOut: new Date('2026-05-06T14:00:00Z'),
      }),
    ];
    await entry({ employeeId: other.id });
    await entry({ clockOut: null, status: 'Open' });
    await entry({ voidedAt: new Date() });
    await entry({ status: 'Rejected' });
    await entry({
      approvalMode: 'Solo',
      clockIn: new Date('2026-05-07T06:00:00Z'),
      clockOut: new Date('2026-05-07T14:00:00Z'),
    });
    const expected = eligible.map((row) => row.id).sort();
    for (const legacyInstallation of [false, true]) {
      if (legacyInstallation)
        await ctx.prisma.installationSettings.deleteMany();
      const response = await targets().expect(200);
      expect(response.body.map((row: { id: string }) => row.id).sort()).toEqual(
        expected,
      );
      expect(response.body[0].summary).toEqual({
        grossMinutes: 480,
        breakMinutes: 30,
        netMinutes: 450,
      });
    }
  });

  it('uses a static GET, takes listing identity only from JWT, and validates the date filter', async () => {
    const own = await entry();
    await entry({ employeeId: other.id });
    const next = await entry({
      clockIn: new Date('2026-05-05T06:00:00Z'),
      clockOut: new Date('2026-05-05T14:00:00Z'),
    });
    await ctx.http.get('/api/requests/time-adjustment-targets').expect(401);
    const listed = await targets()
      .query({ employeeId: other.id, from: IN, to: OUT })
      .send({ employeeId: other.id })
      .expect(200);
    expect(listed.body.map((row: { id: string }) => row.id)).toEqual([own.id]);
    expect(
      (await targets().query({ from: OUT }).expect(200)).body.map(
        (row: { id: string }) => row.id,
      ),
    ).toEqual([next.id]);
    await targets().query({ from: 'not-a-date' }).expect(400);
    await targets().query({ from: OUT, to: IN }).expect(400);
    await ctx.http
      .post('/api/requests/time-adjustment-targets')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({})
      .expect(404);
  });

  it('keeps Solo direct owner correction separate and never exposes Team requests/targets in Solo', async () => {
    const row = await entry({ approvalMode: 'Solo' });
    const archived = await entry({
      clockIn: new Date('2026-05-05T06:00:00Z'),
      clockOut: new Date('2026-05-05T14:00:00Z'),
    });
    const pending = await correction(archived, {
      from: '2026-05-05T06:00:00.000Z',
      to: '2026-05-05T15:00:00.000Z',
    });
    await ctx.prisma.employee.update({
      where: { id: owner.id },
      data: { role: 'HRAdmin' },
    });
    await ctx.prisma.installationSettings.update({
      where: { id: 1 },
      data: { mode: 'Solo', ownerEmployeeId: owner.id },
    });
    await targets().expect(403);
    await targets(hr).expect(403);
    await postRequest().expect(403);
    await decide(pending.id).expect(403);
    await ctx.http
      .patch(`/api/timeentries/${row.id}/correct`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        clockIn: IN,
        clockOut: EXTENDED,
        revision: 0,
        reason: 'Solo owner fixes a forgotten hour',
      })
      .expect(200);
    expect(await currentEntry(row.id)).toMatchObject({
      id: row.id,
      revision: 1,
      clockOut: new Date(EXTENDED),
      status: 'Approved',
      approvalMode: 'Solo',
      requiresApproval: false,
    });
    expect((await audits(row.id)).map((event) => event.action)).toEqual([
      'Corrected',
    ]);
    expect(await currentEntry(archived.id)).toEqual(archived);
    expect((await currentRequest(pending.id)).workflowState).toBe(
      'PendingManager',
    );
  });

  it('rejects foreign and nonexistent targets even if employeeId is forged', async () => {
    const foreign = await entry({ employeeId: other.id });
    for (const targetTimeEntryId of [foreign.id, randomUUID()]) {
      await postRequest({
        targetTimeEntryId,
        expectedTargetRevision: 0,
        employeeId: other.id,
      }).expect(403);
    }
    expect(await currentEntry(foreign.id)).toEqual(foreign);
    expect(await ctx.prisma.request.count()).toBe(0);
    expect(await ctx.prisma.timeEntryAudit.count()).toBe(0);
  });

  it('rejects open, voided, rejected and Solo target bindings without a request/event/audit', async () => {
    const rows = [
      await entry({ status: 'Open', clockOut: null }),
      await entry({ voidedAt: new Date() }),
      await entry({ status: 'Rejected' }),
      await entry({ approvalMode: 'Solo' }),
    ];
    for (const row of rows) {
      await postRequest({
        targetTimeEntryId: row.id,
        expectedTargetRevision: 0,
      }).expect(409);
      expect(await currentEntry(row.id)).toEqual(row);
    }
    expect(await ctx.prisma.request.count()).toBe(0);
    expect(await ctx.prisma.requestEvent.count()).toBe(0);
    expect(await ctx.prisma.timeEntryAudit.count()).toBe(0);
  });

  it('requires a complete target/version pair, validates versions, and rejects stale originals', async () => {
    const row = await entry();
    for (const binding of [
      { targetTimeEntryId: row.id },
      { expectedTargetRevision: 0 },
      { targetTimeEntryId: row.id, expectedTargetRevision: null },
      { targetTimeEntryId: null, expectedTargetRevision: 0 },
      { targetTimeEntryId: row.id, expectedTargetRevision: -1 },
      { targetTimeEntryId: row.id, expectedTargetRevision: 0.5 },
      { targetTimeEntryId: row.id, expectedTargetRevision: 'invalid' },
      { targetTimeEntryId: 'not-a-uuid', expectedTargetRevision: 0 },
    ])
      await postRequest(binding).expect(400);
    await postRequest({
      targetTimeEntryId: row.id,
      expectedTargetRevision: 1,
    }).expect(409);
    expect(await currentEntry(row.id)).toEqual(row);
    expect(await ctx.prisma.request.count()).toBe(0);
  });

  it('forbids correction fields on non-TimeAdjustment requests, including the vacation endpoint', async () => {
    const row = await entry();
    for (const type of ['HomeOffice', 'SpecialLeave', 'Vacation']) {
      await postRequest({
        type,
        targetTimeEntryId: row.id,
        expectedTargetRevision: 0,
      }).expect(400);
    }
    await ctx.http
      .post('/api/requests/vacation')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        employeeId: owner.id,
        from: IN,
        to: OUT,
        targetTimeEntryId: row.id,
        expectedTargetRevision: 0,
      })
      .expect(400);
    expect(await ctx.prisma.request.count()).toBe(0);
  });

  it('exempts precisely the unchanged target ID, never another same-day booking', async () => {
    const row = await entry();
    const adjacent = await entry({
      clockIn: new Date(OUT),
      clockOut: new Date(EXTENDED),
    });
    await postRequest({
      targetTimeEntryId: row.id,
      expectedTargetRevision: 0,
    }).expect(409);
    // Keeping the original interval is legal; the adjacent booking is not overlapping.
    const request = await correction(row, { to: OUT });
    await decide(request.id).expect(201);
    expect(await currentEntry(adjacent.id)).toEqual(adjacent);
    expect(await ctx.prisma.timeEntry.count()).toBe(2);
    expect(await currentEntry(row.id)).toMatchObject({
      revision: 1,
      clockOut: new Date(OUT),
    });
  });

  it('does not exempt overlaps for missing-booking requests with omitted or explicitly null binding', async () => {
    const row = await entry();
    for (const binding of [
      {},
      { targetTimeEntryId: null, expectedTargetRevision: null },
    ]) {
      await postRequest(binding).expect(409);
    }
    expect(await currentEntry(row.id)).toEqual(row);
    expect(await ctx.prisma.request.count()).toBe(0);
  });

  it.each(['approve', 'manager-approve'])(
    '%s forces outside-frame proposed values through manager → HR and materializes only at the final stage',
    async (route) => {
      const row = await entry();
      const from = route === 'approve' ? IN : EARLY;
      const request = await correction(row, { from });
      if (route === 'approve') {
        expect(request.requiresApproval).toBe(false);
        // Re-evaluate proposed values against the current frame, not only the
        // stored request flag or the target's old approval state.
        await ctx.prisma.workSchedule.update({
          where: { id: scheduleId },
          data: { frameEnd: '16:00' },
        });
      } else expect(request.requiresApproval).toBe(true);
      await decide(request.id, 'hr-confirm', hr).expect(409);
      const managed = await decide(request.id, route, manager, {
        requiresHrConfirmation: false,
      }).expect(201);
      expect(managed.body).toMatchObject({
        status: 'Submitted',
        workflowState: 'PendingHr',
        requiresApproval: true,
        approverId: manager.id,
        hrConfirmedAt: null,
      });
      expect(await currentEntry(row.id)).toEqual(row);
      expect(await audits(row.id)).toEqual([]);
      await decide(request.id, 'hr-confirm', owner).expect(403);
      await decide(request.id, 'hr-confirm', manager).expect(403);
      const final = await decide(request.id, 'hr-confirm', hr).expect(201);
      expect(final.body).toMatchObject({
        status: 'Approved',
        workflowState: 'Approved',
      });
      expect(final.body.hrConfirmedAt).not.toBeNull();
      expect(await currentEntry(row.id)).toMatchObject({
        id: row.id,
        revision: 1,
        clockIn: new Date(from),
        clockOut: new Date(EXTENDED),
        status: 'Approved',
        requiresApproval: true,
        frameApproverId: null,
        frameApprovedRevision: null,
      });
      expect(await ctx.prisma.timeEntry.count()).toBe(1);
      expect((await events(request.id)).map((event) => event.kind)).toEqual([
        'Submitted',
        'ManagerApproved',
        'HrConfirmed',
      ]);
      expect((await linkedAudit(request.id).expect(200)).body).toEqual([
        expect.objectContaining({
          requestId: request.id,
          actorId: hr.id,
          before: expect.objectContaining({ clockIn: IN, clockOut: OUT }),
          after: expect.objectContaining({ clockIn: from, clockOut: EXTENDED }),
        }),
      ]);
    },
  );

  it('never reuses #41 approval of old values to authorize a changed outside-frame interval', async () => {
    const row = await entry({
      clockIn: new Date(EARLY),
      status: 'Pending',
      requiresApproval: true,
    });
    await frameDecision(row.id).expect(201);
    await frameDecision(row.id, 1, 'HR').expect(201);
    const approved = await currentEntry(row.id);
    const oldAudits = await audits(row.id);
    expect(approved).toMatchObject({ revision: 2, status: 'Approved' });
    const changedFrom = '2026-05-04T03:00:00.000Z';
    const request = await correction(approved, { from: changedFrom });
    expect(request.requiresApproval).toBe(true);
    await decide(request.id, 'hr-confirm', hr).expect(409);
    await decide(request.id).expect(201);
    expect((await currentRequest(request.id)).workflowState).toBe('PendingHr');
    expect(await currentEntry(row.id)).toEqual(approved);
    expect(await audits(row.id)).toEqual(oldAudits);
    await decide(request.id, 'hr-confirm', hr).expect(201);
    expect(await currentEntry(row.id)).toMatchObject({
      revision: 3,
      clockIn: new Date(changedFrom),
      frameApproverId: null,
      frameApprovedRevision: null,
    });
    for (const audit of oldAudits) {
      expect(
        (await audits(row.id)).find((event) => event.id === audit.id),
      ).toEqual(audit);
    }
    await frameDecision(row.id, 2, 'HR').expect(409);
    const history = await ctx.http
      .get(`/api/timeentries/${row.id}/approval-history`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(history.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId: request.id,
          action: 'FrameRequestCorrected',
        }),
      ]),
    );
  });

  it('return → reason-only save/resubmit retains binding, version, exact before snapshot and ID', async () => {
    const row = await entry();
    const request = await returned(row);
    const saved = await save(request, {
      targetTimeEntryBefore: { clockIn: EARLY, revision: 99 },
    }).expect(200);
    expect(saved.body).toMatchObject({
      id: request.id,
      workflowState: 'Draft',
      targetTimeEntryId: row.id,
      expectedTargetRevision: 0,
      targetTimeEntryBefore: request.targetTimeEntryBefore,
    });
    const submitted = await resubmit(saved.body).expect(201);
    expect(submitted.body).toMatchObject({
      id: request.id,
      workflowState: 'PendingManager',
      targetTimeEntryId: row.id,
      expectedTargetRevision: 0,
      targetTimeEntryBefore: request.targetTimeEntryBefore,
    });
    expect(await currentEntry(row.id)).toEqual(row);
    await decide(request.id).expect(201);
    expect(await ctx.prisma.request.count()).toBe(1);
    expect((await events(request.id)).map((event) => event.kind)).toEqual([
      'Submitted',
      'Returned',
      'Resubmitted',
      'ManagerApproved',
    ]);
  });

  it('denies rebinding, removing the target, or changing the expected revision on both draft paths', async () => {
    const row = await entry();
    const alternative = await entry({
      clockIn: new Date('2026-05-05T06:00:00Z'),
      clockOut: new Date('2026-05-05T14:00:00Z'),
    });
    const request = await returned(row);
    for (const extra of [
      { targetTimeEntryId: alternative.id, expectedTargetRevision: 0 },
      { targetTimeEntryId: null, expectedTargetRevision: null },
      { expectedTargetRevision: 1 },
    ]) {
      await save(request, extra).expect(400);
      await resubmit(request, extra).expect(400);
    }
    expect(await currentRequest(request.id)).toMatchObject({
      workflowState: 'Draft',
      targetTimeEntryId: row.id,
      expectedTargetRevision: 0,
      targetTimeEntryBefore: request.targetTimeEntryBefore,
    });
    expect((await events(request.id)).map((event) => event.kind)).toEqual([
      'Submitted',
      'Returned',
    ]);
  });

  it('rejects a stale target after return with 409 instead of silently refreshing the original snapshot', async () => {
    const row = await entry();
    const request = await returned(row);
    await ctx.http
      .patch(`/api/timeentries/${row.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ revision: 0, note: 'Changed after return' })
      .expect(200);
    const before = await unchangedDecisionState(request.id, row.id);
    await save(request).expect(409);
    await resubmit(request).expect(409);
    expect(await unchangedDecisionState(request.id, row.id)).toEqual(before);
    expect(before.request.targetTimeEntryBefore).toEqual(
      request.targetTimeEntryBefore,
    );
  });

  it('round-trips original/proposed DST spring-gap and repeated-fold instants with seconds through #42 revision and final correction', async () => {
    const cases = [
      {
        originalIn: '2026-03-29T01:59:17.123+01:00',
        originalOut: '2026-03-29T03:00:01.456+02:00',
        from: '2026-03-29T01:59:37.123+01:00',
        to: '2026-03-29T03:00:41.456+02:00',
      },
      {
        originalIn: '2026-10-25T02:15:17.123+02:00',
        originalOut: '2026-10-25T02:45:41.456+01:00',
        from: '2026-10-25T02:20:31.987+02:00',
        to: '2026-10-25T02:55:51.654+01:00',
      },
    ];
    for (const values of cases) {
      const row = await entry({
        clockIn: new Date(values.originalIn),
        clockOut: new Date(values.originalOut),
      });
      const original = {
        clockIn: new Date(values.originalIn).toISOString(),
        clockOut: new Date(values.originalOut).toISOString(),
      };
      const proposed = {
        from: new Date(values.from).toISOString(),
        to: new Date(values.to).toISOString(),
      };
      const request = await returned(row, { from: values.from, to: values.to });
      expect(request.targetTimeEntryBefore).toMatchObject(original);
      const saved = await save(request).expect(200);
      expect(saved.body).toMatchObject(proposed);
      const submitted = await resubmit(saved.body).expect(201);
      expect(submitted.body).toMatchObject({
        ...proposed,
        targetTimeEntryBefore: request.targetTimeEntryBefore,
      });
      await decide(request.id).expect(201);
      expect(await currentEntry(row.id)).toEqual(row);
      await decide(request.id, 'hr-confirm', hr).expect(201);
      const persisted = await currentEntry(row.id);
      expect(persisted.clockIn.toISOString()).toBe(proposed.from);
      expect(persisted.clockOut?.toISOString()).toBe(proposed.to);
      const linked = (await linkedAudit(request.id).expect(200)).body[0];
      expect(linked.before).toMatchObject(original);
      expect(linked.after).toMatchObject({
        clockIn: proposed.from,
        clockOut: proposed.to,
      });
      // Existing ungrouped Team summaries bill/report whole minutes.
      // Persisted timestamps above must still retain every millisecond.
      expect(linked.after.summary.grossMinutes).toBe(
        Math.floor(
          (Date.parse(proposed.to) - Date.parse(proposed.from)) / 60_000,
        ),
      );
    }
  });

  it.each(['Manager', 'HR'])(
    'a target changed before final %s approval leaves pending request, entry, events and audits untouched',
    async (stage) => {
      const row = await entry();
      const request = await correction(
        row,
        stage === 'HR' ? { from: EARLY } : {},
      );
      if (stage === 'HR') await decide(request.id).expect(201);
      await ctx.http
        .patch(`/api/timeentries/${row.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ revision: 0, activity: 'New target revision' })
        .expect(200);
      const before = await unchangedDecisionState(request.id, row.id);
      await decide(
        request.id,
        stage === 'HR' ? 'hr-confirm' : 'manager-approve',
        stage === 'HR' ? hr : manager,
      ).expect(409);
      expect(await unchangedDecisionState(request.id, row.id)).toEqual(before);
      expect(before.request.workflowState).toBe(
        stage === 'HR' ? 'PendingHr' : 'PendingManager',
      );
    },
  );

  it.each(['metadata', 'split', 'frame approval'])(
    '%s increments the target revision and invalidates an outstanding correction',
    async (operation) => {
      const row = await entry({
        clockIn: new Date(EARLY),
        status: 'Pending',
        requiresApproval: true,
      });
      const request = await correction(row, { from: EARLY });
      if (operation === 'metadata') {
        await ctx.http
          .patch(`/api/timeentries/${row.id}`)
          .set('Authorization', `Bearer ${owner.token}`)
          .send({ revision: 0, activity: 'Revised metadata' })
          .expect(200);
      } else if (operation === 'split') {
        await ctx.http
          .post(`/api/timeentries/${row.id}/split`)
          .set('Authorization', `Bearer ${owner.token}`)
          .send({ revision: 0, at: '2026-05-04T10:00:00Z' })
          .expect(201);
      } else await frameDecision(row.id).expect(201);
      expect((await currentEntry(row.id)).revision).toBe(1);
      const before = await unchangedDecisionState(request.id, row.id);
      await decide(request.id).expect(409);
      expect(await unchangedDecisionState(request.id, row.id)).toEqual(before);
    },
  );

  it('serializes two disjoint correction requests for revision 0: exactly one final approval wins', async () => {
    const row = await entry();
    // Disjoint proposals deliberately avoid the independent request-overlap guard.
    const a = await correction(row, {
      from: '2026-05-05T06:00:00.000Z',
      to: '2026-05-05T14:00:00.000Z',
    });
    const b = await correction(row, {
      from: '2026-05-06T06:00:00.000Z',
      to: '2026-05-06T14:00:00.000Z',
    });
    expect(a.expectedTargetRevision).toBe(0);
    expect(b.expectedTargetRevision).toBe(0);
    const replies = await Promise.all([decide(a.id), decide(b.id)]);
    expect(replies.map((reply) => reply.status).sort()).toEqual([201, 409]);
    const winner = replies[0].status === 201 ? a : b;
    const loser = winner.id === a.id ? b : a;
    expect(await currentEntry(row.id)).toMatchObject({
      id: row.id,
      revision: 1,
      clockIn: new Date(winner.from),
      clockOut: new Date(winner.to),
    });
    expect((await currentRequest(winner.id)).workflowState).toBe('Approved');
    expect((await currentRequest(loser.id)).workflowState).toBe(
      'PendingManager',
    );
    expect((await events(loser.id)).map((event) => event.kind)).toEqual([
      'Submitted',
    ]);
    expect(await ctx.prisma.timeEntry.count()).toBe(1);
    expect(await audits(row.id)).toEqual([
      expect.objectContaining({ requestId: winner.id }),
    ]);
  });

  it('rejects repeated final approvals without duplicate entry changes, events or linked audits', async () => {
    const row = await entry();
    const request = await correction(row);
    await decide(request.id, 'approve').expect(201);
    const before = await unchangedDecisionState(request.id, row.id);
    // Legacy assignment guards may return 403 before the state guard returns 409.
    for (const route of ['approve', 'manager-approve']) {
      const response = await decide(request.id, route);
      expect([403, 409]).toContain(response.status);
    }
    await decide(request.id, 'cancel', owner).expect(409);
    expect(await unchangedDecisionState(request.id, row.id)).toEqual(before);
    expect(
      before.events.filter((event) => event.kind === 'ManagerApproved'),
    ).toHaveLength(1);
    expect(before.audits).toHaveLength(1);
    expect(await ctx.prisma.timeEntry.count()).toBe(1);
  });

  it.each(['metadata', 'split', 'frame approval'])(
    'an in-flight final correction cannot overwrite a concurrent %s mutation',
    async (operation) => {
      const row = await entry({
        clockIn: new Date(EARLY),
        status: 'Pending',
        requiresApproval: true,
      });
      // Move proposed values into the frame so manager approval would otherwise be final.
      const request = await correction(row);
      expect(request.requiresApproval).toBe(false);
      const employees = ctx.app.get(EmployeesService);
      const getById = employees.getById.bind(employees);
      let release!: () => void;
      let arrived!: () => void;
      const waiting = new Promise<void>((resolve) => {
        arrived = resolve;
      });
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      let delayOnce = true;
      const spy = jest
        .spyOn(employees, 'getById')
        .mockImplementation(async (id) => {
          const result = await getById(id);
          if (id === manager.id && delayOnce) {
            delayOnce = false;
            arrived();
            await barrier;
          }
          return result;
        });
      // Start HTTP immediately; the barrier pauses after its original request was read.
      const inflight = decide(request.id).then((response) => response);
      try {
        await waiting;
        if (operation === 'metadata') {
          await ctx.http
            .patch(`/api/timeentries/${row.id}`)
            .set('Authorization', `Bearer ${owner.token}`)
            .send({ revision: 0, note: 'Concurrent owner edit' })
            .expect(200);
        } else if (operation === 'split') {
          await ctx.http
            .post(`/api/timeentries/${row.id}/split`)
            .set('Authorization', `Bearer ${owner.token}`)
            .send({ revision: 0, at: '2026-05-04T10:00:00Z' })
            .expect(201);
        } else await frameDecision(row.id).expect(201);
        const before = await unchangedDecisionState(request.id, row.id);
        const allEntries = await ctx.prisma.timeEntry.findMany({
          orderBy: { id: 'asc' },
        });
        release();
        expect((await inflight).status).toBe(409);
        expect(await unchangedDecisionState(request.id, row.id)).toEqual(
          before,
        );
        expect(
          await ctx.prisma.timeEntry.findMany({ orderBy: { id: 'asc' } }),
        ).toEqual(allEntries);
        expect(before.request.workflowState).toBe('PendingManager');
        expect(before.entry.revision).toBe(1);
      } finally {
        release();
        await inflight;
        spy.mockRestore();
      }
    },
  );

  it.each(['approve', 'manager-approve', 'hr-confirm'])(
    '%s rolls back request state/event and entry/audit if application fails after the entry changed inside the transaction',
    async (route) => {
      const row = await entry();
      const request = await correction(
        row,
        route === 'hr-confirm' ? { from: EARLY } : {},
      );
      if (route === 'hr-confirm') await decide(request.id).expect(201);
      const before = await unchangedDecisionState(request.id, row.id);
      const service = ctx.app.get(TimeAdjustmentsService);
      const apply = service.apply.bind(service);
      let changedInsideTransaction = false;
      const spy = jest
        .spyOn(service, 'apply')
        .mockImplementation(async (tx, value, actorId, requiresApproval) => {
          const changed = await apply(tx, value, actorId, requiresApproval);
          expect(changed.revision).toBe(row.revision + 1);
          expect(changed.clockOut?.toISOString()).toBe(EXTENDED);
          expect(
            await tx.timeEntryAudit.count({ where: { requestId: request.id } }),
          ).toBe(1);
          changedInsideTransaction = true;
          throw new Error(
            'Deliberate regression-test failure after entry and audit writes',
          );
        });
      try {
        // createTestApp uses logger:false; this intentional error must reach HTTP as 500.
        await decide(
          request.id,
          route,
          route === 'hr-confirm' ? hr : manager,
        ).expect(500);
        expect(changedInsideTransaction).toBe(true);
      } finally {
        spy.mockRestore();
      }
      expect(await unchangedDecisionState(request.id, row.id)).toEqual(before);
      expect(await ctx.prisma.timeEntry.count()).toBe(1);
      expect((await linkedAudit(request.id).expect(200)).body).toEqual([]);
      // The same request/version remains usable after the failed transaction.
      await decide(
        request.id,
        route,
        route === 'hr-confirm' ? hr : manager,
      ).expect(201);
      expect(await audits(row.id)).toHaveLength(1);
      expect((await currentEntry(row.id)).revision).toBe(1);
    },
  );

  it('preserves a grouped capture policy and snapshots the full capture summary, not just the target segment', async () => {
    const captureGroupId = randomUUID();
    const row = await entry({
      clockOut: new Date('2026-05-04T10:00:00Z'),
      captureGroupId,
    });
    const sibling = await entry({
      clockIn: new Date('2026-05-04T10:00:00Z'),
      captureGroupId,
    });
    const request = await correction(row, {
      from: '2026-05-04T05:00:00.000Z',
      to: '2026-05-04T10:00:00.000Z',
    });
    expect(request.targetTimeEntryBefore).toMatchObject({
      captureGroupId,
      breakRules: RULES,
      summary: { grossMinutes: 240, breakMinutes: 15, netMinutes: 225 },
      captureSummary: { grossMinutes: 480, breakMinutes: 30, netMinutes: 450 },
    });
    await decide(request.id).expect(201); // 07:00 local is exactly in-frame
    expect(await currentEntry(sibling.id)).toEqual(sibling);
    expect(await ctx.prisma.timeEntry.count()).toBe(2);
    const linked = (await linkedAudit(request.id).expect(200)).body[0];
    expect(linked.before).toEqual(request.targetTimeEntryBefore);
    expect(linked.after).toMatchObject({
      captureGroupId,
      breakRules: RULES,
      summary: { grossMinutes: 300, breakMinutes: 25, netMinutes: 275 },
      captureSummary: { grossMinutes: 540, breakMinutes: 45, netMinutes: 495 },
    });
    const listed = (await listEntries().expect(200)).body as Array<{
      summary: {
        grossMinutes: number;
        breakMinutes: number;
        netMinutes: number;
      };
    }>;
    const total = listed.reduce(
      (sum, item) => ({
        grossMinutes: sum.grossMinutes + item.summary.grossMinutes,
        breakMinutes: sum.breakMinutes + item.summary.breakMinutes,
        netMinutes: sum.netMinutes + item.summary.netMinutes,
      }),
      { grossMinutes: 0, breakMinutes: 0, netMinutes: 0 },
    );
    expect(total).toEqual({
      grossMinutes: 540,
      breakMinutes: 45,
      netMinutes: 495,
    });
  });

  it('requires an active real assigned Manager and revalidates their assignment/role at decision time', async () => {
    const row = await entry();
    for (const managerId of [null, owner.id, hr.id]) {
      await ctx.prisma.employee.update({
        where: { id: owner.id },
        data: { managerId },
      });
      await postRequest({
        targetTimeEntryId: row.id,
        expectedTargetRevision: 0,
      }).expect(409);
    }
    await ctx.prisma.employee.update({
      where: { id: owner.id },
      data: { managerId: manager.id },
    });
    await ctx.prisma.employee.update({
      where: { id: manager.id },
      data: { isActive: false },
    });
    await postRequest({
      targetTimeEntryId: row.id,
      expectedTargetRevision: 0,
    }).expect(409);
    await ctx.prisma.employee.update({
      where: { id: manager.id },
      data: { isActive: true },
    });
    const request = await correction(row);
    const before = await unchangedDecisionState(request.id, row.id);
    await decide(request.id, 'manager-approve', hr, {
      actorId: manager.id,
    }).expect(403);
    await ctx.prisma.employee.update({
      where: { id: manager.id },
      data: { role: 'Employee' },
    });
    await decide(request.id).expect(403); // JWT's old role must not authorize the action.
    expect(await unchangedDecisionState(request.id, row.id)).toEqual(before);
  });
});
