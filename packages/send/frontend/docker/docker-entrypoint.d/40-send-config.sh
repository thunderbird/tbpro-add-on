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
set -eu

CONFIG_PATH="${APP_CONFIG_PATH:-/usr/share/nginx/html/config.js}"

# Build config.js with jq so every value is properly JSON-escaped: a value
# containing a quote, a backslash or a newline cannot produce invalid JS or
# inject code into the page.
config_json="$(jq -n \
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

# APP_SEND_SERVER_URL is the one value the SPA cannot boot without -- src/config.ts
# assertConfigured() throws in the browser if it is empty. Say so here too, while
# there is still a container log to read it in.
if [ -z "${APP_SEND_SERVER_URL:-}" ]; then
  echo "send: WARNING APP_SEND_SERVER_URL is unset; the SPA will fail to boot" >&2
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
  sed -i "s|send-backend:8080|${APP_API_UPSTREAM}|g" /etc/nginx/conf.d/default.conf
  echo "send: set API upstream to ${APP_API_UPSTREAM}"
else
  echo "send: APP_API_UPSTREAM unset; keeping baked default send-backend:8080"
fi
