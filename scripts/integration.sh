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

# Wait for servers to be ready
echo "Waiting for HTTPS server..."
START_TIME=$(date +%s)
LAST_LOG_TIME=0
MAX_WAIT=180  # 3-minute timeout
while true; do
  STATUS=$(curl -s -k -w "%{http_code}" --max-time 5 "https://${DOCKER_HOST}:8088/" -o /dev/null)
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