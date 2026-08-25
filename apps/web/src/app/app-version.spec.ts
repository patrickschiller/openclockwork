import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from './app-version';

describe('APP_VERSION', () => {
  it('uses the release version from the root package.json', () => {
    const packageJson = JSON.parse(
      readFileSync(path.resolve(process.cwd(), '../../package.json'), 'utf8'),
    ) as { version: string };

    expect(APP_VERSION).toBe(packageJson.version);
  });
});
