#!/bin/sh
set -eu

# A newer web bundle can expose controls that an older API does not have. Wait
# for the matching API revision before nginx starts accepting browser traffic,
# otherwise a partially rolled-out installation fails later with opaque Nest
# 404 responses such as "Cannot POST /api/terminals".
expected_version="$({
  sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    /app/package.json
} | head -n 1)"

case "$expected_version" in
  ''|*[!0-9A-Za-z.+-]*)
    echo "Cannot determine a valid web version from /app/package.json" >&2
    exit 1
    ;;
esac

health_url="${API_UPSTREAM%/}/api/health"
attempt=1
max_attempts=15

while [ "$attempt" -le "$max_attempts" ]; do
  health_response="$(wget -qO- --timeout=5 "$health_url" 2>/dev/null || true)"
  if printf '%s' "$health_response" | grep -Fq \
    "\"version\":\"$expected_version\""; then
    echo "Compatible OpenClockwork API $expected_version is ready"
    exit 0
  fi

  if [ "$attempt" -lt "$max_attempts" ]; then
    sleep 2
  fi
  attempt=$((attempt + 1))
done

echo "API at $health_url did not report the required version $expected_version" >&2
echo "Deploy the matching API image before the web image" >&2
exit 1
