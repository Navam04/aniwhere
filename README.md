<p align="center">
  <a href="https://navam.dev"><img src="docs/logo.svg" width="96" alt="Aniwhere logo"></a>
</p>

<h1 align="center">Aniwhere</h1>

<p align="center">
  Watch anime anywhere, from your own server.<br>
  A self-hosted, streaming-service style web app built on <a href="https://github.com/pystardust/ani-cli">ani-cli</a>.
</p>

<p align="center">
  <a href="https://github.com/Navam04/aniwhere/releases/latest">Latest release</a> ·
  <a href="docs/install-docker.md">Install with Docker</a> ·
  <a href="docs/install-manual.md">Install manually</a> ·
  <a href="docs/agent-install.md">Install with an AI agent</a>
</p>

---

Aniwhere runs on a home server and is reachable from your devices anywhere through
[Tailscale](https://tailscale.com), with HTTPS and no open ports. On a phone it installs to the home screen and
behaves like an app. Everyone you let in gets their own lists, progress and settings.

## Features

- **Browse like a streaming service:** trending, this season and all-time popular (metadata from AniList), title
  search with genre/format/status filters, "Because you watched" and "More like this" recommendations
- **A real player:** skip intro/credits (AniSkip, optional auto-skip), Up-next countdown with autoplay and
  next-season handoff, quality and speed per device, keyboard shortcuts (`?`), double-tap to seek, subtitle styling
- **Sub or Dub per show:** dub by default, falls back to sub
- **Resume anywhere:** progress is kept on the server, so you can stop on your phone and continue on your TV
- **Lists:** Watching, Plan to watch, Completed, On hold, Dropped, Rewatching, with scores, notes and history;
  two-way AniList sync
- **Episodes kept on the server:** the next episodes of everyone's Watching shows download nightly and play from disk
- **Collections:** franchises (with story-order guides) and studios
- **Profiles:** each Tailscale login has its own lists, progress, history and settings; the owner adds people in Settings
- **Push notifications** for new episodes (on iPhone, from the home-screen app)
- Filler tags and "Skip filler", stats and a yearly recap, TV mode for remotes (`?tv=1`)
- **Looks after itself:** ani-cli updates daily, nightly database backups (last 7 kept), a Server health panel

## Install

You need a Linux server that's always on (a mini PC, NAS, Proxmox container or VPS) and a free
[Tailscale](https://tailscale.com) account.

| Way | Best for | Guide |
|---|---|---|
| **Docker** | Most people: Unraid, TrueNAS, Synology, any machine with Docker | [docs/install-docker.md](docs/install-docker.md) |
| **Manual** | A Debian/Ubuntu machine, VM or LXC container, without Docker | [docs/install-manual.md](docs/install-manual.md) |
| **AI agent** | Let Claude Code or Codex do it: give it one file and answer its questions | [docs/agent-install.md](docs/agent-install.md) |

Updating, backups and moving between versions are covered at the end of each guide.
Releases and what changed in each are on the [Releases page](https://github.com/Navam04/aniwhere/releases)
and in [CHANGELOG.md](CHANGELOG.md).

## How it works

```
your devices ──HTTPS over Tailscale──▶ Aniwhere (FastAPI, port 8000)
                                         ├─ AniList GraphQL: metadata, lists
                                         ├─ bridge.sh ─▶ ani-cli functions: search, episodes, stream links
                                         └─ HLS proxy: fetches playlists and video segments for your devices
```

- `bridge.sh` loads ani-cli's own scraping functions (without its menus or player), so updating ani-cli updates
  how streams are found. The app pulls the latest ani-cli daily, and Settings has an "Update ani-cli" button.
- AniList shows are matched to the stream source by title search, then verified by MAL ID.
- All video goes through your server, so your devices only ever talk to your server.
- Access is checked against Tailscale identity: only the logins you list (and people the owner adds) get in.

| Path | What it is |
|---|---|
| `app/` | FastAPI backend: API, playback, HLS proxy, AniList sync, background jobs, SQLite storage |
| `static/` | Single-page frontend (vanilla JS; the player is `player.js`), service worker, manifest |
| `bridge.sh` | The bridge to ani-cli |
| `deploy/` | Manual installer, systemd units, icon generator, HTTP→HTTPS redirect |
| `Dockerfile`, `docker-compose.yml` | The Docker image and a ready-to-run compose file with Tailscale |

## Disclaimer

Aniwhere doesn't host, store or distribute any video. It's a front end that uses ani-cli to find streams that are
already publicly available on third-party sites, the same way a web browser would. You're responsible for how you use
it and for following the laws where you live. Aniwhere isn't affiliated with AniList, ani-cli or any streaming site.

## Contributing and support

Bug reports and ideas are welcome in [Issues](https://github.com/Navam04/aniwhere/issues). See
[CONTRIBUTING.md](CONTRIBUTING.md). Security problems: see [SECURITY.md](SECURITY.md).

## License

MIT, © Navam Goyani ([navam.dev](https://navam.dev)). Keep the copyright notice when you share or build on it.
`bridge.sh` is GPL-3.0, because it loads code from ani-cli (GPL-3.0). See [LICENSE](LICENSE).
