"""AniList GraphQL client: metadata, search and list sync."""
import asyncio
import json
import logging
import time

import httpx

from . import db, health

API = "https://graphql.anilist.co"
log = logging.getLogger("anilist")
_client = httpx.AsyncClient(timeout=20)

MEDIA_FIELDS = """
id idMal title { romaji english native } synonyms format status episodes duration
season seasonYear averageScore genres description(asHtml: false)
coverImage { extraLarge large color } bannerImage
nextAiringEpisode { episode airingAt timeUntilAiring }
"""
RELATIONS = """
relations { edges { relationType node { id type format title { romaji english }
  coverImage { large color } seasonYear } } }
"""


class AniListError(Exception):
    pass


async def gql(query, variables=None, token=None):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    for attempt in range(3):
        r = await _client.post(API, json={"query": query, "variables": variables or {}}, headers=headers)
        health.anilist_headers(r.headers, r.status_code)
        if r.status_code == 429:
            await asyncio.sleep(min(int(r.headers.get("Retry-After", "5")), 30))
            continue
        data = r.json()
        if data.get("errors"):
            msg = "; ".join(e.get("message", "?") for e in data["errors"])
            if r.status_code >= 500 and attempt < 2:
                await asyncio.sleep(2)
                continue
            raise AniListError(msg)
        return data["data"]
    raise AniListError("AniList rate limit, try again in a minute")


def token():
    return db.get_setting("anilist_token")


def display_title(m):
    t = m.get("title") or {}
    return t.get("english") or t.get("romaji") or t.get("native") or "Untitled"


# metadata -------------------------------------------------------------------
def _max_age(m):
    return 3600 if m.get("status") in ("RELEASING", "NOT_YET_RELEASED") else 6 * 3600


async def media(anilist_id, relations=False):
    """One show, with relations. Cached in SQLite."""
    cached = db.cached_media([anilist_id], 3600).get(anilist_id)
    if cached and (not relations or "relations" in cached):
        return cached
    d = await gql(f"query($id:Int){{Media(id:$id,type:ANIME){{{MEDIA_FIELDS} {RELATIONS}}}}}", {"id": anilist_id})
    m = d["Media"]
    db.store_media([m])
    return m


async def media_many(ids):
    """Several shows by id, using the cache where fresh."""
    ids = list(dict.fromkeys(int(i) for i in ids))
    found = db.cached_media(ids, 3 * 3600)
    missing = [i for i in ids if i not in found]
    for start in range(0, len(missing), 50):
        chunk = missing[start:start + 50]
        d = await gql(f"query($ids:[Int]){{Page(perPage:50){{media(id_in:$ids,type:ANIME){{{MEDIA_FIELDS}}}}}}}",
                      {"ids": chunk})
        items = d["Page"]["media"]
        db.store_media(items)
        found.update({m["id"]: m for m in items})
    return [found[i] for i in ids if i in found]


async def search(text):
    d = await gql(f"query($q:String){{Page(perPage:30){{media(search:$q,type:ANIME,isAdult:false,"
                  f"sort:SEARCH_MATCH){{{MEDIA_FIELDS}}}}}}}", {"q": text})
    items = d["Page"]["media"]
    db.store_media(items)
    return items


_browse_cache = {}


async def browse(kind):
    """Rows for the home page: trending, this season, all-time popular. Cached 1 hour."""
    hit = _browse_cache.get(kind)
    if hit and time.time() - hit[0] < 3600:
        return hit[1]
    args = {"trending": "sort:TRENDING_DESC", "popular": "sort:POPULARITY_DESC"}
    if kind == "season":
        season, year = current_season()
        arg = f"sort:POPULARITY_DESC,season:{season},seasonYear:{year}"
    else:
        arg = args[kind]
    d = await gql(f"query{{Page(perPage:24){{media(type:ANIME,isAdult:false,{arg}){{{MEDIA_FIELDS}}}}}}}")
    items = d["Page"]["media"]
    db.store_media(items)
    _browse_cache[kind] = (time.time(), items)
    return items


SORTS = {"popularity": "POPULARITY_DESC", "score": "SCORE_DESC", "trending": "TRENDING_DESC",
         "newest": "START_DATE_DESC", "match": "SEARCH_MATCH"}
FORMATS = ("TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA")
AIRING = ("RELEASING", "FINISHED", "NOT_YET_RELEASED")


