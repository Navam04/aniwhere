# Install Aniwhere manually

For a Debian 12 or Ubuntu 22.04+ machine, VM or LXC container with systemd, without Docker. The installer sets up
everything else (Python environment, ani-cli, a system user and two systemd services).

## Before you start

- Root access on the machine.
- A free [Tailscale](https://tailscale.com) account, with the Tailscale app on the devices you'll watch on.
- In the [Tailscale admin console](https://login.tailscale.com/admin/dns), under **DNS**: turn on **MagicDNS** and
  **HTTPS Certificates**. Note your **tailnet name** (it looks like `tail1234.ts.net`).
- **Proxmox LXC:** pass `/dev/net/tun` through to the container so Tailscale can run. Add these lines to
  `/etc/pve/lxc/<id>.conf` on the host, then restart the container:
  ```
  lxc.cgroup2.devices.allow: c 10:200 rwm
  lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
  ```

## 1. Put the machine on your tailnet

```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

```bash
tailscale up --hostname=anime
```

Open the link it prints and approve the machine. The app will be at `https://anime.<tailnet name>`.

## 2. Download and install Aniwhere

Pick the latest version from the [Releases page](https://github.com/Navam04/aniwhere/releases) (here, 1.0.0):

```bash
mkdir -p /opt/anime-release && cd /opt/anime-release && curl -fsSL https://github.com/Navam04/aniwhere/archive/refs/tags/v1.0.0.tar.gz | tar xz --strip-components=1
```

```bash
sh deploy/install.sh
```

The installer asks for two things, and saves them in `/etc/anime/anime.env`:

- **The server's HTTPS name:** `anime.<tailnet name>`, e.g. `anime.tail1234.ts.net`.
- **Allowed logins:** your Tailscale login (the email you sign in with); add more, comma-separated. The first is the owner.

To run it without questions, set them first:
`ANIME_HOST=anime.tail1234.ts.net ANIME_ALLOWED_LOGINS=you@example.com sh deploy/install.sh`.

## 3. Serve it over HTTPS

```bash
tailscale serve --bg 8000
```

```bash
tailscale serve --bg --http=80 8002
```

The first makes the app available at `https://anime.<tailnet name>`. The second makes `http://anime/` redirect there.

## 4. Open it

On a device signed in to Tailscale, open `https://anime.<tailnet name>`.

- **Phone:** use *Share → Add to Home Screen* (iPhone) or *Install app* (Android) for the full-screen app and
  notifications.
- **AniList:** Settings → AniList walks you through connecting your account (optional).
- **Other people:** share the machine with them in the Tailscale admin console, then add their login in
  Settings → People (owner only).

## Where things are

| Path | What |
|---|---|
| `/etc/anime/anime.env` | Your settings (host name, allowed logins). Restart after editing: `systemctl restart anime anime-redirect` |
| `/opt/anime` | The installed app |
| `/var/lib/anime` | Your data: `anime.db`, downloaded episodes, nightly backups |
| `/opt/ani-cli-src` | ani-cli (updated daily by the app) |
| `journalctl -u anime` | Logs |

## Updating

Back up the database, then install the new release over the old one. Your settings and data are kept.

```bash
sqlite3 /var/lib/anime/anime.db ".backup /var/lib/anime/anime.db.bak"
```

```bash
rm -rf /opt/anime-release && mkdir -p /opt/anime-release && cd /opt/anime-release && curl -fsSL https://github.com/Navam04/aniwhere/archive/refs/tags/v1.1.0.tar.gz | tar xz --strip-components=1 && sh deploy/install.sh
```

Replace `v1.1.0` with the version you want. Check [CHANGELOG.md](../CHANGELOG.md) before a new major version for any
manual steps. The version you're on is shown in Settings → About.

## Troubleshooting

| Problem | Try |
|---|---|
| "This app is private" | The login you're signed in to Tailscale with isn't in `ANIME_ALLOWED_LOGINS` (`/etc/anime/anime.env`). |
| The page doesn't load | `systemctl status anime`, `tailscale serve status`, and check HTTPS Certificates is on in Tailscale. |
| Episodes won't play | Settings → Stream source → *Update ani-cli*, then Settings → Server health. |
