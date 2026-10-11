import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';

// Deliberately fixed: this test may restart one API and create synthetic records.
// It never runs against the production Compose project or an arbitrary database.
const PROJECT = 'openclockwork-pin-test';
const DATABASE = 'openclockwork_test_pin';
const CONTAINER_ID = /^[a-f0-9]{12,64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
let stage = 'target validation';

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function docker(args, input = '') {
  return new Promise((resolve, reject) => {
    // No shell, response bodies, credentials in argv, inherited test-secret
    // assignments, or file-backed IPC. Child output stays in private memory.
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let bytes = 0;
    const timer = setTimeout(() => child.kill(), 45_000);
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 1_048_576) child.kill();
      else output += chunk.toString();
    });
    // Never forward Docker/Node/HTTP errors, which may contain request data.
    child.stderr.on('data', () => {});
    child.on('error', () => {
      clearTimeout(timer);
      reject(new Error('Docker command unavailable'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || bytes > 1_048_576)
        reject(new Error('Docker command failed'));
      else resolve(output);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function containers(service) {
  const output = await docker([
    'ps',
    '--filter',
    `label=com.docker.compose.project=${PROJECT}`,
    '--filter',
    `label=com.docker.compose.service=${service}`,
    '--filter',
    'status=running',
    '--format',
    '{{.ID}}',
  ]);
  const ids = output.trim().split(/\s+/).filter(Boolean);
  check(
    ids.every((id) => CONTAINER_ID.test(id)),
    'Invalid container identity',
  );
  check(new Set(ids).size === ids.length, 'Duplicate container identity');
  return ids.sort();
}

async function inspect(id, format) {
  check(CONTAINER_ID.test(id), 'Invalid container identity');
  return JSON.parse(await docker(['inspect', '--format', format, id]));
}

// Each execution runs inside a specific API container, whose existing runtime
// connection is checked without exposing it. Secrets in the payload reach Node
// only via docker exec stdin; JSON stdout is a private pipe back to this process.
async function inContainer(id, payload) {
  check(CONTAINER_ID.test(id), 'Invalid container identity');
  const program = `
    const fs = require('node:fs');
    const { Client } = require('pg');
    const input = ${JSON.stringify(payload)};
    async function main() {
      const target = new URL(process.env.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(target.protocol)
        || target.hostname !== 'db' || target.pathname !== '/${DATABASE}'
        || target.searchParams.get('schema') !== 'public'
        || process.env.NODE_ENV !== 'production' || process.env.API_PORT !== '3000')
        throw new Error('Refused target');
      if (input.kind === 'http') {
        if (!/^\\/api\\//.test(input.path) || input.path.includes('..')) throw new Error('Refused route');
        const response = await fetch('http://127.0.0.1:3000' + input.path, {
          method: input.method, redirect: 'error', signal: AbortSignal.timeout(15000),
          headers: { 'Content-Type': 'application/json', ...(input.token ? { Authorization: 'Bearer ' + input.token } : {}) },
          ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
        });
        const content = await response.text();
        return { status: response.status, body: content ? JSON.parse(content) : null };
      }
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      try {
        const { rows: [connected] } = await client.query('SELECT current_database() AS database, current_schema() AS schema');
        if (connected.database !== '${DATABASE}' || connected.schema !== 'public') throw new Error('Refused database');
        if (input.kind === 'validate') {
          const count = fs.readdirSync('/proc').filter((pid) => /^\\d+$/.test(pid)).filter((pid) => {
            try {
              const argv = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\\0');
              return /(?:^|\\/)node$/.test(argv[0] ?? '') && argv.includes('dist/main.js');
            } catch { return false; }
          }).length;
          if (count !== 1) throw new Error('Expected one real API server process');
          return { ...connected, serverProcesses: count };
        }
        if (input.kind !== 'entries' || !/^[a-f0-9-]{36}$/.test(input.employeeId)) throw new Error('Refused query');
        const { rows: [counts] } = await client.query(
          'SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE "clockOut" IS NULL AND "voidedAt" IS NULL)::int AS open FROM "TimeEntry" WHERE "employeeId" = $1::uuid',
          [input.employeeId]);
        return counts;
      } finally { await client.end(); }
    }
    main().then((result) => process.stdout.write(JSON.stringify(result))).catch(() => {
      process.stderr.write('Synthetic runtime check failed'); process.exitCode = 1;
    });
  `;
  return JSON.parse(await docker(['exec', '-i', id, 'node'], program));
}

function expectStatus(response, expected) {
  check(response.status === expected, 'Unexpected HTTP status');
  return response.body;
}

async function main() {
  const started = performance.now();
  const origin = new URL(
    process.env.TERMINAL_RUNTIME_TEST_ORIGIN ?? 'http://localhost:18082',
  );
  check(
    origin.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) &&
      Number(origin.port) >= 18000 &&
      Number(origin.port) <= 65535 &&
      !origin.username &&
      !origin.password &&
      origin.pathname === '/' &&
      !origin.search &&
      !origin.hash,
    'Only an explicit high loopback HTTP port is allowed',
  );
  check(
    !process.env.DOCKER_HOST || process.env.DOCKER_HOST.startsWith('unix://'),
    'Only local Docker sockets are allowed',
  );
  const endpoint = (
    await docker([
      'context',
      'inspect',
      '--format',
      '{{.Endpoints.docker.Host}}',
    ])
  ).trim();
  check(
    endpoint.startsWith('unix://'),
    'Only a local Docker context is allowed',
  );
  const api = await containers('api');
  const web = await containers('web');
  const db = await containers('db');
  check(
    api.length === 3 && web.length === 1 && db.length === 1,
    'Expected exactly three APIs and one local web/database stack',
  );
  for (const [service, ids] of [
    ['api', api],
    ['web', web],
    ['db', db],
  ]) {
    for (const id of ids) {
      const labels = await inspect(id, '{{json .Config.Labels}}');
      check(
        labels['com.docker.compose.project'] === PROJECT &&
          labels['com.docker.compose.service'] === service,
        'Compose identity differs from the synthetic target',
      );
    }
  }
  const bindings = await inspect(web[0], '{{json .HostConfig.PortBindings}}');
  check(
    bindings['8080/tcp']?.some(
      (binding) =>
        ['127.0.0.1', '::1'].includes(binding.HostIp) &&
        binding.HostPort === origin.port,
    ),
    'Loopback origin is not the selected Compose web port',
  );
  const validated = await Promise.all(
    api.map((id) => inContainer(id, { kind: 'validate' })),
  );
  check(
    validated.every(
      (value) =>
        value.database === DATABASE &&
        value.schema === 'public' &&
        value.serverProcesses === 1,
    ),
    'All three real API processes must share the protected synthetic database',
  );

  async function http(method, path, body, token) {
    const response = await fetch(new URL(path, origin), {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const content = await response.text();
    return {
      status: response.status,
      body: content ? JSON.parse(content) : null,
    };
  }
  const direct = (id, method, path, body, token) =>
    inContainer(id, { kind: 'http', method, path, body, token });
  stage = 'synthetic fixture';
  const loggedIn = expectStatus(
    await http('POST', '/api/auth/login', {
      email: 'hannah.roth@openclockwork.test',
      password: 'openclockwork',
    }),
    200,
  );
  check(
    loggedIn.employee?.role === 'HRAdmin' &&
      typeof loggedIn.accessToken === 'string',
    'Synthetic HR login required',
  );
  const hrToken = loggedIn.accessToken;
  const installation = expectStatus(
    await http('GET', '/api/installation', undefined, hrToken),
    200,
  );
  check(installation.mode === 'Team', 'Synthetic target must use Team mode');
  const suffix = randomUUID();
  const personalNo = `PIN-OS-${suffix.slice(0, 12)}`;
  let employeeId;
  let terminalId;
  let deviceToken;
  let pin;
  let cleanupFailed = false;
  let completed = false;
  try {
    const employee = expectStatus(
      await http(
        'POST',
        '/api/employees',
        {
          personalNo,
          firstName: 'Synthetic',
          lastName: 'Process Smoke',
          email: `pin-process-${suffix}@openclockwork.test`,
          password: randomBytes(24).toString('base64url'),
          role: 'Employee',
          timeModel: 'Vollzeit',
          weeklyHours: 40,
          annualLeaveDays: 30,
          startDate: '2020-01-01',
          holidayCalendar: 'NONE',
        },
        hrToken,
      ),
      201,
    );
    check(UUID.test(employee.id), 'Invalid synthetic employee identity');
    employeeId = employee.id;
    const reset = expectStatus(
      await http(
        'POST',
        `/api/employees/${employeeId}/terminal-credentials/pin/reset`,
        {},
        hrToken,
      ),
      201,
    );
    check(/^\d{8}$/.test(reset.pin), 'Expected synthetic eight-digit PIN');
    pin = reset.pin;
    const terminal = expectStatus(
      await http(
        'POST',
        '/api/terminals',
        {
          name: `Synthetic process smoke ${suffix.slice(0, 8)}`,
          displayText: 'Synthetic process acceptance',
          locationLabel: 'Synthetic process test',
          timeZone: 'Europe/Berlin',
          enforceGeofence: false,
          isActive: true,
          allowedAuthMethods: ['PIN'],
        },
        hrToken,
      ),
      201,
    );
    check(UUID.test(terminal.id), 'Invalid synthetic terminal identity');
    terminalId = terminal.id;
    const pairing = expectStatus(
      await http(
        'POST',
        `/api/terminals/${terminalId}/pairing`,
        undefined,
        hrToken,
      ),
      201,
    );
    const paired = expectStatus(
      await http('POST', '/api/terminals/pair', {
        pairingCode: pairing.pairingCode,
        deviceName: 'Synthetic process smoke kiosk',
      }),
      201,
    );
    deviceToken = paired.deviceToken;
    check(
      typeof deviceToken === 'string' && deviceToken.startsWith('octd_'),
      'Synthetic device token required',
    );
    const challenge = async () =>
      expectStatus(
        await direct(
          api[0],
          'POST',
          '/api/terminals/kiosk/challenge',
          {},
          deviceToken,
        ),
        201,
      ).payload;
    const identify = (id, payload, candidate) =>
      direct(
        id,
        'POST',
        '/api/terminals/kiosk/identify',
        {
          method: 'PIN',
          challengePayload: payload,
          personalNo,
          pin: candidate,
        },
        deviceToken,
      );
    stage = 'cross-process PIN lockout';
    let payload = await challenge();
    const wrong = `${pin[0] === '0' ? '1' : '0'}${pin.slice(1)}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const denied = expectStatus(
        await identify(api[attempt % 3], payload, wrong),
        401,
      );
      check(
        denied.code === 'TERMINAL_AUTH_FAILED',
        'PIN errors must remain neutral',
      );
    }
    for (const id of api) {
      const denied = expectStatus(await identify(id, payload, pin), 401);
      check(
        denied.code === 'TERMINAL_AUTH_FAILED',
        'Shared PIN lockout must hold on every process',
      );
    }
    stage = 'API restart and persisted PIN lockout';
    await docker(['restart', api[1]]);
    let healthy = false;
    for (let attempt = 0; attempt < 30 && !healthy; attempt += 1) {
      try {
        healthy = (await direct(api[1], 'GET', '/api/health')).status === 200;
      } catch {
        healthy = false;
      }
      if (!healthy) await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    check(healthy, 'Restarted API must recover');
    await inContainer(api[1], { kind: 'validate' });
    payload = await challenge();
    for (const id of api) {
      const denied = expectStatus(await identify(id, payload, pin), 401);
      check(
        denied.code === 'TERMINAL_AUTH_FAILED',
        'PIN lockout must survive a real API restart',
      );
    }
    stage = 'cross-process atomic booking';
    expectStatus(
      await http(
        'POST',
        `/api/employees/${employeeId}/terminal-credentials/pin/unlock`,
        {},
        hrToken,
      ),
      201,
    );
    payload = await challenge();
    const identified = expectStatus(await identify(api[2], payload, pin), 201);
    check(
      identified.action === 'clock-in' && typeof identified.grant === 'string',
      'A fresh explicit clock-in grant is required',
    );
    const bookings = await Promise.all(
      api.map((id) =>
        direct(
          id,
          'POST',
          '/api/terminals/kiosk/book',
          {
            grant: identified.grant,
            action: 'clock-in',
          },
          deviceToken,
        ),
      ),
    );
    const receipts = bookings.map((response) => expectStatus(response, 201));
    check(
      receipts.every(
        (receipt) =>
          receipt.code === 'TERMINAL_BOOKED' &&
          receipt.action === 'clock-in' &&
          JSON.stringify(receipt) === JSON.stringify(receipts[0]),
      ),
      'Parallel processes must return an identical receipt',
    );
    const counts = await inContainer(api[0], { kind: 'entries', employeeId });
    check(
      counts.total === 1 && counts.open === 1,
      'Only one synthetic time entry may be created',
    );
    completed = true;
  } finally {
    const failedStage = stage;
    stage = 'synthetic fixture cleanup';
    if (employeeId && deviceToken && pin) {
      try {
        const counts = await inContainer(api[0], {
          kind: 'entries',
          employeeId,
        });
        if (counts.open) {
          const challenge = expectStatus(
            await direct(
              api[0],
              'POST',
              '/api/terminals/kiosk/challenge',
              {},
              deviceToken,
            ),
            201,
          );
          const identified = expectStatus(
            await direct(
              api[0],
              'POST',
              '/api/terminals/kiosk/identify',
              {
                method: 'PIN',
                challengePayload: challenge.payload,
                personalNo,
                pin,
              },
              deviceToken,
            ),
            201,
          );
          check(
            identified.action === 'clock-out',
            'Cleanup may only close its synthetic running timer',
          );
          expectStatus(
            await direct(
              api[0],
              'POST',
              '/api/terminals/kiosk/book',
              {
                grant: identified.grant,
                action: 'clock-out',
              },
              deviceToken,
            ),
            201,
          );
        }
      } catch {
        cleanupFailed = true;
      }
    }
    if (terminalId) {
      try {
        expectStatus(
          await http(
            'DELETE',
            `/api/terminals/${terminalId}/permanent`,
            undefined,
            hrToken,
          ),
          204,
        );
      } catch {
        cleanupFailed = true;
      }
    }
    if (employeeId) {
      if (pin) {
        try {
          expectStatus(
            await http(
              'DELETE',
              `/api/employees/${employeeId}/terminal-credentials/pin`,
              undefined,
              hrToken,
            ),
            200,
          );
        } catch {
          cleanupFailed = true;
        }
      }
      try {
        expectStatus(
          await http(
            'DELETE',
            `/api/employees/${employeeId}`,
            undefined,
            hrToken,
          ),
          200,
        );
      } catch {
        cleanupFailed = true;
      }
    }
    // Successful time entries and audit are historical synthetic evidence;
    // account deactivation and terminal deletion preserve those records.
    if (!completed) stage = failedStage;
  }
  check(
    completed && !cleanupFailed,
    'Smoke and synthetic cleanup must complete',
  );
  console.log(
    `Terminal PIN runtime smoke PASS: 3 OS processes, 5 rejected PINs, 1 real restart, 3 identical receipts, 1 time entry; synthetic cleanup complete (${Math.round(performance.now() - started)} ms).`,
  );
}

main().catch(() => {
  console.error(
    `Terminal PIN runtime smoke FAILED during ${stage}; request data and credentials are withheld.`,
  );
  process.exitCode = 1;
});
