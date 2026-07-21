#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export PATH=/usr/local/bin:/usr/bin:/bin

cd /opt/spacebot-lucy/PW7404-1086-canonical-autonomy-runtime
exec 9>/run/lock/spacebot-lucy-autonomy.lock
flock -n 9 || exit 75

exec /usr/bin/timeout --signal=TERM --kill-after=30s 40m \
  /opt/spacebot-lucy/PW7404-1086-canonical-autonomy-runtime/.venv/bin/python -I -B -c \
  'import runpy,sys; root="/opt/spacebot-lucy/PW7404-1086-canonical-autonomy-runtime"; sys.path.insert(0,root); runpy.run_path(root+"/tick_loop.py",run_name="__main__")'
