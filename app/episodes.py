"""Per-episode details (title, synopsis, thumbnail, runtime) for the show page.

Primary source: Kitsu (free, no key), looked up by the show's MAL id and fetched 20 episodes per page,
only for the range being shown. Fallback: AniList's streamingEpisodes (titles + thumbnails, no synopsis).
Everything is cached in SQLite."""
import asyncio
import logging
import re
import time

import httpx

from . import anilist, db

KITSU = "https://kitsu.app/api/edge"
PAGE = 20
log = logging.getLogger("episodes")
_client = httpx.AsyncClient(timeout=15, headers={"Accept": "application/vnd.api+json"}, follow_redirects=True)


def _clean(text):
    text = (text or "").strip()
    text = re.sub(r"\n*\s*\((Source|Written by)[^)]*\)\s*$", "", text, flags=re.I)  # trailing credits
    text = re.sub(r"\n*\s*\[(Source|Written by)[^\]]*\]\s*$", "", text, flags=re.I)
    return text.strip()


async def _kitsu_id(media):
    row = db.one("SELECT kitsu_id, fetched_at FROM kitsu_map WHERE anilist_id=?", media["id"])
    if row and (row["kitsu_id"] or time.time() - row["fetched_at"] < 86400):
        return row["kitsu_id"]
    kid = None
    if media.get("idMal"):
        try:
            r = await _client.get(f"{KITSU}/mappings", params={
                "filter[externalSite]": "myanimelist/anime", "filter[externalId]": media["idMal"], "include": "item"})
            items = [i for i in r.json().get("included", []) if i.get("type") == "anime"]
            kid = items[0]["id"] if items else None
        except (httpx.HTTPError, ValueError, KeyError) as ex:
            log.info("kitsu mapping failed for %s: %s", media["id"], ex)
            return None  # don't cache a network failure
    db.run("INSERT INTO kitsu_map(anilist_id,kitsu_id,fetched_at) VALUES(?,?,?) "
           "ON CONFLICT(anilist_id) DO UPDATE SET kitsu_id=excluded.kitsu_id, fetched_at=excluded.fetched_at",
           media["id"], kid, time.time())
    return kid


async def _fetch_page(anilist_id, kid, page):
    r = await _client.get(f"{KITSU}/anime/{kid}/episodes",
                          params={"page[limit]": PAGE, "page[offset]": page * PAGE, "sort": "number"})
    r.raise_for_status()
    for e in r.json().get("data", []):
        a = e.get("attributes") or {}
        if a.get("number") is None:
            continue
        thumb = (a.get("thumbnail") or {}).get("original")
        db.run("INSERT INTO ep_meta(anilist_id,number,title,description,thumbnail,length,airdate) VALUES(?,?,?,?,?,?,?) "
               "ON CONFLICT(anilist_id,number) DO UPDATE SET title=excluded.title, description=excluded.description, "
               "thumbnail=excluded.thumbnail, length=excluded.length, airdate=excluded.airdate",
               anilist_id, float(a["number"]), a.get("canonicalTitle"),
               _clean(a.get("description") or a.get("synopsis")), thumb, a.get("length"), a.get("airdate"))
    db.run("INSERT INTO ep_meta_page(anilist_id,page,fetched_at) VALUES(?,?,?) "
           "ON CONFLICT(anilist_id,page) DO UPDATE SET fetched_at=excluded.fetched_at", anilist_id, page, time.time())


async def _anilist_fallback(media):
    """Titles + thumbnails from AniList (often from Crunchyroll). Synopses aren't available there."""
    d = await anilist.gql("query($id:Int){Media(id:$id){streamingEpisodes{title thumbnail}}}", {"id": media["id"]})
    out = {}
    for i, e in enumerate(d["Media"].get("streamingEpisodes") or []):
        m = re.match(r"\s*Episode\s+(\d+(?:\.\d+)?)\s*[-:–]\s*(.*)", e.get("title") or "", re.I)
        num, title = (float(m.group(1)), m.group(2).strip()) if m else (float(i + 1), e.get("title"))
        out[num] = {"title": title, "description": "", "thumbnail": e.get("thumbnail"), "length": None}
    return out


async def details(media, start, end):
    """Episode details for episode numbers start..end (inclusive), keyed by number."""
    aid = media["id"]
    max_age = 6 * 3600 if media.get("status") in ("RELEASING", "NOT_YET_RELEASED") else 7 * 86400
    kid = await _kitsu_id(media)
    if kid:
        pages = range(max(0, int(start - 1) // PAGE), int(end - 1) // PAGE + 1)
        fresh = {r["page"] for r in db.q("SELECT page FROM ep_meta_page WHERE anilist_id=? AND fetched_at>?",
                                          aid, time.time() - max_age)}
        todo = [p for p in pages if p not in fresh]
        sem = asyncio.Semaphore(5)

        async def run(p):
            async with sem:
                try:
                    await _fetch_page(aid, kid, p)
                except (httpx.HTTPError, ValueError) as ex:
                    log.info("kitsu page %s for %s failed: %s", p, aid, ex)

        await asyncio.gather(*(run(p) for p in todo))
        rows = db.q("SELECT * FROM ep_meta WHERE anilist_id=? AND number BETWEEN ? AND ?", aid, start, end)
        out = {r["number"]: {k: r[k] for k in ("title", "description", "thumbnail", "length")} for r in rows}
        if out and all(v["thumbnail"] for v in out.values()):
            return out
    else:
        out = {}
    # fill gaps (or everything, without Kitsu) from AniList
    fb = await _fallback_cached(media)
    for n, v in fb.items():
        if not start <= n <= end:
            continue
        cur = out.setdefault(n, {"title": None, "description": "", "thumbnail": None, "length": None})
        cur["thumbnail"] = cur["thumbnail"] or v["thumbnail"]
        cur["title"] = cur["title"] or v["title"]
    return out


_fallback = {}


async def _fallback_cached(media):
    hit = _fallback.get(media["id"])
    if hit and time.time() - hit[0] < 6 * 3600:
        return hit[1]
    try:
        data = await _anilist_fallback(media)
    except Exception as ex:  # details are optional; the list still works without them
        log.info("anilist episode fallback failed for %s: %s", media["id"], ex)
        data = {}
    _fallback[media["id"]] = (time.time(), data)
    return data
