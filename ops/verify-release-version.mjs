import { readFile } from 'node:fs/promises';

const tag =
  process.argv[2] ?? process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME;

if (!tag) {
  console.error(
    'Release tag missing. Pass vMAJOR.MINOR.PATCH or set RELEASE_TAG.',
  );
  process.exit(1);
}

const stableTagPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
if (!stableTagPattern.test(tag)) {
  console.error(`Invalid stable release tag: ${tag}`);
  process.exit(1);
}

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
const expectedTag = `v${packageJson.version}`;

if (tag !== expectedTag) {
  console.error(
    `Release tag ${tag} does not match package.json version ${packageJson.version}.`,
  );
  process.exit(1);
}

const releaseNotes = await readFile(
  new URL('../RELEASE_NOTES.md', import.meta.url),
  'utf8',
);
if (!releaseNotes.startsWith(`# OpenClockwork ${tag}\n`)) {
  console.error(`RELEASE_NOTES.md must start with "# OpenClockwork ${tag}".`);
  process.exit(1);
}

console.log(`Release metadata verified for ${tag}.`);
