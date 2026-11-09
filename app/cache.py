"""Episode cache: keep the next episodes of everyone's Watching shows on the server's disk.

Each cached episode is a folder  CACHE_DIR/<anilist_id>/<episode>-<mode>/  with a local HLS copy
(master.m3u8 -> video.m3u8 [+ audio.m3u8], segments, keys, sub.vtt) and meta.json. It's written to a
temporary folder first and renamed when complete, so a failed download never leaves half an episode.
The total size is kept under a limit (Settings), dropping episodes nobody needs any more, then the
least recently used."""
import asyncio
import json
import logging
import re
import shutil
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx

from . import db, hls

CACHE_DIR = db.DATA_DIR / "cache"
log = logging.getLogger("cache")
AHEAD = 2  # episodes to keep ready per Watching show
RETRY_AFTER = 6 * 3600  # a failed episode isn't tried again for this long (the job runs every 30 minutes)
_running = False
_failed = {}  # (anilist_id, episode, mode) -> when downloading it last failed (or its dub wasn't out)
status = {"running": False, "current": None, "last_run": None, "last_error": None, "done": 0}


# settings (server-wide, owner) -------------------------------------------------------------
def settings():
    return {"enabled": db.get_setting("cache_enabled", "1") == "1",
            "limit_gb": float(db.get_setting("cache_limit_gb", "3") or 3),
            "quality": int(db.get_setting("cache_quality", "1080") or 1080)}


def _folder(anilist_id, episode, mode):
    safe = re.sub(r"[^0-9A-Za-z.]", "_", str(episode))
    return CACHE_DIR / str(int(anilist_id)) / f"{safe}-{mode}"


def _meta(anilist_id, episode, mode):
    """meta.json of a complete cached copy, or None. Just looking doesn't count as using it."""
    meta_path = _folder(anilist_id, episode, mode) / "meta.json"
    try:
        return json.loads(meta_path.read_text()) if meta_path.exists() else None
    except ValueError:
        return None


def get(anilist_id, episode, mode):
    """meta for a complete cached copy that's about to be played, or None. Records it as just used,
    which is what 'least recently used' pruning goes by."""
    meta = _meta(anilist_id, episode, mode)
    if meta:
        meta["last_used"] = time.time()
        (_folder(anilist_id, episode, mode) / "meta.json").write_text(json.dumps(meta))
    return meta


def playable(anilist_id, episode, mode):
    """(meta, mode) of the copy to play for someone who wants `mode`: that copy, or for dub, a sub copy
    kept because the dub wasn't out yet (like streaming, which falls back to sub). (None, mode) if neither."""
    meta = get(anilist_id, episode, mode)
    if meta:
        return meta, mode
    if mode == "dub" and (_meta(anilist_id, episode, "sub") or {}).get("fallback_for") == "dub":
        return get(anilist_id, episode, "sub"), "sub"
    return None, mode


def entries():
    out = []
    if not CACHE_DIR.exists():
        return out
    for meta_path in CACHE_DIR.glob("*/*/meta.json"):
        try:
            out.append(json.loads(meta_path.read_text()))
        except ValueError:
            continue
    return sorted(out, key=lambda m: m.get("created", 0), reverse=True)


def usage():
    return sum(m.get("size", 0) for m in entries())


def remove(anilist_id, episode, mode):
    shutil.rmtree(_folder(anilist_id, episode, mode), ignore_errors=True)
    parent = CACHE_DIR / str(int(anilist_id))
    if parent.exists() and not any(parent.iterdir()):
        parent.rmdir()


def cached_episodes(anilist_id, mode):
    """Episodes of a show that would play from disk for someone who wants `mode` (dub includes sub
    copies standing in for a dub that isn't out yet)."""
    base = CACHE_DIR / str(int(anilist_id))
    if not base.exists():
        return []
    out = []
    for p in base.iterdir():
        try:
            meta = json.loads((p / "meta.json").read_text())
        except (OSError, ValueError):
            continue
        if meta.get("mode") == mode or (mode == "dub" and meta.get("fallback_for") == "dub"):
            out.append(meta["episode"])
    return list(dict.fromkeys(out))


# downloading ---------------------------------------------------------------------------------
async def _get(url, refr, binary=False):
    r = await hls.client.get(url, headers={"Referer": refr or ""})
    r.raise_for_status()
    return r.content if binary else r.text


