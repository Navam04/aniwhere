#!/bin/sh
# Prepares /data, then runs the app (port 8000) and the http -> https redirect (port 8002) as the anime user.
set -e

if [ -z "$ANIME_ALLOWED_LOGINS" ]; then
    echo "ANIME_ALLOWED_LOGINS is not set. Put your Tailscale login in .env (see docs/install-docker.md)." >&2
    exit 1
fi
if [ -z "$ANIME_PUSH_SUBJECT" ] && [ -n "$ANIME_HOST" ]; then
    export ANIME_PUSH_SUBJECT="https://$ANIME_HOST"
fi

mkdir -p /data
# ani-cli lives on the volume so the app's daily update (git pull) survives restarts
[ -d /data/ani-cli-src/.git ] || cp -r /opt/ani-cli-seed /data/ani-cli-src
chown -R anime:anime /data

cd /app
setpriv --reuid=anime --regid=anime --init-groups python /app/deploy/redirect.py &
exec setpriv --reuid=anime --regid=anime --init-groups \
    uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --no-access-log
