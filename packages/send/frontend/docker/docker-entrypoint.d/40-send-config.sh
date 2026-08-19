#!/bin/sh
# Generate the SPA runtime config from container environment variables, and point
# the nginx API proxy at the backend.
#
# nginx:stable runs every /docker-entrypoint.d/*.sh at startup, before nginx, so
# this writes an env-specific config.js that the app loads at boot. The built JS
# bundle is env-agnostic (byte-identical across environments); only this file and
# the proxy upstream differ.
#
# SECURITY: every value written to config.js is served publicly to browsers. Only
# map public, client-safe values into APP_* here -- never a backend secret.
#
# Values come from APP_* env (ConfigMap / ExternalSecrets on EKS). Anything left
# unset is written as an empty string, and src/config.ts treats empty as unset.
#
# NAMESPACE NOTE: every APP_* var this script reads is emitted into the
# publicly-served config.js, with exactly two exceptions -- APP_CONFIG_PATH and
# APP_API_UPSTREAM below configure the entrypoint/nginx themselves and never
# reach the browser. Keep it that way: a new APP_* var must be either clearly
# public SPA config (add it to the jq object AND src/config.ts AND
# public/config.js) or renamed out of the pattern.
set -eu

CONFIG_PATH="${APP_CONFIG_PATH:-/usr/share/nginx/html/config.js}"

# Build config.js with jq so every value is properly JSON-escaped: a value
# containing a quote, a backslash or a newline cannot produce invalid JS or
# inject code into the page. `-a` forces ASCII output, which also escapes raw
# U+2028/U+2029 -- legal inside a JS string literal only since ES2019.
#
# A value containing `</script>` is harmless here ONLY because config.js is an
# EXTERNAL .js file, not inline HTML: there is no HTML parser to break out of. Do
# NOT inline this into index.html -- that would turn every APP_* var into an XSS
# vector.
config_json="$(jq -n -a \
  --arg appEnv "${APP_ENV:-}" \
  --arg sendServerUrl "${APP_SEND_SERVER_URL:-}" \
  --arg sendClientUrl "${APP_SEND_CLIENT_URL:-}" \
  --arg oidcRootUrl "${APP_OIDC_ROOT_URL:-}" \
  --arg oidcClientId "${APP_OIDC_CLIENT_ID:-}" \
  --arg allowPublicLogin "${APP_ALLOW_PUBLIC_LOGIN:-}" \
  --arg sentryDsn "${APP_SENTRY_DSN:-}" \
  --arg posthogProjectKey "${APP_POSTHOG_PROJECT_KEY:-}" \
  --arg posthogHost "${APP_POSTHOG_HOST:-}" \
  --arg splitSizeInMb "${APP_SPLIT_SIZE_IN_MB:-}" \
  --arg loggerLevel "${APP_LOGGER_LEVEL:-}" \
  --arg uploadHttpRetryLimit "${APP_UPLOAD_HTTP_RETRY_LIMIT:-}" \
  --arg uploadHttpRetryBaseDelayMs "${APP_UPLOAD_HTTP_RETRY_BASE_DELAY_MS:-}" \
  --arg accountsUrl "${APP_ACCOUNTS_URL:-}" \
  --arg dashboardUrl "${APP_DASHBOARD_URL:-}" \
  --arg contactFormUrl "${APP_CONTACT_FORM_URL:-}" \
  --arg thundermailUrl "${APP_THUNDERMAIL_URL:-}" \
  --arg appointmentUrl "${APP_APPOINTMENT_URL:-}" \
  '{appEnv:$appEnv, sendServerUrl:$sendServerUrl, sendClientUrl:$sendClientUrl,
    oidcRootUrl:$oidcRootUrl, oidcClientId:$oidcClientId,
    allowPublicLogin:$allowPublicLogin, sentryDsn:$sentryDsn,
    posthogProjectKey:$posthogProjectKey, posthogHost:$posthogHost,
    splitSizeInMb:$splitSizeInMb, loggerLevel:$loggerLevel,
    uploadHttpRetryLimit:$uploadHttpRetryLimit,
    uploadHttpRetryBaseDelayMs:$uploadHttpRetryBaseDelayMs,
    accountsUrl:$accountsUrl, dashboardUrl:$dashboardUrl,
    contactFormUrl:$contactFormUrl, thundermailUrl:$thundermailUrl,
    appointmentUrl:$appointmentUrl}')"