async def _download_playlist(url, refr, folder, prefix, quality):
    """Copy a media playlist and everything it references into folder; returns bytes written."""
    text = await _get(url, refr)
    if "#EXT-X-STREAM-INF" in text:  # a master playlist: follow the best variant at or under `quality`
        variants, res = [], None
        for line in text.splitlines():
            if line.startswith("#EXT-X-STREAM-INF"):
                m = re.search(r"RESOLUTION=\d+x(\d+)", line)
                res = int(m.group(1)) if m else 0
            elif line.strip() and not line.startswith("#") and res is not None:
                variants.append((res, urljoin(url, line.strip())))
                res = None
        variants.sort(reverse=True)
        pick = next((v for v in variants if v[0] <= quality), variants[-1] if variants else None)
        if not pick:
            raise ValueError("empty master playlist")
        return await _download_playlist(pick[1], refr, folder, prefix, quality)

    out, size, n = [], 0, 0
    sem = asyncio.Semaphore(4)
    jobs = []

    async def fetch(seg_url, path, strip):
        nonlocal size
        async with sem:
            for attempt in range(3):
                try:
                    data = await _get(seg_url, refr, binary=True)
                    break
                except httpx.HTTPError:
                    if attempt == 2:
                        raise
                    await asyncio.sleep(2)
            if strip and data[:1] != b"\x47":  # some hosts disguise .ts segments as images
                for i in range(min(len(data) - 377, 8192)):
                    if data[i] == 0x47 and data[i + 188] == 0x47 and data[i + 376] == 0x47:
                        data = data[i:]
                        break
            path.write_bytes(data)
            size += len(data)

    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("#"):
            m = re.search(r'URI="([^"]+)"', s)
            if m:  # keys and init segments
                n += 1
                name = f"{prefix}k{n:04d}{Path(urlsplit(m.group(1)).path).suffix or '.bin'}"
                jobs.append(fetch(urljoin(url, m.group(1)), folder / name, False))
                s = s.replace(m.group(1), name)
            out.append(s)
        else:
            n += 1
            suffix = Path(urlsplit(s).path).suffix.lower()
            ext = suffix if suffix in (".ts", ".m4s", ".mp4", ".aac") else ".ts"
            name = f"{prefix}{n:05d}{ext}"
            jobs.append(fetch(urljoin(url, s), folder / name, ext == ".ts"))
            out.append(name)
    await asyncio.gather(*jobs)
    (folder / f"{prefix}.m3u8").write_text("\n".join(out) + "\n")
    return size


async def download(anilist_id, episode, mode, source_id):
    """Save one episode. When a dub isn't out yet, save the sub instead (marked as standing in for the
    dub) and leave the dub to be retried after RETRY_AFTER. Returns 'saved', 'fallback' or None."""
    from . import source  # late import: source imports health which imports db
    key = (int(anilist_id), str(episode), mode)
    if _meta(anilist_id, episode, mode):
        return None
    try:
        res = await source.resolve(source_id, episode, mode, fresh=True)
    except source.SourceError as ex:
        if mode != "dub":
            raise
        _failed[key] = time.time()
        log.info("dub of %s ep %s isn't out yet (%s); keeping the sub meanwhile", anilist_id, episode, ex)
        existing = _meta(anilist_id, episode, "sub")
        if existing:  # already have the sub (someone watches it subbed): let it stand in for the dub too
            if existing.get("fallback_for") != "dub":
                existing["fallback_for"] = "dub"
                (_folder(anilist_id, episode, "sub") / "meta.json").write_text(json.dumps(existing))
            return None
        res = await source.resolve(source_id, episode, "sub", fresh=True)
        await _save(anilist_id, episode, "sub", res, fallback_for="dub")
        return "fallback"
    await _save(anilist_id, episode, mode, res)
    _failed.pop(key, None)
    return "saved"


async def _save(anilist_id, episode, mode, res, fallback_for=None):
    """Copy a resolved stream (video, separate audio, subtitles) into the episode's cache folder."""
    quality = settings()["quality"]
    have = hls.qualities(res)
    pick = next((q for q in have if q <= quality), have[-1] if have else None)
    url = next((u for label, u in res["links"] if hls.quality_of(label) == pick), res["links"][0][1])
    final = _folder(anilist_id, episode, mode)
    tmp = final.with_name(final.name + ".part")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    try:
        size = await _download_playlist(url, res.get("refr"), tmp, "video", quality)
        master = ["#EXTM3U", "#EXT-X-VERSION:3"]
        audio_attr = ""
        if res.get("audio"):
            size += await _download_playlist(res["audio"], res.get("refr"), tmp, "audio", quality)
            master.append('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Audio",DEFAULT=YES,AUTOSELECT=YES,URI="audio.m3u8"')
            audio_attr = ',AUDIO="aud"'
        bw, resolution = hls.BANDWIDTH.get(str(pick or ""), (3_000_000, None))
        master += [f"#EXT-X-STREAM-INF:BANDWIDTH={bw}{f',RESOLUTION={resolution}' if resolution else ''}{audio_attr}", "video.m3u8"]
        (tmp / "master.m3u8").write_text("\n".join(master) + "\n")
        sub = False
        if res.get("sub"):
            try:
                (tmp / "sub.vtt").write_bytes(await _get(res["sub"], res.get("refr"), binary=True))
                sub = True
            except httpx.HTTPError:
                pass
        meta = {"anilist_id": int(anilist_id), "episode": str(episode), "mode": mode, "quality": pick, "size": size,
                "sub": sub, "created": time.time(), "last_used": 0}
        if fallback_for:
            meta["fallback_for"] = fallback_for
        (tmp / "meta.json").write_text(json.dumps(meta))
        shutil.rmtree(final, ignore_errors=True)
        tmp.rename(final)
        log.info("cached %s ep %s (%s%s, %sp, %.0f MB)", anilist_id, episode, mode,
                 f" for {fallback_for}" if fallback_for else "", pick, size / 1e6)
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise


