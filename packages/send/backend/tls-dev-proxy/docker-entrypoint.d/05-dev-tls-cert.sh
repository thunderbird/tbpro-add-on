#!/bin/sh
# Generates the dev proxy's self-signed TLS cert at container start, so no key is
# committed or baked into an image layer. Run by the nginx image's entrypoint
# before nginx starts. Kept across restarts (and, in compose.yml, across
# recreates via the dev-tls-certs volume) so a browser exception stays valid;
# regenerated when missing or within a day of expiry.
#
# Covers only localhost: CI probes reach the proxy through a gateway IP but use
# `curl --resolve localhost:8088:<ip>`, and the e2e browser goes through a
# localhost TCP proxy. To trust it on the host:
#   docker compose cp reverse-proxy:/etc/nginx/tls/localhost.crt <dest>
set -eu

dir=/etc/nginx/tls
crt="$dir/localhost.crt"
key="$dir/localhost.key"

if [ -s "$key" ] && [ -s "$crt" ] && openssl x509 -checkend 86400 -noout -in "$crt" >/dev/null 2>&1; then
  echo "$0: reusing $crt"
  exit 0
fi

echo "$0: generating self-signed cert for localhost in $dir"
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth" \
  -keyout "$key" -out "$crt" 2>/dev/null
chmod 600 "$key"
