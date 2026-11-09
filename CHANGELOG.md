# Changelog

All notable changes to Aniwhere. Versions follow [Semantic Versioning](https://semver.org): a major version can need
manual steps when updating (they're listed under its heading), minor versions add features, patches fix things.

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
