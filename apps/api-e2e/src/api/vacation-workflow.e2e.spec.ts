import {
  createTestApp,
  login,
  seedEmployee,
  seedLeaveAllowance,
  type TestContext,
} from '../support/test-app';

const YEAR = new Date().getUTCFullYear();
const FROM = `${YEAR}-08-03T00:00:00.000Z`; // Mon
const TO = `${YEAR}-08-07T00:00:00.000Z`;   // Fri (5 working days)

interface Cast {
  hannah: { id: string; token: string };
  marc: { id: string; token: string };
  anna: { id: string; token: string };
  erik: { id: string; token: string };
}

async function setupOrgChart(ctx: TestContext): Promise<Cast> {
  const hannah = await seedEmployee(ctx.prisma, {
    personalNo: '0001',
    firstName: 'Hannah',
    lastName: 'Roth',
    email: 'hannah@test.local',
    role: 'HRAdmin',
  });
  const marc = await seedEmployee(ctx.prisma, {
    personalNo: '0010',
    firstName: 'Marc',
    lastName: 'Becker',
    email: 'marc@test.local',
    role: 'Manager',
    managerId: hannah.id,
  });
  const anna = await seedEmployee(ctx.prisma, {
    personalNo: '1001',
    firstName: 'Anna',
    lastName: 'Mueller',
    email: 'anna@test.local',
    managerId: marc.id,
  });
  const erik = await seedEmployee(ctx.prisma, {
    personalNo: '1002',
    firstName: 'Erik',
    lastName: 'Lindgren',
    email: 'erik@test.local',
    managerId: marc.id,
  });
  await seedLeaveAllowance(ctx.prisma, anna.id, YEAR, 30);
  await seedLeaveAllowance(ctx.prisma, erik.id, YEAR, 30);

  return {
    hannah: { id: hannah.id, token: await login(ctx.http, 'hannah@test.local') },
    marc: { id: marc.id, token: await login(ctx.http, 'marc@test.local') },
    anna: { id: anna.id, token: await login(ctx.http, 'anna@test.local') },
    erik: { id: erik.id, token: await login(ctx.http, 'erik@test.local') },
  };
}

