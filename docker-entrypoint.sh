#!/bin/sh
# Docker entrypoint for app.aporto
set -e

echo "[entrypoint] Running database migrations..."
npx prisma migrate deploy

echo "[entrypoint] Starting app.aporto..."
exec node server.js
