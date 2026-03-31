#!/bin/bash
LOCK="/var/www/spacebot/.build_lock"
if [ -f "$LOCK" ]; then
    echo "BUILD LOCKED — another build is running. Exiting."
    exit 1
fi
touch "$LOCK"
trap "rm -f $LOCK" EXIT
cd /var/www/spacebot
NODE_OPTIONS='--max-old-space-size=3072' npm run build
EXIT_CODE=$?
rm -f "$LOCK"
exit $EXIT_CODE
