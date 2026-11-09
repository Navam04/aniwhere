"""Stream source: talks to ani-cli through bridge.sh, matches AniList shows, caches lookups."""
import asyncio
import difflib
import logging
import os
import re
import time

from . import db, health

BRIDGE = os.environ.get("ANIME_BRIDGE", "/opt/anime/bridge.sh")
log = logging.getLogger("source")


class SourceError(Exception):
    pass


async def _bridge(*args, timeout=60):
    proc = await asyncio.create_subprocess_exec(
        BRIDGE, *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        cwd="/tmp", env={**os.environ, "TERM": "dumb"})
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout)
    except asyncio.TimeoutError:
        proc.kill()
        health.source_failed(f"{args[0]}: timed out")
        raise SourceError("The stream source took too long to answer")
    if proc.returncode != 0:
        msg = re.sub(r"\x1b\[[0-9;]*[a-zA-Z]", "", err.decode(errors="replace")).strip()
        msg = msg.splitlines()[-1] if msg else "Stream source error"
        health.source_failed(f"{args[0]}: {msg}")
        raise SourceError(msg)
    health.source_ok()
    return out.decode(errors="replace")


def _tsv(text):
    return [line.split("\t", 1) for line in text.splitlines() if "\t" in line]


async def version():
    return (await _bridge("version")).strip()


async def search(query):
    query = re.sub(r"[^\w\s'-]", " ", query).strip()
    if not query:
        return []
    return [{"id": i, "title": t} for i, t in _tsv(await _bridge("search", query))]


_eps_cache = {}


def _ep_key(e):
    try:
        return (0, float(e))
    except ValueError:
        return (1, e)


async def episodes(source_id, max_age=900):
    hit = _eps_cache.get(source_id)
    if hit and time.time() - hit[0] < max_age:
        return hit[1]
    eps = sorted({ep for _id, ep in _tsv(await _bridge("episodes", source_id))}, key=_ep_key)
    _eps_cache[source_id] = (time.time(), eps)
    return eps


_resolve_cache = {}


async def resolve(source_id, episode, mode, fresh=False):
    key = (source_id, str(episode), mode)
    hit = _resolve_cache.get(key)
    if hit and not fresh and time.time() - hit[0] < 1800:
        return hit[1]
    res = {"links": []}
    for k, v in _tsv(await _bridge("resolve", source_id, str(episode), mode)):
        if k == "link" and ">" in v:
            quality, url = v.split(">", 1)
            res["links"].append((quality.strip(), url.strip()))
        else:
            res[k] = v.strip()
    if not res["links"]:
        raise SourceError(f"No {mode} stream found for episode {episode}")
    _resolve_cache[key] = (time.time(), res)
    return res


# matching -----------------------------------------------------------------
def _norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", (s or "").lower())).strip()


def _similarity(candidate, titles):
    c = _norm(candidate)
    return max((difflib.SequenceMatcher(None, c, _norm(t)).ratio() for t in titles if t), default=0)


async def find_match(media):
    """Pick the source show for an AniList entry. Verified by MAL id when possible."""
    t = media.get("title") or {}
    titles = [t.get("english"), t.get("romaji"), *(media.get("synonyms") or [])[:2]]
    titles = [x for x in dict.fromkeys(titles) if x]
    candidates = {}
    for title in titles[:3]:
        try:
            for c in await search(title):
                candidates.setdefault(c["id"], c["title"])
        except SourceError as ex:
            log.info("source search failed for %r: %s", title, ex)
    if not candidates:
        return None
    ranked = sorted(candidates.items(), key=lambda kv: _similarity(kv[1], titles), reverse=True)
    mal = media.get("idMal")
    if mal:
        for sid, stitle in ranked[:4]:
            try:
                eps = await episodes(sid)
                if not eps:
                    continue
                for mode in ("sub", "dub"):
                    try:
                        res = await resolve(sid, eps[0], mode)
                        break
                    except SourceError:
                        res = None
                if res and res.get("mal") and int(res["mal"]) == int(mal):
                    return {"source_id": sid, "source_title": stitle, "verified": 1}
            except SourceError:
                continue
    sid, stitle = ranked[0]
    if _similarity(stitle, titles) >= 0.8:
        return {"source_id": sid, "source_title": stitle, "verified": 0}
    return None


async def ensure_mapping(media):
    """Return the stored mapping for a show, auto-matching it on first use."""
    m = db.get_mapping(media["id"])
    if m and m.get("source_id"):
        return m
    found = await find_match(media)
    if not found:
        return None
    db.save_mapping(media["id"], found["source_id"], found["source_title"], found["verified"])
    return db.get_mapping(media["id"])


def latest_number(eps):
    nums = []
    for e in eps:
        try:
            nums.append(float(e))
        except ValueError:
            pass
    return max(nums) if nums else None


def record_episode_count(anilist_id, eps):
    latest = latest_number(eps)
    row = db.one("SELECT * FROM source_eps WHERE anilist_id=?", anilist_id)
    if row is None:
        db.run("INSERT INTO source_eps(anilist_id,latest,count,checked_at,notified_latest) VALUES(?,?,?,?,?)",
               anilist_id, latest, len(eps), time.time(), latest)
    else:
        db.run("UPDATE source_eps SET latest=?, count=?, checked_at=? WHERE anilist_id=?",
               latest, len(eps), time.time(), anilist_id)
    return latest
