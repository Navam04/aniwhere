#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only  (loads code from ani-cli, which is GPL-3.0; the rest of Aniwhere is MIT)
# Bridge between the web app and ani-cli.
# Loads ani-cli's own scraping functions and API settings (without its menus or player),
# so updating ani-cli also updates how the app finds streams.
#   bridge.sh search <query>              -> id<TAB>title per line
#   bridge.sh episodes <show-id>          -> episode-id<TAB>episode-number per line
#   bridge.sh resolve <show-id> <ep> <sub|dub>
#        -> key<TAB>value lines: refr, mal, sub, audio, then link<TAB>quality >url
#   bridge.sh version                     -> ani-cli version
ANI="${ANI_CLI_PATH:-/usr/local/bin/ani-cli}"
eval "$(sed -n '2,/^# MAIN/p' "$ANI")"
eval "$(sed -n '/^# setup/,/^curl_exe=/p' "$ANI")"
die() { printf '%s\n' "$*" >&2; exit 1; }
info() { :; }

cmd="$1"
[ "$#" -gt 0 ] && shift
case "$cmd" in
    search) hianime_search "$(printf '%s' "$*" | sed 's| |+|g')" ;;
    episodes) hianime_episodes "$1" ;;
    resolve)
        episode_maps="$(hianime_episodes "$1")" || exit 1
        hianime_m3u8 "$2" "$3" || die "No $3 source for episode $2"
        printf 'refr\t%s\nmal\t%s\nsub\t%s\naudio\t%s\n' "$refr" "$mal_id" "$sub_link" "$audio_link"
        printf '%s\n' "$links" | sed 's|^|link\t|'
        ;;
    version) printf '%s\n' "$version_number" ;;
    *) die "usage: bridge.sh search|episodes|resolve|version" ;;
esac
