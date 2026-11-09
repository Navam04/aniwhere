"""Intro / credits timestamps from AniSkip (free, no key), looked up by MAL id and episode number.

AniSkip stores several submissions per episode, each timed against the video length it was made from.
All of them are cached; the one whose length is closest to the video actually playing is used."""
import json
import logging
import time

import httpx

from . import db

API = "https://api.aniskip.com/v2/skip-times"
TYPES = {"op": "intro", "mixed-op": "intro", "ed": "outro", "mixed-ed": "outro"}
TOLERANCE = 45  # seconds of length difference before a submission is considered a different cut
log = logging.getLogger("skip")
_client = httpx.AsyncClient(timeout=10)


async def _fetch(mal_id, episode):
    row = db.one("SELECT data, fetched_at FROM skip_times WHERE mal_id=? AND episode=?", mal_id, episode)
    if row:
        data = json.loads(row["data"])
        if time.time() - row["fetched_at"] < (7 * 86400 if data else 86400):
            return data
    try:
        r = await _client.get(f"{API}/{mal_id}/{episode}",
                              params=[("types[]", t) for t in TYPES] + [("episodeLength", "0")])
        body = r.json()
    except (httpx.HTTPError, ValueError) as ex:
        log.info("aniskip lookup failed for %s ep %s: %s", mal_id, episode, ex)
        return []  # don't cache a network failure
    data = [{"kind": TYPES[x["skipType"]], "mixed": x["skipType"].startswith("mixed"),
             "start": x["interval"]["startTime"], "end": x["interval"]["endTime"],
             "length": x.get("episodeLength") or 0}
            for x in (body.get("results") or []) if x.get("skipType") in TYPES]
    db.run("INSERT INTO skip_times(mal_id,episode,data,fetched_at) VALUES(?,?,?,?) "
           "ON CONFLICT(mal_id,episode) DO UPDATE SET data=excluded.data, fetched_at=excluded.fetched_at",
           mal_id, episode, json.dumps(data), time.time())
    return data


async def times(mal_id, episode, length):
    """{"intro": [start, end] | None, "outro": [start, end] | None} for a video `length` seconds long."""
    out = {"intro": None, "outro": None}
    if not mal_id:
        return out
    subs = await _fetch(int(mal_id), str(episode))
    for kind in ("intro", "outro"):
        candidates = [s for s in subs if s["kind"] == kind and s["end"] > s["start"]]
        if length:
            candidates = [s for s in candidates if not s["length"] or abs(s["length"] - length) <= TOLERANCE]
        # closest length first; proper op/ed before "mixed" (op/ed with story over it)
        candidates.sort(key=lambda s: (s["mixed"], abs((s["length"] or length) - length) if length else 0))
        if candidates:
            best = candidates[0]
            end = min(best["end"], length) if length else best["end"]
            out[kind] = [round(best["start"], 2), round(end, 2)]
    return out
