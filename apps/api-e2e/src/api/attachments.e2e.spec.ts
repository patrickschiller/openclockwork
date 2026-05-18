import {
  createTestApp,
  login,
  seedEmployee,
  type TestContext,
} from '../support/test-app';

describe('Attachments — SpecialLeave uploads', () => {
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

  async function seedSpecialLeave(opts: { type?: 'SpecialLeave' | 'Vacation' } = {}) {
    const e = await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
    });
    const token = await login(ctx.http, 'hannah@test.local');
    const request = await ctx.prisma.request.create({
      data: {
        employeeId: e.id,
        type: opts.type ?? 'SpecialLeave',
        status: 'Submitted',
        workflowState: 'PendingManager',
        from: new Date('2026-06-01T00:00:00Z'),
        to: new Date('2026-06-01T00:00:00Z'),
        calculatedDays: 1,
        reason: 'Umzug',
      },
    });
    return { e, token, request };
  }

  it('owner can upload a PDF, list it, download it, and delete it', async () => {
    const { token, request } = await seedSpecialLeave();
    const pdf = Buffer.from('%PDF-1.4\n%fake', 'utf8');

    const uploaded = await ctx.http
      .post(`/api/requests/${request.id}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', pdf, { filename: 'beleg.pdf', contentType: 'application/pdf' })
      .expect(201);
    expect(uploaded.body.fileName).toBe('beleg.pdf');
    expect(uploaded.body.mimeType).toBe('application/pdf');
    expect(uploaded.body.sizeBytes).toBe(pdf.length);

    const list = await ctx.http
      .get(`/api/requests/${request.id}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.length).toBe(1);
    expect(list.body[0].id).toBe(uploaded.body.id);

    const dl = await ctx.http
      .get(`/api/attachments/${uploaded.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.isBuffer(dl.body)).toBe(true);
    expect((dl.body as Buffer).equals(pdf)).toBe(true);
    expect(dl.headers['content-type']).toContain('application/pdf');

    await ctx.http
      .delete(`/api/attachments/${uploaded.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    const afterDelete = await ctx.http
      .get(`/api/requests/${request.id}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(afterDelete.body.length).toBe(0);
  });

  it('attachments are scoped to SpecialLeave — Vacation requests reject the upload', async () => {
    const { token, request } = await seedSpecialLeave({ type: 'Vacation' });
    await ctx.http
      .post(`/api/requests/${request.id}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('hi'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(400);
  });

  it('disallowed MIME types are rejected with 400', async () => {
    const { token, request } = await seedSpecialLeave();
    await ctx.http
      .post(`/api/requests/${request.id}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('<html></html>'), {
        filename: 'evil.html',
        contentType: 'text/html',
      })
      .expect(400);
  });

  it('a different employee cannot list attachments on someone else\'s request', async () => {
    const { request } = await seedSpecialLeave();
    await seedEmployee(ctx.prisma, {
      personalNo: '1002',
      firstName: 'Other',
      lastName: 'Person',
      email: 'other@test.local',
    });
    const otherToken = await login(ctx.http, 'other@test.local');
    await ctx.http
      .get(`/api/requests/${request.id}/attachments`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });

  it('an HRAdmin can list and delete attachments on any request', async () => {
    const { token, request } = await seedSpecialLeave();
    const pdf = Buffer.from('%PDF', 'utf8');
    const uploaded = await ctx.http
      .post(`/api/requests/${request.id}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', pdf, { filename: 'hr.pdf', contentType: 'application/pdf' })
      .expect(201);

    await seedEmployee(ctx.prisma, {
      personalNo: '9999',
      firstName: 'HR',
      lastName: 'Admin',
      email: 'hr@test.local',
      role: 'HRAdmin',
    });
    const hrToken = await login(ctx.http, 'hr@test.local');

    const hrList = await ctx.http
      .get(`/api/requests/${request.id}/attachments`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    expect(hrList.body.length).toBe(1);

    await ctx.http
      .delete(`/api/attachments/${uploaded.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(204);
  });

  it('uploading without a file returns 400', async () => {
    const { token, request } = await seedSpecialLeave();
    await ctx.http
      .post(`/api/requests/${request.id}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
