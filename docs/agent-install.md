# Aniwhere: install guide for AI agents

> **For the person:** give this file to an AI coding agent that can run commands on (or SSH into) the machine you
> want to install on, such as Claude Code or Codex. For example: *"Follow docs/agent-install.md to set up Aniwhere for
> me"*, with this file attached or linked. The agent asks you what it needs as it goes.
>
> **For the agent:** everything below is addressed to you. Follow it in order.

## What you're installing

Aniwhere (https://github.com/Navam04/aniwhere) is a self-hosted anime streaming web app. It runs on the user's
server and is reached from their devices over Tailscale with HTTPS. It is installed one of two ways:

- **Docker** (preferred when Docker is available): two containers, Tailscale and the app. Guide: `docs/install-docker.md`.
- **Manual** (Debian/Ubuntu with systemd, no Docker): `deploy/install.sh`. Guide: `docs/install-manual.md`.

Fetch the guides from `https://raw.githubusercontent.com/Navam04/aniwhere/main/docs/` and treat them as the source of
truth for commands. This file tells you how to run the setup as a conversation.

## Rules

1. **Ask, don't assume.** Ask the user one or two questions at a time, in plain language, and wait for answers.
   Explain briefly why you need each one.
2. **Never ask for passwords, API keys or auth keys in chat.** Tailscale sign-in uses a link the user opens.
   If the user wants to use a Tailscale auth key, tell them to paste it into the `.env` file themselves.
3. **Confirm before anything that changes the system** outside the install folder: installing packages, installing
   Tailscale, editing Proxmox config, opening ports. Say what you'll run and why.
4. **Don't expose the app** to the LAN or internet: no port mappings, no firewall changes, no `tailscale funnel`.
   It's meant to be reachable only over the tailnet.
5. If a step fails, show the user the relevant error, explain it simply, and propose a fix. Don't loop silently.

## Step 1: Where are you running?

Work out whether you have a shell on the target machine. Run `uname -a`, `cat /etc/os-release`, `id -u` and
`command -v docker systemctl tailscale`.

- If you're on the user's laptop/desktop and the server is a different machine, ask how to reach it (SSH alias or
  `user@host`) and run commands over SSH. If you can't reach it, tell the user they need to run you on the server
  or give you SSH access, and stop.
- If the machine is a Proxmox host (`pveversion` exists), ask whether they want Aniwhere in an existing container/VM or
  a new LXC container. For a new container, propose: Debian 12, unprivileged, 2 cores, 2 GB RAM, 16 GB disk or more,
  with Nesting and keyctl enabled if using Docker, or `/dev/net/tun` passed through if installing manually
  (see the guides). Confirm before creating it, then run the rest inside it with `pct exec`.
- You need root (or sudo) for the manual install, or permission to use Docker.

## Step 2: Ask the user

Ask these, briefly:

1. **Docker or manual?** Recommend Docker if `docker compose version` works (v2.23+), otherwise manual.
2. **Do you have a Tailscale account?** If not, ask them to create one at https://login.tailscale.com (free) and
   install Tailscale on their phone/computer, then continue.
3. **Turn on HTTPS:** ask them to open https://login.tailscale.com/admin/dns, turn on **MagicDNS** and
   **HTTPS Certificates**, and tell you the **tailnet name** shown there (like `tail1234.ts.net`).
4. **Machine name** on the tailnet (default `anime`). The app will be at `https://<name>.<tailnet name>`.
5. **Who may use it:** their Tailscale login email, plus anyone else's (comma-separated). The first is the owner.
   Others can be added later in the app.

## Step 3: Install

### Docker

1. `mkdir -p ~/aniwhere && cd ~/aniwhere`, then download `docker-compose.yml` and `.env.example` (as `.env`) as in
   `docs/install-docker.md`.
2. Write `.env` with `TS_HOSTNAME`, `ANIME_HOST=<name>.<tailnet>`, `ANIME_ALLOWED_LOGINS`, and leave `TS_AUTHKEY`
   empty unless the user filled it in themselves.
3. `docker compose up -d`.
4. Get the sign-in link: `docker compose logs tailscale | grep -o 'https://login.tailscale.com/[^ ]*' | tail -1`.
   Give it to the user, ask them to open it and approve the machine, and wait for them to confirm. The link lasts
   10 minutes; if `tailscale status` still says NeedsLogin afterwards, fetch the link again (it changes on restart).
5. Check: `docker compose ps` shows both running; `docker compose exec aniwhere curl -fs http://127.0.0.1:8000/api/ping`
   returns `{"ok":true,...}`; `docker compose exec tailscale tailscale serve status` lists port 443.

### Manual

1. If Tailscale isn't installed, confirm, then `curl -fsSL https://tailscale.com/install.sh | sh`.
   Run `tailscale up --hostname=<name>`, give the user the link it prints, and wait for them to approve.
   In an LXC container without `/dev/net/tun`, Tailscale won't start. Explain the Proxmox change from the manual
   guide and ask the user to make it (or make it on the host with their permission).
2. Download the latest release into `/opt/anime-release` (latest tag:
   `curl -fsSL https://api.github.com/repos/Navam04/aniwhere/releases/latest | grep tag_name`).
3. Run `ANIME_HOST=<name>.<tailnet> ANIME_ALLOWED_LOGINS=<logins> sh deploy/install.sh` from there.
4. `tailscale serve --bg 8000` and `tailscale serve --bg --http=80 8002`.
5. Check: `systemctl is-active anime` is `active`; `curl -fs http://127.0.0.1:8000/api/ping` returns `{"ok":true,...}`.

## Step 4: Hand over

Tell the user, in a short message:

- Open `https://<name>.<tailnet>` on a device signed in to Tailscale (the first load can take up to a minute while the
  certificate is issued).
- On a phone: *Share → Add to Home Screen* (iPhone) or *Install app* (Android).
- Settings → AniList connects their AniList account (optional; the app shows the steps).
- To let someone else in: share the machine with them in the Tailscale admin console, then add their login in
  Settings → People.
- How to update later: the *Updating* section of the guide they used.

Then ask them to open the app and confirm it loads. If they see "This app is private", the login they're signed in
with isn't in the allowed list; fix the settings and restart.
