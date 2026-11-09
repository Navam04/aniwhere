"""Aniwhere web app: FastAPI backend serving the API, the HLS proxy and the static frontend."""
import asyncio
import logging
import os
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import anilist, cache, collections, db, episodes, filler, health, hls, push, skip, source, watch_order
from .anilist import AniListError
from .source import SourceError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
health.install()
log = logging.getLogger("app")
STATIC = Path(__file__).resolve().parent.parent / "static"
ANI_CLI_DIR = os.environ.get("ANI_CLI_DIR", "/opt/ani-cli-src")
_version_file = Path(__file__).resolve().parent.parent / "VERSION"
VERSION = _version_file.read_text().strip() if _version_file.exists() else "dev"
ACTIVE = ("CURRENT", "REPEATING")
MIN_VIEW = 60  # seconds watched before a viewing counts for Continue watching and History


@asynccontextmanager
async def lifespan(_app):
    db.init()
    collections.init()
    filler.init()
    tasks = [asyncio.create_task(background()), asyncio.create_task(collections.keep_fresh())]
    yield
    for t in tasks:
        t.cancel()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=STATIC), name="static")

# Short names like http://anime/ redirect to the full HTTPS address (needed for install + notifications).
CANONICAL_HOST = os.environ.get("ANIME_HOST", "")
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}


@app.middleware("http")
async def canonical_redirect(request: Request, call_next):
    host = (request.headers.get("host") or "").rsplit(":", 1)[0].strip("[]").lower()
    if CANONICAL_HOST and host and host != CANONICAL_HOST and host not in LOCAL_HOSTS:
        url = f"https://{CANONICAL_HOST}{request.url.path}"
        if request.url.query:
            url += f"?{request.url.query}"
        return RedirectResponse(url, status_code=301)
    return await call_next(request)


# Only devices owned by these Tailscale accounts may use the app. `tailscale serve` strips any
# Tailscale-User-* headers sent by clients and sets them from the caller's real identity;
# requests from tagged devices or with no identity carry no login and are refused.
ALLOWED_LOGINS = {x.strip().lower() for x in os.environ.get("ANIME_ALLOWED_LOGINS", "").split(",") if x.strip()}
DENIED_PAGE = """<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Private</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;
color:#eef1f6;font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:16px;text-align:center">
<div><h1 style="font-size:22px">This app is private</h1>
<p style="color:#9aa3b5">It's only available on devices signed in to its owner's Tailscale account.</p></div>"""


def allowed_logins():
    """Logins from the service file plus people the owner added in Settings."""
    return ALLOWED_LOGINS | {x.lower() for x in db.get_json("allowed_logins_extra", [])}


@app.middleware("http")
async def tailscale_owner_only(request: Request, call_next):
    login = (request.headers.get("tailscale-user-login") or "").strip().lower()
    if ALLOWED_LOGINS and request.url.path != "/api/ping":  # ping is for health checks and says nothing private
        if login not in allowed_logins():
            log.info("refused request for %s from %s", request.url.path, login or "unknown identity")
            if request.url.path.startswith(("/api/", "/hls/")):
                return JSONResponse({"detail": "Not allowed"}, status_code=403)
            return HTMLResponse(DENIED_PAGE, status_code=403)
    # each login gets its own profile; no login (local development) acts as the owner
    token = db.set_user(login or db.OWNER)
    try:
        return await call_next(request)
    finally:
        db._user.reset(token)


@app.exception_handler(SourceError)
async def _source_error(_req, ex):
    return JSONResponse({"detail": str(ex)}, status_code=502)


@app.exception_handler(AniListError)
async def _anilist_error(_req, ex):
    return JSONResponse({"detail": f"AniList: {ex}"}, status_code=502)


# helpers ----------------------------------------------------------------------
def fmt_ep(n):
    return str(int(n)) if float(n).is_integer() else str(n)


def ep_num(e):
    try:
        return float(e)
    except (TypeError, ValueError):
        return None


def source_latest(anilist_id):
    r = db.one("SELECT latest FROM source_eps WHERE anilist_id=?", anilist_id)
    return r["latest"] if r else None


async def mark_progress(anilist_id, episode):
    """An episode was finished: bump list progress, set status, sync to AniList."""
    n = ep_num(episode)
    if n is None:
        return
    m = await anilist.media(anilist_id)
    e = db.get_entry(anilist_id) or {"status": "CURRENT", "progress": 0, "score": 0, "notes": ""}
    progress = max(e["progress"], int(n))
    status = e["status"]
    if status in ("PLANNING", "PAUSED", "DROPPED"):
        status = "CURRENT"
    total = m.get("episodes")
    if total and progress >= total and m.get("status") == "FINISHED":
        status = "COMPLETED"
    db.save_entry(anilist_id, status, progress, e["score"], e["notes"])
    anilist.push_later(anilist_id)


# pages ------------------------------------------------------------------------
NO_CACHE = {"Cache-Control": "no-cache"}


@app.get("/")
async def index():
    return FileResponse(STATIC / "index.html", headers=NO_CACHE)


@app.get("/sw.js")
async def service_worker():
    return FileResponse(STATIC / "sw.js", media_type="text/javascript", headers=NO_CACHE)


