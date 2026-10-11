import { randomUUID } from 'node:crypto';
import {
  test as base,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

type TerminalFixture = {
  employeeId: string;
  personalNo: string;
  pin: string;
  pairingCode: string;
};

function assertLocalTestTarget(baseURL: string | undefined) {
  const target = new URL(baseURL ?? 'http://invalid.test');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(
    target.hostname,
  );
  expect(
    Boolean(process.env.BASE_URL) &&
      loopback &&
      ['http:', 'https:'].includes(target.protocol) &&
      Number(target.port) >= 18_000 &&
      !target.username &&
      !target.password,
    'Terminal PIN tests require an explicit loopback BASE_URL with a test port >= 18000.',
  ).toBe(true);
}

/** Real API + isolated synthetic records. Never target a production installation. */
const test = base.extend<{ terminal: TerminalFixture }>({
  terminal: async ({ request, baseURL }, use) => {
    // Check before the first request: these tests create and revoke HR records.
    assertLocalTestTarget(baseURL);
    const login = await request.post('/api/auth/login', {
      data: {
        email: process.env.SMOKE_EMAIL ?? 'hannah.roth@openclockwork.test',
        password: process.env.SMOKE_PASSWORD ?? 'openclockwork',
      },
    });
    expect(login.ok()).toBe(true);
    const { accessToken } = await login.json();
    const headers = { Authorization: `Bearer ${accessToken}` };
    const suffix = randomUUID().slice(0, 12);
    const personalNo = `00-pin-${suffix}`;
    let employeeId: string | undefined;
    let terminalId: string | undefined;
    try {
      const employee = await request.post('/api/employees', {
        headers,
        data: {
          personalNo,
          firstName: 'Synthetic',
          lastName: 'Terminal',
          email: `pin-${suffix}@example.test`,
          password: 'synthetic-test-password',
          role: 'Employee',
          timeModel: 'Gleitzeit',
          weeklyHours: 40,
          annualLeaveDays: 20,
          startDate: '2020-01-01',
          holidayCalendar: 'NONE',
          managerId: null,
          workScheduleId: null,
        },
      });
      expect(employee.ok()).toBe(true);
      const employeeRecord = (await employee.json()) as { id: string };
      employeeId = employeeRecord.id;
      const created = await request.post('/api/terminals', {
        headers,
        data: {
          name: `PIN E2E ${suffix}`,
          displayText: 'Synthetic PIN terminal',
          locationLabel: 'Test location',
          logoUrl: null,
          timeZone: 'Europe/Berlin',
          enforceGeofence: false,
          latitude: null,
          longitude: null,
          radiusMeters: null,
          maxAccuracyMeters: null,
          isActive: true,
          allowedAuthMethods: ['PIN'],
        },
      });
      expect(created.ok()).toBe(true);
      terminalId = (await created.json()).id;
      const reset = await request.post(
        `/api/employees/${employeeId}/terminal-credentials/pin/reset`,
        { headers, data: {} },
      );
      expect(reset.ok()).toBe(true);
      const { pin } = await reset.json();
      const pairing = await request.post(
        `/api/terminals/${terminalId}/pairing`,
        { headers },
      );
      expect(pairing.ok()).toBe(true);
      const { pairingCode } = await pairing.json();
      await use({
        employeeId: employeeRecord.id,
        personalNo,
        pin,
        pairingCode,
      });
    } finally {
      await cleanup(request, headers, terminalId, employeeId);
    }
  },
});

async function cleanup(
  request: APIRequestContext,
  headers: Record<string, string>,
  terminalId?: string,
  employeeId?: string,
) {
  if (terminalId)
    await request.delete(`/api/terminals/${terminalId}/permanent`, { headers });
  if (employeeId)
    await request.delete(`/api/employees/${employeeId}`, { headers });
}

test.use({ locale: 'de-DE', trace: 'off', screenshot: 'off', video: 'off' });

async function pair(page: Page, terminal: TerminalFixture) {
  await page.goto(`/kiosk?pairing=${encodeURIComponent(terminal.pairingCode)}`);
  await expect(
    page.getByRole('button', { name: 'Mit PIN anmelden' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/kiosk$/);
}

async function identify(
  page: Page,
  terminal: TerminalFixture,
  pin = terminal.pin,
) {
  await page.getByRole('button', { name: 'Mit PIN anmelden' }).click();
  await page
    .getByLabel('Personalnummer', { exact: true })
    .fill(terminal.personalNo);
  await page.getByLabel('Terminal-PIN', { exact: true }).fill(pin);
  await page.getByRole('button', { name: 'Anmeldung prüfen' }).click();
}

test('Terminal PIN: paired PIN-only terminal explicitly clocks in and out without an employee session', async ({
  page,
  terminal,
}) => {
  await pair(page, terminal);
  await expect(
    page.getByAltText('Kurzzeitig gültiger QR-Code für dieses Terminal'),
  ).toHaveCount(0);
  await identify(page, terminal);
  await expect(
    page.getByRole('heading', { name: /Buchung für Synthetic T/ }),
  ).toBeVisible();
  await expect(
    page.getByText('Einstempeln bestätigt', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Jetzt einstempeln' }).click();
  await expect(
    page.getByText('Einstempeln bestätigt', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Vorgang beenden' }).click();
  await identify(page, terminal);
  await page.getByRole('button', { name: 'Jetzt ausstempeln' }).click();
  await expect(
    page.getByText('Ausstempeln bestätigt', { exact: true }),
  ).toBeVisible();
  const hasEmployeeSession = await page.evaluate(() => {
    const storage = (
      globalThis as unknown as {
        localStorage: { getItem(key: string): string | null };
      }
    ).localStorage;
    return Boolean(
      storage.getItem('openclockwork.accessToken') ||
      storage.getItem('openclockwork.refreshToken'),
    );
  });
  expect(hasEmployeeSession).toBe(false);
  await expect(page.getByLabel('Terminal-PIN', { exact: true })).toHaveCount(0);
});

test('Terminal PIN: incorrect PIN preserves pairing and cancellation does not clock in', async ({
  page,
  terminal,
}) => {
  await pair(page, terminal);
  await identify(
    page,
    terminal,
    terminal.pin === '00000000' ? '11111111' : '00000000',
  );
  await expect(page.getByText(/Anmeldung nicht möglich/)).toBeVisible();
  const paired = await page.evaluate(() => {
    const storage = (
      globalThis as unknown as {
        localStorage: { getItem(key: string): string | null };
      }
    ).localStorage;
    return Boolean(storage.getItem('openclockwork.terminalDeviceToken'));
  });
  expect(paired).toBe(true);
  await identify(page, terminal);
  await expect(
    page.getByRole('button', { name: 'Jetzt einstempeln' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Vorgang beenden' }).click();
  await expect(page.getByRole('heading', { name: /Buchung für/ })).toHaveCount(
    0,
  );
  await identify(page, terminal);
  await expect(
    page.getByRole('button', { name: 'Jetzt einstempeln' }),
  ).toBeVisible();
});

test('Terminal PIN: HR can inspect PIN status and the real audit log without redisplaying a PIN', async ({
  page,
  terminal,
}) => {
  await page.goto('/');
  await page
    .getByLabel('E-Mail')
    .fill(process.env.SMOKE_EMAIL ?? 'hannah.roth@openclockwork.test');
  await page
    .getByLabel('Passwort')
    .fill(process.env.SMOKE_PASSWORD ?? 'openclockwork');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.goto('/admin/employees');
  const row = page.getByRole('row').filter({ hasText: terminal.personalNo });
  await row.getByRole('button', { name: 'Terminal-PIN verwalten' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('PIN aktiv', { exact: true })).toBeVisible();
  await expect(dialog.locator('output')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();

  await page.goto('/admin/settings/terminals');
  await page.getByRole('button', { name: 'Protokoll laden' }).click();
  await page.getByLabel('Methode', { exact: true }).selectOption('PIN');
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: terminal.employeeId })
      .filter({
        has: page.locator('[title="PinReset"]'),
      }),
  ).toBeVisible();
  await expect(page.locator('output')).toHaveCount(0);
});
