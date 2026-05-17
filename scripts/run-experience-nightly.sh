#!/bin/bash
# Nightly experience loop runner — sources .env.local then executes via npx tsx
set -a
source /var/www/spacebot/.env.local
set +a
cd /var/www/spacebot
exec npx tsx scripts/experience-loop-nightly.ts