async def discover(q="", genres=(), formats=(), status=None, sort=None, page=1):
    """Search & Browse: title text, genres, formats, airing status and sort, 30 per page."""
    sort = SORTS.get(sort or ("match" if q else "popularity"), "POPULARITY_DESC")
    if sort == "SEARCH_MATCH" and not q:
        sort = "POPULARITY_DESC"
    variables = {"page": max(1, int(page)), "sort": [sort]}
    args = ["type:ANIME", "isAdult:false", "sort:$sort"]
    params = ["$page:Int", "$sort:[MediaSort]"]
    if q:
        variables["q"] = q
        args.append("search:$q")
        params.append("$q:String")
    if genres:
        variables["genres"] = list(genres)
        args.append("genre_in:$genres")
        params.append("$genres:[String]")
    formats = [f for f in formats if f in FORMATS]
    if formats:
        variables["formats"] = formats
        args.append("format_in:$formats")
        params.append("$formats:[MediaFormat]")
    if status in AIRING:
        variables["status"] = status
        args.append("status:$status")
        params.append("$status:MediaStatus")
    if sort == "SCORE_DESC":
        args.append("averageScore_greater:0")
    if sort == "START_DATE_DESC" and status is None:
        args.append("status_not:NOT_YET_RELEASED")  # "newest" means out already, unless asked for upcoming
    d = await gql(f"query({','.join(params)}){{Page(page:$page,perPage:30){{pageInfo{{hasNextPage}} "
                  f"media({','.join(args)}){{{MEDIA_FIELDS}}}}}}}", variables)
    items = d["Page"]["media"]
    db.store_media(items)
    return {"items": items, "has_more": d["Page"]["pageInfo"]["hasNextPage"]}


_genres = []


async def genres():
    global _genres
    if not _genres:
        d = await gql("query{GenreCollection}")
        _genres = [g for g in d["GenreCollection"] if g not in ("Hentai", "Ecchi")]
    return _genres


async def recommendations(anilist_id):
    """AniList's top-rated recommendations for a show (ids cached a day, media via the media cache)."""
    row = db.one("SELECT ids, fetched_at FROM recs WHERE anilist_id=?", anilist_id)
    if row and time.time() - row["fetched_at"] < 86400:
        ids = json.loads(row["ids"])
    else:
        d = await gql(f"""query($id:Int){{Media(id:$id){{recommendations(sort:RATING_DESC,perPage:15){{nodes{{
            rating mediaRecommendation{{{MEDIA_FIELDS} isAdult}} }}}}}}}}""", {"id": anilist_id})
        nodes = d["Media"]["recommendations"]["nodes"] if d.get("Media") else []
        items = [n["mediaRecommendation"] for n in nodes
                 if n.get("mediaRecommendation") and (n.get("rating") or 0) > 0
                 and not n["mediaRecommendation"].get("isAdult")]
        db.store_media(items)
        ids = [m["id"] for m in items]
        db.run("INSERT INTO recs(anilist_id,ids,fetched_at) VALUES(?,?,?) "
               "ON CONFLICT(anilist_id) DO UPDATE SET ids=excluded.ids, fetched_at=excluded.fetched_at",
               anilist_id, json.dumps(ids), time.time())
    return await media_many(ids)


SEASON_FORMATS = ("TV", "TV_SHORT", "ONA")


def _season_link(m, relation):
    """The PREQUEL or SEQUEL of a show that counts as a season (a series, not a movie, special or OVA)."""
    edges = [e for e in (m.get("relations") or {}).get("edges") or []
             if e.get("relationType") == relation and (e.get("node") or {}).get("type") == "ANIME"
             and e["node"].get("format") in SEASON_FORMATS]
    edges.sort(key=lambda e: e["node"].get("format") != "TV")  # prefer the TV series when there are several
    return edges[0]["node"]["id"] if edges else None


async def seasons(anilist_id, limit=25):
    """All seasons of a series in order, found by following prequel/sequel links from any one season.
    Empty when the show isn't a series (e.g. a movie) or has no other seasons."""
    start = await media(anilist_id, relations=True)
    if start.get("format") not in SEASON_FORMATS:
        return []
    chain, seen = [start], {start["id"]}
    for relation, add in (("PREQUEL", lambda x: chain.insert(0, x)), ("SEQUEL", chain.append)):
        cur = start
        while len(chain) < limit:
            nxt = _season_link(cur, relation)
            if not nxt or nxt in seen:
                break
            cur = await media(nxt, relations=True)
            seen.add(nxt)
            if cur.get("episodes") == 1:  # a one-off (e.g. a single-episode ONA) isn't a season
                break
            add(cur)
    return chain if len(chain) > 1 else []


