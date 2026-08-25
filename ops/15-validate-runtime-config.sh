#!/bin/sh
set -eu

# This script runs before nginx's 20-envsubst-on-templates.sh hook. Values are
# embedded in runtime-config.js, so accept only syntax that cannot terminate the
# generated JavaScript string or expression.
case "${DEMO_MODE:-false}" in
  true|false) ;;
  *)
    echo "DEMO_MODE must be either true or false" >&2
    exit 1
    ;;
esac

case "${SUPPORT_URL:-}" in
  '') ;;
  https://*)
    case "$SUPPORT_URL" in
      *[!A-Za-z0-9:/?\&=%._~+#@,-]*)
        echo "SUPPORT_URL contains unsupported characters" >&2
        exit 1
        ;;
    esac
    ;;
  *)
    echo "SUPPORT_URL must be empty or an absolute HTTPS URL" >&2
    exit 1
    ;;
esac
