import { test, expect } from '@playwright/test';

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
 * default HR admin — see prisma/seed.ts. If your local seed differs, override
 * via the SMOKE_EMAIL / SMOKE_PASSWORD env vars before running the test.
 */
const EMAIL = process.env.SMOKE_EMAIL ?? 'hannah.roth@openclockwork.test';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'openclockwork';

test('login flow lands on the dashboard with the user visible in the header', async ({ page }) => {
  await page.goto('/');

  // Login page renders our branding, not the Nx default greeting.
  await expect(page.getByText('OpenClockwork').first()).toBeVisible();

  await page.getByLabel('E-Mail').fill(EMAIL);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();

  // After login, the dashboard headline is rendered.
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // The header pill carries the user's first name + role. Match loosely
  // because the role chip nests inside the same wrapper.
  await expect(page.getByRole('button').filter({ hasText: 'Hannah' }).first()).toBeVisible();
});

test('the login form refuses bogus credentials with a visible error', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill('nope@nope.nope');
  await page.getByLabel('Passwort').fill('definitely-wrong');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByText(/Invalid credentials/i)).toBeVisible();
});
