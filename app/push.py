"""Web Push (works on iPhone once the app is added to the home screen)."""
import asyncio
import base64
import hashlib
import json
import logging
import os
import time
from urllib.parse import urlsplit

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid01
from pywebpush import WebPushException, webpush

from . import db

log = logging.getLogger("push")
KEY_PATH = db.DATA_DIR / "vapid.pem"
# Apple's push service rejects VAPID subjects that aren't a real mailto: or https: URL.
SUBJECT = os.environ.get("ANIME_PUSH_SUBJECT", "https://anime.invalid")


def _vapid():
    if not KEY_PATH.exists():
        v = Vapid01()
        v.generate_keys()
        v.save_key(str(KEY_PATH))
        os.chmod(KEY_PATH, 0o600)
    return Vapid01.from_file(str(KEY_PATH))


def public_key():
    raw = _vapid().public_key.public_bytes(serialization.Encoding.X962,
                                           serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def device_id(endpoint):
    """A short, stable id for a device. The endpoint itself works like a key to the device, so it never leaves
    the server; pages compute the same hash from their own subscription to recognise themselves."""
    return hashlib.sha256(endpoint.encode()).hexdigest()[:16]


def _fallback_label(endpoint):
    host = urlsplit(endpoint).hostname or ""
    if host.endswith("push.apple.com"):
        return "Apple device"
    if "googleapis" in host:
        return "Chrome"
    if "mozilla" in host:
        return "Firefox"
    if "windows" in host or "notify" in host:
        return "Edge"
    return "Browser"


def subscribe(sub, label=None):
    label = (label or "").strip()[:60] or _fallback_label(sub["endpoint"])
    db.run("INSERT INTO push_sub(endpoint,user,data,label,added) VALUES(?,?,?,?,?) "
           "ON CONFLICT(endpoint) DO UPDATE SET user=excluded.user, data=excluded.data, label=excluded.label, last_error=NULL",
           sub["endpoint"], db.user(), json.dumps(sub), label, time.time())


def count():
    return db.one("SELECT COUNT(*) n FROM push_sub WHERE user=?", db.user())["n"]


def devices():
    """The current person's devices, newest first."""
    rows = db.q("SELECT endpoint, label, added, last_sent, last_error FROM push_sub WHERE user=? "
                "ORDER BY COALESCE(added, 0) DESC", db.user())
    return [{"id": device_id(r["endpoint"]), "label": r["label"] or _fallback_label(r["endpoint"]),
             "added": r["added"], "last_sent": r["last_sent"], "last_error": r["last_error"]} for r in rows]


def _endpoint_of(dev_id):
    for r in db.q("SELECT endpoint FROM push_sub WHERE user=?", db.user()):
        if device_id(r["endpoint"]) == dev_id:
            return r["endpoint"]
    return None


def remove(dev_id):
    """Stop sending to one of the current person's devices. Returns False if it isn't theirs."""
    endpoint = _endpoint_of(dev_id)
    if not endpoint:
        return False
    db.run("DELETE FROM push_sub WHERE endpoint=? AND user=?", endpoint, db.user())
    return True


def _send_one(sub, payload):
    """Runs in a worker thread. Returns (ok, error, gone)."""
    try:
        webpush(sub, json.dumps(payload), vapid_private_key=str(KEY_PATH),
                vapid_claims={"sub": SUBJECT}, ttl=24 * 3600)
        return True, None, False
    except WebPushException as ex:
        status = ex.response.status_code if ex.response is not None else None
        log.warning("push failed (%s): %s", status, ex)
        return False, f"HTTP {status}" if status else str(ex)[:120], status in (404, 410)
    except Exception as ex:  # network trouble and the like
        log.warning("push failed: %s", ex)
        return False, str(ex)[:120] or ex.__class__.__name__, False


async def _send(rows, title, body, url):
    _vapid()
    payload = {"title": title, "body": body, "url": url}
    results = await asyncio.gather(*(asyncio.to_thread(_send_one, json.loads(r["data"]), payload) for r in rows))
    now = time.time()
    for r, (ok, error, gone) in zip(rows, results):
        if gone:  # the browser dropped this subscription (app removed, permission revoked...)
            db.run("DELETE FROM push_sub WHERE endpoint=?", r["endpoint"])
        elif ok:
            db.run("UPDATE push_sub SET last_sent=?, last_error=NULL WHERE endpoint=?", now, r["endpoint"])
        else:
            db.run("UPDATE push_sub SET last_error=? WHERE endpoint=?", error, r["endpoint"])
    return sum(ok for ok, _e, _g in results)


async def send_all(title, body, url="/", user=None):
    """Send to every device of one person (default: the current person)."""
    rows = db.q("SELECT endpoint, data FROM push_sub WHERE user=?", user or db.user())
    return await _send(rows, title, body, url)


async def send_to(dev_id, title, body, url="/"):
    """Send to one of the current person's devices. Returns None if it isn't theirs, else 1 or 0."""
    endpoint = _endpoint_of(dev_id)
    if not endpoint:
        return None
    return await _send(db.q("SELECT endpoint, data FROM push_sub WHERE endpoint=?", endpoint), title, body, url)
