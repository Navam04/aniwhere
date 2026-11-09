# Install Aniwhere with Docker

This runs two containers: **Tailscale**, which puts the app on your tailnet with HTTPS, and **Aniwhere**, which
shares the Tailscale container's network. Nothing is exposed on your LAN or the internet.

## Before you start

- A Linux machine with Docker and Docker Compose v2.23 or newer (`docker compose version`).
  Images are published for `amd64` and `arm64`.
- A free [Tailscale](https://tailscale.com) account, with the Tailscale app on the devices you'll watch on.
- In the [Tailscale admin console](https://login.tailscale.com/admin/dns), under **DNS**: turn on **MagicDNS** and
  **HTTPS Certificates**. Note your **tailnet name** (it looks like `tail1234.ts.net`).
- **Proxmox LXC:** Docker inside an LXC container needs *Options → Features → Nesting* and *keyctl* turned on.

## 1. Get the files

```bash
mkdir -p ~/aniwhere && cd ~/aniwhere
```

```bash
curl -fsSLO https://raw.githubusercontent.com/Navam04/aniwhere/main/docker-compose.yml
```

```bash
curl -fsSL https://raw.githubusercontent.com/Navam04/aniwhere/main/.env.example -o .env
```

## 2. Fill in `.env`

| Setting | What to put |
|---|---|
| `TS_HOSTNAME` | The machine name on your tailnet, e.g. `anime`. |
| `ANIME_HOST` | `<TS_HOSTNAME>.<tailnet name>`, e.g. `anime.tail1234.ts.net`. |
| `ANIME_ALLOWED_LOGINS` | Your Tailscale login (the email you sign in with). Add more, comma-separated. The first one is the owner. |
| `TS_AUTHKEY` | Optional. Leave empty to sign in with a link instead (step 3). |
| `ANIWHERE_VERSION` | `latest`, or a release like `1.0.0` to stay on that version. |

## 3. Start it

```bash
docker compose up -d
```

If you left `TS_AUTHKEY` empty, get the sign-in link and open it in a browser:

```bash
docker compose logs tailscale | grep -o 'https://login.tailscale.com/[^ ]*' | tail -1
```

The link works for 10 minutes. If it runs out, Tailscale restarts with a new one: run the command again for the
current link, and go all the way to **Connect** on the page it opens.

After you approve the machine, Tailscale fetches an HTTPS certificate. The first visit can take up to a minute.

## 4. Open it

On a device signed in to Tailscale, open `https://<ANIME_HOST>` (also `http://<TS_HOSTNAME>/`).

- **Phone:** use *Share → Add to Home Screen* (iPhone) or *Install app* (Android) for the full-screen app and
  notifications.
- **AniList:** Settings → AniList walks you through connecting your account (optional).
- **Other people:** share the machine with them in the Tailscale admin console, then add their login in
  Settings → People (owner only).

## Updating

```bash
cd ~/aniwhere && docker compose pull && docker compose up -d
```

Your data lives in the `aniwhere-data` volume and is kept. Check [CHANGELOG.md](../CHANGELOG.md) before a new major
version (2.0.0, 3.0.0…) for any manual steps. The version you're on is shown in Settings → About.

## Backups

The app keeps a nightly database backup (last 7) inside the volume. To take one now:

```bash
docker compose exec aniwhere sqlite3 /data/anime.db ".backup /data/anime.db.manual"
```

## Troubleshooting

| Problem | Try |
|---|---|
| "This app is private" | The login you're signed in to Tailscale with isn't in `ANIME_ALLOWED_LOGINS`. Fix `.env`, then `docker compose up -d`. |
| The page doesn't load | `docker compose ps` (both running?), `docker compose logs aniwhere`, and check HTTPS Certificates is on in Tailscale. |
| Episodes won't play | Settings → Stream source → *Update ani-cli*, then Settings → Server health. |
| Aniwhere stops right away | `docker compose logs aniwhere`. Usually `ANIME_ALLOWED_LOGINS` is empty. |
