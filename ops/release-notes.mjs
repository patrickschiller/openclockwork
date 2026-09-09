import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Publish only this release, keeping older notes available in the repository. */
export function currentReleaseNotes(markdown, version) {
  const heading = `# OpenClockwork v${version}\n`;
  if (!markdown.startsWith(heading)) {
    throw new Error(`Release notes must start with ${heading.trim()}`);
  }
  const nextRelease = markdown
    .slice(heading.length)
    .search(/^# OpenClockwork v/m);
  const current =
    nextRelease < 0
      ? markdown
      : markdown.slice(0, heading.length + nextRelease);
  if (!current.slice(heading.length).trim()) {
    throw new Error('The current release notes cannot be empty.');
  }
  return `${current.trimEnd()}\n`;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const pkg = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const notes = await readFile(
    new URL('../RELEASE_NOTES.md', import.meta.url),
    'utf8',
  );
  process.stdout.write(currentReleaseNotes(notes, pkg.version));
}
