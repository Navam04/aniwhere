"""Web Push (works on iPhone once the app is added to the home screen)."""
import asyncio
import base64
import json
import logging
import os

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


def subscribe(sub):
    db.run("INSERT INTO push_sub(endpoint,user,data) VALUES(?,?,?) "
           "ON CONFLICT(endpoint) DO UPDATE SET user=excluded.user, data=excluded.data",
           sub["endpoint"], db.user(), json.dumps(sub))


def count():
    return db.one("SELECT COUNT(*) n FROM push_sub WHERE user=?", db.user())["n"]


def _send_one(sub, payload):
    try:
        webpush(sub, json.dumps(payload), vapid_private_key=str(KEY_PATH),
                vapid_claims={"sub": SUBJECT}, ttl=24 * 3600)
        return True
    except WebPushException as ex:
        status = ex.response.status_code if ex.response is not None else None
        if status in (404, 410):
            db.run("DELETE FROM push_sub WHERE endpoint=?", sub["endpoint"])
        log.warning("push failed (%s): %s", status, ex)
        return False


async def send_all(title, body, url="/", user=None):
    """Send to every device of one person (default: the current person)."""
    _vapid()
    payload = {"title": title, "body": body, "url": url}
    subs = [json.loads(r["data"]) for r in db.q("SELECT data FROM push_sub WHERE user=?", user or db.user())]
    results = await asyncio.gather(*(asyncio.to_thread(_send_one, s, payload) for s in subs))
    return sum(results)
