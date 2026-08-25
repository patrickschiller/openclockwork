#!/usr/bin/env bash
set -euo pipefail

# Generate a private, local-only CA and a short-lived TLS certificate for the
# Docker iPad test gateway. All output is written below the gitignored
# .certs/ipad directory. This is intentionally not a production PKI tool.

readonly PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly OUTPUT_DIR="${PROJECT_ROOT}/.certs/ipad"
readonly CA_KEY="${OUTPUT_DIR}/rootCA-key.pem"
readonly CA_CERT="${OUTPUT_DIR}/rootCA.crt"
readonly SERVER_KEY="${OUTPUT_DIR}/openclockwork-ipad-key.pem"
readonly SERVER_CERT="${OUTPUT_DIR}/openclockwork-ipad.pem"

lan_ip=""
lan_hostname=""
force=false
replace_existing=false
ca_config_file=""
config_file=""
csr_file=""
new_key=""
new_cert=""

cleanup() {
  [[ -z "$ca_config_file" ]] || rm -f "$ca_config_file"
  [[ -z "$config_file" ]] || rm -f "$config_file"
  [[ -z "$csr_file" ]] || rm -f "$csr_file"
  [[ -z "$new_key" ]] || rm -f "$new_key"
  [[ -z "$new_cert" ]] || rm -f "$new_cert"
  rm -f "${CA_KEY}.new" "${CA_CERT}.new"
}

usage() {
  printf '%s\n' \
    'Usage: ./ops/generate-ipad-tls.sh [--ip PRIVATE_IPV4] [--hostname LAN_HOSTNAME] [--force]' \
    '' \
    'Without --ip, the script attempts to detect the current private LAN IPv4.' \
    'The optional hostname is added as a DNS SAN (for example clockwork-mac.local).' \
    '--force archives an existing server key/certificate before replacing it.' \
    'The local root CA is retained unless it is incomplete; it is never replaced.'
}

