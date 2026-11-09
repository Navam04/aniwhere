#!/bin/sh
# Installs or updates Aniwhere on a Debian/Ubuntu server with systemd. Run as root from the unpacked release:
#   sh deploy/install.sh
# First install: asks for the server's Tailscale name and the logins allowed to use the app, or takes them
# from ANIME_HOST / ANIME_ALLOWED_LOGINS in the environment. Updates keep /etc/anime/anime.env and all data.
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE=/etc/anime/anime.env

[ "$(id -u)" = 0 ] || { echo "Run this as root (sudo sh deploy/install.sh)." >&2; exit 1; }
command -v systemctl >/dev/null || { echo "This installer needs systemd. Use the Docker image instead." >&2; exit 1; }

# prerequisites
need=""
for p in git curl python3 sqlite3 fzf; do command -v "$p" >/dev/null || need="$need $p"; done
python3 -c 'import venv, ensurepip' 2>/dev/null || need="$need python3-venv"
if [ -n "$need" ]; then
    command -v apt-get >/dev/null || { echo "Please install:$need" >&2; exit 1; }
    echo "Installing:$need"
    apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $need >/dev/null
fi

# ani-cli (the app updates it daily from here)
[ -d /opt/ani-cli-src/.git ] || git clone -q --depth 1 https://github.com/pystardust/ani-cli.git /opt/ani-cli-src

# server settings
if [ ! -f "$ENV_FILE" ]; then
    mkdir -p /etc/anime
    old=/etc/systemd/system/anime.service
    if [ -f "$old" ] && grep -q '^Environment=ANIME_ALLOWED_LOGINS=' "$old"; then
        # upgrading from a version that kept these settings in the service file
        grep -E '^Environment=ANIME_(HOST|ALLOWED_LOGINS|PUSH_SUBJECT|OWNER)=' "$old" | sed 's/^Environment=//' > "$ENV_FILE"
        echo "Moved server settings from the old service file to $ENV_FILE"
    else
        host="${ANIME_HOST:-}"
        logins="${ANIME_ALLOWED_LOGINS:-}"
        if [ -z "$host" ] && [ -t 0 ]; then
            printf "Server's Tailscale HTTPS name (e.g. anime.tail1234.ts.net): "; read -r host
        fi
        if [ -z "$logins" ] && [ -t 0 ]; then
            printf "Tailscale logins allowed to use the app, comma-separated (the first is the owner): "; read -r logins
        fi
        [ -n "$logins" ] || { echo "ANIME_ALLOWED_LOGINS is required." >&2; exit 1; }
        {
            echo "ANIME_HOST=$host"
            echo "ANIME_ALLOWED_LOGINS=$logins"
            [ -n "$host" ] && echo "ANIME_PUSH_SUBJECT=https://$host"
        } > "$ENV_FILE"
        echo "Wrote $ENV_FILE"
    fi
    chmod 644 "$ENV_FILE"
fi
grep -q '^ANIME_ALLOWED_LOGINS=..*' "$ENV_FILE" || { echo "Set ANIME_ALLOWED_LOGINS in $ENV_FILE first." >&2; exit 1; }

id anime >/dev/null 2>&1 || useradd --system --home /var/lib/anime --shell /usr/sbin/nologin anime
mkdir -p /opt/anime /var/lib/anime
chown anime:anime /var/lib/anime
chown -R anime:anime /opt/ani-cli-src
git config --system --add safe.directory /opt/ani-cli-src 2>/dev/null || true

# code
rm -rf /opt/anime/app /opt/anime/static
cp -r "$SRC/app" "$SRC/static" /opt/anime/
install -m 644 "$SRC/VERSION" /opt/anime/VERSION
install -m 755 "$SRC/bridge.sh" /opt/anime/bridge.sh
# cache-bust the frontend so phones pick up new versions
sed -i "s/?v=[0-9]*\"/?v=$(date +%s)\"/g" /opt/anime/static/index.html
cp "$SRC/requirements.txt" /opt/anime/

# python env
[ -d /opt/anime/venv ] || python3 -m venv /opt/anime/venv
/opt/anime/venv/bin/pip install -q --upgrade pip
/opt/anime/venv/bin/pip install -q -r /opt/anime/requirements.txt

# assets
mkdir -p /opt/anime/static/vendor
curl -fsSL https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js -o /opt/anime/static/vendor/hls.min.js
/opt/anime/venv/bin/python "$SRC/deploy/gen_icons.py" /opt/anime/static/icons

# service
install -m 644 "$SRC/deploy/redirect.py" /opt/anime/redirect.py
install -m 644 "$SRC/deploy/anime.service" /etc/systemd/system/anime.service
install -m 644 "$SRC/deploy/anime-redirect.service" /etc/systemd/system/anime-redirect.service
systemctl daemon-reload
systemctl enable -q anime anime-redirect
systemctl restart anime anime-redirect
sleep 2
systemctl is-active anime
echo "Aniwhere $(cat "$SRC/VERSION") installed."
command -v tailscale >/dev/null && ! tailscale serve status 2>/dev/null | grep -q 8000 &&
    echo "Next: tailscale serve --bg 8000 && tailscale serve --bg --http=80 8002"
exit 0
