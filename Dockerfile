# Aniwhere: self-hosted anime streaming built on ani-cli. See docs/install-docker.md.
FROM python:3.11-slim-bookworm

ARG HLS_JS_VERSION=1.5.15
RUN apt-get update \
 && apt-get install -y --no-install-recommends git curl ca-certificates fzf sqlite3 \
 && apt-get clean \
 && useradd --system --uid 1000 --home /data --shell /usr/sbin/nologin anime \
 && git config --system --add safe.directory '*'

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY static ./static
COPY bridge.sh VERSION ./
COPY deploy/redirect.py deploy/gen_icons.py ./deploy/
COPY docker/entrypoint.sh /entrypoint.sh
RUN mkdir -p static/vendor \
 && curl -fsSL "https://cdn.jsdelivr.net/npm/hls.js@${HLS_JS_VERSION}/dist/hls.min.js" -o static/vendor/hls.min.js \
 && python deploy/gen_icons.py static/icons \
 && sed -i "s/?v=[0-9]*\"/?v=$(cat VERSION)\"/g" static/index.html \
 && git clone -q --depth 1 https://github.com/pystardust/ani-cli.git /opt/ani-cli-seed \
 && chmod 755 bridge.sh /entrypoint.sh

ENV ANIME_DATA=/data \
    ANIME_BRIDGE=/app/bridge.sh \
    ANI_CLI_DIR=/data/ani-cli-src \
    ANI_CLI_PATH=/data/ani-cli-src/ani-cli \
    HOME=/data \
    PYTHONUNBUFFERED=1

VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fs http://127.0.0.1:8000/api/ping || exit 1
ENTRYPOINT ["/entrypoint.sh"]
