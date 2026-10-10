import { readFile } from 'node:fs/promises';
import { currentReleaseNotes } from './release-notes.mjs';

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
currentReleaseNotes(releaseNotes, packageJson.version);

for (const relativePath of [
  'apps/api/src/main.ts',
  'apps/api/src/generate-openapi.ts',
]) {
  const source = await readFile(
    new URL(`../${relativePath}`, import.meta.url),
    'utf8',
  );
  if (!source.includes(`.setVersion('${packageJson.version}')`)) {
    throw new Error(`${relativePath} must use version ${packageJson.version}.`);
  }
}

const spec = JSON.parse(
  await readFile(new URL('../apps/api/openapi.json', import.meta.url), 'utf8'),
);
if (
  spec.info.version !== packageJson.version ||
  spec.components.schemas.HealthResponseDto.properties.version.example !==
    packageJson.version
) {
  throw new Error(
    'Regenerate OpenAPI: API metadata and health example must match the release.',
  );
}

const productionExample = await readFile(
  new URL('../.env.prod.example', import.meta.url),
  'utf8',
);
if (
  !productionExample
    .split(/\r?\n/)
    .includes(`OPENCLOCKWORK_VERSION=${packageJson.version}`)
) {
  throw new Error('.env.prod.example must pin the release version.');
}

console.log(`Release metadata verified for ${tag}.`);
