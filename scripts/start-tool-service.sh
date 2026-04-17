#!/bin/bash
# LUCY Tool Service — PM2 startup script
# Space Bot Engineering — April 2026

# Load environment variables from .env.local
set -a
source /var/www/spacebot/.env.local
set +a

# Configure for Cerebras + QWEN 3
export CEREBRAS_API_KEY="${CEREBRAS_CHAT_KEY}"
export CEREBRAS_BASE_URL="https://api.cerebras.ai/v1"
export QWEN_MODEL="qwen-3-235b-a22b-instruct-2507"
export TOOL_SERVICE_PORT=3457

cd /var/www/spacebot/scripts
exec python3 qwen-tool-service.py