printf 'window.__APP_CONFIG__ = %s;\n' "$config_json" > "$CONFIG_PATH"
echo "send: wrote runtime config to $CONFIG_PATH"

# The two values the SPA cannot boot without -- src/config.ts assertConfigured()
# throws in the browser if either is empty. Say so here too, while there is still
# a container log to read it in.
#
# APP_SEND_CLIENT_URL matters as much as the server URL: it becomes BASE_URL, and
# every share link is `${BASE_URL}/share/<id>`. Unset, nginx still answers GET /
# with 200 -- so a readiness probe on / stays green while every copied link reads
# `undefined/share/...`.
for required in APP_SEND_SERVER_URL APP_SEND_CLIENT_URL; do
  eval "value=\${${required}:-}"
  if [ -z "$value" ]; then
    echo "send: WARNING $required is unset; the SPA will fail to boot" >&2
  fi
done

# Not fatal (the SPA still boots), but an undeclared environment silently
# resolves to the non-production fallback in src/config.ts -- staging sibling
# URLs, environment "staging" in Sentry. Name the cause in the container log.
if [ -z "${APP_ENV:-}" ]; then
  echo "send: WARNING APP_ENV is unset; the SPA will report a fallback environment (staging) and use the -stage sibling-service URLs" >&2
fi

# Point the nginx API/tRPC proxy at the backend. On EKS the backend is a SEPARATE
# Service, so the baked default (send-backend:8080, for a compose/sidecar
# topology) must be overridden. Set APP_API_UPSTREAM to host:port with NO scheme,
# e.g. send-backend.<namespace>.svc.cluster.local:8080.
#
# The rewrite is a one-shot against the baked default, so it is only repeatable
# because /etc/nginx/conf.d comes from an immutable image layer and is restored on
# every container start. Do NOT mount conf.d from a persistent volume: the second
# start would find no `send-backend:8080` left to replace and silently keep the
# first value.
if [ -n "${APP_API_UPSTREAM:-}" ]; then
  # Validate before substituting. This value is interpolated into an nginx config
  # by sed, so an unvalidated one is both a config-injection point and a
  # silent-corruption point:
  #   * `&` in the replacement expands to the whole matched text
  #     ("a&b:8080" -> "asend-backend:8080b:8080");
  #   * a `}` closes the location block and everything after it is parsed as
  #     server-scope nginx directives;
  #   * the likeliest operator mistake, a scheme ("http://send-backend:8080"),
  #     produces `invalid port in upstream`.
  # All three crash-loop rather than mis-serve, but failing here names the cause.
  case "${APP_API_UPSTREAM}" in
    *[!A-Za-z0-9.:_-]*)
      echo "send: FATAL APP_API_UPSTREAM must be host:port with no scheme or path: '${APP_API_UPSTREAM}'" >&2
      exit 1
      ;;
  esac
  # The substitution is one-shot against the baked default, so assert the default
  # is still there. If it is not, /etc/nginx/conf.d is not coming from the image
  # layer (a mounted volume?) and this would otherwise silently keep the previous
  # start's upstream.
  if ! grep -q 'send-backend:8080' /etc/nginx/conf.d/default.conf; then
    echo "send: FATAL upstream placeholder already replaced; is /etc/nginx/conf.d on a persistent volume?" >&2
    exit 1
  fi
  sed -i "s|send-backend:8080|${APP_API_UPSTREAM}|g" /etc/nginx/conf.d/default.conf
  echo "send: set API upstream to ${APP_API_UPSTREAM}"
else
  echo "send: APP_API_UPSTREAM unset; keeping baked default send-backend:8080"
fi
