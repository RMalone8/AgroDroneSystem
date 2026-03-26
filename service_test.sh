#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

echo "Starting MQTT broker and backend..."
docker compose up mqtt backend -d

echo "Waiting for services to be ready..."
sleep 5

echo "Running service tests..."
cd "$SCRIPT_DIR/AgroDroneFrontend"
npm run test:service
TEST_EXIT=$?

echo "Stopping services..."
cd "$SCRIPT_DIR"
docker compose down

exit $TEST_EXIT
