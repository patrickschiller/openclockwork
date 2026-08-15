# Upgrading OpenClockwork

OpenClockwork releases use semantic versioning. Read the release notes for the
target version and every skipped version before upgrading. A release may call
out required intermediate versions or manual steps.

The production Docker Compose stack keeps PostgreSQL data in the named volume
`openclockwork-db-data-prod` and local request attachments in
`openclockwork-attachments-prod`. `docker compose up -d` replaces application
containers without deleting either volume. Keep `OPENCLOCKWORK_DB_VOLUME` and
`OPENCLOCKWORK_ATTACHMENTS_VOLUME` unchanged in `.env.prod` across upgrades.

## 1. Prepare and back up

Run these commands from the directory that contains the existing `.env.prod`.
Keep backups outside Docker volumes and test their restoration regularly.

```bash
mkdir -p backups

docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > backups/openclockwork-before-upgrade.dump

docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T api tar -czf - -C /app/data attachments \
  > backups/openclockwork-attachments-before-upgrade.tar.gz
```

If `STORAGE_BACKEND=azure-blob` is configured, back up the Azure container
according to the organisation's storage policy instead of using the attachment
command above.

## 2. Select and pull the release

Set `OPENCLOCKWORK_VERSION` in `.env.prod` to the exact version from the GitHub
Release, for example `1.1.0`. Do not use `latest` for a controlled production
upgrade.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
```

## 3. Apply the update

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

The API waits for PostgreSQL and runs `prisma migrate deploy` before starting.
Prisma records applied migrations in `_prisma_migrations` and skips them on
subsequent starts. Production startup never seeds or resets the database.

Do not run any of the following during an upgrade:

```text
docker compose down -v
prisma migrate reset
pnpm db:reset
pnpm db:demo-reset
```

## 4. Verify the installation

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps

docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T api ./node_modules/.bin/prisma migrate status

curl --fail http://localhost:${WEB_PORT:-8080}/api/health
```

Sign in and verify a known employee, an existing time entry, and any configured
attachment storage before considering the upgrade complete.

## Rollback

Application containers can only be changed back to an earlier
`OPENCLOCKWORK_VERSION` when the release notes explicitly declare the database
compatible with that version. Forward migrations are not automatically
reversed.

For a full rollback, stop application traffic, restore the database backup and
attachment backup, set the previous version in `.env.prod`, and start the stack
again. Restoring overwrites current data, so follow the organisation's incident
and backup procedures rather than attempting an ad-hoc reverse migration.

## Migration policy for contributors

- `prisma/schema.prisma` and committed migrations are the database source of
  truth.
- Never edit a migration that has already reached `main`; add a new migration.
- Prefer expand/contract changes when old and new application versions may
  overlap during deployment.
- Backfill existing rows before adding a required constraint that they do not
  yet satisfy.
- Every schema-changing pull request must pass the Base-to-Head upgrade test
  with existing sentinel data.
