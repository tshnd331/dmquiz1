#!/bin/sh
set -e

# Apply existing migrations (creates the SQLite DB on first run, no-op after).
echo "[entrypoint] running prisma migrate deploy..."
npx prisma migrate deploy

# Hand off to the container command (CMD, or a `compose run` override).
exec "$@"
