#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only  (loads code from ani-cli, which is GPL-3.0; the rest of Aniwhere is MIT)
# Bridge between the web app and ani-cli.
# Loads ani-cli's own scraping functions and API settings (without its menus or player),
# so updating ani-cli also updates how the app finds streams.
# ani-cli's provider is Miruro (since ani-cli 2026-11, replacing HiAnime). Show ids look like
# <anilist-id>:<miruro-id>:<mal-id>.
#   bridge.sh search <query>              -> id<TAB>title per line
#   bridge.sh episodes <show-id>          -> episode-id<TAB>episode-number per line
#   bridge.sh resolve <show-id> <ep> <sub|dub>
#        -> key<TAB>value lines: server, refr, origin, mal, sub, audio, then link<TAB>quality >url
#           (all links come from one server, so one Referer/Origin pair works for every request)
#   bridge.sh version                     -> ani-cli version
ANI="${ANI_CLI_PATH:-/usr/local/bin/ani-cli}"
eval "$(sed -n '2,/^# MAIN/p' "$ANI")"
eval "$(sed -n '/^# setup/,/^curl_exe=/p' "$ANI")"
die() { printf '%s\n' "$*" >&2; exit 1; }
info() { :; }

cmd="$1"
[ "$#" -gt 0 ] && shift
if [ "$cmd" != version ]; then
    for f in miruro_search miruro_episodes miruro_media; do
        command -v "$f" >/dev/null 2>&1 ||
            die "ani-cli $version_number no longer has $f (its stream provider changed); bridge.sh needs updating"
    done
fi

case "$cmd" in
    search) miruro_search "$*" ;;
    episodes) miruro_episodes "$1" | sed -n 's/^\(.\{1,\}\)$/\1\t\1/p' ;;
    resolve)
        anime_id="$1"
        miruro_media "$2" "$3" || die "No $3 source for episode $2"
        # $links: "<quality> <server> >url|referer|origin|hls|audio|subtitles", best quality first.
        # Use the first HLS server (the app proxies HLS), else the first server of any kind.
        server="$(printf '%s\n' "$links" | awk -F'|' '$4 == 1 { split($1, a, " "); print a[2]; exit }')"
        [ -n "$server" ] || server="$(printf '%s\n' "$links" | awk 'NR == 1 { print $2 }')"
        printf '%s\n' "$links" | awk -F'|' -v srv="$server" -v mal="${anime_id##*:}" '
            { split($1, a, " ") } a[2] != srv { next }
            !head { printf "server\t%s\nrefr\t%s\norigin\t%s\nmal\t%s\nsub\t%s\naudio\t%s\n", srv, $2, $3, mal, $6, $5; head = 1 }
            { url = $1; sub(/^[^>]*>/, "", url); if (!seen[a[1]]++) printf "link\t%s >%s\n", a[1], url }'
        ;;
    version) printf '%s\n' "$version_number" ;;
    *) die "usage: bridge.sh search|episodes|resolve|version" ;;
esac
