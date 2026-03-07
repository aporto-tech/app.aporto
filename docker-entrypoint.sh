#!/bin/sh
# Docker entrypoint for app.aporto
set -e

echo "[entrypoint] Running Prisma DB push for PostgreSQL schema..."
npx prisma db push --skip-generate --accept-data-loss

echo "[entrypoint] Starting app.aporto..."
exec node server.js
