import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readAppVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { version?: unknown };
    if (
      typeof packageJson.version === 'string' &&
      packageJson.version.trim().length > 0
    ) {
      return packageJson.version.trim();
    }
  } catch {
    // The production image and supported source checkout both contain the
    // root package.json. Keep health available if a downstream packager omits
    // it, but make the incompatibility visible instead of guessing a version.
  }
  return 'unknown';
}

export const APP_VERSION = readAppVersion();
