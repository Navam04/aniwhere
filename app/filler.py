"""Filler episodes for long shows, from animefillerlist.com (cached in SQLite).

A show's page is found by turning its titles into the site's URL slugs ("Naruto: Shippuden" ->
"naruto-shippuden") and accepted only if the page's episode count roughly matches the show's,
so a similarly named show is never used by mistake."""
import json
import logging
import re
import time

import httpx

from . import db

SITE = "https://www.animefillerlist.com/shows/"
MIN_EPISODES = 40  # shorter shows rarely have filler; don't look them up
log = logging.getLogger("filler")
_client = httpx.AsyncClient(timeout=20, follow_redirects=True,
                            headers={"User-Agent": "Mozilla/5.0 (anime-app; personal use)"})
ROW = re.compile(r'<tr class="([a-z_/]+) (?:even|odd)" id="eps-(\d+)"')
KINDS = {"filler": "filler", "mixed_canon/filler": "mixed"}  # canon kinds are left out


def init():
    db.run("CREATE TABLE IF NOT EXISTS filler (anilist_id INTEGER PRIMARY KEY, slug TEXT, data TEXT NOT NULL, "
           "fetched_at REAL NOT NULL)")


def _slugs(media):
    t = media.get("title") or {}
    names = [t.get("english"), t.get("romaji"), *(media.get("synonyms") or [])[:3]]
    out = []
    for n in names:
        if not n:
            continue
        s = re.sub(r"[^a-z0-9]+", "-", n.lower().replace("'", "")).strip("-")
        if s and s not in out:
            out.append(s)
    return out


async def _fetch(slug):
    r = await _client.get(SITE + slug)
    if r.status_code != 200:
        return None
    rows = ROW.findall(r.text)
    return {int(n): kind for kind, n in rows} if rows else None


async def episodes(media):
    """{episode number: 'filler' | 'mixed'} for the show; {} when unknown or it has no filler."""
    total = media.get("episodes") or 0
    long_running = media.get("status") == "RELEASING" and (media.get("nextAiringEpisode") or {}).get("episode", 0) > MIN_EPISODES
    if total < MIN_EPISODES and not long_running:
        return {}
    row = db.one("SELECT data, fetched_at FROM filler WHERE anilist_id=?", media["id"])
    max_age = 3 * 86400 if media.get("status") == "RELEASING" else 30 * 86400
    if row and time.time() - row["fetched_at"] < max_age:
        return {int(k): v for k, v in json.loads(row["data"]).items()}
    found, slug = {}, None
    try:
        for s in _slugs(media):
            got = await _fetch(s)
            if not got:
                continue
            last = max(got)
            expected = total or (media.get("nextAiringEpisode") or {}).get("episode", 0)
            if expected and not (expected * 0.8 <= last <= expected * 1.2 + 5):
                continue  # a different show with a similar name
            found = {n: KINDS[k] for n, k in got.items() if k in KINDS}
            slug = s
            break
    except httpx.HTTPError as ex:
        log.info("filler lookup failed for %s: %s", media["id"], ex)
        return {int(k): v for k, v in json.loads(row["data"]).items()} if row else {}
    db.run("INSERT INTO filler(anilist_id,slug,data,fetched_at) VALUES(?,?,?,?) ON CONFLICT(anilist_id) DO UPDATE "
           "SET slug=excluded.slug, data=excluded.data, fetched_at=excluded.fetched_at",
           media["id"], slug, json.dumps(found), time.time())
    return found