describe('Vacation workflow — POST /api/requests/vacation + transitions', () => {
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

  it('happy path without substitute: Submitted → PendingManager → Approved', async () => {
    const cast = await setupOrgChart(ctx);

    const created = await ctx.http
      .post('/api/requests/vacation')
      .set('Authorization', `Bearer ${cast.anna.token}`)
      .send({
        employeeId: cast.anna.id,
        from: FROM,
        to: TO,
        substituteId: null,
        reason: 'Sommer',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      type: 'Vacation',
      workflowState: 'PendingManager',
      currentApproverId: cast.marc.id,
      calculatedDays: 5,
    });

    const approved = await ctx.http
      .post(`/api/requests/${created.body.id}/manager-approve`)
      .set('Authorization', `Bearer ${cast.marc.token}`)
      .send({ actorId: cast.marc.id, note: 'OK', requiresHrConfirmation: false })
      .expect(201);
    expect(approved.body).toMatchObject({ workflowState: 'Approved', status: 'Approved' });

    const events = await ctx.http
      .get(`/api/requests/${created.body.id}/events`)
      .set('Authorization', `Bearer ${cast.marc.token}`)
      .expect(200);
    expect(events.body.map((e: { kind: string }) => e.kind)).toEqual(['Submitted', 'ManagerApproved']);

    const balance = await ctx.http
      .get(`/api/accounts/${cast.anna.id}/vacation`)
      .set('Authorization', `Bearer ${cast.anna.token}`)
      .expect(200);
    expect(balance.body).toMatchObject({ approvedDays: 5, pendingDays: 0, remainingDays: 25 });
  });

  it('with substitute: PendingSubstitute → PendingManager → PendingHr → Approved', async () => {
    const cast = await setupOrgChart(ctx);

    const created = await ctx.http
      .post('/api/requests/vacation')
      .set('Authorization', `Bearer ${cast.anna.token}`)
      .send({
        employeeId: cast.anna.id,
        from: FROM,
        to: TO,
        substituteId: cast.erik.id,
        reason: 'Mit Vertretung',
      })
      .expect(201);
    expect(created.body).toMatchObject({
      workflowState: 'PendingSubstitute',
      substituteId: cast.erik.id,
      currentApproverId: null,
    });

    const subAccepted = await ctx.http
      .post(`/api/requests/${created.body.id}/substitute/accept`)
      .set('Authorization', `Bearer ${cast.erik.token}`)
      .send({ actorId: cast.erik.id })
      .expect(201);
    expect(subAccepted.body).toMatchObject({
      workflowState: 'PendingManager',
      currentApproverId: cast.marc.id,
    });

    const managerApproved = await ctx.http
      .post(`/api/requests/${created.body.id}/manager-approve`)
      .set('Authorization', `Bearer ${cast.marc.token}`)
      .send({ actorId: cast.marc.id, note: 'OK', requiresHrConfirmation: true })
      .expect(201);
    expect(managerApproved.body).toMatchObject({ workflowState: 'PendingHr' });

    const hrConfirmed = await ctx.http
      .post(`/api/requests/${created.body.id}/hr-confirm`)
      .set('Authorization', `Bearer ${cast.hannah.token}`)
      .send({ actorId: cast.hannah.id, note: 'final OK' })
      .expect(201);
    expect(hrConfirmed.body).toMatchObject({ workflowState: 'Approved', status: 'Approved' });

    const events = await ctx.http
      .get(`/api/requests/${created.body.id}/events`)
      .set('Authorization', `Bearer ${cast.hannah.token}`)
      .expect(200);
    expect(events.body.map((e: { kind: string }) => e.kind)).toEqual([
      'Submitted',
      'SubstituteAccepted',
      'ManagerApproved',
      'HrConfirmed',
    ]);
  });

  it('substitute decline returns the request to Draft', async () => {
    const cast = await setupOrgChart(ctx);
    const r = await ctx.http
      .post('/api/requests/vacation')
      .set('Authorization', `Bearer ${cast.anna.token}`)
      .send({ employeeId: cast.anna.id, from: FROM, to: TO, substituteId: cast.erik.id })
      .expect(201);

    const declined = await ctx.http
      .post(`/api/requests/${r.body.id}/substitute/decline`)
      .set('Authorization', `Bearer ${cast.erik.token}`)
      .send({ actorId: cast.erik.id, note: 'Bin selbst weg' })
      .expect(201);
    expect(declined.body).toMatchObject({ workflowState: 'Draft' });
  });

  it('insufficient balance → 409 Conflict', async () => {
    const cast = await setupOrgChart(ctx);
    // Reduce Anna's allowance to 1 day
    await ctx.prisma.employeeLeaveAllowance.update({
      where: { employeeId_year: { employeeId: cast.anna.id, year: YEAR } },
      data: { baseDays: 1 },
    });

    const res = await ctx.http
      .post('/api/requests/vacation')
      .set('Authorization', `Bearer ${cast.anna.token}`)
      .send({ employeeId: cast.anna.id, from: FROM, to: TO, substituteId: null })
      .expect(409);
    expect(res.body.message).toMatch(/Not enough vacation/i);
  });

  it('non-vacation TimeAdjustment routes generically (single-stage when in-frame)', async () => {
    const cast = await setupOrgChart(ctx);
    // 09:00 → 11:00 same day, well inside 07–23 default frame
    const created = await ctx.http
      .post('/api/requests')
      .set('Authorization', `Bearer ${cast.anna.token}`)
      .send({
        employeeId: cast.anna.id,
        type: 'TimeAdjustment',
        from: `${YEAR}-08-03T09:00:00.000Z`,
        to: `${YEAR}-08-03T11:00:00.000Z`,
        reason: 'Vergessen zu stempeln',
      })
      .expect(201);
    expect(created.body).toMatchObject({
      type: 'TimeAdjustment',
      requiresApproval: false,
      workflowState: 'PendingManager',
    });

    const approved = await ctx.http
      .post(`/api/requests/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${cast.marc.token}`)
      .send({ actorId: cast.marc.id })
      .expect(201);
    expect(approved.body).toMatchObject({ workflowState: 'Approved' });
  });

  it('approving a TimeAdjustment materialises a TimeEntry for the corrected times', async () => {
    const cast = await setupOrgChart(ctx);
    const from = `${YEAR}-08-03T09:00:00.000Z`;
    const to = `${YEAR}-08-03T11:00:00.000Z`;

    // No booked time for that day yet.
    const before = await ctx.http
      .get(`/api/timeentries?employeeId=${cast.anna.id}&from=${YEAR}-08-03T00:00:00.000Z&to=${YEAR}-08-03T23:59:59.000Z`)
      .set('Authorization', `Bearer ${cast.anna.token}`)
      .expect(200);
    expect(before.body).toEqual([]);

    const created = await ctx.http
      .post('/api/requests')
      .set('Authorization', `Bearer ${cast.anna.token}`)
      .send({
        employeeId: cast.anna.id,
        type: 'TimeAdjustment',
        from,
        to,
        reason: 'Kommen/Gehen vergessen',
      })
      .expect(201);

    await ctx.http
      .post(`/api/requests/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${cast.marc.token}`)
      .send({ actorId: cast.marc.id })
      .expect(201);

    // The approval must have created a closed, Approved TimeEntry that
    // carries the corrected clock-in / clock-out.
    const after = await ctx.http
      .get(`/api/timeentries?employeeId=${cast.anna.id}&from=${YEAR}-08-03T00:00:00.000Z&to=${YEAR}-08-03T23:59:59.000Z`)
      .set('Authorization', `Bearer ${cast.anna.token}`)
      .expect(200);
    expect(after.body).toHaveLength(1);
    expect(after.body[0]).toMatchObject({
      clockIn: from,
      clockOut: to,
      status: 'Approved',
    });
  });
});
