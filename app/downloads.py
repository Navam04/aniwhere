"""Downloads: anyone on the app can save episodes on the server on purpose (one episode, or a whole season).

A download is a normal episode-cache copy (cache.py) whose meta.json lists who downloaded it in "kept_by"; the
cache never drops those by itself. Requests go into a queue (kept in the database, so it survives restarts) and
a single worker saves them one after another.

Space: downloads count towards the cache's "Space to use" limit. Before queueing, the page asks check(); when
less than WARN_LEFT of the limit would be left, it asks the person to confirm and suggests copies to delete
(ones they've watched first, then the least recently played). The server never fills its disk: an episode is
refused when it would leave less than MIN_DISK_FREE free."""
import asyncio
import logging
import shutil
import time

from . import cache, db

log = logging.getLogger("downloads")
QUEUE_KEY = "download_queue"
WARN_LEFT = 2e9
MIN_DISK_FREE = 1e9
EST_SIZE = {1080: 400e6, 720: 250e6, 480: 120e6}  # rough size of one ~24 minute episode at each quality
_worker = None
status = {"current": None}


def _queue():
    return db.get_json(QUEUE_KEY, [])


def _save_queue(q):
    db.set_json(QUEUE_KEY, q)


def _key(aid, ep, mode):
    return f"{int(aid)}|{ep}|{mode}"


def estimate():
    return EST_SIZE.get(cache.settings()["quality"], 400e6)


def space():
    """Bytes for the 'Space to use' limit, what's used, what queued downloads will take, and what's left."""
    limit = cache.settings()["limit_gb"] * 1e9
    used = cache.usage()
    queued = sum(1 for it in _queue() if it["state"] in ("queued", "downloading")) * estimate()
    free = shutil.disk_usage(db.DATA_DIR).free
    return {"limit": limit, "used": used, "queued": queued, "left": limit - used - queued, "disk_free": free,
            "per_episode": estimate(), "warn_below": WARN_LEFT}


def _copy(aid, ep, mode):
    """The saved copy that plays for `mode` (a dub request may be served by a sub standing in for it)."""
    meta = cache._meta(aid, ep, mode)
    if meta:
        return meta
    sub = cache._meta(aid, ep, "sub") if mode == "dub" else None
    return sub if sub and sub.get("fallback_for") == "dub" else None


def can_delete(meta, user):
    kept = meta.get("kept_by") or []
    return user == db.OWNER or not kept or set(kept) <= {user}


# what's on the server for a show ---------------------------------------------------------------
def show_state(aid, mode):
    """{episode: {"state": done|queued|downloading|failed, "mine": bool, "error": str?}} for one show and mode."""
    me = db.user()
    out = {}
    for ep in cache.cached_episodes(aid, mode):
        meta = _copy(aid, ep, mode) or {}
        kept = meta.get("kept_by") or []
        out[ep] = {"state": "done", "mine": me in kept, "kept": bool(kept), "size": meta.get("size", 0),
                   "deletable": can_delete(meta, me)}
    for it in _queue():
        if it["anilist_id"] == int(aid) and it["mode"] == mode and it["episode"] not in out:
            out[it["episode"]] = {"state": it["state"], "mine": it["user"] == me, "error": it.get("error")}
    return out


# space check and suggestions --------------------------------------------------------------------
def check(aid, episodes, mode):
    """What downloading these would take, whether to ask first, and copies the person could delete instead."""
    me = db.user()
    state = show_state(aid, mode)
    new = [ep for ep in dict.fromkeys(str(e) for e in episodes) if ep not in state or state[ep]["state"] == "failed"]
    sp = space()
    need = len(new) * sp["per_episode"]
    left_after = sp["left"] - need
    out = {"episodes": new, "need": need, "space": sp, "left_after": left_after,
           "warn": bool(new) and left_after < WARN_LEFT,
           "blocked": bool(new) and sp["disk_free"] - sp["queued"] - need < MIN_DISK_FREE,
           "suggestions": []}
    if out["warn"]:
        out["suggestions"] = suggestions(WARN_LEFT - left_after, exclude={(int(aid), ep) for ep in new})
    return out


def suggestions(want_bytes, exclude=()):
    """Copies this person may delete, most sensible first: episodes they've watched, then least recently played."""
    me = db.user()
    watched = {(r["anilist_id"], r["episode"]) for r in
               db.q("SELECT anilist_id, episode FROM watch WHERE user=? AND completed=1", me)}
    items = [m for m in cache.entries() if can_delete(m, me) and (m["anilist_id"], m["episode"]) not in exclude]
    items.sort(key=lambda m: ((m["anilist_id"], m["episode"]) not in watched,
                              max(m.get("last_used") or 0, m.get("created") or 0)))
    titles = db.cached_media(list({m["anilist_id"] for m in items}), 10 ** 9)
    out, total = [], 0
    for m in items:
        if total >= want_bytes and len(out) >= 3:
            break
        t = titles.get(m["anilist_id"]) or {}
        name = (t.get("title") or {}).get("english") or (t.get("title") or {}).get("romaji") or f"Show {m['anilist_id']}"
        out.append({"anilist_id": m["anilist_id"], "episode": m["episode"], "mode": m["mode"], "title": name,
                    "size": m.get("size", 0), "watched": (m["anilist_id"], m["episode"]) in watched,
                    "last_used": m.get("last_used") or None, "created": m.get("created"),
                    "kept_by_me": me in (m.get("kept_by") or [])})
        total += m.get("size", 0)
    return out