# what to keep, and the job ---------------------------------------------------------------------
async def wanted():
    """{(anilist_id, episode, mode)} that someone is likely to watch next: for each person's Watching
    shows, a half-watched episode plus the next AHEAD episodes that are out."""
    from . import source
    want = {}
    for u in db.users():
        tok = db.set_user(u)
        try:
            for e in db.q("SELECT * FROM list_entry WHERE user=? AND status IN ('CURRENT','REPEATING')", u):
                aid = e["anilist_id"]
                mode = db.get_mode(aid)
                latest = (db.one("SELECT latest FROM source_eps WHERE anilist_id=?", aid) or {}).get("latest")
                nums = [e["progress"] + k for k in range(1, AHEAD + 1) if latest and e["progress"] + k <= latest]
                part = db.one("SELECT episode FROM watch WHERE user=? AND anilist_id=? AND completed=0 AND position>60 "
                              "ORDER BY updated_at DESC LIMIT 1", u, aid)
                eps = ([part["episode"]] if part else []) + [str(int(n)) for n in nums]
                for ep in eps:
                    want[(aid, ep, mode)] = e["updated_at"]
        finally:
            db._user.reset(tok)
    return want


def _needed(m, keep):
    """Wanted as is, or a sub copy standing in for a wanted dub that isn't saved yet."""
    if (m["anilist_id"], m["episode"], m["mode"]) in keep:
        return True
    fb = m.get("fallback_for")
    return bool(fb) and (m["anilist_id"], m["episode"], fb) in keep and not _meta(m["anilist_id"], m["episode"], fb)


def prune(keep):
    """Stay under the size limit: drop copies nobody needs first, then the least recently used."""
    limit = settings()["limit_gb"] * 1e9
    items = entries()
    total = sum(m.get("size", 0) for m in items)
    items.sort(key=lambda m: (_needed(m, keep), m.get("last_used") or m.get("created", 0)))
    for m in items:
        unneeded = not _needed(m, keep)
        if total <= limit and not (unneeded and time.time() - max(m.get("last_used") or 0, m.get("created", 0)) > 3 * 86400):
            continue
        remove(m["anilist_id"], m["episode"], m["mode"])
        total -= m.get("size", 0)


async def run():
    """Fill the cache with what's wanted, within the size limit."""
    global _running
    if _running or not settings()["enabled"]:
        return
    _running = True
    status.update(running=True, done=0, last_error=None)
    try:
        from . import anilist, source
        want = await wanted()
        prune(set(want))
        limit = settings()["limit_gb"] * 1e9
        for (aid, ep, mode), _ in sorted(want.items(), key=lambda kv: -kv[1]):
            if usage() >= limit * 0.95:
                break
            if _meta(aid, ep, mode):
                continue
            if time.time() - _failed.get((aid, ep, mode), 0) < RETRY_AFTER:
                continue  # failed recently (or its dub isn't out): try again later, not every 30 minutes
            mapping = db.get_mapping(aid)
            if not mapping or not mapping.get("source_id"):
                try:
                    mapping = await source.ensure_mapping(await anilist.media(aid))
                except Exception:
                    mapping = None
                if not mapping:
                    continue
            status["current"] = f"{aid} ep {ep} ({mode})"
            try:
                if await download(aid, ep, mode, mapping["source_id"]):
                    status["done"] += 1
            except Exception as ex:
                _failed[(aid, ep, mode)] = time.time()
                status["last_error"] = f"{aid} ep {ep}: {ex}"[:300]
                log.warning("caching %s ep %s (%s) failed: %s", aid, ep, mode, ex)
            prune(set(want))
    finally:
        _running = False
        status.update(running=False, current=None, last_run=time.time())
