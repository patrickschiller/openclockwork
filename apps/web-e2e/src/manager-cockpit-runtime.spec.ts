import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

// This opt-in creates only synthetic fixtures in the one isolated local stack.
// It cannot be pointed at an arbitrary deployment, and retains no auth traces.
const ENABLED = process.env.COCKPIT_RUNTIME_TEST === '1';
const PASSWORD = 'runtime44-only-synthetic';
function docker(args: string[]): string {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.status !== 0)
    throw new Error('Isolated runtime target validation failed');
  return result.stdout.trim();
}
function validateIsolatedStack() {
  if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://'))
    throw new Error('Remote Docker targets are not permitted');
  if (
    !docker([
      'context',
      'inspect',
      '--format',
      '{{.Endpoints.docker.Host}}',
    ]).startsWith('unix://')
  )
    throw new Error('Expected local Docker context');
  const container = (service: string) => {
    const ids = docker([
      'ps',
      '--filter',
      'label=com.docker.compose.project=openclockwork-all-five',
      '--filter',
      `label=com.docker.compose.service=${service}`,
      '--filter',
      'status=running',
      '--format',
      '{{.ID}}',
    ])
      .split(/\s+/)
      .filter(Boolean);
    if (ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0]))
      throw new Error('Expected exactly one isolated runtime service');
    return ids[0];
  };
  const api = container('api'),
    web = container('web');
  container('db');
  const env = (id: string) =>
    JSON.parse(
      docker(['inspect', '--format', '{{json .Config.Env}}', id]),
    ) as string[];
  // Validate in private memory; never include the environment or URL in errors.
  try {
    const apiEnv = env(api),
      webEnv = env(web);
    const database = new URL(
      (apiEnv.find((value) => value.startsWith('DATABASE_URL=')) ?? '').slice(
        13,
      ),
    );
    if (
      database.hostname !== 'db' ||
      database.pathname !== '/openclockwork_test' ||
      !apiEnv.includes('NODE_ENV=production') ||
      !webEnv.includes('API_UPSTREAM=http://api:3000')
    )
      throw new Error();
    const ports = JSON.parse(
      docker(['inspect', '--format', '{{json .NetworkSettings.Ports}}', web]),
    ) as Record<string, Array<{ HostIp: string; HostPort: string }>>;
    if (
      !ports['8080/tcp']?.some(
        (port) => port.HostIp === '127.0.0.1' && port.HostPort === '18050',
      )
    )
      throw new Error();
  } catch {
    throw new Error(
      'Runtime stack is not the expected isolated synthetic database and loopback proxy',
    );
  }
}

function runtimeOrigin(baseURL: string | undefined) {
  const origin = new URL(baseURL ?? '');
  expect(origin.protocol).toBe('http:');
  expect(['localhost', '127.0.0.1']).toContain(origin.hostname);
  expect(origin.port).toBe('18050');
  expect(origin.pathname).toBe('/');
}
function required<T>(value: T | undefined): T {
  if (!value) throw new Error('Expected isolated synthetic demo role');
  return value;
}

test.use({ locale: 'de-DE', timezoneId: 'America/New_York' });

type Person = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};
type Entry = {
  id: string;
  employeeId: string;
  revision: number;
  clockIn: string;
  clockOut: string | null;
  status: string;
};
type Application = {
  id: string;
  employeeId: string;
  workflowState: string;
  updatedAt: string;
};
async function call<T>(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  expected: number,
  token?: string,
  data?: object,
): Promise<T> {
  const response = await request.fetch(path, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    ...(data ? { data } : {}),
  });
  expect(response.status(), `${method} ${path}`).toBe(expected);
  return response.json() as Promise<T>;
}
async function token(
  request: APIRequestContext,
  email: string,
  password = 'openclockwork',
) {
  return (
    await call<{ accessToken: string }>(
      request,
      'POST',
      '/api/auth/login',
      200,
      undefined,
      { email, password },
    )
  ).accessToken;
}
async function login(page: Page, email: string, password = 'openclockwork') {
  await page.goto('/');
  await page.getByLabel('E-Mail', { exact: true }).fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/auth/login') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(
    page.getByRole('button', { name: 'Kontomenü öffnen' }),
  ).toBeVisible();
}
function dayOffset(today: string, offset: number) {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
function berlinInstant(date: string, time: string) {
  const zone = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Berlin',
    timeZoneName: 'longOffset',
  })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((part) => part.type === 'timeZoneName')?.value;
  if (!zone) throw new Error('Expected explicit Berlin offset');
  return new Date(
    `${date}T${time}:00${zone === 'GMT' ? '+00:00' : zone.replace('GMT', '')}`,
  ).toISOString();
}