# queue ------------------------------------------------------------------------------------------
def enqueue(aid, episodes, mode):
    """Queue episodes (in the order given). Ones already on the server are just marked as yours."""
    me = db.user()
    q = _queue()
    have = {_key(it["anilist_id"], it["episode"], it["mode"]) for it in q if it["state"] != "failed"}
    q = [it for it in q if not (it["state"] == "failed" and it["anilist_id"] == int(aid) and it["mode"] == mode
                                and it["episode"] in {str(e) for e in episodes})]
    added = kept = 0
    for ep in dict.fromkeys(str(e) for e in episodes):
        meta = _copy(aid, ep, mode)
        if meta:
            _mark_kept(meta, me)
            kept += 1
        elif _key(aid, ep, mode) not in have:
            q.append({"anilist_id": int(aid), "episode": ep, "mode": mode, "user": me, "added": time.time(),
                      "state": "queued"})
            added += 1
    _save_queue(q)
    start()
    return {"queued": added, "already_saved": kept}


def cancel(aid, ep, mode):
    """Take a waiting or failed episode out of the queue (one being downloaded right now finishes first)."""
    me = db.user()
    q = _queue()
    keep = [it for it in q if not (it["anilist_id"] == int(aid) and it["episode"] == str(ep) and it["mode"] == mode
                                   and it["state"] in ("queued", "failed") and (it["user"] == me or me == db.OWNER))]
    if len(keep) == len(q):
        return False
    _save_queue(keep)
    return True


def delete(aid, ep, mode):
    """Delete a saved copy, if this person may. Returns bytes freed, or None if it isn't theirs to delete."""
    me = db.user()
    meta = _copy(aid, ep, mode)  # for a dub, possibly the sub copy standing in for it
    if not meta:
        return 0
    if not can_delete(meta, me):
        return None
    cache.remove(aid, ep, meta["mode"])
    return meta.get("size", 0)


def _mark_kept(meta, user):
    kept = meta.get("kept_by") or []
    if user not in kept:
        meta["kept_by"] = kept + [user]
        cache.write_meta(meta)


def mine():
    """This person's queue and downloads (for Settings)."""
    me = db.user()
    q = [it for it in _queue() if it["user"] == me]
    saved = [m for m in cache.entries() if me in (m.get("kept_by") or [])]
    ids = list({it["anilist_id"] for it in q} | {m["anilist_id"] for m in saved})
    media = db.cached_media(ids, 10 ** 9)
    def title(aid):
        t = (media.get(aid) or {}).get("title") or {}
        return t.get("english") or t.get("romaji") or f"Show {aid}"
    return {"queue": [{**it, "title": title(it["anilist_id"])} for it in q],
            "saved": [{"anilist_id": m["anilist_id"], "episode": m["episode"], "mode": m["mode"], "size": m.get("size", 0),
                       "quality": m.get("quality"), "created": m.get("created"), "title": title(m["anilist_id"])} for m in saved],
            "space": space(), "current": status["current"]}


# the worker -------------------------------------------------------------------------------------
def start():
    global _worker
    if _worker is None or _worker.done():
        _worker = asyncio.get_running_loop().create_task(_work())


def resume():
    """After a restart: anything that was mid-download goes back to waiting, and the worker starts."""
    q = _queue()
    for it in q:
        if it["state"] == "downloading":
            it["state"] = "queued"
    _save_queue(q)
    if any(it["state"] == "queued" for it in q):
        start()


def _set(item, **changes):
    q = _queue()
    for it in q:
        if _key(it["anilist_id"], it["episode"], it["mode"]) == _key(item["anilist_id"], item["episode"], item["mode"]):
            it.update(changes)
    _save_queue(q)


async def _work():
    from . import anilist, source
    while True:
        item = next((it for it in _queue() if it["state"] == "queued"), None)
        if not item:
            status["current"] = None
            return
        aid, ep, mode, user = item["anilist_id"], item["episode"], item["mode"], item["user"]
        _set(item, state="downloading", started=time.time())
        status["current"] = _key(aid, ep, mode)
        tok = db.set_user(user)
        try:
            if shutil.disk_usage(db.DATA_DIR).free - estimate() < MIN_DISK_FREE:
                raise RuntimeError("the server's disk is nearly full")
            mapping = await source.ensure_mapping(await anilist.media(aid))
            if not mapping:
                raise RuntimeError("couldn't find this show on the stream source")
            await cache.download(aid, ep, mode, mapping["source_id"])
            meta = _copy(aid, ep, mode)
            if not meta:
                raise RuntimeError("the download didn't produce a playable copy")
            _mark_kept(meta, user)
            q = [it for it in _queue() if _key(it["anilist_id"], it["episode"], it["mode"]) != _key(aid, ep, mode)]
            _save_queue(q)
            log.info("downloaded %s ep %s (%s) for %s", aid, ep, mode, user)
        except Exception as ex:
            msg = str(ex)[:200] or ex.__class__.__name__
            _set(item, state="failed", error=msg)
            log.warning("download of %s ep %s (%s) failed: %s", aid, ep, mode, msg)
        finally:
            db._user.reset(tok)
        await asyncio.sleep(1)
