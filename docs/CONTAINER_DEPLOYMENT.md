# Container deployment and operations

OpenClockwork runs on a single host with Docker Engine, the Docker Compose
plugin and persistent storage. A server, VM or local machine can run the same
stack. Start with the [production installation steps](../README.md#production-installation-step-by-step)
to configure secrets and create the first account.

## Services and persistent data

| Service | Internal endpoint | Role |
| --- | --- | --- |
| `web` | `web:8080` | Serves the PWA and proxies `/api/` and `/socket.io/` to the API on the same origin |
| `api` | `api:3000` | Runs OpenClockwork and stores attachment files in a mounted volume |
| `db` | `db:5432` | Runs PostgreSQL 16 and stores its data in a mounted volume |

Compose publishes only `web`. On startup the API waits for PostgreSQL and applies
pending Prisma migrations. The web container waits for the matching API version.
With the optional PIN overlay, a separate `migrate` job applies migrations and
sets permissions before the API starts with its restricted database role.

| Volume name setting | Default name | Mount |
| --- | --- | --- |
| `OPENCLOCKWORK_DB_VOLUME` | `openclockwork-db-data-prod` | `db:/var/lib/postgresql/data` |
| `OPENCLOCKWORK_ATTACHMENTS_VOLUME` | `openclockwork-attachments-prod` | `api:/app/data/attachments` |

Use stable volume names for upgrades. When running multiple installations on
one host, give each a distinct Compose project name (`-p`), host port, database
and attachment volume name, and its own `.env.prod` with distinct secrets.
Compose uses the explicit volume names even when the project name changes.
If you supply your own attachment mount, make it writable by the API image's
`app` user and keep `ATTACHMENTS_DIR` on that mount.

## Images and registries

The default Compose file pulls matching versioned API and web images. Set
`OPENCLOCKWORK_VERSION` to a published release. To use a mirror or private
registry, set `OPENCLOCKWORK_API_IMAGE` and `OPENCLOCKWORK_WEB_IMAGE` to the
complete image references, with tags or digests for the same release. Sign in
to a private registry with `docker login <registry>` before pulling. The PIN
migration job uses the same API image setting.

If release images are unavailable for the host architecture, or if you need to
deploy a specific source revision, use the [source-build override](../README.md#variant-b-test-the-current-local-source-tree).
The Dockerfiles build the images with the repository's pinned pnpm version.
For a source build with PIN enabled, set `OPENCLOCKWORK_API_IMAGE=openclockwork-api:local`
in that installation's environment file so the migration job uses the built
image. Include the production file, the source-build override, and the PIN
overlay in that order. Build `api` and `web` before starting the stack.

```bash
oc() {
  docker compose --env-file .env.prod \
    -f docker-compose.prod.yml \
    -f docker-compose.prod.build.yml \
    -f docker-compose.terminal-pin.yml "$@"
}

oc build api web
oc up -d --no-build
```

See the [PIN and audit operations guide (German)](TERMINAL_AUTH_OPERATIONS.de.md)
for the separate migration credentials, API role, secrets and archive requirements.

## HTTPS and network access

For production, use a reverse proxy that serves HTTPS with a certificate
trusted by client devices and redirects HTTP to HTTPS. Caddy is a practical
choice for a new single-host installation. If you already run a reverse proxy,
use it with the settings below.

For a reverse proxy running on the host, use `WEB_BIND_ADDRESS=127.0.0.1` and
an available `WEB_PORT` (default `8080`). Point the proxy at
`http://127.0.0.1:8080` or the selected port. A containerised reverse proxy on
the same Docker network can forward to `http://web:8080`. Bind any published
web port to loopback so users connect through the HTTPS proxy.

The example environment file selects loopback. An existing deployment with
`WEB_BIND_ADDRESS` unset continues to publish the web port on all host interfaces.

- Use a dedicated hostname and forward all paths, including `/api/`, `/kiosk`
  and `/socket.io/`, to `web`. Forward WebSocket upgrades for `/socket.io/`.
- Set `API_CORS_ORIGINS` to the exact browser origin, for example
  `https://time.example.com`. Include non-default ports and omit URL paths.
- Keep PostgreSQL and the API on the private container network. Route users to
  the HTTPS proxy. Camera access, geolocation and the installed PWA require a
  trusted secure origin on client devices.
- Verify that the public URL loads, `GET /api/health` reports the expected
  version, and an authenticated browser can open a WebSocket connection.

### Caddy example

For a public installation, point your hostname's DNS records at the host and
make TCP ports `80` and `443` reachable on Caddy. Caddy obtains and renews the
TLS certificate and redirects HTTP to HTTPS. [Automatic HTTPS](https://caddyserver.com/docs/automatic-https)

Add the Caddy container to the same Docker network as `web`, for example by
adding it as a service in your Compose project. Use this `Caddyfile` with your
hostname. `reverse_proxy` handles WebSocket upgrades.
[Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#streaming)

```caddyfile
time.example.com {
	reverse_proxy web:8080
}
```

With the official Caddy image, mount the directory containing the `Caddyfile`
at `/etc/caddy` and give `/data` a persistent volume for certificates and keys.
If Caddy runs directly on the host, use `reverse_proxy 127.0.0.1:8080` with the
loopback binding and port described above. [Caddy container setup](https://hub.docker.com/_/caddy)

Set `API_CORS_ORIGINS` to the HTTPS origin for your hostname. After starting
the proxy, verify the health endpoint using that same origin.

```bash
curl --fail https://time.example.com/api/health
```

## Daily operations

Run the following commands with the same Compose project, environment file and
ordered file list used for the installation. The function shown here targets
the base release stack. Include any overrides you use, including the PIN
overlay, in each command.

```bash
oc() {
  docker compose --env-file .env.prod -f docker-compose.prod.yml "$@"
}

oc ps
oc logs --tail 100 api web db
curl --fail http://127.0.0.1:8080/api/health
```

Adjust the health URL for your bind address and port. Use `oc stop web api`
to pause application traffic for maintenance and `oc up -d` to resume. Keep
the named volumes when removing or replacing containers. If startup fails,
check `db` and `api` logs for invalid credentials or migration errors, and
check `web` logs for mismatched image versions or a port conflict on the host.

If you use Team leave carry-over expiry, set up a daily job in your host's
scheduler or a scheduler container. Send `POST /api/cron/expire-carryovers`
with `X-Cron-Key` set to the installation's `CRON_API_KEY`. Use the local web
endpoint or a private container network, keep the key in the scheduler's secret
configuration, and monitor failed requests. HR can also trigger expiry from
the application. [API contract](../apps/api/openapi.json)

## Backups, upgrades and moving hosts

Pause writers when capturing a matching PostgreSQL dump and attachment archive.
Back up the private environment file, exact Compose file set, image references
and any database roles and audit keys required by your installation. Keep an
encrypted copy off the Docker host and test restoring it into a separate stack.
The [backup procedure](../UPGRADING.md#1-prepare-and-back-up) includes commands
for both PostgreSQL and file attachments.

For an upgrade, keep the existing Compose project and volume names, deploy
matching API and web versions, and let the documented migration step complete
before serving traffic. For a host move, restore both the database and the
attachment files, preserve the working timezone and secrets, and verify login,
bookings and representative attachment downloads before switching traffic.
See [UPGRADING.md](../UPGRADING.md) for backup, restore and rollback steps.