test('manager cockpit runtime: real proxy operations, both approval lanes, employee stop and full history', async ({
  browser,
  page,
  request,
  baseURL,
}) => {
  // This test mutates fixtures only after explicit isolated-stack opt-in.
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(
    !ENABLED,
    'Explicit isolated combined-stack runtime opt-in required',
  );
  test.setTimeout(180_000);
  runtimeOrigin(baseURL);
  validateIsolatedStack();
  const hrToken = await token(request, 'hannah.roth@openclockwork.test');
  const managerToken = await token(request, 'marc.becker@openclockwork.test');
  const people = await call<Person[]>(
    request,
    'GET',
    '/api/employees',
    200,
    hrToken,
  );
  const manager = required(
    people.find((person) => person.email === 'marc.becker@openclockwork.test'),
  );
  const foreign = required(
    people.find((person) => person.email === 'fatma.demir@openclockwork.test'),
  );
  const suffix = randomUUID().slice(0, 8);
  const schedule = await call<{ id: string }>(
    request,
    'POST',
    '/api/work-schedules',
    201,
    hrToken,
    {
      name: `Cockpit runtime ${suffix}`,
      description: 'Synthetic runtime fixture',
      frameStart: '07:00',
      frameEnd: '18:00',
      workingDays: 127,
      breakRules: [{ afterMinutes: 360, breakMinutes: 30 }],
      isDefault: false,
      coreTimes: [
        {
          label: 'Synthetic known core',
          start: '09:00',
          end: '11:00',
          weekdays: 127,
        },
      ],
    },
  );
  const employee = await call<Person>(
    request,
    'POST',
    '/api/employees',
    201,
    hrToken,
    {
      personalNo: `SM44-${suffix}`,
      firstName: 'Runtime44',
      lastName: `Smoke${suffix}`,
      email: `runtime44.${suffix}@openclockwork.test`,
      password: PASSWORD,
      role: 'Employee',
      timeModel: 'Vollzeit',
      weeklyHours: 35,
      annualLeaveDays: 30,
      startDate: '2024-01-01',
      managerId: manager.id,
      workScheduleId: schedule.id,
      holidayCalendar: 'NONE',
      holidayDates: [],
    },
  );
  const fullName = `${employee.firstName} ${employee.lastName}`;
  const overview = await call<{ today: string; timeZone: string }>(
    request,
    'GET',
    '/api/team-cockpit',
    200,
    managerToken,
  );
  expect(overview.timeZone).toBe('Europe/Berlin');
  const { today } = overview;
  await call(
    request,
    'POST',
    `/api/employees/${employee.id}/contract-periods`,
    201,
    hrToken,
    {
      effectiveFrom: `${today.slice(0, 4)}-01-01`,
      effectiveTo: null,
      employmentStart: '2024-01-01',
      employmentEnd: null,
      weeklyHours: 35,
      timeModel: 'Vollzeit',
      workingDays: 127,
      holidayCalendar: 'NONE',
      holidayDates: [],
      scheduleLabel: `Cockpit runtime ${suffix}`,
      confirmationNote: 'Explicitly known synthetic runtime contract',
      confirmed: true,
    },
  );
  const employeeToken = await token(request, employee.email, PASSWORD);
  const employeeContext = await browser.newContext({
    baseURL,
    locale: 'de-DE',
    timezoneId: 'America/New_York',
  });
  const hrContext = await browser.newContext({
    baseURL,
    locale: 'de-DE',
    timezoneId: 'America/New_York',
  });
  try {
    await login(page, manager.email);
    await page.goto('/team-cockpit');
    await expect(
      page.getByRole('heading', { name: 'Team-Cockpit', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('option', { name: fullName, exact: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole('option', { name: 'Fatma Demir', exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel('Person für Details und Vertretungsaktionen')
      .selectOption(employee.id);
    const form = page.getByRole('form', { name: 'Im Auftrag erfassen' });
    const submit = form.getByRole('button', {
      name: `Für ${fullName} speichern`,
      exact: true,
    });
    await form
      .getByLabel('Betriebliche Begründung für die Stellvertretung')
      .fill('Synthetic runtime assisted start');
    const startResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/team-cockpit/employees/${employee.id}/clock-in`) &&
        r.request().method() === 'POST',
    );
    await submit.click();
    const started = await startResponse;
    expect(started.status()).toBe(201);
    const open = (await started.json()) as Entry;
    expect(open.employeeId).toBe(employee.id);
    expect(open.clockOut).toBeNull();
    const employeePage = await employeeContext.newPage();
    await login(employeePage, employee.email, PASSWORD);
    await employeePage.goto('/booking');
    const clockOut = employeePage.waitForResponse(
      (r) =>
        r.url().endsWith('/api/timeentries/clock-out') &&
        r.request().method() === 'POST',
    );
    await employeePage
      .getByRole('button', { name: 'Gehen', exact: true })
      .click();
    expect((await clockOut).status()).toBe(201);

    const previous = dayOffset(today, -1);
    await form.getByLabel('Aktion', { exact: true }).selectOption('manual');
    await form.getByLabel('Beginn', { exact: true }).fill(`${previous}T06:17`);
    await form.getByLabel('Ende', { exact: true }).fill(`${previous}T08:47`);
    await form
      .getByLabel('Betriebliche Begründung für die Stellvertretung')
      .fill('Synthetic runtime retrospective entry');
    const manualResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/team-cockpit/employees/${employee.id}/manual`) &&
        r.request().method() === 'POST',
    );
    await submit.click();
    const manualResult = await manualResponse;
    expect(manualResult.status()).toBe(201);
    const manual = (await manualResult.json()) as Entry;
    expect(manual.status).toBe('Pending');
    expect(manual.clockIn).toBe(berlinInstant(previous, '06:17'));
    const audit = await call<Array<{ actorId: string; action: string }>>(
      request,
      'GET',
      `/api/timeentries/${manual.id}/audit`,
      200,
      managerToken,
    );
    expect(
      audit.some(
        (event) =>
          event.actorId === manager.id && event.action === 'ProxyManualCreated',
      ),
    ).toBe(true);
    const ordinary = page.locator(`[data-entry-id="${manual.id}"]`);
    await expect(ordinary).toBeVisible({ timeout: 45_000 });
    const managerApproval = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/timeentries/${manual.id}/approval`) &&
        r.request().method() === 'POST',
    );
    await ordinary
      .getByRole('button', {
        name: 'Als Führungskraft genehmigen',
        exact: true,
      })
      .click();
    expect((await managerApproval).status()).toBe(201);
    const hrPage = await hrContext.newPage();
    await login(hrPage, 'hannah.roth@openclockwork.test');
    await hrPage.goto('/team-cockpit');
    const hrOrdinary = hrPage.locator(`[data-entry-id="${manual.id}"]`);
    await expect(hrOrdinary).toBeVisible({ timeout: 45_000 });
    const hrApproval = hrPage.waitForResponse(
      (r) =>
        r.url().endsWith(`/timeentries/${manual.id}/approval`) &&
        r.request().method() === 'POST',
    );
    await hrOrdinary
      .getByRole('button', { name: 'Als HR bestätigen', exact: true })
      .click();
    const approvedResponse = await hrApproval;
    expect(approvedResponse.status()).toBe(201);
    const approved = ((await approvedResponse.json()) as { entry: Entry })
      .entry;
    expect(approved.status).toBe('Approved');

    const before = await call<Entry[]>(
      request,
      'GET',
      `/api/timeentries?employeeId=${employee.id}`,
      200,
      employeeToken,
    );
    const correction = await call<Application>(
      request,
      'POST',
      '/api/requests',
      201,
      employeeToken,
      {
        employeeId: employee.id,
        type: 'TimeAdjustment',
        targetTimeEntryId: approved.id,
        expectedTargetRevision: approved.revision,
        from: approved.clockIn,
        to: berlinInstant(previous, '09:47'),
        reason: 'Synthetic runtime existing-entry correction',
      },
    );
    const correctionRow = page.locator(`[data-request-id="${correction.id}"]`);
    await expect(correctionRow).toBeVisible({ timeout: 45_000 });
    const managerDecision = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/requests/${correction.id}/manager-approve`) &&
        r.request().method() === 'POST',
    );
    await correctionRow
      .getByRole('button', { name: 'Genehmigen', exact: true })
      .click();
    const firstDecision = await managerDecision;
    expect(firstDecision.status()).toBe(201);
    expect(((await firstDecision.json()) as Application).workflowState).toBe(
      'PendingHr',
    );
    const hrCorrection = hrPage.locator(`[data-request-id="${correction.id}"]`);
    await expect(hrCorrection).toBeVisible({ timeout: 45_000 });
    const finalDecision = hrPage.waitForResponse(
      (r) =>
        r.url().endsWith(`/requests/${correction.id}/hr-confirm`) &&
        r.request().method() === 'POST',
    );
    await hrCorrection
      .getByRole('button', { name: 'HR-bestätigen', exact: true })
      .click();
    const confirmed = await finalDecision;
    expect(confirmed.status()).toBe(201);
    expect(((await confirmed.json()) as Application).workflowState).toBe(
      'Approved',
    );
    const after = await call<Entry[]>(
      request,
      'GET',
      `/api/timeentries?employeeId=${employee.id}`,
      200,
      employeeToken,
    );
    expect(after.map((entry) => entry.id).sort()).toEqual(
      before.map((entry) => entry.id).sort(),
    );
    expect(after.find((entry) => entry.id === manual.id)?.clockOut).toBe(
      berlinInstant(previous, '09:47'),
    );

    const sickness = dayOffset(today, 1);
    await form.getByLabel('Aktion', { exact: true }).selectOption('absence');
    await form
      .getByLabel('Abwesenheitsart', { exact: true })
      .selectOption('Sickness');
    await form
      .getByLabel('Von (einschließlich)', { exact: true })
      .fill(sickness);
    await form
      .getByLabel('Bis (einschließlich)', { exact: true })
      .fill(sickness);
    await form
      .getByLabel('Betriebliche Begründung für die Stellvertretung')
      .fill('Synthetic runtime telephone notification');
    const sickResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/team-cockpit/employees/${employee.id}/absences`) &&
        r.request().method() === 'POST',
    );
    await submit.click();
    expect((await sickResponse).status()).toBe(201);
    const vacation = dayOffset(today, 7);
    await call(
      request,
      'PUT',
      `/api/employees/${employee.id}/leave-allowances/${vacation.slice(0, 4)}`,
      200,
      hrToken,
      {
        baseDays: 30,
        carryOverDays: 0,
        adjustmentDays: 0,
        adjustmentReason: 'Synthetic runtime fixture',
      },
    );
    await form.getByLabel('Aktion', { exact: true }).selectOption('request');
    await form
      .getByLabel('Antragsart', { exact: true })
      .selectOption('Vacation');
    await form
      .getByLabel('Von (einschließlich)', { exact: true })
      .fill(vacation);
    await form
      .getByLabel('Bis (einschließlich)', { exact: true })
      .fill(vacation);
    await form.getByLabel('Erster Tag halb', { exact: true }).check();
    await form
      .getByLabel('Betriebliche Begründung für die Stellvertretung')
      .fill('Synthetic runtime absence application');
    const absenceResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/team-cockpit/employees/${employee.id}/requests`) &&
        r.request().method() === 'POST',
    );
    await submit.click();
    const submittedResponse = await absenceResponse;
    expect(submittedResponse.status()).toBe(201);
    const submitted = (await submittedResponse.json()) as Application;
    expect(submitted.workflowState).toBe('PendingManager');
    expect(submitted.employeeId).toBe(employee.id);
    const history = page.getByRole('region', {
      name: 'Mitarbeiterverlauf',
      exact: true,
    });
    await history.getByLabel('Verlaufszeitraum').selectOption('custom');
    await history.getByLabel('Verlauf von', { exact: true }).fill(previous);
    await history
      .getByLabel('Verlauf bis (einschließlich)', { exact: true })
      .fill(vacation);
    await expect(history.getByText(/Vollständiger Verlauf:/)).toBeVisible();
    const calendar = history.getByRole('region', {
      name: 'Verlaufskalender',
      exact: true,
    });
    await expect(
      calendar.locator(`[data-history-date="${sickness}"]`),
    ).toContainText('Krankheit');
    await expect(
      calendar.locator(`[data-history-date="${vacation}"]`),
    ).toContainText('Urlaub');
    await expect(
      history.getByText(/keine genehmigte Verfügbarkeit/),
    ).toBeVisible();
    await history.getByLabel('Verlaufszeitraum').selectOption('year');
    await expect(history.getByText(/Vollständiger Verlauf:/)).toBeVisible();
    await expect(
      history.getByRole('region', { name: 'Verlaufskalender', exact: true }),
    ).toBeVisible();
    const denied = await request.post(
      `/api/team-cockpit/employees/${foreign.id}/absences`,
      {
        headers: { Authorization: `Bearer ${managerToken}` },
        data: {
          kind: 'Sickness',
          from: sickness,
          to: sickness,
          proxyReason: 'Synthetic denied foreign operation',
        },
      },
    );
    expect(denied.status()).toBe(403);
    const self = await request.post(
      `/api/team-cockpit/employees/${manager.id}/clock-in`,
      {
        headers: { Authorization: `Bearer ${managerToken}` },
        data: { reason: 'Synthetic denied self operation' },
      },
    );
    expect(self.status()).toBe(403);
  } finally {
    await employeeContext.close();
    await hrContext.close();
  }
});