while (($# > 0)); do
  case "$1" in
    --ip)
      [[ $# -ge 2 ]] || { printf 'Missing value for --ip\n' >&2; exit 2; }
      lan_ip="$2"
      shift 2
      ;;
    --hostname)
      [[ $# -ge 2 ]] || { printf 'Missing value for --hostname\n' >&2; exit 2; }
      lan_hostname="$2"
      shift 2
      ;;
    --force)
      force=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

command -v openssl >/dev/null 2>&1 || {
  printf 'OpenSSL is required but was not found in PATH.\n' >&2
  exit 1
}

is_private_ipv4() {
  local candidate="$1"
  local first second third fourth

  [[ "$candidate" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
  first=$((10#${BASH_REMATCH[1]}))
  second=$((10#${BASH_REMATCH[2]}))
  third=$((10#${BASH_REMATCH[3]}))
  fourth=$((10#${BASH_REMATCH[4]}))
  ((first <= 255 && second <= 255 && third <= 255 && fourth <= 255)) || return 1

  ((first == 10)) && return 0
  ((first == 172 && second >= 16 && second <= 31)) && return 0
  ((first == 192 && second == 168)) && return 0
  ((first == 169 && second == 254)) && return 0
  return 1
}

detect_private_ipv4() {
  local candidate=""
  local interface_name=""

  if command -v ipconfig >/dev/null 2>&1; then
    for interface_name in en0 en1; do
      candidate="$(ipconfig getifaddr "$interface_name" 2>/dev/null || true)"
      if is_private_ipv4 "$candidate"; then
        printf '%s' "$candidate"
        return 0
      fi
    done
  fi

  if command -v ip >/dev/null 2>&1; then
    candidate="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }')"
    if is_private_ipv4 "$candidate"; then
      printf '%s' "$candidate"
      return 0
    fi
  fi

  if command -v hostname >/dev/null 2>&1; then
    for candidate in $(hostname -I 2>/dev/null || true); do
      if is_private_ipv4 "$candidate"; then
        printf '%s' "$candidate"
        return 0
      fi
    done
  fi

  return 1
}

if [[ -z "$lan_ip" ]]; then
  lan_ip="$(detect_private_ipv4 || true)"
fi

if ! is_private_ipv4 "$lan_ip"; then
  printf '%s\n' \
    'Could not determine a private LAN IPv4 address.' \
    'Run the command again with, for example: --ip 192.168.178.42' >&2
  exit 1
fi

if [[ -n "$lan_hostname" ]] && ! [[ "$lan_hostname" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]; then
  printf 'Invalid LAN hostname: %s\n' "$lan_hostname" >&2
  exit 1
fi

umask 077
mkdir -p "$OUTPUT_DIR"
chmod 700 "$OUTPUT_DIR"
trap cleanup EXIT HUP INT TERM

if [[ -e "$CA_KEY" || -e "$CA_CERT" ]]; then
  if [[ ! -f "$CA_KEY" || ! -f "$CA_CERT" ]]; then
    printf '%s\n' \
      "Incomplete local CA in ${OUTPUT_DIR}." \
      'Move the remaining rootCA file aside manually, then retry.' >&2
    exit 1
  fi
else
  printf 'Creating private local test CA in %s\n' "$OUTPUT_DIR"
  ca_config_file="$(mktemp "${OUTPUT_DIR}/openssl-ca.XXXXXX.cnf")"
  {
    printf '%s\n' \
      '[req]' \
      'prompt = no' \
      'distinguished_name = ca_subject' \
      'x509_extensions = ca_extensions' \
      '' \
      '[ca_subject]' \
      'CN = OpenClockwork Local iPad Test CA' \
      'O = OpenClockwork Local Development' \
      '' \
      '[ca_extensions]' \
      'basicConstraints = critical,CA:TRUE,pathlen:0' \
      'keyUsage = critical,keyCertSign,cRLSign' \
      'subjectKeyIdentifier = hash'
  } > "$ca_config_file"
  openssl genrsa -out "${CA_KEY}.new" 3072 >/dev/null 2>&1
  openssl req -x509 -new -sha256 \
    -key "${CA_KEY}.new" \
    -days 3650 \
    -config "$ca_config_file" \
    -extensions ca_extensions \
    -out "${CA_CERT}.new"
  mv "${CA_KEY}.new" "$CA_KEY"
  mv "${CA_CERT}.new" "$CA_CERT"
  rm -f "$ca_config_file"
  ca_config_file=""
fi

chmod 600 "$CA_KEY"
chmod 644 "$CA_CERT"
openssl x509 -in "$CA_CERT" -checkend 86400 -noout >/dev/null || {
  printf 'The local CA certificate is invalid or expired: %s\n' "$CA_CERT" >&2
  exit 1
}
ca_cert_public_key="$(openssl x509 -in "$CA_CERT" -pubkey -noout | openssl pkey -pubin -outform DER 2>/dev/null | openssl dgst -sha256)"
ca_private_public_key="$(openssl pkey -in "$CA_KEY" -pubout -outform DER 2>/dev/null | openssl dgst -sha256)"
if [[ "$ca_cert_public_key" != "$ca_private_public_key" ]]; then
  printf 'The local CA certificate and private key do not match. Refusing to continue.\n' >&2
  exit 1
fi

if [[ -e "$SERVER_KEY" || -e "$SERVER_CERT" ]]; then
  if [[ "$force" != true ]]; then
    printf '%s\n' \
      'A server key or certificate already exists.' \
      'Re-run with --force to archive and replace the existing pair.' >&2
    exit 1
  fi

  replace_existing=true
fi

config_file="$(mktemp "${OUTPUT_DIR}/openssl.XXXXXX.cnf")"
csr_file="$(mktemp "${OUTPUT_DIR}/server.XXXXXX.csr")"
new_key="$(mktemp "${OUTPUT_DIR}/server-key.XXXXXX.pem")"
new_cert="$(mktemp "${OUTPUT_DIR}/server-cert.XXXXXX.pem")"

{
  printf '%s\n' \
    '[req]' \
    'prompt = no' \
    'distinguished_name = subject' \
    'req_extensions = request_extensions' \
    '' \
    '[subject]' \
    'CN = OpenClockwork iPad Local Test' \
    'O = OpenClockwork Local Development' \
    '' \
    '[request_extensions]' \
    'subjectAltName = @subject_alt_names' \
    '' \
    '[certificate_extensions]' \
    'basicConstraints = critical,CA:FALSE' \
    'keyUsage = critical,digitalSignature,keyEncipherment' \
    'extendedKeyUsage = serverAuth' \
    'subjectKeyIdentifier = hash' \
    'authorityKeyIdentifier = keyid,issuer' \
    'subjectAltName = @subject_alt_names' \
    '' \
    '[subject_alt_names]' \
    'DNS.1 = localhost' \
    'IP.1 = 127.0.0.1' \
    "IP.2 = ${lan_ip}"
  if [[ -n "$lan_hostname" ]]; then
    printf 'DNS.2 = %s\n' "$lan_hostname"
  fi
} > "$config_file"

openssl genrsa -out "$new_key" 3072 >/dev/null 2>&1
openssl req -new -sha256 \
  -key "$new_key" \
  -config "$config_file" \
  -out "$csr_file"

serial_hex="$(openssl rand -hex 16)"
openssl x509 -req -sha256 \
  -in "$csr_file" \
  -CA "$CA_CERT" \
  -CAkey "$CA_KEY" \
  -set_serial "0x${serial_hex}" \
  -days 397 \
  -extfile "$config_file" \
  -extensions certificate_extensions \
  -out "$new_cert" >/dev/null

openssl verify -CAfile "$CA_CERT" "$new_cert" >/dev/null
openssl x509 -in "$new_cert" -checkend 86400 -noout >/dev/null

if [[ "$replace_existing" == true ]]; then
  archive_dir="${OUTPUT_DIR}/archive/$(date -u +%Y%m%dT%H%M%SZ)-$$"
  mkdir -p "$archive_dir"
  chmod 700 "$archive_dir"
  [[ -f "$SERVER_KEY" ]] && mv "$SERVER_KEY" "$archive_dir/"
  [[ -f "$SERVER_CERT" ]] && mv "$SERVER_CERT" "$archive_dir/"
  printf 'Archived previous server certificate material in %s\n' "$archive_dir"
fi

mv "$new_key" "$SERVER_KEY"
mv "$new_cert" "$SERVER_CERT"
chmod 600 "$CA_KEY" "$SERVER_KEY"
chmod 644 "$CA_CERT" "$SERVER_CERT"

printf '\nLocal iPad TLS material is ready:\n'
printf '  URL:         https://%s:8443\n' "$lan_ip"
printf '  Certificate: %s\n' "$SERVER_CERT"
printf '  Private key: %s\n' "$SERVER_KEY"
printf '  Install CA:  %s\n\n' "$CA_CERT"
printf '%s\n' \
  'Install rootCA.crt (never rootCA-key.pem) on each test device and enable' \
  'full certificate trust. Then set IPAD_ORIGIN to the URL shown above.'
