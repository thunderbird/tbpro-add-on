#!/bin/bash

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Lock in the browser cache path before any HOME changes.
# GitHub Actions sets HOME=/github/home (uid 1001 owned) but runs as root, which
# causes Firefox Nightly to refuse to start. We'll fix HOME=/root later, but the
# browser binaries are installed under the original HOME so we pin that path now.
export PLAYWRIGHT_BROWSERS_PATH="${HOME}/.cache/ms-playwright"

# Install browsers and system dependencies (--with-deps installs both in one step)
echo "Installing browser dependencies..."
cd "$REPO_ROOT/packages/send"
pnpm exec playwright install --with-deps
cd "$REPO_ROOT"

pwd

# In GitHub Actions `container:` jobs the docker socket is mounted from the HOST,
# so compose containers publish ports to the HOST's network, not to localhost inside
# the container. Reach them via the bridge gateway IP for docker commands.
# However, Playwright/Firefox must connect via 'localhost' because the TLS cert at
# the reverse proxy is issued for 'localhost' only. We set up Node.js TCP proxies
# (localhost:5173 -> DOCKER_HOST:5173, localhost:8088 -> DOCKER_HOST:8088) after
# the stack is ready so the browser sees 'localhost' and the TLS cert matches.
if [ "$IS_CI_AUTOMATION" = "yes" ]; then
  if [ "$GITHUB_ACTIONS" = "true" ]; then
    DOCKER_HOST=$(ip route show default | awk '{print $3; exit}')
    echo "Docker host gateway: $DOCKER_HOST"
  else
    DOCKER_HOST="localhost"
  fi

  BUILD_ENV=production docker compose -f "$REPO_ROOT/compose.ci.yml" up -d --build
else
  pnpm dev:detach
  DOCKER_HOST="localhost"
fi

# Playwright always uses localhost - via TCP proxy in GitHub Actions CI,
# or directly in devpod/local where localhost reaches the servers.
export PLAYWRIGHT_BASE_URL="http://localhost:5173"

# Start docker logs in background immediately so we see container output during startup
if [ "$IS_CI_AUTOMATION" = "yes" ]; then
  docker compose -f "$REPO_ROOT/compose.ci.yml" logs -f &
else
  docker compose logs -f &
fi
DOCKER_LOGS_PID=$!

# Function to cleanup dev server on script exit
cleanup() {
  kill $DOCKER_LOGS_PID 2>/dev/null
  [ -n "$TCP_PROXY_PID" ] && kill $TCP_PROXY_PID 2>/dev/null
}
trap cleanup INT TERM

# Wait for HTTPS server (nginx reverse-proxy) to return 200
echo "Waiting for HTTPS server..."
START_TIME=$(date +%s)
LAST_LOG_TIME=0
MAX_WAIT=180  # 3-minute timeout - fail fast rather than waiting for step timeout
while true; do
  STATUS=$(curl -s -k -w "%{http_code}" --max-time 5 "https://${DOCKER_HOST}:8088/" -o /dev/null)
  if [ "$STATUS" = "200" ]; then
    break
  fi

  CURRENT_TIME=$(date +%s)
  ELAPSED=$((CURRENT_TIME - START_TIME))

  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
    echo "ERROR: HTTPS server not ready after ${MAX_WAIT}s (last status: ${STATUS})"
    docker compose -f "$REPO_ROOT/compose.ci.yml" logs 2>&1 | tail -40
    exit 1
  fi

  # Log every 30 seconds with container status and backend logs
  if [ $((ELAPSED - LAST_LOG_TIME)) -ge 30 ]; then
    echo "Waiting for HTTPS server... (${ELAPSED}s elapsed, curl status: ${STATUS})"
    docker compose -f "$REPO_ROOT/compose.ci.yml" ps 2>&1 || docker compose ps 2>&1
    echo "--- backend logs (last 20 lines) ---"
    docker compose -f "$REPO_ROOT/compose.ci.yml" logs --no-log-prefix backend 2>&1 | tail -20
    echo "--- end backend logs ---"
    LAST_LOG_TIME=$ELAPSED
  fi

  sleep 1
done
echo "HTTPS server is ready"

while true; do
  RESPONSE=$(curl -s "http://${DOCKER_HOST}:5173/send")
  if [ -n "$RESPONSE" ] && [[ "$RESPONSE" == *"<title>Thunderbird Send</title>"* ]]; then
    echo $RESPONSE
    break
  fi
  # log the response for debugging
  echo $RESPONSE
  echo "Waiting for Vite dev server..."
  sleep 1
done
echo "Vite dev server is ready"

# In GitHub Actions CI the containers are on the host bridge (DOCKER_HOST).
# The TLS cert is issued for 'localhost' only, so direct connections to the bridge
# IP cause Firefox to fail SSL even with ignoreHTTPSErrors (hostname mismatch).
# Fix: run TCP proxies that forward localhost:{5173,8088} -> DOCKER_HOST:{5173,8088}.
# Firefox then negotiates TLS with 'localhost' as the hostname, cert matches.
# CORS also passes since the frontend origin becomes http://localhost:5173.
if [ "$IS_CI_AUTOMATION" = "yes" ] && [ "$GITHUB_ACTIONS" = "true" ]; then
  echo "Setting up TCP proxies: localhost:{5173,8088} -> ${DOCKER_HOST}:{5173,8088}"
  node -e "
const net = require('net');
const host = process.argv[1];
[[5173, 5173], [8088, 8088]].forEach(([lp, rp]) => {
  net.createServer(c => {
    const r = net.connect(rp, host);
    c.pipe(r); r.pipe(c);
    c.on('error', () => r.destroy());
    r.on('error', () => c.destroy());
  }).listen(lp, '127.0.0.1', () =>
    process.stdout.write('Proxy ready: localhost:' + lp + ' -> ' + host + ':' + rp + '\n'));
});" "${DOCKER_HOST}" &
  TCP_PROXY_PID=$!
  sleep 1  # allow proxies to bind before tests start
fi

# Firefox Nightly refuses to run as root when $HOME is not owned by root.
# GitHub Actions sets HOME=/github/home (owned by uid 1001) but runs containers as root.
# Fix: point HOME at /root (always root-owned) so Firefox accepts the environment.
# Guard: only applies when actually running as root (not in local devpod as vscode).
# PLAYWRIGHT_BROWSERS_PATH (set above) keeps pointing at the browser cache.
if [ "$IS_CI_AUTOMATION" = "yes" ] && [ "$(id -u)" = "0" ]; then
  export HOME=/root
fi

# Run tests in parallel with docker logs
pnpm exec playwright test --grep dev-desktop --config "$REPO_ROOT/packages/send/e2e/playwright.config.dev.ts" &
PLAYWRIGHT_PID=$!

# Wait for tests to complete
wait $PLAYWRIGHT_PID
PLAYWRIGHT_EXIT_CODE=$?

if [ $PLAYWRIGHT_EXIT_CODE -ne 0 ]; then
    echo "Playwright tests failed with exit code $PLAYWRIGHT_EXIT_CODE"
    kill $DOCKER_LOGS_PID
    cleanup
    exit $PLAYWRIGHT_EXIT_CODE
fi

echo "Finished running tests"

# Kill docker logs process
kill $DOCKER_LOGS_PID

# Cleanup
cleanup