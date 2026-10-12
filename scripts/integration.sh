#!/bin/bash

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# In GitHub Actions `container:` jobs the docker socket is mounted from the HOST,
# so compose containers publish ports to the HOST's network, not to localhost inside
# the devcontainer. Reach them via the bridge gateway IP.
# In other DinD environments (devpod, local) the daemon is internal and published
# ports ARE available on localhost.
if [ "$IS_CI_AUTOMATION" = "yes" ]; then
  if [ "$GITHUB_ACTIONS" = "true" ]; then
    DOCKER_HOST=$(ip route show default | awk '{print $3; exit}')
    echo "Docker host gateway: $DOCKER_HOST"
  else
    DOCKER_HOST="localhost"
  fi
  BUILD_ENV=production docker compose -f "$REPO_ROOT/compose.ci.yml" up -d --build
else
  # Start dev server in background
  pnpm dev:detach
  DOCKER_HOST="localhost"
fi

# Function to cleanup dev server on script exit
cleanup() {
  kill $DOCKER_LOGS_PID 2>/dev/null
}
trap cleanup INT TERM

# The proxy's self-signed cert is generated at container start for localhost
# only: copy it out of the container (trust comes from the local docker daemon,
# not the network) and pin localhost to DOCKER_HOST instead of using -k.
COMPOSE_ARGS=()
[ "$IS_CI_AUTOMATION" = "yes" ] && COMPOSE_ARGS=(-f "$REPO_ROOT/compose.ci.yml")
DEV_TLS_CERT="$(mktemp)"
trap 'rm -f "$DEV_TLS_CERT"' EXIT
RESOLVE_ARGS=()
[ "$DOCKER_HOST" != "localhost" ] && RESOLVE_ARGS=(--resolve "localhost:8088:${DOCKER_HOST}")

# Wait for servers to be ready
echo "Waiting for HTTPS server..."
START_TIME=$(date +%s)
LAST_LOG_TIME=0
MAX_WAIT=180  # 3-minute timeout
while true; do
  STATUS=000
  if docker compose "${COMPOSE_ARGS[@]}" cp \
      reverse-proxy:/etc/nginx/tls/localhost.crt "$DEV_TLS_CERT" >/dev/null 2>&1; then
    STATUS=$(curl -s --cacert "$DEV_TLS_CERT" "${RESOLVE_ARGS[@]}" -w "%{http_code}" \
      --max-time 5 "https://localhost:8088/" -o /dev/null)
  fi
  if [ "$STATUS" = "200" ]; then
    break
  fi

  CURRENT_TIME=$(date +%s)
  ELAPSED=$((CURRENT_TIME - START_TIME))

  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
    echo "ERROR: HTTPS server not ready after ${MAX_WAIT}s (last status: ${STATUS})"
    if [ "$IS_CI_AUTOMATION" = "yes" ]; then
      docker compose -f "$REPO_ROOT/compose.ci.yml" logs 2>&1 | tail -40
    else
      docker compose logs 2>&1 | tail -40
    fi
    exit 1
  fi

  # Log every 5 seconds
  if [ $((ELAPSED - LAST_LOG_TIME)) -ge 5 ]; then
    echo "Waiting for HTTPS server... (${ELAPSED}s elapsed)"
    LAST_LOG_TIME=$ELAPSED
  fi

  sleep 1
done
echo "HTTPS server is ready"

# Start docker logs in background
if [ "$IS_CI_AUTOMATION" = "yes" ]; then
  docker compose -f "$REPO_ROOT/compose.ci.yml" logs -f &
else
  docker compose logs -f &
fi
DOCKER_LOGS_PID=$!

while true; do
  RESPONSE=$(curl -s "http://${DOCKER_HOST}:5173/send")
  if [ -n "$RESPONSE" ] && [[ "$RESPONSE" == *"<title>Send – Thunderbird</title>"* ]]; then
    echo $RESPONSE
    break
  fi
  # log the response for debugging
  echo $RESPONSE
  echo "Waiting for Vite dev server..."
  sleep 1
done
echo "Vite dev server is ready"

# Run integration tests for send-backend
# vitest is already installed as a devDependency via pnpm during docker build
echo "Running vitest"
docker compose -f "$REPO_ROOT/compose.ci.yml" exec -T backend npx vitest run --config vitest.integration.config.js
VITEST_EXIT_CODE=$?

if [ $VITEST_EXIT_CODE -ne 0 ]; then
    echo "Vitest tests failed with exit code $VITEST_EXIT_CODE"
    kill $DOCKER_LOGS_PID
    cleanup
    exit $VITEST_EXIT_CODE
fi


echo "Finished running tests"

# Kill docker logs process
kill $DOCKER_LOGS_PID

# Cleanup
cleanup