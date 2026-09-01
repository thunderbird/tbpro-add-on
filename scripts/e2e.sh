#!/bin/bash

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Extra `-f` flags for the CI stack. Empty on the local path, which runs the root
# compose.yml through `pnpm dev:detach`, so `docker compose` finds it by default.
COMPOSE_FILES=()
# Whether the stack includes the MinIO bucket; decided with COMPOSE_FILES below.
USES_MINIO="no"

# Lock in the browser cache path before any HOME changes.
# GitHub Actions sets HOME=/github/home (uid 1001 owned) but runs as root, which
# causes Firefox Nightly to refuse to start. We'll fix HOME=/root later, but the
# browser binaries are installed under the original HOME so we pin that path now.
export PLAYWRIGHT_BROWSERS_PATH="${HOME}/.cache/ms-playwright"

# In GHA CI, playwright install is handled by dedicated workflow steps with caching.
# Locally (devcontainer or bare machine), always install so browsers are available.
if [ "$IS_CI_AUTOMATION" != "yes" ] || [ "$GITHUB_ACTIONS" != "true" ]; then
  echo "Installing browser dependencies..."
  cd "$REPO_ROOT/packages/send"
  pnpm exec playwright install --with-deps
  cd "$REPO_ROOT"
fi

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

  # Two lanes share this script. One runs against Backblaze and wants nothing to
  # do with MinIO; the other needs it. Read which from the backend's own
  # configuration rather than a second flag, so the stack and the .env cannot
  # disagree about where the bytes go.
  #
  # Parse the value rather than matching the whole line, and fail on anything
  # unrecognised. A quoted value or a stray space would make an exact-line match
  # miss while dotenv still resolved it to `s3` -- the stack would come up
  # without a bucket and die much later as a Playwright timeout naming nothing.
  ENV_FILE="$REPO_ROOT/packages/send/backend/.env"
  STORAGE_BACKEND_VALUE=$(
    grep -E '^STORAGE_BACKEND=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d "\"' \r"
  )
  COMPOSE_FILES=(-f "$REPO_ROOT/compose.ci.yml")
  case "$STORAGE_BACKEND_VALUE" in
    s3)
      echo "STORAGE_BACKEND=s3 -- adding the MinIO bucket to the stack"
      COMPOSE_FILES+=(-f "$REPO_ROOT/compose.ci.minio.yml")
      USES_MINIO="yes"
      ;;
    b2)
      echo "STORAGE_BACKEND=b2 -- running against Backblaze, no MinIO"
      ;;
    *)
      echo "ERROR: STORAGE_BACKEND is '$STORAGE_BACKEND_VALUE' in $ENV_FILE; expected s3 or b2"
      exit 1
      ;;
  esac

  if [ "$GITHUB_ACTIONS" = "true" ]; then
    # In GHA, images are pre-built and pushed to GHCR by docker/build-push-action steps.
    # compose.ci.prebuilt.yml overrides image: and pull_policy: always for each service.
    docker compose "${COMPOSE_FILES[@]}" -f "$REPO_ROOT/compose.ci.prebuilt.yml" up -d || {
      echo "ERROR: docker compose up failed"
      docker compose "${COMPOSE_FILES[@]}" logs
      exit 1
    }
  else
    BUILD_ENV=production docker compose "${COMPOSE_FILES[@]}" up -d --build
  fi
else
  pnpm dev:detach
  DOCKER_HOST="localhost"
fi

# Playwright always uses localhost - via TCP proxy in GitHub Actions CI,
# or directly in devpod/local where localhost reaches the servers.
export PLAYWRIGHT_BASE_URL="http://localhost:5173"

# Start docker logs in background immediately so we see container output during startup
if [ "$IS_CI_AUTOMATION" = "yes" ]; then
  docker compose "${COMPOSE_FILES[@]}" logs -f &
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

# Both entry points have to answer before Playwright starts, and together they get
# ONE 3-minute budget. Per-call budgets would let the stack burn twice that, which
# is what the timeout-minutes on the CI step is sized against; the Vite loop used
# to have no budget at all, so a frontend that never came up read as a silent
# 10-minute step timeout naming nothing.
STACK_MAX_WAIT=180
STACK_START=$(date +%s)

# nginx reverse-proxy, on the port the browser reaches over TLS.
https_ready() {
  [ "$(curl -s -k -o /dev/null -w '%{http_code}' --max-time 5 \
        "https://${DOCKER_HOST}:8088/")" = 200 ]
}

frontend_ready() {
  curl -s --max-time 5 "http://${DOCKER_HOST}:5173/send" \
    | grep -q '<title>Thunderbird Send</title>'
}

wait_for() {
  local what="$1"
  shift
  local last_log=0 elapsed
  echo "Waiting for ${what}..."

  until "$@"; do
    elapsed=$(( $(date +%s) - STACK_START ))

    if [ "$elapsed" -ge "$STACK_MAX_WAIT" ]; then
      echo "ERROR: ${what} not ready ${elapsed}s into the stack's ${STACK_MAX_WAIT}s budget"
      docker compose "${COMPOSE_FILES[@]}" ps 2>&1
      docker compose "${COMPOSE_FILES[@]}" logs 2>&1 | tail -40
      exit 1
    fi

    if [ $(( elapsed - last_log )) -ge 30 ]; then
      echo "Waiting for ${what}... (${elapsed}s elapsed)"
      docker compose "${COMPOSE_FILES[@]}" ps 2>&1
      echo "--- backend logs (last 20 lines) ---"
      docker compose "${COMPOSE_FILES[@]}" logs --no-log-prefix backend 2>&1 | tail -20
      echo "--- end backend logs ---"
      last_log=$elapsed
    fi

    sleep 1
  done

  echo "${what} is ready"
}

wait_for "HTTPS server" https_ready
wait_for "Vite dev server" frontend_ready

# In GitHub Actions CI the containers are on the host bridge (DOCKER_HOST).
# The TLS cert is issued for 'localhost' only, so direct connections to the bridge
# IP cause Firefox to fail SSL even with ignoreHTTPSErrors (hostname mismatch).
# Fix: run TCP proxies that forward localhost:{5173,8088} -> DOCKER_HOST.
# Firefox then negotiates TLS with 'localhost' as the hostname, cert matches.
# CORS also passes since the frontend origin becomes http://localhost:5173.
# On the MinIO lane 9000 joins them: uploads are presigned PUTs from the browser,
# and the URL is signed for S3_PUBLIC_ENDPOINT (localhost:9000), so the browser
# has to reach that exact host -- the backend's own `minio:9000` is inside
# compose. The Backblaze lane has no such port and does not proxy it.
if [ "$IS_CI_AUTOMATION" = "yes" ] && [ "$GITHUB_ACTIONS" = "true" ]; then
  PROXY_PORTS="[[5173, 5173], [8088, 8088]]"
  if [ "$USES_MINIO" = "yes" ]; then
    PROXY_PORTS="[[5173, 5173], [8088, 8088], [9000, 9000]]"
  fi
  echo "Setting up TCP proxies: ${PROXY_PORTS} -> ${DOCKER_HOST}"
  node -e "
const net = require('net');
const host = process.argv[1];
${PROXY_PORTS}.forEach(([lp, rp]) => {
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