# Changelog

All notable changes to Aniwhere. Versions follow [Semantic Versioning](https://semver.org): a major version can need
manual steps when updating (they're listed under its heading), minor versions add features, patches fix things.

## [1.4.0] - 2026-11-27

- New: downloads. Every episode on a show's page has a Download button, and the Episodes header has "Download
  season", which queues every episode not on the server yet. Episodes download one after another and are saved
  on the server: they start instantly on any of your devices, play even when the stream site is down, and stay
  until someone deletes them (the automatic cache never removes them). Everyone on the app can download.
- New: when a download would leave less than 2 GB of the server's download space ("Space to use"), the app asks
  first and suggests episodes to delete to make room: ones you've watched, then the ones nobody has played for
  the longest. Nothing is downloaded if the server's disk itself would drop below 1 GB free.
- New: Settings → Downloads shows the space used, your queue (cancel waiting episodes) and your downloads
  (delete them). You can delete your own downloads and automatically kept episodes; only the owner can delete
  someone else's.
- Fixed: saving episodes on the server (downloads and the nightly cache) failed with "429 Too Many Requests"
  since the switch to Miruro. Segments are now fetched two at a time, and when a host asks to slow down, all
  fetches pause for as long as it asks.

## [1.3.1] - 2026-11-27

- Changed (computers, tablets and landscape screens): on a show's page the My list panel (status, episodes
  watched, score, notes) stays in its place beside the episodes instead of following you down the page, and
  Related and More like this now run across the full width of the page underneath. Episodes in the list
  have more room around them. Phones are unchanged.

## [1.3.0] - 2026-11-27

- New: Settings → New episode notifications says whether this device gets notifications, with a Turn on / Turn off
  button to match, and a "Send a test here".
- New: a list of all your devices that get notifications (named like "iPhone" or "Mac · Safari", with when each
  was added and how its last notification went). From any device you can send a test to one or remove it.
  Devices added before this version get their name the next time you open Settings on them.

## [1.2.0] - 2026-11-27

- New: app updates without re-adding it to the home screen. When the server has a newer version, the app shows
  "A new version is ready" with a Refresh button. It checks when you come back to the app and every
  15 minutes, and never interrupts a video: the banner waits until the player is closed.
- New: Settings → About shows which version the app is running and has a "Refresh app" button that reloads it with
  the newest files. Notifications stay on.

## [1.1.0] - 2026-11-27

- Fixed: streaming stopped working after ani-cli switched its provider from HiAnime to Miruro. The bridge now
  uses ani-cli's Miruro functions, and shows are matched again automatically (Miruro ids include the AniList id,
  so matches are exact). Your sub/dub choice per show is kept.
- Fixed: stream requests now send the Origin header the new hosts require, and SRT and ASS subtitles are
  converted to WebVTT.
- New: health alerts. The server checks streaming (a real search + episode list + stream lookup), disk space and
  backups every few minutes and sends the owner a push notification when one breaks and when it's fixed.
  Settings → Server health has an on/off switch, "Check now" and "Send test alert".
- What happened, what changed and how to handle ani-cli's next provider change:
  [docs/stream-source.md](docs/stream-source.md)

## [1.0.2] - 2026-11-10

Fixes.

- Watching on a phone: rotating to landscape and back to portrait no longer makes the video player disappear
  (Safari kept a stale size for it)

## [1.0.1] - 2026-11-09

Fixes.

- Dropdowns match the app's theme: Safari (macOS and iOS) drew them with the glossy system look. They now open the
  app's own menu, a popover under the field or a bottom sheet on touch, and work with the keyboard
- Settings page spacing: sub-sections get room and a divider, hints sit under what they explain, and paired fields
  stay aligned on phones
- Settings: a cache limit that isn't one of the presets (e.g. 12 GB) showed as 1 GB
- Collections: the watch-order switcher was hidden behind the header image on tall windows

## [1.0.0] - 2026-11-09

First public release.

- Streaming-service style browsing (trending, this season, all-time popular), search with filters, recommendations
- Custom player: skip intro/credits, Up-next with autoplay, quality/speed per device, keyboard shortcuts,
  double-tap seek, subtitle styling, playback recovery
- Per-show Sub/Dub, resume on any device, lists with scores and notes, history, stats and yearly recap
- Two-way AniList sync
- Collections: franchises with story-order guides, and studios
- Profiles for each Tailscale login; the owner adds people in Settings
- Next episodes of Watching shows kept on the server
- Filler tags and Skip filler, push notifications for new episodes, TV mode
- Daily ani-cli updates, nightly database backups, Server health panel
- Docker image (`ghcr.io/navam04/aniwhere`) with a compose file that includes Tailscale
- Manual installer for Debian/Ubuntu, and an install guide for AI agents (Claude Code, Codex)
