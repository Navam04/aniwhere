# The stream source, and the 1.1.0 switch to Miruro

Aniwhere doesn't scrape anime sites itself. `bridge.sh` loads the scraping functions from
[ani-cli](https://github.com/pystardust/ani-cli) and calls them, so the app finds streams wherever ani-cli does.
The app updates ani-cli every day (a `git pull` of `/opt/ani-cli-src`, or the volume in Docker) and Settings has an
"Update ani-cli" button.

That works as long as ani-cli keeps the same function names. When ani-cli changes the site it scrapes (its
*provider*), its functions change too, and `bridge.sh` has to be updated to match. This page records the one time
that has happened so far and how to handle the next one.

## What happened (2026-11-26)

ani-cli replaced its HiAnime provider with Miruro (ani-cli 5.2.0, upstream commit "feat: switch provider to Miruro").
The daily update pulled it in, and from then on:

- every lookup failed with `bridge.sh: hianime_episodes: not found`, so nothing played and new-episode
  notifications stopped;
- every saved match between an AniList show and the stream source pointed at a HiAnime id
  (e.g. `one-piece-1`), which means nothing to Miruro.

## What 1.1.0 changed

| Area | Change |
| --- | --- |
| `bridge.sh` | Calls `miruro_search`, `miruro_episodes` and `miruro_media` instead of the `hianime_*` functions. Before any lookup it checks those functions exist, and if not stops with `ani-cli <version> no longer has miruro_… (its stream provider changed); bridge.sh needs updating`. |
| Show ids | Miruro ids look like `<anilist-id>:<miruro-id>:<mal-id>`. Matching now takes the result whose AniList id is the show's own, so matches are exact instead of title guesses. |
| Saved matches | On start, the app forgets any saved match that isn't a Miruro id (`app/db.py`), so each show is matched again the first time it's opened or checked. Each show's sub/dub choice is kept. |
| Stream links | Miruro lists several servers per episode. `bridge.sh resolve` takes the first HLS server and returns only its links, so one Referer/Origin pair works for every playlist, segment and subtitle request. |
| HLS proxy and episode cache | The new hosts refuse requests without an `Origin` header (HTTP 403), so `app/hls.py` and `app/cache.py` now send `Origin` as well as `Referer` (`hls.upstream_headers`). |
| Subtitles | Subtitles now come as SRT or ASS (Aegisub) files, which browsers can't show. `hls.to_vtt` converts them to WebVTT: ASS dialogue keeps its timing and text, and styling, vector drawings and duplicate typesetting layers are dropped. |
| Health alerts | New in the same release (see below), so the next break is noticed within the hour instead of when someone presses play. |

No manual steps are needed when updating: install 1.1.0 and shows are matched again automatically.

## Health alerts

`app/alerts.py` runs a round of checks every 5 minutes:

- **Stream source:** a real search, episode list and stream lookup through `bridge.sh` (every 30 minutes, and
  every 5 minutes after a failure until it's working again).
- **Disk space:** at least 2 GB free on the data disk.
- **Backups:** the nightly database backup is under 2 days old.

When a check fails twice in a row, the owner gets one push notification, and gets another when the check works
again. Settings → Server health (owner only) shows each check with an on/off switch, **Check now** and **Send test
alert**. Push notifications have to be turned on for at least one of the owner's devices.

API (owner only): `PUT /api/health/alerts` `{"enabled": true|false}`, `POST /api/health/alerts/check`,
`POST /api/health/alerts/test`. `GET /api/health` includes an `alerts` object for the owner.

## When ani-cli changes provider again

You'll see it as a "Stream source problem" alert, or as the `no longer has …` error in Settings → Server health or
the service log (`journalctl -u anime`).

1. Look at the new ani-cli (`/opt/ani-cli-src/ani-cli`): the functions under `# SCRAPING` are the new provider's
   search, episode list and stream-link functions, and the `# setup` block below `# MAIN` holds its settings.
2. Update `bridge.sh` to call them. The app only depends on what the bridge prints:

   ```
   bridge.sh search <query>           -> <show-id><TAB><title>, one per line
   bridge.sh episodes <show-id>       -> <episode><TAB><episode>, one per line (numbers, sorted)
   bridge.sh resolve <show-id> <ep> <sub|dub>
       -> key<TAB>value lines: server, refr, origin, mal, sub, audio
          then one "link<TAB><quality> ><url>" line per quality, best first
   bridge.sh version                  -> ani-cli's version
   ```

   `refr` and `origin` are the headers the video host wants, `mal` is the show's MyAnimeList id (used to verify
   title matches), `sub` is a subtitle file and `audio` a separate audio playlist; leave any of them empty if the
   source doesn't have it. Exit non-zero with a one-line message on stderr when something isn't found.
3. If the new show ids look different, make the "forget old matches" query in `db.init()` and the exact-match rule
   in `source.find_match()` recognise them, so saved matches are redone.
4. Test on the server before releasing: search a show, play an episode in sub and dub, and check the subtitles.
   Settings → Server health → **Check now** runs the same probe the alerts use.
