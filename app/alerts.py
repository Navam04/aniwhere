"""Health alerts: checks the server's vital signs every few minutes and sends the owner a push notification
when one breaks, and again when it's working again.

Checks:
  source  - a real lookup through ani-cli (search, episode list, stream links), so a provider change or a
            blocked site is noticed before anyone presses play
  disk    - free space on the data disk
  backup  - the nightly database backup is recent
A check must fail FAIL_AFTER times in a row before it alerts, so a single blip doesn't wake anyone."""
import asyncio
import logging
import time

from . import db, health, push, source

log = logging.getLogger("alerts")
INTERVAL = 300            # seconds between rounds of checks
PROBE_EVERY = 1800        # the stream-source probe costs a few requests to the site, so run it less often
PROBE_RETRY = 300         # ...but re-check soon once it has failed, to confirm or clear the problem
FAIL_AFTER = 2
PROBE_TITLE = "Frieren"   # a long-running, well-indexed show that should always be findable
MIN_FREE_DISK = 2e9
MAX_BACKUP_AGE = 2 * 86400

LABELS = {"source": "Stream source", "disk": "Disk space", "backup": "Backups"}
_running = False


def enabled():
    return db.get_setting("health_alerts", "1") == "1"


def set_enabled(on):
    db.set_setting("health_alerts", "1" if on else "0")


def _state():
    return db.get_json("health_alerts_state", {})


def checks():
    """Current state of every check, for the Settings page."""
    st = _state()
    return [{"name": k, "label": LABELS[k], **st.get(k, {"ok": None})} for k in LABELS]


async def _probe_source():
    results = await source.search(PROBE_TITLE)
    if not results:
        raise source.SourceError(f'searching for "{PROBE_TITLE}" found nothing')
    sid = results[0]["id"]
    eps = await source.episodes(sid, max_age=0)
    if not eps:
        raise source.SourceError(f"no episodes listed for {results[0]['title']}")
    await source.resolve(sid, eps[0], "sub", fresh=True)


async def _run_checks(st):
    """{name: (ok, detail)} for every check that is due this round."""
    out = {}
    now = time.time()
    src = st.get("source", {})
    due = PROBE_RETRY if src.get("ok") is False or src.get("fails") else PROBE_EVERY
    if now - src.get("checked", 0) >= due:
        try:
            await _probe_source()
            out["source"] = (True, "Search, episode list and stream links all work")
        except Exception as ex:  # SourceError, timeouts, anything else: all mean playback is broken
            out["source"] = (False, str(ex)[:300] or ex.__class__.__name__)
    free = health.disk()["free"]
    out["disk"] = (free >= MIN_FREE_DISK, f"{free / 1e9:.1f} GB free")
    last = float(db.get_setting("last_backup", 0) or 0)
    if last:
        out["backup"] = (now - last <= MAX_BACKUP_AGE, f"last backup {(now - last) / 3600:.0f} hours ago")
    return out


async def _notify(title, body):
    if not enabled():
        return 0
    try:
        return await push.send_all(title, body, "/#/settings", user=db.OWNER)
    except Exception as ex:
        log.warning("health alert push failed: %s", ex)
        return 0


async def run_once():
    """One round of checks; alerts on changes. Returns the new state."""
    global _running
    if _running:
        return _state()
    _running = True
    try:
        st = _state()
        now = time.time()
        for name, (ok, detail) in (await _run_checks(st)).items():
            c = {"ok": None, "fails": 0, "alerted": False, **st.get(name, {})}
            c.update(checked=now, detail=detail)
            if ok:
                if c.get("alerted"):
                    await _notify(f"{LABELS[name]} is working again", detail)
                    log.info("health check %s recovered: %s", name, detail)
                if c.get("ok") is not True:
                    c["since"] = now
                c.update(ok=True, fails=0, alerted=False)
            else:
                c["fails"] = c.get("fails", 0) + 1
                log.warning("health check %s failed (%d in a row): %s", name, c["fails"], detail)
                if c["fails"] >= FAIL_AFTER:
                    if c.get("ok") is not False:
                        c["since"] = now
                    c["ok"] = False
                    if not c.get("alerted") and enabled():  # with alerts off, alert once they're back on
                        await _notify(f"Aniwhere: {LABELS[name]} problem", detail)
                        c["alerted"] = True
            st[name] = c
        db.set_json("health_alerts_state", st)
        return st
    finally:
        _running = False


async def keep_watch():
    await asyncio.sleep(60)  # let the app finish starting
    while True:
        try:
            await run_once()
        except Exception as ex:
            log.warning("health checks failed to run: %s", ex)
        await asyncio.sleep(INTERVAL)
