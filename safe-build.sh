#!/bin/bash
LOCK="/var/www/spacebot/.build_lock"
if [ -f "$LOCK" ]; then
    echo "BUILD LOCKED - another build is running. Exiting."
    exit 1
fi
touch "$LOCK"
trap 'rm -f "$LOCK"' EXIT
cd /var/www/spacebot || exit 1
NODE_OPTIONS='--max-old-space-size=3072' npm run build
EXIT_CODE=$?
if [ "$EXIT_CODE" -eq 0 ]; then
    echo "Copying static and public assets into the standalone bundle..."
    mkdir -p .next/standalone/.next
    cp -a .next/static .next/standalone/.next/ || exit 1
    cp -a public .next/standalone/ || exit 1
fi
exit "$EXIT_CODE"
