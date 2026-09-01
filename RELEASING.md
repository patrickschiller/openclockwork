# Releasing OpenClockwork

Only publish a release from a green `main` commit. Stable releases follow
semantic versioning and use matching metadata in five places:

- `package.json`: `MAJOR.MINOR.PATCH`
- `apps/api/src/main.ts`, `apps/api/src/generate-openapi.ts`, and the health DTO
  example: `MAJOR.MINOR.PATCH`
- `RELEASE_NOTES.md`: `# OpenClockwork vMAJOR.MINOR.PATCH`
- `.env.prod.example`: `OPENCLOCKWORK_VERSION=MAJOR.MINOR.PATCH`
- Git tag: `vMAJOR.MINOR.PATCH`

## Prepare the release pull request

1. Choose the next semantic version according to the compatibility impact.
2. Update `package.json`, `RELEASE_NOTES.md`, `.env.prod.example`, and any
   additional version examples.
3. Curate highlights, upgrade notes, database migrations, breaking changes,
   Docker image names, and known issues.
4. Ensure every included pull request has a release-note entry or is explicitly
   marked `None`.
5. Run `RELEASE_TAG=vMAJOR.MINOR.PATCH pnpm release:verify-tag` and the full CI
   suite.

## Publish

After the release pull request is merged and `main` is green, create an
annotated tag on the exact merge commit and push it:

```bash
git switch main
git pull --ff-only
git tag -a v1.3.0 -m "OpenClockwork v1.3.0"
git push origin v1.3.0
```

The release workflow verifies the tag and notes, runs Nx and API end-to-end
tests, publishes the API and web images to GHCR, and finally creates a GitHub
Release. GitHub's generated changelog is appended to the curated notes using
the categories in `.github/release.yml`.

For the first publication of each GHCR package, verify its visibility is
**Public** in the GitHub package settings. Public container images can then be
pulled anonymously by self-hosted installations.

## Verify the published release

```bash
docker pull ghcr.io/patrickschiller/openclockwork-api:1.3.0
docker pull ghcr.io/patrickschiller/openclockwork-web:1.3.0
```

Confirm that the GitHub Release is marked latest, contains the curated upgrade
notes, links to the tag, and lists both image tags. Then perform the documented
upgrade smoke test against a backed-up non-production installation.

Release tags and published images are immutable. Correct a faulty release with
a new patch version instead of moving or overwriting its tag.