_studios = {}


async def studios_of(ids):
    """Main animation studios for several shows: {anilist_id: [name, ...]} (cached a day in memory)."""
    now = time.time()
    missing = [i for i in dict.fromkeys(ids) if i not in _studios or now - _studios[i][0] > 86400]
    for start in range(0, len(missing), 50):
        d = await gql("query($ids:[Int]){Page(perPage:50){media(id_in:$ids,type:ANIME){id "
                      "studios(isMain:true){nodes{name isAnimationStudio}}}}}", {"ids": missing[start:start + 50]})
        for m in d["Page"]["media"]:
            _studios[m["id"]] = (now, [s["name"] for s in m["studios"]["nodes"] if s.get("isAnimationStudio")])
    return {i: _studios[i][1] for i in ids if i in _studios}


def current_season():
    t = time.gmtime()
    season = ["WINTER", "WINTER", "WINTER", "SPRING", "SPRING", "SPRING",
              "SUMMER", "SUMMER", "SUMMER", "FALL", "FALL", "FALL"][t.tm_mon - 1]
    return season, t.tm_year


# account & list sync ---------------------------------------------------------
async def viewer(tok):
    d = await gql("query{Viewer{id name avatar{medium}}}", token=tok)
    return d["Viewer"]


async def fetch_list(tok, user_id):
    d = await gql(f"""query($u:Int){{MediaListCollection(userId:$u,type:ANIME){{lists{{entries{{
        mediaId status progress score(format:POINT_10_DECIMAL) notes updatedAt
        media{{{MEDIA_FIELDS}}} }}}}}}}}""", {"u": user_id}, token=tok)
    entries = []
    for lst in d["MediaListCollection"]["lists"]:
        entries.extend(lst["entries"])
    db.store_media([e["media"] for e in entries])
    return entries


async def push_entry(anilist_id):
    """Send the local list entry for one show to AniList (or delete it there)."""
    tok = token()
    if not tok:
        return
    e = db.get_entry(anilist_id)
    try:
        if e is None:
            d = await gql("query($m:Int,$u:Int){MediaList(mediaId:$m,userId:$u){id}}",
                          {"m": anilist_id, "u": int(db.get_setting("anilist_user_id", 0))}, token=tok)
            await gql("mutation($id:Int){DeleteMediaListEntry(id:$id){deleted}}",
                      {"id": d["MediaList"]["id"]}, token=tok)
            return
        await gql("""mutation($m:Int,$s:MediaListStatus,$p:Int,$sc:Int,$n:String){
            SaveMediaListEntry(mediaId:$m,status:$s,progress:$p,scoreRaw:$sc,notes:$n){id updatedAt}}""",
                  {"m": anilist_id, "s": e["status"], "p": e["progress"],
                   "sc": round(e["score"] * 10), "n": e["notes"]}, token=tok)
    except (AniListError, httpx.HTTPError, KeyError, TypeError) as ex:
        log.warning("AniList sync failed for %s: %s", anilist_id, ex)


def push_later(anilist_id):
    asyncio.get_running_loop().create_task(push_entry(anilist_id))


async def sync_from_anilist():
    """Two-way merge: newer side wins per show. Returns number of changed local entries."""
    tok = token()
    uid = db.get_setting("anilist_user_id")
    if not tok or not uid:
        return 0
    remote = await fetch_list(tok, int(uid))
    changed = 0
    seen = set()
    for r in remote:
        mid = r["mediaId"]
        seen.add(mid)
        local = db.get_entry(mid)
        if local is None or r["updatedAt"] > local["updated_at"] + 1:
            db.save_entry(mid, r["status"], r["progress"], r["score"] or 0, r["notes"] or "", r["updatedAt"])
            changed += 1
        elif local["updated_at"] > r["updatedAt"] + 1 and (
                local["status"], local["progress"]) != (r["status"], r["progress"]):
            await push_entry(mid)
    # entries changed in the app that AniList doesn't have yet (e.g. made before connecting).
    # Entries are never deleted locally just because AniList lacks them.
    last = float(db.get_setting("anilist_last_sync", 0))
    for local in db.q("SELECT anilist_id, updated_at FROM list_entry WHERE user=?", db.user()):
        if local["anilist_id"] not in seen and local["updated_at"] > last:
            await push_entry(local["anilist_id"])
    db.set_setting("anilist_last_sync", time.time())
    return changed
