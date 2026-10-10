import {
  createTestApp,
  login,
  seedEmployee,
  type TestContext,
} from '../support/test-app';

const TERMINAL_INPUT = {
  name: 'Haupteingang',
  displayText: 'QR-Code zum Ein- oder Ausstempeln scannen',
  locationLabel: 'Büro Würzburg – Empfang',
  latitude: 49.7913,
  longitude: 9.9534,
  radiusMeters: 100,
  maxAccuracyMeters: 50,
  timeZone: 'Europe/Berlin',
};

describe('Tablet terminals', () => {
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

  async function actors() {
    const hr = await seedEmployee(ctx.prisma, {
      personalNo: 'HR-1',
      firstName: 'Hannah',
      lastName: 'Admin',
      email: 'hr@terminal.test',
      role: 'HRAdmin',
    });
    const manager = await seedEmployee(ctx.prisma, {
      personalNo: 'M-1',
      firstName: 'Mark',
      lastName: 'Manager',
      email: 'manager@terminal.test',
      role: 'Manager',
    });
    const first = await seedEmployee(ctx.prisma, {
      personalNo: 'E-1',
      firstName: 'Erika',
      lastName: 'Employee',
      email: 'first@terminal.test',
    });
    const second = await seedEmployee(ctx.prisma, {
      personalNo: 'E-2',
      firstName: 'Emil',
      lastName: 'Employee',
      email: 'second@terminal.test',
    });
    return {
      hr,
      manager,
      first,
      second,
      hrToken: await login(ctx.http, hr.email),
      managerToken: await login(ctx.http, manager.email),
      firstToken: await login(ctx.http, first.email),
      secondToken: await login(ctx.http, second.email),
    };
  }

  async function createTerminal(hrToken: string, isActive = true) {
    return ctx.http
      .post('/api/terminals')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ ...TERMINAL_INPUT, isActive })
      .expect(201);
  }

  async function pairTerminal(hrToken: string, terminalId: string) {
    const pairing = await ctx.http
      .post(`/api/terminals/${terminalId}/pairing`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(201);
    expect(pairing.body.pairingCode).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(pairing.body.pairingUrl).toContain('/kiosk?pairing=');

    return ctx.http
      .post('/api/terminals/pair')
      .send({ pairingCode: pairing.body.pairingCode, deviceName: 'Test iPad' })
      .expect(201);
  }

  async function kiosk(deviceToken: string) {
    return ctx.http
      .get('/api/terminals/kiosk')
      .set('Authorization', `Bearer ${deviceToken}`)
      .expect(200);
  }

  function scanBody(qrPayload: string) {
    return {
      qrPayload,
      latitude: TERMINAL_INPUT.latitude,
      longitude: TERMINAL_INPUT.longitude,
      accuracyMeters: 8,
      positionTimestamp: new Date().toISOString(),
    };
  }

  it('creates the first terminal after bootstrapping a production-style empty database', async () => {
    const hr = await seedEmployee(ctx.prisma, {
      personalNo: 'PROD-HR-1',
      firstName: 'Production',
      lastName: 'Admin',
      email: 'production-admin@terminal.test',
      role: 'HRAdmin',
    });
    const hrToken = await login(ctx.http, hr.email);

    const before = await ctx.http
      .get('/api/terminals')
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    expect(before.body).toEqual([]);
    expect(await ctx.prisma.terminalSupportPrompt.count()).toBe(0);

    const created = await ctx.http
      .post('/api/terminals')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        name: 'Empfang',
        displayText: 'QR-Code zum Ein- oder Ausstempeln scannen',
        locationLabel: 'Musterfirma – Empfang',
        enforceGeofence: false,
        latitude: null,
        longitude: null,
        radiusMeters: null,
        maxAccuracyMeters: null,
        timeZone: 'Europe/Berlin',
        isActive: true,
      })
      .expect(201);

    expect(created.body).toMatchObject({
      name: 'Empfang',
      enforceGeofence: false,
      latitude: null,
      longitude: null,
      isActive: true,
      isPaired: false,
    });
    expect(await ctx.prisma.terminal.count()).toBe(1);
    expect(await ctx.prisma.terminalSupportPrompt.count()).toBe(1);
  });

  it('restricts administration to HRAdmin and records the opt-in prompt once', async () => {
    const { hrToken, managerToken } = await actors();
    await ctx.http
      .post('/api/terminals')
      .set('Authorization', `Bearer ${managerToken}`)
      .send(TERMINAL_INPUT)
      .expect(403);
    await ctx.http
      .post('/api/terminals')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ ...TERMINAL_INPUT, logoUrl: 'https://evil.example/logo.png' })
      .expect(400);
    await ctx.http
      .post('/api/terminals')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        ...TERMINAL_INPUT,
        logoUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      })
      .expect(400);

    const before = await ctx.http
      .get('/api/terminals/support-prompt')
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    expect(before.body.shownAt).toBeNull();

    const created = await createTerminal(hrToken, false);
    expect(created.body.isActive).toBe(false);
    const activated = await ctx.http
      .put(`/api/terminals/${created.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ isActive: true })
      .expect(200);
    expect(activated.body.isActive).toBe(true);
    expect(activated.body.activatedAt).not.toBeNull();

    const dismissed = await ctx.http
      .post('/api/terminals/support-prompt/dismiss')
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(201);
    expect(dismissed.body.shownAt).not.toBeNull();
    const firstShownAt = dismissed.body.shownAt;

    await ctx.http
      .delete(`/api/terminals/${created.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    await ctx.http
      .put(`/api/terminals/${created.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ isActive: true })
      .expect(200);
    const after = await ctx.http
      .post('/api/terminals/support-prompt/dismiss')
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(201);
    expect(after.body.shownAt).toBe(firstShownAt);
  });

  it('pairs exactly one kiosk, returns public data only and revokes the old iPad', async () => {
    const { hrToken } = await actors();
    const terminal = await createTerminal(hrToken);
    const firstPair = await pairTerminal(hrToken, terminal.body.id);
    expect(firstPair.headers['cache-control']).toContain('no-store');
    expect(firstPair.body.deviceToken).toMatch(/^octd_/);
    expect(firstPair.body.terminal.devices).toBeUndefined();
    expect(firstPair.body.terminal.locationLabel).toBe(
      TERMINAL_INPUT.locationLabel,
    );

    const firstState = await kiosk(firstPair.body.deviceToken);
    expect(firstState.headers['cache-control']).toContain('no-store');
    expect(firstState.body.serverTime).toBeTruthy();
    expect(firstState.body.challenge.payload).toMatch(
      /^ocw1\.g\.[A-Za-z0-9_-]{43}$/,
    );
    expect(
      firstState.body.challenge.refreshAfterSeconds,
    ).toBeGreaterThanOrEqual(10);

    const secondPair = await pairTerminal(hrToken, terminal.body.id);
    await ctx.http
      .get('/api/terminals/kiosk')
      .set('Authorization', `Bearer ${firstPair.body.deviceToken}`)
      .expect(401);
    await kiosk(secondPair.body.deviceToken);

    const adminView = await ctx.http
      .get(`/api/terminals/${terminal.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    expect(adminView.body.isPaired).toBe(true);
    expect(adminView.body.deviceCount).toBe(1);
    expect(adminView.body.devices).toHaveLength(2);
    expect(
      adminView.body.devices.filter(
        (device: { revokedAt: string | null }) => device.revokedAt === null,
      ),
    ).toHaveLength(1);
  });

  it('does not pair an inactive terminal or accept a code after deactivation', async () => {
    const { hrToken } = await actors();
    const inactive = await createTerminal(hrToken, false);
    await ctx.http
      .post(`/api/terminals/${inactive.body.id}/pairing`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(409);

    const active = await createTerminal(hrToken, true);
    const paired = await pairTerminal(hrToken, active.body.id);
    const pairing = await ctx.http
      .post(`/api/terminals/${active.body.id}/pairing`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(201);
    await ctx.http
      .delete(`/api/terminals/${active.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    await ctx.http
      .post('/api/terminals/pair')
      .send({ pairingCode: pairing.body.pairingCode })
      .expect(401);
    await ctx.http
      .put(`/api/terminals/${active.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ isActive: true })
      .expect(200);
    await ctx.http
      .get('/api/terminals/kiosk')
      .set('Authorization', `Bearer ${paired.body.deviceToken}`)
      .expect(401);

    const stored = await ctx.prisma.terminal.findUniqueOrThrow({
      where: { id: active.body.id },
    });
    expect(stored.pairingCodeHash).toBeNull();
    expect(stored.pairingExpiresAt).toBeNull();
  });

  it('throttles challenge creation per kiosk device', async () => {
    const { hrToken } = await actors();
    const terminal = await createTerminal(hrToken);
    const paired = await pairTerminal(hrToken, terminal.body.id);

    for (let requestNo = 0; requestNo < 12; requestNo += 1) {
      await kiosk(paired.body.deviceToken);
    }
    const limited = await ctx.http
      .get('/api/terminals/kiosk')
      .set('Authorization', `Bearer ${paired.body.deviceToken}`)
      .expect(429);
    expect(limited.body.code).toBe('TERMINAL_KIOSK_RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('throttles invalid scans for an authenticated employee before DB work', async () => {
    const { firstToken } = await actors();
    const invalidScan = scanBody('A'.repeat(43));
    for (let requestNo = 0; requestNo < 12; requestNo += 1) {
      await ctx.http
        .post('/api/terminals/scan')
        .set('Authorization', `Bearer ${firstToken}`)
        .send(invalidScan)
        .expect(400);
    }
    const limited = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send(invalidScan)
      .expect(429);
    expect(limited.body.code).toBe('TERMINAL_SCAN_RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('caps a challenge at the next local midnight on a DST day', async () => {
    const { hrToken } = await actors();
    const terminal = await createTerminal(hrToken);
    const paired = await pairTerminal(hrToken, terminal.body.id);
    const shortlyBeforeLocalMidnight = new Date('2026-03-29T21:59:45.000Z');

    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout'],
    });
    jest.setSystemTime(shortlyBeforeLocalMidnight);
    try {
      const state = await kiosk(paired.body.deviceToken);
      expect(state.body.serverTime).toBe(
        shortlyBeforeLocalMidnight.toISOString(),
      );
      expect(state.body.challenge.expiresAt).toBe('2026-03-29T22:00:00.000Z');
      expect(state.body.challenge.refreshAfterSeconds).toBe(10);
    } finally {
      jest.useRealTimers();
    }
  });

  it('lets multiple employees redeem one display challenge, but each only once', async () => {
    const { hrToken, first, second, firstToken, secondToken } = await actors();
    const terminal = await createTerminal(hrToken);
    const paired = await pairTerminal(hrToken, terminal.body.id);
    const state = await kiosk(paired.body.deviceToken);
    const payload = state.body.challenge.payload as string;

    const firstIn = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send(scanBody(payload))
      .expect(201);
    expect(firstIn.body.action).toBe('clock-in');
    expect(firstIn.body.distanceMeters).toBe(0);
    expect(firstIn.body.entry.employeeId).toBe(first.id);
    expect(firstIn.body.entry.source).toBe('Terminal');
    expect(firstIn.body.entry.terminalDistanceMeters).toBe(0);
    expect(firstIn.body.entry.terminalRadiusMeters).toBe(
      TERMINAL_INPUT.radiusMeters,
    );
    expect(firstIn.body.entry.terminalMaxAccuracyMeters).toBe(
      TERMINAL_INPUT.maxAccuracyMeters,
    );
    expect(firstIn.body.entry.positionTimestamp).toBeTruthy();

    const secondIn = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${secondToken}`)
      .send(scanBody(payload))
      .expect(201);
    expect(secondIn.body.action).toBe('clock-in');
    expect(secondIn.body.entry.employeeId).toBe(second.id);

    const replay = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send(scanBody(payload))
      .expect(409);
    expect(replay.body.code).toBe('TERMINAL_QR_REPLAYED');

    const nextState = await kiosk(paired.body.deviceToken);
    const outPayload = nextState.body.challenge.payload as string;
    const firstOut = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send(scanBody(outPayload))
      .expect(201);
    expect(firstOut.body.action).toBe('clock-out');
    expect(firstOut.body.entry.clockOutTerminalId).toBe(terminal.body.id);
    expect(firstOut.body.entry.clockOutLatitude).toBeCloseTo(
      TERMINAL_INPUT.latitude,
    );
    expect(firstOut.body.entry.clockOutTerminalDistanceMeters).toBe(0);
    expect(firstOut.body.entry.clockOutTerminalRadiusMeters).toBe(
      TERMINAL_INPUT.radiusMeters,
    );
    expect(firstOut.body.entry.clockOutTerminalMaxAccuracyMeters).toBe(
      TERMINAL_INPUT.maxAccuracyMeters,
    );
    expect(firstOut.body.entry.clockOutPositionTimestamp).toBeTruthy();
    const storedEntry = await ctx.prisma.timeEntry.findUniqueOrThrow({
      where: { id: firstOut.body.entry.id },
    });
    expect(storedEntry.terminalLocationLabel).toBe(
      TERMINAL_INPUT.locationLabel,
    );
    expect(storedEntry.clockOutTerminalLocationLabel).toBe(
      TERMINAL_INPUT.locationLabel,
    );

    await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${secondToken}`)
      .send(scanBody(outPayload))
      .expect(201);

    expect(
      await ctx.prisma.terminalChallengeRedemption.count({
        where: {
          challengeId: {
            in: [
              firstIn.body.entry.clockInChallengeId,
              firstOut.body.entry.clockOutChallengeId,
            ],
          },
        },
      }),
    ).toBe(4);
  });

  it('books at a terminal without requesting or storing GPS data', async () => {
    const { hrToken, firstToken } = await actors();
    const created = await ctx.http
      .post('/api/terminals')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        name: TERMINAL_INPUT.name,
        displayText: TERMINAL_INPUT.displayText,
        locationLabel: TERMINAL_INPUT.locationLabel,
        timeZone: TERMINAL_INPUT.timeZone,
        enforceGeofence: false,
        isActive: true,
      })
      .expect(201);
    expect(created.body).toMatchObject({
      enforceGeofence: false,
      latitude: null,
      longitude: null,
      radiusMeters: null,
      maxAccuracyMeters: null,
    });

    const paired = await pairTerminal(hrToken, created.body.id);
    const state = await kiosk(paired.body.deviceToken);
    const payload = state.body.challenge.payload as string;
    expect(payload).toMatch(/^ocw1\.n\.[A-Za-z0-9_-]{43}$/);

    const manipulated = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send({ qrPayload: payload.replace('ocw1.n.', 'ocw1.g.') })
      .expect(400);
    expect(manipulated.body.code).toBe('TERMINAL_QR_INVALID');

    const booked = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send({ qrPayload: payload, action: 'clock-in' })
      .expect(201);
    expect(booked.body.distanceMeters).toBeNull();
    expect(booked.body.entry).toMatchObject({
      latitude: null,
      longitude: null,
      accuracyMeters: null,
      terminalDistanceMeters: null,
      terminalRadiusMeters: null,
      terminalMaxAccuracyMeters: null,
      positionTimestamp: null,
      terminalId: created.body.id,
    });

    const clockOutState = await kiosk(paired.body.deviceToken);
    const clockedOut = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send({
        qrPayload: clockOutState.body.challenge.payload,
        action: 'clock-out',
      })
      .expect(201);
    expect(clockedOut.body.distanceMeters).toBeNull();
    expect(clockedOut.body.entry).toMatchObject({
      clockOutLatitude: null,
      clockOutLongitude: null,
      clockOutAccuracyMeters: null,
      clockOutTerminalDistanceMeters: null,
      clockOutTerminalRadiusMeters: null,
      clockOutTerminalMaxAccuracyMeters: null,
      clockOutPositionTimestamp: null,
      clockOutTerminalId: created.body.id,
    });
  });

  it('permanently deletes kiosk data while retaining time-entry audit snapshots', async () => {
    const { hrToken, managerToken, firstToken } = await actors();
    const terminal = await createTerminal(hrToken);
    const paired = await pairTerminal(hrToken, terminal.body.id);
    const state = await kiosk(paired.body.deviceToken);
    const booked = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send(scanBody(state.body.challenge.payload))
      .expect(201);
    const clockOutState = await kiosk(paired.body.deviceToken);
    const clockedOut = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send(scanBody(clockOutState.body.challenge.payload))
      .expect(201);
    expect(clockedOut.body.entry.id).toBe(booked.body.entry.id);

    await ctx.http
      .delete(`/api/terminals/${terminal.body.id}/permanent`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(403);
    await ctx.http
      .delete(`/api/terminals/${terminal.body.id}/permanent`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(204);

    expect(
      await ctx.prisma.terminal.findUnique({ where: { id: terminal.body.id } }),
    ).toBeNull();
    expect(await ctx.prisma.terminalDevice.count()).toBe(0);
    expect(await ctx.prisma.terminalChallenge.count()).toBe(0);
    expect(await ctx.prisma.terminalChallengeRedemption.count()).toBe(0);

    const historicalEntry = await ctx.prisma.timeEntry.findUniqueOrThrow({
      where: { id: booked.body.entry.id },
    });
    expect(historicalEntry.source).toBe('Terminal');
    expect(historicalEntry.terminalId).toBeNull();
    expect(historicalEntry.clockOutTerminalId).toBeNull();
    expect(historicalEntry.clockInChallengeId).toBeNull();
    expect(historicalEntry.clockOutChallengeId).toBeNull();
    expect(historicalEntry.terminalLocationLabel).toBe(
      TERMINAL_INPUT.locationLabel,
    );
    expect(historicalEntry.clockOutTerminalLocationLabel).toBe(
      TERMINAL_INPUT.locationLabel,
    );
    expect(Number(historicalEntry.latitude)).toBeCloseTo(
      TERMINAL_INPUT.latitude,
    );
    expect(Number(historicalEntry.longitude)).toBeCloseTo(
      TERMINAL_INPUT.longitude,
    );
    expect(Number(historicalEntry.terminalDistanceMeters)).toBe(0);
    expect(historicalEntry.terminalRadiusMeters).toBe(
      TERMINAL_INPUT.radiusMeters,
    );
    expect(historicalEntry.terminalMaxAccuracyMeters).toBe(
      TERMINAL_INPUT.maxAccuracyMeters,
    );
    expect(Number(historicalEntry.clockOutLatitude)).toBeCloseTo(
      TERMINAL_INPUT.latitude,
    );
    expect(Number(historicalEntry.clockOutLongitude)).toBeCloseTo(
      TERMINAL_INPUT.longitude,
    );
    expect(Number(historicalEntry.clockOutTerminalDistanceMeters)).toBe(0);
    expect(historicalEntry.clockOutTerminalRadiusMeters).toBe(
      TERMINAL_INPUT.radiusMeters,
    );

    await ctx.http
      .get('/api/terminals/kiosk')
      .set('Authorization', `Bearer ${paired.body.deviceToken}`)
      .expect(401);
    await ctx.http
      .delete(`/api/terminals/${terminal.body.id}/permanent`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(404);
  });

  it('validates geofence mode changes and rechecks an existing n challenge', async () => {
    const { hrToken, firstToken, secondToken } = await actors();
    const terminal = await createTerminal(hrToken);
    const paired = await pairTerminal(hrToken, terminal.body.id);
    const geofencedState = await kiosk(paired.body.deviceToken);
    expect(geofencedState.body.challenge.payload).toMatch(/^ocw1\.g\./);

    const disabled = await ctx.http
      .put(`/api/terminals/${terminal.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ enforceGeofence: false })
      .expect(200);
    expect(disabled.body).toMatchObject({
      enforceGeofence: false,
      latitude: null,
      longitude: null,
      radiusMeters: null,
      maxAccuracyMeters: null,
    });

    const ignoredPosition = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send(scanBody(geofencedState.body.challenge.payload))
      .expect(201);
    expect(ignoredPosition.body.distanceMeters).toBeNull();
    expect(ignoredPosition.body.entry).toMatchObject({
      latitude: null,
      longitude: null,
      accuracyMeters: null,
      terminalDistanceMeters: null,
      positionTimestamp: null,
    });

    const state = await kiosk(paired.body.deviceToken);
    expect(state.body.challenge.payload).toMatch(/^ocw1\.n\./);

    const incomplete = await ctx.http
      .put(`/api/terminals/${terminal.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ enforceGeofence: true })
      .expect(400);
    expect(incomplete.body.code).toBe('TERMINAL_GEOFENCE_INCOMPLETE');

    const enabled = await ctx.http
      .put(`/api/terminals/${terminal.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ ...TERMINAL_INPUT, enforceGeofence: true })
      .expect(200);
    expect(enabled.body).toMatchObject({
      enforceGeofence: true,
      latitude: TERMINAL_INPUT.latitude,
      longitude: TERMINAL_INPUT.longitude,
      radiusMeters: TERMINAL_INPUT.radiusMeters,
      maxAccuracyMeters: TERMINAL_INPUT.maxAccuracyMeters,
    });

    const gpsRequired = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${secondToken}`)
      .send({ qrPayload: state.body.challenge.payload })
      .expect(400);
    expect(gpsRequired.body.code).toBe('TERMINAL_GPS_REQUIRED');

    await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${secondToken}`)
      .send(scanBody(state.body.challenge.payload))
      .expect(201);
  });

  it('enforces fresh accurate geolocation and challenge expiry', async () => {
    const { hrToken, firstToken } = await actors();
    const terminal = await createTerminal(hrToken);
    const paired = await pairTerminal(hrToken, terminal.body.id);
    const state = await kiosk(paired.body.deviceToken);
    const payload = state.body.challenge.payload as string;

    const missing = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send({ qrPayload: payload })
      .expect(400);
    expect(missing.body.code).toBe('TERMINAL_GPS_REQUIRED');

    const inaccurate = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send({ ...scanBody(payload), accuracyMeters: 51 })
      .expect(403);
    expect(inaccurate.body.code).toBe('TERMINAL_GPS_INACCURATE');

    const outside = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send({ ...scanBody(payload), latitude: TERMINAL_INPUT.latitude + 0.01 })
      .expect(403);
    expect(outside.body.code).toBe('TERMINAL_OUTSIDE_GEOFENCE');

    const antipodal = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send({
        ...scanBody(payload),
        latitude: -TERMINAL_INPUT.latitude,
        longitude: TERMINAL_INPUT.longitude - 180,
      })
      .expect(403);
    expect(antipodal.body.code).toBe('TERMINAL_OUTSIDE_GEOFENCE');

    const stale = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send({
        ...scanBody(payload),
        positionTimestamp: new Date(Date.now() - 61_000).toISOString(),
      })
      .expect(403);
    expect(stale.body.code).toBe('TERMINAL_POSITION_STALE');

    await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send(scanBody(payload))
      .expect(201);

    const expiredState = await kiosk(paired.body.deviceToken);
    const latestChallenge = await ctx.prisma.terminalChallenge.findFirstOrThrow(
      {
        orderBy: { createdAt: 'desc' },
      },
    );
    await ctx.prisma.terminalChallenge.update({
      where: { id: latestChallenge.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const expired = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send(scanBody(expiredState.body.challenge.payload))
      .expect(400);
    expect(expired.body.code).toBe('TERMINAL_QR_EXPIRED');
  });

  it('serializes simultaneous scans and allows HR to revoke the device', async () => {
    const { hrToken, firstToken } = await actors();
    const terminal = await createTerminal(hrToken);
    const paired = await pairTerminal(hrToken, terminal.body.id);
    const state = await kiosk(paired.body.deviceToken);
    const body = scanBody(state.body.challenge.payload);

    const responses = await Promise.all([
      ctx.http
        .post('/api/terminals/scan')
        .set('Authorization', `Bearer ${firstToken}`)
        .send(body),
      ctx.http
        .post('/api/terminals/scan')
        .set('Authorization', `Bearer ${firstToken}`)
        .send(body),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);

    const adminView = await ctx.http
      .get(`/api/terminals/${terminal.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    const activeDevice = adminView.body.devices.find(
      (device: { revokedAt: string | null }) => device.revokedAt === null,
    );
    await ctx.http
      .delete(`/api/terminals/${terminal.body.id}/devices/${activeDevice.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    await ctx.http
      .get('/api/terminals/kiosk')
      .set('Authorization', `Bearer ${paired.body.deviceToken}`)
      .expect(401);
  });

  it('keeps physical clock-out audit data on the final segment after a split', async () => {
    const { hrToken, firstToken } = await actors();
    const terminal = await createTerminal(hrToken);
    const paired = await pairTerminal(hrToken, terminal.body.id);
    const inState = await kiosk(paired.body.deviceToken);
    const clockedIn = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send(scanBody(inState.body.challenge.payload))
      .expect(201);
    const physicalClockIn = new Date(Date.now() - 20 * 60_000);
    await ctx.prisma.timeEntry.update({
      where: { id: clockedIn.body.entry.id },
      data: { clockIn: physicalClockIn },
    });

    const outState = await kiosk(paired.body.deviceToken);
    const clockedOut = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${firstToken}`)
      .send(scanBody(outState.body.challenge.payload))
      .expect(201);
    const splitAt = new Date(physicalClockIn.getTime() + 10 * 60_000);
    const split = await ctx.http
      .post(`/api/timeentries/${clockedOut.body.entry.id}/split`)
      .set('Authorization', `Bearer ${firstToken}`)
      .send({ at: splitAt.toISOString() })
      .expect(201);

    expect(split.body.first.clockOutTerminalId).toBeNull();
    expect(split.body.first.clockOutChallengeId).toBeNull();
    expect(split.body.first.clockOutTerminalDistanceMeters).toBeNull();
    expect(split.body.first.clockOutTerminalRadiusMeters).toBeNull();
    expect(split.body.first.clockOutTerminalMaxAccuracyMeters).toBeNull();
    expect(split.body.first.clockOutPositionTimestamp).toBeNull();
    expect(split.body.second.clockOutTerminalId).toBe(terminal.body.id);
    expect(split.body.second.clockOutChallengeId).toBe(
      clockedOut.body.entry.clockOutChallengeId,
    );
    expect(split.body.second.clockOutTerminalDistanceMeters).toBe(0);
    expect(split.body.second.clockOutTerminalRadiusMeters).toBe(
      TERMINAL_INPUT.radiusMeters,
    );
    expect(split.body.second.clockOutTerminalMaxAccuracyMeters).toBe(
      TERMINAL_INPUT.maxAccuracyMeters,
    );
    expect(split.body.second.clockOutPositionTimestamp).toBeTruthy();
    const redemption =
      await ctx.prisma.terminalChallengeRedemption.findFirstOrThrow({
        where: {
          action: 'clock-out',
          challengeId: clockedOut.body.entry.clockOutChallengeId,
        },
      });
    expect(redemption.timeEntryId).toBe(split.body.second.id);
  });

  it('throttles repeated invalid pairing guesses by connection peer', async () => {
    let limitedResponse: Awaited<ReturnType<typeof ctx.http.post>> | undefined;
    for (let requestNo = 0; requestNo < 31; requestNo += 1) {
      const response = await ctx.http
        .post('/api/terminals/pair')
        .send({ pairingCode: 'AAAAA-AAAAA' });
      if (response.status === 429) {
        limitedResponse = response;
        break;
      }
      expect(response.status).toBe(401);
    }
    expect(limitedResponse?.body.code).toBe('TERMINAL_PAIR_RATE_LIMITED');
    expect(Number(limitedResponse?.headers['retry-after'])).toBeGreaterThan(0);
  });
});
