import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Smoke test that proves the full stack hangs together:
 *   web (Vite/preview) -> API (NestJS) -> Postgres (Docker).
 *
 * Prereqs to run locally:
 *   docker compose up -d db
 *   pnpm prisma migrate deploy && pnpm prisma db seed
 *   pnpm nx serve api &
 *   pnpm nx dev web &
 *   pnpm nx e2e web-e2e
 *
 * The seed creates `hannah.roth@openclockwork.test` / `openclockwork` as a
 * default HR admin and an active, ready-to-pair `Demo-Empfang` terminal — see
 * prisma/seed.ts. If your local seed differs, override via the SMOKE_EMAIL /
 * SMOKE_PASSWORD env vars before running the test.
 */
const EMAIL = process.env.SMOKE_EMAIL ?? 'hannah.roth@openclockwork.test';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'openclockwork';

// These fixture assertions exercise the German translation explicitly.
// Language detection must no longer depend on an implicit German default.
test.use({ locale: 'de-DE' });

test('login flow lands on the dashboard with account details in the header menu', async ({
  page,
}) => {
  await page.goto('/');

  // Login page renders our branding, not the Nx default greeting.
  await expect(page.getByText('OpenClockwork').first()).toBeVisible();

  await page.getByLabel('E-Mail').fill(EMAIL);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();

  // After login, the dashboard headline is rendered.
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  const accountMenu = page.getByRole('button', { name: 'Kontomenü öffnen' });
  await expect(accountMenu).toBeVisible();
  await accountMenu.click();
  await expect(page.getByText('Hannah Roth', { exact: true })).toBeVisible();
  await expect(page.getByText(EMAIL, { exact: true })).toBeVisible();
  await expect(
    page.getByText('Rolle: HR-Admin', { exact: true }),
  ).toBeVisible();
});

test('the login form refuses bogus credentials with a visible error', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill('nope@nope.nope');
  await page.getByLabel('Passwort').fill('definitely-wrong');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByText(/Invalid credentials/i)).toBeVisible();
});

test('the unpaired kiosk is public and uses its dedicated home-screen manifest', async ({
  page,
}) => {
  await page.goto('/kiosk');

  await expect(
    page.getByRole('heading', { name: 'Terminal koppeln' }),
  ).toBeVisible();
  await expect(page.getByLabel('E-Mail')).toHaveCount(0);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/kiosk.webmanifest',
  );
});

test('the demo seed includes an active terminal ready for tablet pairing', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(EMAIL);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.goto('/admin/settings/terminals');
  await expect(
    page.getByRole('heading', { name: 'Login-Terminals' }),
  ).toBeVisible();
  const terminalCard = page
    .getByText('Demo-Empfang', { exact: true })
    .locator(
      'xpath=ancestor::div[.//button[normalize-space()="Tablet koppeln"]][1]',
    );
  await expect(terminalCard).toBeVisible();
  await expect(terminalCard.getByText('Musterfirma – Empfang')).toBeVisible();
  await expect(
    terminalCard.getByText('nicht gekoppelt', { exact: true }),
  ).toBeVisible();
  await expect(
    terminalCard.getByRole('button', { name: 'Tablet koppeln' }),
  ).toBeEnabled();
});

test('login page has no critical or serious WCAG-2.1-AA accessibility violations', async ({
  page,
}) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  if (blocking.length > 0) {
    // Surface a readable summary in the test failure.
    console.log(
      JSON.stringify(
        blocking.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
        })),
        null,
        2,
      ),
    );
  }
  expect(blocking).toEqual([]);
});

test('dashboard has no critical or serious WCAG-2.1-AA accessibility violations', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(EMAIL);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  if (blocking.length > 0) {
    console.log(
      JSON.stringify(
        blocking.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
        })),
        null,
        2,
      ),
    );
  }
  expect(blocking).toEqual([]);
});
