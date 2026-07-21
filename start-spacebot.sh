#!/bin/bash
set -euo pipefail

APP_ROOT="/var/www/spacebot"
STANDALONE_DIR="$APP_ROOT/.next/standalone"

cd "$APP_ROOT"
test -f "$STANDALONE_DIR/server.js"

# Next standalone output does not copy these runtime assets automatically.
mkdir -p "$STANDALONE_DIR/.next"
cp -a "$APP_ROOT/.next/static" "$STANDALONE_DIR/.next/"
cp -a "$APP_ROOT/public" "$STANDALONE_DIR/"

set -a
source "$APP_ROOT/.env.local"
set +a

node "$APP_ROOT/scripts/PW7404-1125-preflight-resident-identity-app.mjs"

export PORT=3003 HOSTNAME=127.0.0.1
exec node "$STANDALONE_DIR/server.js"
