import { createHmac } from 'node:crypto';
import {
  createTestApp,
  login,
  seedEmployee,
  type TestContext,
} from '../support/test-app';

describe('Atomic, explicit terminal PIN bookings and audits', () => {
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

  async function terminal(hrToken: string, geofence = false) {
    const result = await ctx.http
      .post('/api/terminals')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        name: 'Synthetic PIN booking',
        displayText: 'Synthetic test terminal',
        locationLabel: 'Synthetic reception',
        timeZone: 'Europe/Berlin',
        enforceGeofence: geofence,
        isActive: true,
        allowedAuthMethods: ['QR', 'PIN'],
        ...(geofence
          ? {
              latitude: 49.7913,
              longitude: 9.9534,
              radiusMeters: 100,
              maxAccuracyMeters: 50,
            }
          : {}),
      })
      .expect(201);
    const pair = await ctx.http
      .post(`/api/terminals/${result.body.id}/pairing`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(201);
    const paired = await ctx.http
      .post('/api/terminals/pair')
      .send({
        pairingCode: pair.body.pairingCode,
        deviceName: 'Synthetic booking kiosk',
      })
      .expect(201);
    return {
      terminalId: result.body.id as string,
      deviceToken: paired.body.deviceToken as string,
    };
  }

  async function fixture(geofence = false, ownerOnly = false) {
    const hr = await seedEmployee(ctx.prisma, {
      personalNo: 'BOOK-HR',
      firstName: 'Hannah',
      lastName: 'Administrator',
      email: 'hr@pin-booking.test',
      role: 'HRAdmin',
    });
    const employee = ownerOnly
      ? hr
      : await seedEmployee(ctx.prisma, {
          personalNo: '000007',
          firstName: 'Erika',
          lastName: 'Employee',
          email: 'employee@pin-booking.test',
        });
    const hrToken = await login(ctx.http, hr.email);
    const reset = await ctx.http
      .post(`/api/employees/${employee.id}/terminal-credentials/pin/reset`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({})
      .expect(201);
    return {
      hr,
      employee,
      hrToken,
      pin: reset.body.pin as string,
      ...(await terminal(hrToken, geofence)),
    };
  }

  async function grant(f: {
    deviceToken: string;
    pin: string;
    employee: { personalNo: string };
  }) {
    const challenge = await ctx.http
      .post('/api/terminals/kiosk/challenge')
      .set('Authorization', `Bearer ${f.deviceToken}`)
      .send({})
      .expect(201);
    const identified = await ctx.http
      .post('/api/terminals/kiosk/identify')
      .set('Authorization', `Bearer ${f.deviceToken}`)
      .send({
        method: 'PIN',
        challengePayload: challenge.body.payload,
        personalNo: f.employee.personalNo,
        pin: f.pin,
      })
      .expect(201);
    return identified.body as {
      grant: string;
      action: 'clock-in' | 'clock-out';
      requiresLocation: boolean;
    };
  }

  function book(
    deviceToken: string,
    token: string,
    action?: string,
    extra: Record<string, unknown> = {},
  ) {
    return ctx.http
      .post('/api/terminals/kiosk/book')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({ grant: token, ...(action ? { action } : {}), ...extra });
  }

  it('requires an explicit action, rejects a status mismatch, and commits one minimal confirmation', async () => {
    const f = await fixture();
    const identified = await grant(f);
    await book(f.deviceToken, identified.grant).expect(400);
    const mismatch = await book(
      f.deviceToken,
      identified.grant,
      'clock-out',
    ).expect(409);
    expect(mismatch.body.code).toBe('TERMINAL_ACTION_MISMATCH');
    expect(await ctx.prisma.timeEntry.count()).toBe(0);
    expect(await ctx.prisma.terminalChallengeRedemption.count()).toBe(0);
    const booked = await book(f.deviceToken, identified.grant, 'clock-in', {
      employeeId: f.hr.id,
    }).expect(201);
    expect(booked.headers['cache-control']).toContain('no-store');
    expect(Object.keys(booked.body).sort()).toEqual([
      'action',
      'bookedAt',
      'code',
      'receiptId',
    ]);
    expect(booked.body).toMatchObject({
      code: 'TERMINAL_BOOKED',
      action: 'clock-in',
    });
    const entry = await ctx.prisma.timeEntry.findFirstOrThrow();
    expect(entry).toMatchObject({
      employeeId: f.employee.id,
      source: 'Terminal',
      terminalId: f.terminalId,
      clockOut: null,
      latitude: null,
      longitude: null,
    });
    expect(entry.clockIn.toISOString()).toBe(booked.body.bookedAt);
    const stored = await ctx.prisma.terminalBookingGrant.findFirstOrThrow();
    expect(stored).toMatchObject({ timeEntryId: entry.id, action: 'clock-in' });
    expect(stored.consumedAt).not.toBeNull();
    expect(await ctx.prisma.terminalChallengeRedemption.count()).toBe(1);
    expect(
      await ctx.prisma.terminalAuditEvent.count({
        where: {
          timeEntryId: entry.id,
          method: 'PIN',
          action: 'clock-in',
          result: 'SUCCESS',
        },
      }),
    ).toBe(1);
    expect(JSON.stringify(booked.body)).not.toMatch(
      /employeeId|personalNo|latitude|note|clockIn|entry/,
    );
  });

  it('deduplicates concurrent commits and returns the same receipt after a lost response and grant expiry', async () => {
    const f = await fixture();
    const identified = await grant(f);
    const results = await Promise.all(
      [1, 2].map(() => book(f.deviceToken, identified.grant, 'clock-in')),
    );
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(results[0].body).toEqual(results[1].body);
    expect(await ctx.prisma.timeEntry.count()).toBe(1);
    expect(await ctx.prisma.terminalChallengeRedemption.count()).toBe(1);
    await ctx.prisma.terminalBookingGrant.updateMany({
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const retry = await book(
      f.deviceToken,
      identified.grant,
      'clock-in',
    ).expect(201);
    expect(retry.body).toEqual(results[0].body);
    await book(f.deviceToken, identified.grant, 'clock-out').expect(409);
    expect((await ctx.prisma.timeEntry.findFirstOrThrow()).clockOut).toBeNull();
    await ctx.prisma.terminalBookingGrant.updateMany({
      data: { consumedAt: new Date(Date.now() - 121_000) },
    });
    await book(f.deviceToken, identified.grant, 'clock-in').expect(409);
    expect(await ctx.prisma.timeEntry.count()).toBe(1);
  });

  it('serializes two terminals so simultaneous clock-ins cannot silently become a clock-out', async () => {
    const f = await fixture();
    const other = await terminal(f.hrToken);
    const first = await grant(f);
    const second = await grant({ ...f, ...other });
    const results = await Promise.all([
      book(f.deviceToken, first.grant, 'clock-in'),
      book(other.deviceToken, second.grant, 'clock-in'),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(results.find((result) => result.status === 409)?.body.code).toBe(
      'TERMINAL_ACTION_MISMATCH',
    );
    expect(await ctx.prisma.timeEntry.count()).toBe(1);
    expect(
      await ctx.prisma.timeEntry.count({ where: { clockOut: null } }),
    ).toBe(1);
    expect(await ctx.prisma.terminalChallengeRedemption.count()).toBe(1);
    const stopped = await grant(f);
    expect(stopped.action).toBe('clock-out');
    await book(f.deviceToken, stopped.grant, 'clock-out').expect(201);
    expect(await ctx.prisma.timeEntry.count()).toBe(1);
    const entry = await ctx.prisma.timeEntry.findFirstOrThrow();
    expect(entry.clockOut).not.toBeNull();
    expect(entry.clockOutTerminalId).toBe(f.terminalId);
  });

  it.each([
    'reset',
    'disable',
    'unlock',
    'lock',
    'employee',
    'method',
    'device',
    'terminal',
  ] as const)(
    'invalidates an outstanding grant after committed %s revocation',
    async (change) => {
      const f = await fixture();
      const identified = await grant(f);
      const auth = `Bearer ${f.hrToken}`;
      const credentials = `/api/employees/${f.employee.id}/terminal-credentials/pin`;
      switch (change) {
        case 'reset':
          await ctx.http
            .post(`${credentials}/reset`)
            .set('Authorization', auth)
            .send({})
            .expect(201);
          break;
        case 'disable':
          await ctx.http
            .delete(credentials)
            .set('Authorization', auth)
            .expect(200);
          break;
        case 'unlock':
          await ctx.http
            .post(`${credentials}/unlock`)
            .set('Authorization', auth)
            .send({})
            .expect(201);
          break;
        case 'lock': {
          const challenge = await ctx.http
            .post('/api/terminals/kiosk/challenge')
            .set('Authorization', `Bearer ${f.deviceToken}`)
            .send({})
            .expect(201);
          const wrong = `${f.pin[0] === '0' ? '1' : '0'}${f.pin.slice(1)}`;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            await ctx.http
              .post('/api/terminals/kiosk/identify')
              .set('Authorization', `Bearer ${f.deviceToken}`)
              .send({
                method: 'PIN',
                challengePayload: challenge.body.payload,
                personalNo: f.employee.personalNo,
                pin: wrong,
              })
              .expect(401);
          }
          break;
        }
        case 'employee':
          await ctx.http
            .delete(`/api/employees/${f.employee.id}`)
            .set('Authorization', auth)
            .expect(200);
          break;
        case 'method':
          await ctx.http
            .put(`/api/terminals/${f.terminalId}`)
            .set('Authorization', auth)
            .send({ allowedAuthMethods: ['QR'] })
            .expect(200);
          break;
        case 'terminal':
          await ctx.http
            .delete(`/api/terminals/${f.terminalId}`)
            .set('Authorization', auth)
            .expect(200);
          break;
        case 'device': {
          const devices = await ctx.http
            .get(`/api/terminals/${f.terminalId}`)
            .set('Authorization', auth)
            .expect(200);
          const active = devices.body.devices.find(
            (item: { revokedAt: string | null }) => item.revokedAt === null,
          );
          await ctx.http
            .delete(`/api/terminals/${f.terminalId}/devices/${active.id}`)
            .set('Authorization', auth)
            .expect(200);
          break;
        }
      }
      const denied = await book(f.deviceToken, identified.grant, 'clock-in');
      expect([401, 403, 409]).toContain(denied.status);
      expect(await ctx.prisma.timeEntry.count()).toBe(0);
      expect(await ctx.prisma.terminalChallengeRedemption.count()).toBe(0);
      expect(
        (await ctx.prisma.terminalBookingGrant.findFirstOrThrow()).consumedAt,
      ).toBeNull();
    },
  );

  it('rejects foreign-device grants and expired unconsumed grants or challenges without partial writes', async () => {
    const f = await fixture();
    const other = await terminal(f.hrToken);
    const identified = await grant(f);
    await book(other.deviceToken, identified.grant, 'clock-in').expect(409);
    await ctx.prisma.terminalBookingGrant.updateMany({
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const expired = await book(
      f.deviceToken,
      identified.grant,
      'clock-in',
    ).expect(409);
    expect(expired.body.code).toBe('TERMINAL_GRANT_EXPIRED');
    const current = await grant(f);
    const latest = await ctx.prisma.terminalBookingGrant.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
    });
    await ctx.prisma.terminalChallenge.update({
      where: { id: latest.challengeId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await book(f.deviceToken, current.grant, 'clock-in').expect(409);
    expect(await ctx.prisma.timeEntry.count()).toBe(0);
    expect(await ctx.prisma.terminalChallengeRedemption.count()).toBe(0);
    expect(
      await ctx.prisma.terminalBookingGrant.count({
        where: { consumedAt: { not: null } },
      }),
    ).toBe(0);
  });

  it('rechecks the credential after a real PIN reset commits ahead of a waiting booking', async () => {
    const f = await fixture();
    const identified = await grant(f);
    let acquired!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = ctx.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7261500)`;
      acquired();
      await gate;
    });
    await ready;
    const reset = ctx.http
      .post(`/api/employees/${f.employee.id}/terminal-credentials/pin/reset`)
      .set('Authorization', `Bearer ${f.hrToken}`)
      .send({})
      .then((result) => result);
    async function waitFor(count: number) {
      let waiting = 0;
      for (let attempt = 0; attempt < 100 && waiting < count; attempt += 1) {
        const locks = await ctx.prisma.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(*)::int AS count FROM pg_locks
          WHERE locktype = 'advisory' AND objid = 7261500 AND NOT granted
          AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`;
        waiting = locks[0]?.count ?? 0;
        if (waiting < count)
          await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return waiting;
    }
    let firstWaiting = 0;
    let bothWaiting = 0;
    let pending: Promise<{ status: number }> | undefined;
    try {
      firstWaiting = await waitFor(1);
      pending = book(f.deviceToken, identified.grant, 'clock-in').then(
        (result) => result,
      );
      bothWaiting = await waitFor(2);
    } finally {
      release();
      await blocker;
    }
    expect(firstWaiting).toBe(1);
    expect(bothWaiting).toBe(2);
    const replacement = await reset;
    expect(replacement.status).toBe(201);
    const denied = await pending;
    expect(denied?.status).toBe(409);
    expect(await ctx.prisma.timeEntry.count()).toBe(0);
    expect(await ctx.prisma.terminalChallengeRedemption.count()).toBe(0);
    expect(
      (await ctx.prisma.terminalBookingGrant.findFirstOrThrow()).consumedAt,
    ).toBeNull();
  });

  it('caps an identify grant at local midnight on a DST day', async () => {
    const f = await fixture();
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout'],
    });
    jest.setSystemTime(new Date('2026-03-29T21:59:45.000Z'));
    try {
      const identified = await grant(f);
      const stored = await ctx.prisma.terminalBookingGrant.findFirstOrThrow();
      expect(stored.expiresAt.toISOString()).toBe('2026-03-29T22:00:00.000Z');
      jest.setSystemTime(new Date('2026-03-29T22:00:00.001Z'));
      await book(f.deviceToken, identified.grant, 'clock-in').expect(409);
      expect(await ctx.prisma.timeEntry.count()).toBe(0);
      expect(await ctx.prisma.terminalChallengeRedemption.count()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('retains an unconsumed grant after missing, stale or outside-geofence positions', async () => {
    const f = await fixture(true);
    const identified = await grant(f);
    expect(identified.requiresLocation).toBe(true);
    await book(f.deviceToken, identified.grant, 'clock-in').expect(400);
    const position = {
      latitude: 49.7913,
      longitude: 9.9534,
      accuracyMeters: 8,
      positionTimestamp: new Date().toISOString(),
    };
    await book(f.deviceToken, identified.grant, 'clock-in', {
      ...position,
      positionTimestamp: new Date(Date.now() - 5 * 60_000).toISOString(),
    }).expect(403);
    await book(f.deviceToken, identified.grant, 'clock-in', {
      ...position,
      latitude: 50.1,
    }).expect(403);
    expect(await ctx.prisma.timeEntry.count()).toBe(0);
    expect(
      (await ctx.prisma.terminalBookingGrant.findFirstOrThrow()).consumedAt,
    ).toBeNull();
    await book(f.deviceToken, identified.grant, 'clock-in', position).expect(
      201,
    );
    const entry = await ctx.prisma.timeEntry.findFirstOrThrow();
    expect(Number(entry.latitude)).toBeCloseTo(position.latitude);
    expect(Number(entry.terminalDistanceMeters)).toBe(0);
    const audit = await ctx.prisma.terminalAuditEvent.findMany();
    for (const event of audit)
      expect(event.canonicalPayload).not.toMatch(
        /latitude|longitude|accuracyMeters|positionTimestamp/,
      );
  });

  it('checks Team mode inside a booking transaction queued behind a committed Solo switch', async () => {
    const f = await fixture(false, true);
    const identified = await grant(f);
    await ctx.prisma.installationSettings.upsert({
      where: { id: 1 },
      create: { id: 1, mode: 'Team' },
      update: {},
    });
    let acquired!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const switchMode = ctx.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7261500)`;
      acquired();
      await gate;
      await tx.installationSettings.update({
        where: { id: 1 },
        data: {
          mode: 'Solo',
          ownerEmployeeId: f.hr.id,
          revision: { increment: 1 },
        },
      });
    });
    await ready;
    const pending = book(f.deviceToken, identified.grant, 'clock-in').then(
      (result) => result,
    );
    let waiting = 0;
    try {
      for (let attempt = 0; attempt < 100 && waiting === 0; attempt += 1) {
        const locks = await ctx.prisma.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(*)::int AS count FROM pg_locks
          WHERE locktype = 'advisory' AND objid = 7261500 AND NOT granted
          AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`;
        waiting = locks[0]?.count ?? 0;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      release();
      await switchMode;
    }
    const denied = await pending;
    expect(waiting).toBe(1);
    expect(denied.status).toBe(403);
    expect(await ctx.prisma.timeEntry.count()).toBe(0);
    expect(
      (await ctx.prisma.terminalBookingGrant.findFirstOrThrow()).consumedAt,
    ).toBeNull();
  });

  it('keeps redacted, chained audit events after terminal deletion and rejects in-place mutation', async () => {
    const f = await fixture();
    const identified = await grant(f);
    await book(f.deviceToken, identified.grant, 'clock-in').expect(201);
    const oldEvents = await ctx.prisma.terminalAuditEvent.findMany({
      orderBy: { sequence: 'asc' },
    });
    const oldIds = oldEvents.map((event) => event.id);
    await ctx.http
      .delete(`/api/terminals/${f.terminalId}/permanent`)
      .set('Authorization', `Bearer ${f.hrToken}`)
      .expect(204);
    expect(
      await ctx.prisma.terminalAuditEvent.count({
        where: { id: { in: oldIds } },
      }),
    ).toBe(oldIds.length);
    const events = await ctx.prisma.terminalAuditEvent.findMany({
      orderBy: { sequence: 'asc' },
    });
    let previous = '0'.repeat(64);
    for (const event of events) {
      expect(event.previousHash).toBe(previous);
      expect(event.hash).toBe(
        createHmac('sha256', process.env.TERMINAL_AUDIT_KEY ?? '')
          .update(`${previous}\n${event.canonicalPayload}`)
          .digest('hex'),
      );
      expect(event.canonicalPayload).not.toContain(f.pin);
      expect(event.canonicalPayload).not.toContain(identified.grant);
      expect(event.canonicalPayload).not.toContain(f.deviceToken);
      expect(event.canonicalPayload).not.toMatch(
        /pinHash|pepper|password|latitude|longitude/,
      );
      previous = event.hash;
    }
    const audit = await ctx.http
      .get(`/api/terminals/audit-events?terminalId=${f.terminalId}&limit=2`)
      .set('Authorization', `Bearer ${f.hrToken}`)
      .expect(200);
    expect(audit.headers['cache-control']).toContain('no-store');
    expect(audit.body.items).toHaveLength(2);
    expect(audit.body.nextCursor).toMatch(/^\d+$/);
    expect(JSON.stringify(audit.body)).not.toMatch(
      /canonicalPayload|previousHash|keyVersion|pinHash/,
    );
    const event = events[0];
    await expect(
      ctx.prisma.terminalAuditEvent.update({
        where: { sequence: event.sequence },
        data: { result: 'TAMPERED' },
      }),
    ).rejects.toThrow();
    await expect(
      ctx.prisma.terminalAuditEvent.delete({
        where: { sequence: event.sequence },
      }),
    ).rejects.toThrow();
    expect(
      await ctx.prisma.terminalAuditEvent.findUnique({
        where: { sequence: event.sequence },
      }),
    ).toMatchObject({ result: event.result, hash: event.hash });
  });

  it('rolls back the booking, redemption and grant consumption if the success audit cannot be inserted', async () => {
    const f = await fixture();
    const identified = await grant(f);
    // This transient fault exists only in the connection checked by ctx.reset().
    // It rejects a success audit while allowing the durable rejection audit.
    await ctx.prisma
      .$executeRawUnsafe(`CREATE FUNCTION e2e_reject_terminal_booking_audit()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW."timeEntryId" IS NOT NULL THEN RAISE EXCEPTION 'Synthetic E2E audit write failure'; END IF;
      RETURN NEW; END $$`);
    try {
      await ctx.prisma
        .$executeRawUnsafe(`CREATE TRIGGER e2e_terminal_booking_audit_failure
        BEFORE INSERT ON "TerminalAuditEvent" FOR EACH ROW
        EXECUTE FUNCTION e2e_reject_terminal_booking_audit()`);
      const result = await book(f.deviceToken, identified.grant, 'clock-in');
      expect(result.status).toBeGreaterThanOrEqual(500);
      expect(await ctx.prisma.timeEntry.count()).toBe(0);
      expect(await ctx.prisma.terminalChallengeRedemption.count()).toBe(0);
      expect(
        (await ctx.prisma.terminalBookingGrant.findFirstOrThrow()).consumedAt,
      ).toBeNull();
    } finally {
      await ctx.prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS e2e_terminal_booking_audit_failure ON "TerminalAuditEvent"',
      );
      await ctx.prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS e2e_reject_terminal_booking_audit()',
      );
    }
    await book(f.deviceToken, identified.grant, 'clock-in').expect(201);
    expect(await ctx.prisma.timeEntry.count()).toBe(1);
  });
});
