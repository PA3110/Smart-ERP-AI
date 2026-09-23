#!/bin/bash
# Vivek ERP System — production build & run (no Docker required).
# Builds the TypeScript backend, seeds the database if needed, and runs the
# compiled production server (not a dev/watch process).

set -e
cd "$(dirname "$0")/backend"

if [ ! -f .env ]; then
  cp .env.example .env
  SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  if [ "$(uname)" = "Darwin" ]; then
    sed -i '' "s#change_this_to_a_long_random_string#${SECRET}#" .env
  else
    sed -i "s#change_this_to_a_long_random_string#${SECRET}#" .env
  fi
  echo "Created backend/.env with a generated JWT secret."
fi

echo "Installing dependencies..."
npm install --omit=dev=false >/dev/null 2>&1 || npm install

echo "Building production bundle (tsc)..."
npm run build

echo "Seeding database if empty (admin@erp.local / Admin@123)..."
node dist/db/seed.js

echo ""
echo "============================================================"
echo " Vivek ERP System — PRODUCTION build running"
echo "   App:  http://localhost:${PORT:-4000}/"
echo "   API:  http://localhost:${PORT:-4000}/auth, /customers, /products,"
echo "         /challans, /flash-sale"
echo "   Login: admin@erp.local / Admin@123"
echo "============================================================"
echo ""

exec node dist/server.js
