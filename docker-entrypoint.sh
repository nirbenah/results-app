#!/bin/sh
set -e

echo "[Startup] Running migrations..."
npx knex migrate:latest --knexfile knexfile.ts

echo "[Startup] Seeding database..."
npx ts-node src/shared/db/seed.ts || echo "[Startup] Seed skipped (may already exist)"

echo "[Startup] Starting server..."
node -r dotenv/config dist/index.js
