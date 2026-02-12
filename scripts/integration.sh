#!/bin/bash

# Start dev server in background
# pnpm dev:detach
export BUILD_ENV=development
docker compose up -f compose-ci.yml -d --build

# Function to cleanup dev server on script exit
cleanup() {
  kill $DOCKER_LOGS_PID 2>/dev/null
}
trap cleanup INT TERM

# Wait for servers to be ready
echo "Waiting for dev servers..."
START_TIME=$(date +%s)
LAST_LOG_TIME=0
while true; do
  STATUS=$(curl -s -k -w "%{http_code}" https://localhost:8088/ -o /dev/null)
  if [ "$STATUS" = "200" ]; then
    break
  fi

  CURRENT_TIME=$(date +%s)
  ELAPSED=$((CURRENT_TIME - START_TIME))

  # Only log every 5 seconds
  if [ $((ELAPSED - LAST_LOG_TIME)) -ge 5 ]; then
    echo "Waiting for HTTPS server... (${ELAPSED}s elapsed)"
    LAST_LOG_TIME=$ELAPSED
  fi

  sleep 1
done
echo "HTTPS server is ready"

# Start docker logs in background
docker compose logs -f &
DOCKER_LOGS_PID=$!

while true; do
  RESPONSE=$(curl -s http://localhost:5173/send)
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
echo "Installing vitest with npm"
docker compose exec -T backend npm install vitest
echo "Running vitest"
docker compose exec -T backend npx vitest run --config vitest.integration.config.js
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
