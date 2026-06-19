import {
  createTestApp,
  login,
  seedEmployee,
  type TestContext,
} from '../support/test-app';

describe('WorkSchedules — CRUD + assignment', () => {
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

  async function setupHR() {
    await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
      role: 'HRAdmin',
    });
    return login(ctx.http, 'hannah@test.local');
  }

  const samplePayload = {
    name: 'Standard 7-23',
    description: 'Regelarbeitszeit mit zwei Kernzeitfenstern',
    frameStart: '07:00',
    frameEnd: '23:00',
    workingDays: 31,
    coreTimes: [
      { label: 'Vormittag', start: '10:00', end: '11:00', weekdays: 31 },
      { label: 'Nachmittag', start: '14:00', end: '15:00', weekdays: 31 },
    ],
  };

  it('non-HR cannot create a schedule (401 without token, 403 as employee)', async () => {
    await ctx.http.post('/api/work-schedules').send(samplePayload).expect(401);
    await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Reg',
      lastName: 'Ular',
      email: 'reg@test.local',
    });
    const empToken = await login(ctx.http, 'reg@test.local');
    await ctx.http
      .post('/api/work-schedules')
      .set('Authorization', `Bearer ${empToken}`)
      .send(samplePayload)
      .expect(403);
  });

  it('HR can create + read + update + delete a schedule', async () => {
    const token = await setupHR();
    const created = await ctx.http
      .post('/api/work-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send(samplePayload)
      .expect(201);
    expect(created.body.name).toBe(samplePayload.name);
    expect(created.body.coreTimes.length).toBe(2);
    expect(created.body.workingDays).toBe(31);

    const list = await ctx.http.get('/api/work-schedules').expect(200);
    expect(
      list.body.some((s: { id: string }) => s.id === created.body.id),
    ).toBe(true);

    const got = await ctx.http
      .get(`/api/work-schedules/${created.body.id}`)
      .expect(200);
    expect(got.body.id).toBe(created.body.id);

    const updated = await ctx.http
      .put(`/api/work-schedules/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...samplePayload, name: 'Standard Updated' })
      .expect(200);
    expect(updated.body.name).toBe('Standard Updated');

    await ctx.http
      .delete(`/api/work-schedules/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await ctx.http.get(`/api/work-schedules/${created.body.id}`).expect(404);
  });

  it('rejects schedules whose frame or core windows do not increase', async () => {
    const token = await setupHR();
    await ctx.http
      .post('/api/work-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...samplePayload,
        name: 'Bad Frame',
        frameStart: '17:00',
        frameEnd: '09:00',
      })
      .expect(400);

    await ctx.http
      .post('/api/work-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...samplePayload,
        name: 'Bad Core',
        coreTimes: [
          { label: 'Kernzeit', start: '11:00', end: '10:00', weekdays: 31 },
        ],
      })
      .expect(400);
  });

  it('marking a schedule as default unsets the previous default', async () => {
    const token = await setupHR();
    const first = await ctx.http
      .post('/api/work-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...samplePayload, name: 'A', isDefault: true })
      .expect(201);
    const second = await ctx.http
      .post('/api/work-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...samplePayload, name: 'B', isDefault: true })
      .expect(201);
    const reread = await ctx.http
      .get(`/api/work-schedules/${first.body.id}`)
      .expect(200);
    expect(reread.body.isDefault).toBe(false);
    expect(second.body.isDefault).toBe(true);
  });

  it('assigns a schedule to an employee', async () => {
    const token = await setupHR();
    const e = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Assign',
      lastName: 'Me',
      email: 'assign@test.local',
    });
    const created = await ctx.http
      .post('/api/work-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send(samplePayload)
      .expect(201);
    await ctx.http
      .post(`/api/work-schedules/${created.body.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId: e.id })
      .expect(201);
    const updatedEmployee = await ctx.prisma.employee.findUnique({
      where: { id: e.id },
    });
    expect(updatedEmployee?.workScheduleId).toBe(created.body.id);
  });
});
