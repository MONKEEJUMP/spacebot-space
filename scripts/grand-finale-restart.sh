#!/bin/bash
# grand-finale-restart.sh — Agent B Round 5 Grand Finale (LUCY)
# One-shot restart script for the full stack after all agent fixes are in.
# Run this ONCE after every agent (A, B, C, D, E) reports done.

set -e

echo "========================================================"
echo "SpaceBot LUCY Grand Finale Restart"
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "========================================================"

cd /var/www/spacebot

# Step 1: Clean stale TypeScript incremental cache
echo ""
echo "[1/6] Clean TypeScript cache..."
rm -f tsconfig.tsbuildinfo

# Step 2: Fresh TypeScript typecheck (should be 0 errors)
echo ""
echo "[2/6] TypeScript typecheck..."
NODE_OPTIONS='--max-old-space-size=3072' npx tsc --noEmit 2>&1 | tee /tmp/tsc-finale.log
TS_ERRORS=$(grep -c 'error TS' /tmp/tsc-finale.log || true)
if [ "$TS_ERRORS" != "0" ]; then
  echo "❌ TypeScript errors detected: $TS_ERRORS — aborting"
  exit 1
fi
echo "✅ TypeScript: 0 errors"

# Step 3: Production build
echo ""
echo "[3/6] Production build (NODE_OPTIONS=--max-old-space-size=3072)..."
NODE_OPTIONS='--max-old-space-size=3072' npm run build 2>&1 | tee /tmp/build-finale.log
BUILD_STATUS=${PIPESTATUS[0]}
if [ "$BUILD_STATUS" != "0" ]; then
  echo "❌ Build failed — aborting"
  exit 1
fi
echo "✅ Build: success"

# Step 4: Restart PM2 app
echo ""
echo "[4/6] Restart PM2 spacebot process..."
pm2 restart spacebot --update-env
sleep 3

# Step 5: Health check — curl the live site
echo ""
echo "[5/6] Health check — curl localhost:3003..."
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3003/ || echo 'FAIL')
if [ "$HEALTH" != "200" ]; then
  echo "❌ Health check failed: HTTP $HEALTH"
  pm2 logs spacebot --lines 30 --nostream
  exit 1
fi
echo "✅ Health check: HTTP $HEALTH"

# Step 6: Final PM2 status
echo ""
echo "[6/6] Final PM2 status..."
pm2 list

echo ""
echo "========================================================"
echo "✅ LUCY GRAND FINALE COMPLETE"
echo "Finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "========================================================"