@app.get("/manifest.webmanifest")
async def manifest():
    return FileResponse(STATIC / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/anilist/callback")
async def anilist_callback():
    return FileResponse(STATIC / "callback.html", headers=NO_CACHE)


# browse -----------------------------------------------------------------------
@app.get("/api/home")
async def home():
    out = {"continue": [], "new": [], "trending": [], "season": [], "popular": []}

    # continue watching: most recent episode per show. Left out: shows removed from the row (until
    # something is watched again), on-hold and dropped shows, shows marked Completed after their last
    # viewing, and views too short to count (under MIN_VIEW seconds).
    latest_rows = {}
    for r in db.q("SELECT * FROM watch WHERE user=? ORDER BY updated_at DESC LIMIT 300", db.user()):
        if r["completed"] or r["position"] >= MIN_VIEW:
            latest_rows.setdefault(r["anilist_id"], r)
    hidden = {r["anilist_id"]: r["hidden_at"] for r in db.q("SELECT * FROM continue_hidden WHERE user=?", db.user())}
    cont = []
    for aid, r in list(latest_rows.items())[:30]:
        if aid in hidden and hidden[aid] >= r["updated_at"]:
            continue
        entry = db.get_entry(aid)
        if entry and entry["status"] in ("DROPPED", "PAUSED"):
            continue
        if entry and entry["status"] == "COMPLETED" and entry["updated_at"] >= r["updated_at"]:
            continue
        if not r["completed"]:
            cont.append({"id": aid, "episode": r["episode"], "position": r["position"], "duration": r["duration"],
                         "at": r["updated_at"]})
            continue
        n = ep_num(r["episode"])
        latest = source_latest(aid)
        if n is not None and latest and n + 1 <= latest:
            cont.append({"id": aid, "episode": fmt_ep(n + 1), "position": 0, "duration": 0, "at": r["updated_at"]})
    # shows you're watching whose next episode is out, even if progress was set without playing here
    # (marked watched, or synced from AniList)
    in_continue = {c["id"] for c in cont}
    for e in db.q("SELECT * FROM list_entry WHERE user=? AND status IN ('CURRENT','REPEATING') AND progress>0", db.user()):
        aid = e["anilist_id"]
        if aid in in_continue or (aid in hidden and hidden[aid] >= e["updated_at"]):
            continue
        latest = source_latest(aid)
        if latest and e["progress"] + 1 <= latest:
            cont.append({"id": aid, "episode": fmt_ep(e["progress"] + 1), "position": 0, "duration": 0,
                         "at": e["updated_at"]})
    cont.sort(key=lambda c: -c.pop("at"))
    # new episodes on shows you're watching
    new = []
    in_continue = {c["id"] for c in cont}
    for row in db.q("SELECT e.anilist_id, e.progress, s.latest FROM list_entry e "
                    "JOIN source_eps s ON s.anilist_id=e.anilist_id "
                    "WHERE e.user=? AND e.status IN ('CURRENT','REPEATING') AND s.latest > e.progress", db.user()):
        if row["anilist_id"] in in_continue:
            continue
        new.append({"id": row["anilist_id"], "episode": fmt_ep(row["progress"] + 1),
                    "unwatched": int(row["latest"] - row["progress"])})
    ids = [c["id"] for c in cont] + [n["id"] for n in new]
    try:
        medias = {m["id"]: m for m in await anilist.media_many(ids)} if ids else {}
    except (AniListError, Exception) as ex:  # keep the page working without AniList
        log.warning("home media lookup failed: %s", ex)
        medias = {}
    out["continue"] = [{**c, "media": medias[c["id"]]} for c in cont if c["id"] in medias][:12]
    out["new"] = [{**n, "media": medias[n["id"]]} for n in new if n["id"] in medias]
    for kind in ("trending", "season", "popular"):
        try:
            out[kind] = await anilist.browse(kind)
        except Exception as ex:
            log.warning("browse %s failed: %s", kind, ex)
    return out


@app.get("/api/home/recs")
async def home_recs():
    """'Because you watched' rows: up to 3 shows you completed or scored 8+, picked at random each visit.
    Shows already on your lists are left out; rows with too few shows are skipped."""
    seeds = db.q("SELECT anilist_id FROM list_entry WHERE user=? AND (status='COMPLETED' OR score>=8) "
                 "ORDER BY RANDOM() LIMIT 12", db.user())
    on_list = {r["anilist_id"] for r in db.entries()}
    rows, used = [], set()
    universes = set()  # one row per franchise, so two seasons of one show don't make two near-identical rows
    for s in seeds:
        fr = db.one("SELECT key, members FROM collections WHERE kind='franchise' AND members LIKE ? "
                    "ORDER BY popularity DESC", f"%,{s['anilist_id']},%")
        universe = fr["key"] if fr else s["anilist_id"]
        if universe in universes:
            continue
        universes.add(universe)
        if fr:
            used.update(collections.member_ids(fr))  # don't recommend the seed's own sequels and spin-offs
        try:
            items = await anilist.recommendations(s["anilist_id"])
            seed = await anilist.media(s["anilist_id"])
        except Exception as ex:
            log.info("recommendations for %s failed: %s", s["anilist_id"], ex)
            continue
        items = [m for m in items if m["id"] not in on_list and m["id"] not in used]
        if len(items) >= 4:
            used.update(m["id"] for m in items)
            rows.append({"seed": seed, "items": items[:15]})
        if len(rows) == 3:
            break
    return rows


@app.get("/api/search")
async def search(q: str):
    if len(q.strip()) < 2:
        return []
    return await anilist.search(q.strip())


@app.get("/api/discover")
async def discover(q: str = "", genres: str = "", formats: str = "", status: str = "", sort: str = "",
                   page: int = 1):
    """Search & Browse: any mix of title text, genres, formats, airing status and sort."""
    return await anilist.discover(q.strip(), [g for g in genres.split(",") if g],
                                  [f for f in formats.split(",") if f], status or None, sort or None, page)


@app.get("/api/genres")
async def genre_list():
    return await anilist.genres()


# recent searches, kept on the server so every device shows the same ones
@app.get("/api/searches")
async def recent_searches():
    return db.get_json("recent_searches", [])


class SearchIn(BaseModel):
    q: str


@app.post("/api/searches")
async def add_search(body: SearchIn):
    q = " ".join(body.q.split())[:100]
    items = db.get_json("recent_searches", [])
    if len(q) >= 2:
        items = [q] + [x for x in items if x.lower() != q.lower()]
        db.set_json("recent_searches", items[:10])
    return db.get_json("recent_searches", [])


@app.delete("/api/searches")
async def remove_search(q: str = ""):
    """Remove one recent search, or all of them when q is empty."""
    items = [x for x in db.get_json("recent_searches", []) if q and x != q]
    db.set_json("recent_searches", items)
    return items


@app.get("/api/media/{anilist_id}")
async def media_detail(anilist_id: int):
    m = await anilist.media(anilist_id, relations=True)
    watch = {r["episode"]: r for r in db.q("SELECT * FROM watch WHERE user=? AND anilist_id=?", db.user(), anilist_id)}
    return {"media": m, "entry": db.get_entry(anilist_id), "mapping": db.get_mapping(anilist_id),
            "mode": db.get_mode(anilist_id), "watch": watch, "notify": notify_state(anilist_id),
            "devices": push.count()}


def notify_state(anilist_id):
    """'watching' (on: you get alerts because it's on Watching), 'muted', 'bell' (asked to be told), or 'off'."""
    e = db.get_entry(anilist_id)
    if e and e["status"] in ACTIVE:
        return "muted" if anilist_id in db.get_json("notify_mute", []) else "watching"
    return "bell" if anilist_id in db.get_json("notify_watch", []) else "off"


class NotifyIn(BaseModel):
    on: bool


@app.put("/api/media/{anilist_id}/notify")
async def set_notify(anilist_id: int, body: NotifyIn):
    """Ring the bell on a show (be told when its next episode is out) or mute a show you're watching."""
    e = db.get_entry(anilist_id)
    mute = [i for i in db.get_json("notify_mute", []) if i != anilist_id]
    bell = [i for i in db.get_json("notify_watch", []) if i != anilist_id]
    if e and e["status"] in ACTIVE:
        db.set_json("notify_mute", mute if body.on else mute + [anilist_id])
    else:
        db.set_json("notify_watch", bell + [anilist_id] if body.on else bell)
        if body.on:  # alert on the next episode after what's out now (episode 1 for unreleased shows)
            db.run("INSERT INTO notified(user,anilist_id,latest) VALUES(?,?,?) ON CONFLICT(user,anilist_id) "
                   "DO UPDATE SET latest=excluded.latest", db.user(), anilist_id, source_latest(anilist_id) or 0)
    return {"notify": notify_state(anilist_id), "devices": push.count()}


@app.get("/api/media/{anilist_id}/filler")
async def media_filler(anilist_id: int):
    """Filler and mixed canon/filler episodes of a long show, and whether you skip filler."""
    m = await anilist.media(anilist_id)
    return {"episodes": await filler.episodes(m), "skip": player_prefs()["skip_filler"]}


@app.get("/api/media/{anilist_id}/episodes")
async def media_episodes(anilist_id: int):
    m = await anilist.media(anilist_id)
    mapping = await source.ensure_mapping(m)
    if not mapping:
        return {"mapping": None, "episodes": []}
    eps = await source.episodes(mapping["source_id"])
    source.record_episode_count(anilist_id, eps)
    return {"mapping": mapping, "episodes": eps, "cached": cache.cached_episodes(anilist_id, db.get_mode(anilist_id))}


@app.get("/api/media/{anilist_id}/episode-details")
async def media_episode_details(anilist_id: int, start: float = 1, end: float = 100):
    """Titles, synopses, thumbnails and runtimes for episodes start..end (max 200 at a time)."""
    end = min(end, start + 199)
    m = await anilist.media(anilist_id)
    info = await episodes.details(m, start, end)
    return {fmt_ep(n): v for n, v in info.items()}


@app.get("/api/media/{anilist_id}/seasons")
async def media_seasons(anilist_id: int):
    """Every season of the series this show belongs to, in order, with your list status for each."""
    chain = await anilist.seasons(anilist_id)
    entries = {e["anilist_id"]: e for e in db.entries()} if chain else {}
    return [{"id": m["id"], "number": i + 1, "title": m.get("title"), "format": m.get("format"),
             "season": m.get("season"), "seasonYear": m.get("seasonYear"), "episodes": m.get("episodes"),
             "status": m.get("status"), "coverImage": m.get("coverImage"),
             "entry": entries.get(m["id"])} for i, m in enumerate(chain)]


# collections -------------------------------------------------------------------------
def _entries():
    return {e["anilist_id"]: e for e in db.entries()}


@app.get("/api/collections")
async def collection_list():
    """Collections page: recommended (universes and studios you've started), popular franchises, studios."""
    entries = _entries()
    rows = db.q("SELECT * FROM collections ORDER BY popularity DESC")
    items = [collections.summary(r, entries) for r in rows]
    franchises = [c for c in items if c["kind"] == "franchise"]
    studios = [c for c in items if c["kind"] == "studio"]
    # recommended: universes you've started but haven't seen all of, then studios you've watched 2+ shows from
    rec = sorted((c for c in franchises if c["seen"] and c["seen"] < c["size"]), key=lambda c: (-c["seen"], -c["popularity"]))[:8]
    rec += sorted((c for c in studios if c["seen"] >= 2), key=lambda c: -c["seen"])[:4]
    return {"building": collections.building() or not db.get_setting("collections_built"),
            "recommended": rec, "franchises": franchises[:60], "studios": studios[:30]}


@app.get("/api/collections/search")
async def collection_search(q: str):
    q = " ".join(q.lower().split())
    if len(q) < 2:
        return []
    entries = _entries()
    rows = db.q("SELECT * FROM collections WHERE kind='franchise' AND (name LIKE ? OR search LIKE ?) "
                "ORDER BY popularity DESC LIMIT 8", f"%{q}%", f"%{q}%")
    out = [collections.summary(r, entries) for r in rows]
    try:
        cached = {c["key"] for c in out}
        out += [s for s in await collections.search_studios(q) if s["key"] not in cached][:4]
    except Exception as ex:
        log.info("studio search failed: %s", ex)
    return out


@app.get("/api/collections/{key}")
async def collection_detail(key: str, page: int = 1):
    """One collection with its shows. Franchises come back in release order; studios by popularity, paged."""
    entries = {e["anilist_id"]: e for e in db.entries()}
    if key.startswith("s:") and key[2:].isdigit():
        s, items, more = await collections.studio_page(int(key[2:]), page)
        return {"key": key, "kind": "studio", "name": s["name"], "items": items, "has_more": more,
                "entries": {i["id"]: entries[i["id"]] for i in items if i["id"] in entries}}
    row = db.one("SELECT * FROM collections WHERE key=?", key)
    if not row:
        raise HTTPException(404, "Collection not found")
    row = await collections.ensure_main(row)
    ids = collections.member_ids(row)
    medias = {m["id"]: m for m in await anilist.media_many(ids)}
    items = [medias[i] for i in ids if i in medias]
    guide, story = watch_order.story_order(items) if row["kind"] == "franchise" else (None, None)
    pref = db.get_json("watch_orders", {}).get(key) or {}
    return {"key": key, "kind": row["kind"], "name": row["name"], "items": items, "has_more": False,
            "main": collections.main_ids(row), "entries": {i: entries[i] for i in ids if i in entries},
            "story": {"guide": guide, "ids": story} if story else None,
            "order": {"mode": pref.get("mode") or ("story" if story else "release"), "custom": pref.get("ids")}}


class OrderIn(BaseModel):
    mode: str  # release, story or custom
    ids: Optional[list[int]] = None  # your own order (for custom)


@app.put("/api/collections/{key}/order")
async def set_collection_order(key: str, body: OrderIn):
    """Remember how you want a franchise ordered: release, story (guide) or your own order."""
    if body.mode not in ("release", "story", "custom"):
        raise HTTPException(400, "mode must be release, story or custom")
    orders = db.get_json("watch_orders", {})
    cur = orders.get(key) or {}
    orders[key] = {"mode": body.mode, "ids": body.ids if body.ids is not None else cur.get("ids")}
    db.set_json("watch_orders", orders)
    return orders[key]


class CompleteIn(BaseModel):
    scope: str = "all"  # "all", or "main" = the main story only (no spin-offs, recaps, OVAs or specials)


async def _push_slowly(ids):
    """Send many list changes to AniList one at a time, well under its 30-requests-a-minute limit."""
    for i in ids:
        await anilist.push_entry(i)
        await asyncio.sleep(3)


@app.post("/api/collections/{key}/complete")
async def complete_collection(key: str, body: CompleteIn):
    """Mark every released title in a franchise as Completed (scores and notes are kept).
    Shows still airing or not out yet are skipped."""
    row = db.one("SELECT * FROM collections WHERE key=?", key)
    if not row or row["kind"] != "franchise":
        raise HTTPException(400, "Only franchise collections can be marked as watched")
    row = await collections.ensure_main(row)
    ids = collections.member_ids(row)
    main = set(collections.main_ids(row) or [])
    medias = {m["id"]: m for m in await anilist.media_many(ids)}
    changed, skipped = [], []
    for i in ids:
        m = medias.get(i)
        in_main = i in main if main else m and m.get("format") in collections.SERIES + ("MOVIE",)
        if not m or (body.scope == "main" and not in_main):
            continue
        if m.get("status") in ("RELEASING", "NOT_YET_RELEASED"):
            skipped.append(anilist.display_title(m))
            continue
        e = db.get_entry(i) or {"status": None, "progress": 0, "score": 0, "notes": ""}
        if e["status"] == "COMPLETED":
            continue
        db.save_entry(i, "COMPLETED", max(e["progress"], m.get("episodes") or 0), e["score"], e["notes"])
        changed.append(i)
    if changed:
        asyncio.get_running_loop().create_task(_push_slowly(changed))
    return {"changed": len(changed), "skipped": skipped,
            "entries": {i: db.get_entry(i) for i in ids if db.get_entry(i)}}


@app.get("/api/media/{anilist_id}/collection")
async def media_collection(anilist_id: int):
    """The franchise collection a show is part of, or null."""
    row = await collections.franchise_for(anilist_id)
    return collections.summary(row, _entries()) if row else None


@app.get("/api/media/{anilist_id}/recommendations")
async def media_recommendations(anilist_id: int):
    return await anilist.recommendations(anilist_id)


def next_up(anilist_id, entry=None):
    """What 'Play' should start for a show: the most recent unfinished episode, else the one after progress."""
    w = db.one("SELECT episode, position FROM watch WHERE user=? AND anilist_id=? AND completed=0 AND position>10 "
               "ORDER BY updated_at DESC LIMIT 1", db.user(), anilist_id)
    if w:
        return {"episode": w["episode"], "position": w["position"]}
    entry = entry or db.get_entry(anilist_id)
    if entry and entry["status"] == "COMPLETED":
        return {"episode": "1", "position": 0, "again": True}
    progress = entry["progress"] if entry else 0
    latest = source_latest(anilist_id)
    if latest is not None and progress >= latest:
        return None  # caught up: nothing new to play yet
    return {"episode": fmt_ep(progress + 1), "position": 0}


@app.get("/api/media/{anilist_id}/quick")
async def media_quick(anilist_id: int):
    """What the poster quick menu needs: list entry and what Play would start."""
    entry = db.get_entry(anilist_id)
    return {"entry": entry, "next": next_up(anilist_id, entry)}


@app.get("/api/source/search")
async def source_search(q: str):
    return await source.search(q)


class MappingIn(BaseModel):
    source_id: str
    source_title: str


@app.put("/api/media/{anilist_id}/mapping")
async def set_mapping(anilist_id: int, body: MappingIn):
    db.save_mapping(anilist_id, body.source_id, body.source_title, 2)
    db.run("DELETE FROM source_eps WHERE anilist_id=?", anilist_id)
    return await media_episodes(anilist_id)


class ModeIn(BaseModel):
    mode: str


@app.put("/api/media/{anilist_id}/mode")
async def set_mode(anilist_id: int, body: ModeIn):
    if body.mode not in ("sub", "dub"):
        raise HTTPException(400, "mode must be sub or dub")
    db.set_mode(anilist_id, body.mode)
    return {"mode": body.mode}


# lists ------------------------------------------------------------------------
class EntryIn(BaseModel):
    status: Optional[str] = None
    progress: Optional[int] = None
    score: Optional[float] = None
    notes: Optional[str] = None


STATUSES = ("CURRENT", "PLANNING", "COMPLETED", "PAUSED", "DROPPED", "REPEATING")


@app.put("/api/list/{anilist_id}")
async def save_list_entry(anilist_id: int, body: EntryIn):
    if not body.status:
        db.delete_entry(anilist_id)
        anilist.push_later(anilist_id)
        return {"entry": None}
    if body.status not in STATUSES:
        raise HTTPException(400, "unknown status")
    e = db.get_entry(anilist_id) or {"progress": 0, "score": 0, "notes": ""}
    progress = e["progress"] if body.progress is None else max(0, body.progress)
    if body.status == "COMPLETED":
        m = await anilist.media(anilist_id)
        progress = max(progress, m.get("episodes") or 0)
    db.save_entry(anilist_id, body.status, progress,
                  e["score"] if body.score is None else max(0, min(10, body.score)),
                  e["notes"] if body.notes is None else body.notes[:2000])
    anilist.push_later(anilist_id)
    return {"entry": db.get_entry(anilist_id)}


@app.get("/api/lists")
async def lists():
    entries = db.q("SELECT * FROM list_entry WHERE user=? ORDER BY updated_at DESC", db.user())
    medias = {m["id"]: m for m in await anilist.media_many([e["anilist_id"] for e in entries])} if entries else {}
    latest = {r["anilist_id"]: r["latest"] for r in db.q("SELECT anilist_id, latest FROM source_eps")}
    return [{**e, "media": medias.get(e["anilist_id"]), "available": latest.get(e["anilist_id"])}
            for e in entries if e["anilist_id"] in medias]


# playback -----------------------------------------------------------------------
class PlayIn(BaseModel):
    anilist_id: int
    episode: str
    mode: Optional[str] = None
    fresh: bool = False  # skip the cached stream links (used when retrying a failed episode)


def player_prefs():
    return {"autoplay": db.get_setting("autoplay", "1") == "1", "autoskip": db.get_setting("autoskip", "0") == "1",
            "skip_filler": db.get_setting("skip_filler", "0") == "1"}


def sequel_of(m):
    """The show's direct sequel on AniList, for the 'next season' handoff after the last episode."""
    for e in (m.get("relations") or {}).get("edges") or []:
        n = e.get("node") or {}
        if e.get("relationType") == "SEQUEL" and n.get("type") == "ANIME" and n.get("format") != "MUSIC":
            return {"id": n["id"], "title": n.get("title"), "coverImage": n.get("coverImage"),
                    "format": n.get("format"), "seasonYear": n.get("seasonYear")}
    return None


@app.post("/api/play")
async def play(body: PlayIn):
    m = await anilist.media(body.anilist_id, relations=True)
    mode = body.mode or db.get_mode(body.anilist_id)
    fell_back = False
    # a copy on the server's disk plays without asking the stream source at all
    cached = None
    if not body.fresh:
        cached, cached_mode = cache.playable(body.anilist_id, body.episode, mode)
        if cached and cached_mode != mode:  # a sub copy standing in for a dub that isn't out yet
            mode, fell_back = cached_mode, True
    mapping = db.get_mapping(body.anilist_id) if cached else await source.ensure_mapping(m)
    if not mapping:
        raise HTTPException(404, "Couldn't find this show on the stream source. Pick it manually on the show page.")
    if cached:
        base = f"/cache/{body.anilist_id}/{cache._folder(body.anilist_id, body.episode, mode).name}"
        src, subs, qualities = f"{base}/master.m3u8", f"{base}/sub.vtt" if cached.get("sub") else None, []
    else:
        try:
            res = await source.resolve(mapping["source_id"], body.episode, mode, fresh=body.fresh)
        except SourceError:
            if mode != "dub":
                raise
            res = await source.resolve(mapping["source_id"], body.episode, "sub", fresh=body.fresh)
            mode, fell_back = "sub", True
        tok = hls.new_session(res)
        src, subs, qualities = f"/hls/{tok}/master.m3u8", f"/hls/{tok}/sub.vtt" if res.get("sub") else None, hls.qualities(res)
    try:
        eps = await source.episodes(mapping["source_id"])
    except SourceError:
        if not cached:
            raise
        eps = []  # stream source down: the cached copy still plays, just without prev/next
    idx = eps.index(body.episode) if body.episode in eps else -1
    w = db.one("SELECT * FROM watch WHERE user=? AND anilist_id=? AND episode=?", db.user(), body.anilist_id, body.episode)
    start = w["position"] if w and not w["completed"] and w["position"] > 10 else 0
    nxt = eps[idx + 1] if 0 <= idx < len(eps) - 1 else None
    skipped = 0
    if nxt and player_prefs()["skip_filler"]:  # jump past filler (mixed canon/filler episodes are kept)
        fill = await filler.episodes(m)
        j = idx + 1
        while j < len(eps) and fill.get(int(ep_num(eps[j]) or -1)) == "filler":
            j += 1
        skipped = j - idx - 1
        nxt = eps[j] if j < len(eps) else None
    finished = m.get("status") == "FINISHED" or (m.get("episodes") and ep_num(body.episode) == m["episodes"])
    return {
        "media": m, "episode": body.episode, "mode": mode, "fell_back": fell_back,
        "src": src, "subtitles": subs, "qualities": qualities, "cached": bool(cached),
        "start": start,
        "prev": eps[idx - 1] if idx > 0 else None,
        "next": nxt,
        "skipped_filler": skipped,
        "next_season": sequel_of(m) if nxt is None and idx >= 0 and finished else None,
        "prefs": player_prefs(),
    }


CACHE_TYPES = {".m3u8": hls.M3U8, ".ts": "video/mp2t", ".m4s": "video/iso.segment", ".mp4": "video/mp4",
               ".aac": "audio/aac", ".vtt": "text/vtt; charset=utf-8"}


@app.get("/cache/{anilist_id}/{folder}/{name}")
async def cached_file(anilist_id: int, folder: str, name: str):
    """Files of an episode kept on the server (behind the same login check as everything else)."""
    if not re.fullmatch(r"[0-9A-Za-z._]+-(sub|dub)", folder) or not re.fullmatch(r"[0-9A-Za-z_.]+", name) or ".." in name:
        raise HTTPException(404)
    path = cache.CACHE_DIR / str(anilist_id) / folder / name
    if not path.is_file():
        raise HTTPException(404, "Not cached")
    return FileResponse(path, media_type=CACHE_TYPES.get(path.suffix, "application/octet-stream"),
                        headers={"Cache-Control": "private, max-age=3600"})


# episode cache settings and contents (owner) --------------------------------------------------
@app.get("/api/cache")
async def cache_info():
    _owner_only()
    items = cache.entries()
    medias = {m["id"]: m for m in await anilist.media_many(list({e["anilist_id"] for e in items}))} if items else {}
    return {"settings": cache.settings(), "usage": sum(e.get("size", 0) for e in items), "status": cache.status,
            "disk": health.disk(),
            "items": [{**e, "title": anilist.display_title(medias[e["anilist_id"]]) if e["anilist_id"] in medias else str(e["anilist_id"])}
                      for e in items]}


class CacheSettingsIn(BaseModel):
    enabled: Optional[bool] = None
    limit_gb: Optional[float] = None
    quality: Optional[int] = None


@app.put("/api/cache/settings")
async def cache_settings(body: CacheSettingsIn):
    _owner_only()
    if body.enabled is not None:
        db.set_setting("cache_enabled", "1" if body.enabled else "0")
    if body.limit_gb is not None:
        db.set_setting("cache_limit_gb", max(0.5, min(body.limit_gb, 500)))
    if body.quality is not None:
        db.set_setting("cache_quality", body.quality if body.quality in (360, 480, 720, 1080) else 1080)
    cache.prune(set(await cache.wanted()))
    return await cache_info()


@app.post("/api/cache/run")
async def cache_run():
    _owner_only()
    asyncio.get_running_loop().create_task(cache.run())
    return {"started": True}


@app.delete("/api/cache/{anilist_id}/{episode}/{mode}")
async def cache_delete(anilist_id: int, episode: str, mode: str):
    _owner_only()
    if mode not in ("sub", "dub"):
        raise HTTPException(400)
    cache.remove(anilist_id, episode, mode)
    return await cache_info()


@app.get("/api/skip/{anilist_id}/{episode}")
async def skip_times(anilist_id: int, episode: str, length: float = 0):
    """Intro and credits timestamps for an episode, matched to the playing video's length."""
    m = await anilist.media(anilist_id)
    return await skip.times(m.get("idMal"), episode, length)


@app.get("/hls/{tok}/master.m3u8")
async def hls_master(tok: str, q: int = 0):
    return hls.master(tok, q or None)


@app.get("/hls/{tok}/p")
async def hls_playlist(tok: str, u: str, sig: str):
    return await hls.playlist(tok, u, sig)


@app.get("/hls/{tok}/s")
async def hls_segment(tok: str, u: str, sig: str, request: Request):
    return await hls.segment(tok, u, sig, request.headers.get("range"))


@app.get("/hls/{tok}/sub.vtt")
async def hls_subs(tok: str):
    return await hls.subtitles(tok)


class ProgressIn(BaseModel):
    anilist_id: int
    episode: str
    position: float
    duration: float = 0
    ended: bool = False


@app.post("/api/progress")
async def progress(body: ProgressIn):
    old = db.one("SELECT * FROM watch WHERE user=? AND anilist_id=? AND episode=?", db.user(), body.anilist_id, body.episode)
    done = bool(body.ended or (body.duration > 60 and body.position / body.duration >= 0.9))
    was_done = bool(old and old["completed"])
    position = 0 if done else body.position
    db.run("INSERT INTO watch(user,anilist_id,episode,position,duration,completed,updated_at) VALUES(?,?,?,?,?,?,?) "
           "ON CONFLICT(user,anilist_id,episode) DO UPDATE SET position=excluded.position, duration=excluded.duration, "
           "completed=MAX(watch.completed, excluded.completed), updated_at=excluded.updated_at",
           db.user(), body.anilist_id, body.episode, position, body.duration, int(done), time.time())
    if done or body.position >= MIN_VIEW:
        db.log_history(body.anilist_id, body.episode, body.position, body.duration, done)
    if done and not was_done:
        await mark_progress(body.anilist_id, body.episode)
    return {"completed": done or was_done}


class WatchedIn(BaseModel):
    anilist_id: int
    episode: str
    watched: bool


@app.post("/api/watched")
async def set_watched(body: WatchedIn):
    db.run("INSERT INTO watch(user,anilist_id,episode,position,duration,completed,updated_at) VALUES(?,?,?,0,0,?,?) "
           "ON CONFLICT(user,anilist_id,episode) DO UPDATE SET completed=excluded.completed, position=0, "
           "updated_at=excluded.updated_at", db.user(), body.anilist_id, body.episode, int(body.watched), time.time())
    if body.watched:
        await mark_progress(body.anilist_id, body.episode)
    else:
        e = db.get_entry(body.anilist_id)
        n = ep_num(body.episode)
        if e and n is not None and n <= e["progress"]:
            status = "CURRENT" if e["status"] == "COMPLETED" else e["status"]
            db.save_entry(body.anilist_id, status, int(n) - 1, e["score"], e["notes"])
            anilist.push_later(body.anilist_id)
    return {"entry": db.get_entry(body.anilist_id)}


@app.post("/api/continue/{anilist_id}/hide")
async def hide_from_continue(anilist_id: int):
    """Remove a show from Continue watching until another episode is played."""
    db.run("INSERT INTO continue_hidden(user,anilist_id,hidden_at) VALUES(?,?,?) "
           "ON CONFLICT(user,anilist_id) DO UPDATE SET hidden_at=excluded.hidden_at", db.user(), anilist_id, time.time())
    return {"ok": True}


# history ------------------------------------------------------------------------
@app.get("/api/history")
async def history(before: float = 0, limit: int = 60):
    """Viewing sessions, newest first. Page with `before` = the last item's watched_at."""
    limit = max(1, min(limit, 200))
    rows = db.q("SELECT * FROM history WHERE user=? AND (?=0 OR watched_at<?) ORDER BY watched_at DESC LIMIT ?",
                db.user(), before, before, limit)
    medias = {m["id"]: m for m in await anilist.media_many([r["anilist_id"] for r in rows])} if rows else {}
    items = [{**r, "media": medias[r["anilist_id"]]} for r in rows if r["anilist_id"] in medias]
    return {"items": items, "has_more": len(rows) == limit}


@app.delete("/api/history/{entry_id}")
async def delete_history(entry_id: int):
    db.run("DELETE FROM history WHERE id=? AND user=?", entry_id, db.user())
    return {"ok": True}


@app.get("/api/ping")
async def ping():
    return {"ok": True, "version": VERSION}


# settings -------------------------------------------------------------------------
@app.get("/api/settings")
async def get_settings():
    try:
        ver = await source.version()
    except SourceError:
        ver = None
    return {
        "anilist": {"connected": bool(anilist.token()), "name": db.get_setting("anilist_name"),
                    "avatar": db.get_setting("anilist_avatar"), "client_id": db.get_setting("anilist_client_id"),
                    "last_sync": float(db.get_setting("anilist_last_sync", 0) or 0)},
        "push": {"public_key": push.public_key(), "devices": push.count()},
        "ani_cli_version": ver,
        "version": VERSION,
        "default_mode": db.get_setting("default_mode", "dub"),
        "player": player_prefs(),
        "profile": {"me": db.user(), "owner": db.OWNER, "is_owner": db.user() == db.OWNER},
    }


# stats ---------------------------------------------------------------------------------
@app.get("/api/stats")
async def stats(year: int = 0):
    """Your numbers. Lifetime totals come from your lists (so they include AniList history); activity
    by month and the yearly recap come from viewings recorded in this app."""
    from collections import Counter
    entries = db.entries()
    medias = {m["id"]: m for m in await anilist.media_many([e["anilist_id"] for e in entries])} if entries else {}
    watched = [e for e in entries if e["progress"] > 0 and e["anilist_id"] in medias]
    minutes = sum(e["progress"] * (medias[e["anilist_id"]].get("duration") or 24) for e in watched)
    scored = [e["score"] for e in entries if e["score"]]
    genres, formats, studio_count = Counter(), Counter(), Counter()
    for e in watched:
        m = medias[e["anilist_id"]]
        for g in m.get("genres") or []:
            genres[g] += e["progress"]
        formats[m.get("format") or "?"] += 1
    top = sorted(watched, key=lambda e: -e["progress"])[:150]
    try:
        studios_by_show = await anilist.studios_of([e["anilist_id"] for e in top])
    except Exception as ex:
        log.info("studio lookup for stats failed: %s", ex)
        studios_by_show = {}
    for e in top:
        for s in studios_by_show.get(e["anilist_id"], [])[:1]:
            studio_count[s] += e["progress"]

    # activity recorded in this app (History): per month, and per year for the recap
    rows = db.q("SELECT * FROM history WHERE user=?", db.user())
    seconds = lambda r: r["duration"] if r["completed"] else r["position"]
    months = {}
    for r in rows:
        key = time.strftime("%Y-%m", time.localtime(r["watched_at"]))
        mo = months.setdefault(key, {"month": key, "hours": 0.0, "episodes": 0})
        mo["hours"] += seconds(r) / 3600
        mo["episodes"] += int(bool(r["completed"]))
    now = time.localtime()
    last12 = []
    for i in range(11, -1, -1):
        y, mth = now.tm_year, now.tm_mon - i
        while mth <= 0:
            y, mth = y - 1, mth + 12
        key = f"{y}-{mth:02d}"
        last12.append({**months.get(key, {"month": key, "hours": 0.0, "episodes": 0})})
    years = sorted({int(k[:4]) for k in months} | {now.tm_year}, reverse=True)
    year = year or now.tm_year
    in_year = [r for r in rows if time.localtime(r["watched_at"]).tm_year == year]
    year_shows = Counter(r["anilist_id"] for r in in_year if r["completed"])
    finished_in_year = [e for e in entries if e["status"] == "COMPLETED"
                        and time.localtime(e["updated_at"]).tm_year == year and e["anilist_id"] in medias]
    year_media = {m["id"]: m for m in await anilist.media_many(list(year_shows))} if year_shows else {}
    return {
        "lifetime": {"episodes": sum(e["progress"] for e in watched), "minutes": minutes,
                     "completed": sum(e["status"] == "COMPLETED" for e in entries), "shows": len(watched),
                     "mean_score": round(sum(scored) / len(scored), 1) if scored else None,
                     "by_status": dict(Counter(e["status"] for e in entries))},
        "genres": [{"name": g, "episodes": n} for g, n in genres.most_common(8)],
        "studios": [{"name": s, "episodes": n} for s, n in studio_count.most_common(8)],
        "formats": dict(formats),
        "months": [{**m, "hours": round(m["hours"], 1)} for m in last12],
        "years": years,
        "year": {"year": year, "hours": round(sum(seconds(r) for r in in_year) / 3600, 1),
                 "episodes": sum(int(bool(r["completed"])) for r in in_year),
                 "top": [{"media": year_media[i], "episodes": n} for i, n in year_shows.most_common(5) if i in year_media],
                 "finished": [medias[e["anilist_id"]] for e in sorted(finished_in_year, key=lambda e: -e["updated_at"])][:24]},
    }


# server health and backups ---------------------------------------------------------------
@app.get("/api/health")
async def server_health():
    """Status for the Settings page. Everyone sees the basics; the owner also sees errors and backups."""
    try:
        ver = await source.version()
    except SourceError:
        ver = None
    s = health.source_stats
    out = {
        "uptime": time.time() - health.STARTED,
        "source": {"version": ver, "ok": s["ok"], "failed": s["failed"], "last_ok": s["last_ok"],
                   "last_error": s["last_error"], "last_error_at": s["last_error_at"],
                   "updated": float(db.get_setting("ani_cli_updated", 0) or 0) or None},
        "anilist": {**health.anilist_stats, "last_sync": float(db.get_setting("anilist_last_sync", 0) or 0) or None,
                    "connected": bool(anilist.token())},
        "collections": {"built": float(db.get_setting("collections_built", 0) or 0) or None,
                        "building": collections.building(),
                        "count": db.one("SELECT COUNT(*) AS n FROM collections")["n"]},
        "disk": health.disk(),
    }
    if db.user() == db.OWNER:
        out["errors"] = list(health.recent)[-15:][::-1]
        out["backups"] = health.backups()
    return out


@app.post("/api/backups")
async def backup_now():
    _owner_only()
    await asyncio.to_thread(health.make_backup)
    return health.backups()


@app.get("/api/backups/{name}")
async def download_backup(name: str):
    _owner_only()
    path = health.BACKUP_DIR / name
    if not name.startswith("anime-") or "/" in name or "\\" in name or not path.exists():
        raise HTTPException(404, "No such backup")
    return FileResponse(path, media_type="application/octet-stream", filename=name)


# people (owner only): who besides the service file's logins may use the app -------------------------
def _owner_only():
    if db.user() != db.OWNER:
        raise HTTPException(403, "Only the owner can manage who uses the app")


@app.get("/api/people")
async def people():
    _owner_only()
    extra = db.get_json("allowed_logins_extra", [])
    logins = sorted(ALLOWED_LOGINS | set(extra) | {db.OWNER})
    return [{"login": x, "owner": x == db.OWNER, "removable": x in extra and x != db.OWNER,
             "has_data": x in db.users()} for x in logins]


class PersonIn(BaseModel):
    login: str


@app.post("/api/people")
async def add_person(body: PersonIn):
    _owner_only()
    login = body.login.strip().lower()
    if "@" not in login or " " in login or len(login) > 200:
        raise HTTPException(400, "Enter the Tailscale login, e.g. name@gmail.com")
    extra = db.get_json("allowed_logins_extra", [])
    if login not in extra and login not in ALLOWED_LOGINS:
        db.set_json("allowed_logins_extra", extra + [login])
    return await people()


@app.delete("/api/people/{login}")
async def remove_person(login: str):
    """Stops a login from using the app. Their lists and history are kept in case they're added back."""
    _owner_only()
    db.set_json("allowed_logins_extra", [x for x in db.get_json("allowed_logins_extra", []) if x != login.lower()])
    return await people()


class SettingsIn(BaseModel):
    anilist_client_id: Optional[str] = None
    autoplay: Optional[bool] = None
    autoskip: Optional[bool] = None
    skip_filler: Optional[bool] = None


@app.put("/api/settings")
async def put_settings(body: SettingsIn):
    for key in ("autoplay", "autoskip", "skip_filler"):
        value = getattr(body, key)
        if value is not None:
            db.set_setting(key, "1" if value else "0")
    if body.autoplay is not None or body.autoskip is not None or body.skip_filler is not None:
        return {"player": player_prefs()}
    if body.anilist_client_id is not None:
        cid = body.anilist_client_id.strip()
        if cid and not cid.isdigit():
            raise HTTPException(400, "The AniList client ID is a number")
        db.set_setting("anilist_client_id", cid or None)
    return await get_settings()


class TokenIn(BaseModel):
    access_token: str


@app.post("/api/anilist/token")
async def anilist_token(body: TokenIn):
    v = await anilist.viewer(body.access_token)
    db.set_setting("anilist_token", body.access_token)
    db.set_setting("anilist_user_id", v["id"])
    db.set_setting("anilist_name", v["name"])
    db.set_setting("anilist_avatar", (v.get("avatar") or {}).get("medium"))
    changed = await anilist.sync_from_anilist()
    return {"name": v["name"], "imported": changed}


@app.post("/api/anilist/sync")
async def anilist_sync():
    if not anilist.token():
        raise HTTPException(400, "AniList isn't connected")
    return {"changed": await anilist.sync_from_anilist()}


@app.post("/api/anilist/disconnect")
async def anilist_disconnect():
    for k in ("anilist_token", "anilist_user_id", "anilist_name", "anilist_avatar", "anilist_last_sync"):
        db.set_setting(k, None)
    return {"ok": True}


@app.post("/api/push/subscribe")
async def push_subscribe(sub: dict):
    if "endpoint" not in sub:
        raise HTTPException(400, "Invalid subscription")
    push.subscribe(sub)
    return {"devices": push.count()}


@app.post("/api/push/test")
async def push_test():
    sent = await push.send_all("Notifications are on", "You'll get a message when a new episode is out.", "/")
    return {"sent": sent}


async def update_ani_cli():
    proc = await asyncio.create_subprocess_exec(
        "git", "-C", ANI_CLI_DIR, "pull", "--ff-only", "-q",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    out, _ = await asyncio.wait_for(proc.communicate(), 120)
    db.set_setting("ani_cli_updated", time.time())
    if proc.returncode != 0:
        raise HTTPException(500, f"Update failed: {out.decode(errors='replace').strip()[-300:]}")
    source._eps_cache.clear()
    source._resolve_cache.clear()
    return await source.version()


@app.post("/api/system/update")
async def system_update():
    return {"version": await update_ani_cli()}


# background work -------------------------------------------------------------------
def as_user(login):
    """Context manager-ish helper for background work done on someone's behalf."""
    class _As:
        def __enter__(self):
            self.t = db.set_user(login)

        def __exit__(self, *exc):
            db._user.reset(self.t)
    return _As()


def notify_wanted():
    """Which people want to hear about which shows: their Watching/Rewatching shows, plus shows they
    rang the bell on, minus shows they muted. {anilist_id: [login, ...]}"""
    wants = {}
    for u in db.users():
        with as_user(u):
            ids = {r["anilist_id"] for r in db.q("SELECT anilist_id FROM list_entry WHERE user=? AND "
                                                  "status IN ('CURRENT','REPEATING')", u)}
            ids |= {int(i) for i in db.get_json("notify_watch", [])}
            ids -= {int(i) for i in db.get_json("notify_mute", [])}
        for i in ids:
            wants.setdefault(i, []).append(u)
    return wants


async def check_new_episodes():
    wants = notify_wanted()
    if not wants:
        return
    medias = {m["id"]: m for m in await anilist.media_many(list(wants))}
    for aid, people in wants.items():
        m = medias.get(aid)
        if not m or m.get("status") not in ("RELEASING", "NOT_YET_RELEASED"):
            continue
        try:
            mapping = await source.ensure_mapping(m)
            if not mapping:
                continue
            eps = await source.episodes(mapping["source_id"], max_age=0)
            latest = source.record_episode_count(aid, eps)
            if latest is None:
                continue
            ep = next((e for e in reversed(eps) if ep_num(e) == latest), fmt_ep(latest))
            for u in people:
                with as_user(u):
                    prev = db.one("SELECT latest FROM notified WHERE user=? AND anilist_id=?", u, aid)
                    if prev is None:  # first time we see this show for this person: start from here
                        db.run("INSERT INTO notified(user,anilist_id,latest) VALUES(?,?,?)", u, aid, latest)
                        continue
                    if latest <= prev["latest"]:
                        continue
                    mode = db.get_mode(aid)
                    try:
                        await source.resolve(mapping["source_id"], ep, mode)
                    except SourceError:
                        continue  # e.g. the dub isn't out yet; check again next round
                    db.run("UPDATE notified SET latest=? WHERE user=? AND anilist_id=?", latest, u, aid)
                    label = " (dub)" if mode == "dub" else ""
                    await push.send_all(anilist.display_title(m), f"Episode {ep}{label} is out", f"/#/show/{aid}", user=u)
                    log.info("new episode alert for %s: %s ep %s", u, anilist.display_title(m), ep)
        except Exception as ex:
            log.warning("episode check failed for %s: %s", aid, ex)
        await asyncio.sleep(1)


async def background():
    await asyncio.sleep(15)
    while True:
        for u in db.users():
            with as_user(u):
                if not anilist.token():
                    continue
                try:
                    await anilist.sync_from_anilist()
                except Exception as ex:
                    log.warning("AniList sync failed for %s: %s", u, ex)
        try:
            await check_new_episodes()
            asyncio.get_running_loop().create_task(cache.run())  # download upcoming episodes (runs on its own)
        except Exception as ex:
            log.warning("new episode check failed: %s", ex)
        try:
            if health.backup_due():
                path = await asyncio.to_thread(health.make_backup)
                log.info("database backed up to %s", path)
        except Exception as ex:
            log.warning("database backup failed: %s", ex)
        try:
            if time.time() - float(db.get_setting("ani_cli_updated", 0) or 0) > 86400:
                log.info("ani-cli version after daily update: %s", await update_ani_cli())
        except Exception as ex:
            log.warning("ani-cli update failed: %s", ex)
        await asyncio.sleep(1800)
