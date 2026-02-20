#!/bin/bash

# Create zip for submission
echo "Installing browser dependencies..."
cd packages/send
pnpm exec playwright install
cd ../../

pwd

# Start dev server in background
pnpm dev:detach 

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


# Run tests in parallel with docker logs
pnpm exec playwright test --grep dev-desktop --config ./send/e2e/playwright.config.dev.ts  &
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
