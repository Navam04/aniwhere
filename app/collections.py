"""Collections: franchises and animation studios.

A franchise is every anime AniList links together as sequel, prequel, side story, spin-off, movie, OVA...
(e.g. Naruto + Naruto Shippuden + the movies + Boruto). It's found by walking those links from one show,
fetching up to 50 shows per AniList request. A studio collection is a studio's most popular shows.

Collections for the most popular shows and studios are built in the background once a day and kept in
SQLite; a collection for any other show is built the first time its page asks for it."""
import asyncio
import json
import logging
import time

from . import anilist, db

log = logging.getLogger("collections")
LINKS = ("SEQUEL", "PREQUEL", "SIDE_STORY", "SPIN_OFF", "PARENT", "ALTERNATIVE", "SUMMARY", "COMPILATION", "CONTAINS")
SERIES = ("TV", "TV_SHORT", "ONA")
MAX_MEMBERS = 60   # big universes (Gundam, Pretty Cure) are cut off here
SEEDS = 150        # how many of AniList's most popular shows seed the franchise list
REFRESH = 86400
BACKGROUND_PACE = 4  # the daily build sends one request every 4s, leaving most of AniList's limit for browsing
LIGHT = ("id type isAdult format episodes popularity title { romaji english } startDate { year month day } "
         "coverImage { large } relations { edges { relationType node { id type } } }")

SCHEMA = """
CREATE TABLE IF NOT EXISTS collections (
    key TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, members TEXT NOT NULL,
    popularity INTEGER NOT NULL DEFAULT 0, counts TEXT NOT NULL, covers TEXT NOT NULL,
    search TEXT NOT NULL DEFAULT '', updated_at REAL NOT NULL);
"""
_building = False


def init():
    db.conn().executescript(SCHEMA)
    cols = {r["name"] for r in db.q("PRAGMA table_info(collections)")}
    if "main" not in cols:
        # main story ids (added later): rebuild so popular franchises get them
        db.run("ALTER TABLE collections ADD COLUMN main TEXT")
        db.set_setting("collections_built", None)


def _title(m):
    t = m.get("title") or {}
    return t.get("english") or t.get("romaji") or "Untitled"


def _start(m):
    d = m.get("startDate") or {}
    return (d.get("year") or 9999, d.get("month") or 12, d.get("day") or 31)


def _counts(members):
    series = sum(m.get("format") in SERIES for m in members)
    movies = sum(m.get("format") == "MOVIE" for m in members)
    return {"series": series, "movies": movies, "other": len(members) - series - movies}


def _covers(members):
    top = sorted(members, key=lambda m: -(m.get("popularity") or 0))
    return [c for c in ((m.get("coverImage") or {}).get("large") for m in top) if c][:4]


def _save(key, kind, name, members, popularity, search, main=None):
    ids = ",".join(str(m["id"]) for m in members)
    db.run("INSERT INTO collections(key,kind,name,members,popularity,counts,covers,search,updated_at,main) "
           "VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET kind=excluded.kind, name=excluded.name, "
           "members=excluded.members, popularity=excluded.popularity, counts=excluded.counts, covers=excluded.covers, "
           "search=excluded.search, updated_at=excluded.updated_at, main=excluded.main",
           key, kind, name, f",{ids},", int(popularity or 0), json.dumps(_counts(members)),
           json.dumps(_covers(members)), search.lower(), time.time(),
           json.dumps(main) if main is not None else None)


def main_ids(row):
    """Ids of the franchise's main story (None if not worked out yet for this row)."""
    return json.loads(row["main"]) if row.get("main") else None


def _main_story(members, root):
    """The main story: everything reachable from the oldest series through sequel/prequel links,
    keeping only series and movies (no recaps, spin-offs, OVAs or one-episode shorts)."""
    by_id = {m["id"]: m for m in members}
    ok = lambda m: m.get("format") == "MOVIE" or (m.get("format") in SERIES and m.get("episodes") != 1)
    main, todo = {root["id"]}, [root]
    while todo:
        cur = todo.pop()
        for e in (cur.get("relations") or {}).get("edges") or []:
            n = by_id.get((e.get("node") or {}).get("id"))
            if e.get("relationType") in ("SEQUEL", "PREQUEL") and n and n["id"] not in main and ok(n):
                main.add(n["id"])
                todo.append(n)
    return [m["id"] for m in members if m["id"] in main]


def member_ids(row):
    return [int(x) for x in row["members"].strip(",").split(",") if x]


# franchises ---------------------------------------------------------------------
async def _fetch_light(ids, pace=0.3):
    out = {}
    ids = list(ids)
    for i in range(0, len(ids), 50):
        d = await anilist.gql(f"query($ids:[Int]){{Page(perPage:50){{media(id_in:$ids,type:ANIME){{{LIGHT}}}}}}}",
                              {"ids": ids[i:i + 50]})
        for m in d["Page"]["media"]:
            out[m["id"]] = m
        await asyncio.sleep(pace)
    return out


async def walk(seed_id, pace=0.3):
    """Every anime linked to seed_id (up to MAX_MEMBERS), oldest first. `pace` = seconds between requests."""
    members, visited, frontier = {}, set(), {seed_id}
    while frontier and len(members) < MAX_MEMBERS:
        batch = list(frontier)[:max(1, MAX_MEMBERS - len(members))]
        visited.update(batch)
        got = await _fetch_light(batch, pace)
        frontier = set()
        for m in got.values():
            if m.get("isAdult") or m.get("type") != "ANIME":
                continue
            members[m["id"]] = m
            for e in (m.get("relations") or {}).get("edges") or []:
                n = e.get("node") or {}
                if e.get("relationType") in LINKS and n.get("type") == "ANIME" and n.get("id") not in visited:
                    frontier.add(n["id"])
    return sorted(members.values(), key=_start)


def _save_franchise(members):
    series = [m for m in members if m.get("format") in SERIES] or members
    root = series[0]  # oldest series names the collection: "Naruto", "Attack on Titan"
    key = f"f:{root['id']}"
    search = " ".join(f"{(m.get('title') or {}).get('english') or ''} {(m.get('title') or {}).get('romaji') or ''}"
                      for m in members)
    _save(key, "franchise", _title(root), members, max(m.get("popularity") or 0 for m in members), search,
          _main_story(members, root))
    return key


async def ensure_main(row):
    """Franchise rows saved before main stories were tracked get re-walked once, the first time they're opened."""
    if row["kind"] != "franchise" or main_ids(row) is not None:
        return row
    try:
        members = await walk(int(row["key"][2:]))
    except Exception as ex:
        log.info("couldn't re-walk %s: %s", row["key"], ex)
        return row
    if len(members) >= 2:
        key = _save_franchise(members)
        return db.one("SELECT * FROM collections WHERE key=?", key) or row
    return row


async def franchise_for(anilist_id):
    """The franchise collection a show belongs to (built now if needed), or None if it stands alone."""
    row = db.one("SELECT * FROM collections WHERE kind='franchise' AND members LIKE ? ORDER BY popularity DESC",
                 f"%,{int(anilist_id)},%")
    if row:
        return row
    no = db.get_json("collections_solo", [])
    if anilist_id in no:
        return None
    members = await walk(anilist_id)
    if len(members) < 2:
        db.set_json("collections_solo", (no + [anilist_id])[-2000:])
        return None
    return db.one("SELECT * FROM collections WHERE key=?", _save_franchise(members))


# studios ----------------------------------------------------------------------------
STUDIO_MEDIA = "id type isAdult format popularity title { romaji english } coverImage { large }"


async def _build_studios():
    d = await anilist.gql(f"""query{{Page(perPage:50){{studios(sort:FAVOURITES_DESC){{id name isAnimationStudio favourites
        media(sort:POPULARITY_DESC,isMain:true,perPage:25){{nodes{{{STUDIO_MEDIA}}}}}}}}}}}""")
    for s in d["Page"]["studios"]:
        nodes = [m for m in s["media"]["nodes"] if m.get("type") == "ANIME" and not m.get("isAdult")]
        if s.get("isAnimationStudio") and len(nodes) >= 4:
            _save(f"s:{s['id']}", "studio", s["name"], nodes, s.get("favourites") or 0, s["name"])


async def studio_page(studio_id, page=1):
    d = await anilist.gql(f"""query($id:Int,$p:Int){{Studio(id:$id){{id name favourites isAnimationStudio
        media(sort:POPULARITY_DESC,isMain:true,page:$p,perPage:30){{pageInfo{{hasNextPage}}
        nodes{{{anilist.MEDIA_FIELDS} type isAdult}}}}}}}}""", {"id": studio_id, "p": page})
    s = d["Studio"]
    items = [m for m in s["media"]["nodes"] if m.get("type") == "ANIME" and not m.get("isAdult")]
    db.store_media(items)
    return s, items, s["media"]["pageInfo"]["hasNextPage"]


async def search_studios(q):
    d = await anilist.gql(f"""query($q:String){{Page(perPage:6){{studios(search:$q){{id name isAnimationStudio favourites
        media(sort:POPULARITY_DESC,isMain:true,perPage:12){{nodes{{{STUDIO_MEDIA}}}}}}}}}}}""", {"q": q})
    out = []
    for s in d["Page"]["studios"]:
        nodes = [m for m in s["media"]["nodes"] if m.get("type") == "ANIME" and not m.get("isAdult")]
        if s.get("isAnimationStudio") and nodes:
            out.append({"key": f"s:{s['id']}", "kind": "studio", "name": s["name"], "size": len(nodes),
                        "counts": _counts(nodes), "covers": _covers(nodes), "popularity": s.get("favourites") or 0})
    return out


# building ----------------------------------------------------------------------------
async def build_all():
    """Rebuild the popular franchises and studios. Takes a few minutes (AniList rate limits)."""
    global _building
    if _building:
        return
    _building = True
    started = time.time()
    try:
        await _build_studios()
        seeds = []
        for page in range(1, SEEDS // 50 + 1):
            d = await anilist.gql("query($p:Int){Page(page:$p,perPage:50){media(type:ANIME,isAdult:false,"
                                  "sort:POPULARITY_DESC){id}}}", {"p": page})
            seeds += [m["id"] for m in d["Page"]["media"]]
            await asyncio.sleep(BACKGROUND_PACE)
        done = set()
        for sid in seeds:
            if sid in done:
                continue
            try:
                members = await walk(sid, BACKGROUND_PACE)
            except Exception as ex:
                log.info("franchise walk from %s failed: %s", sid, ex)
                continue
            done.update(m["id"] for m in members)
            done.add(sid)
            if len(members) >= 2:
                _save_franchise(members)
        # drop popular collections that didn't come back this time (shows built on demand are kept)
        db.run("DELETE FROM collections WHERE updated_at<? AND kind='studio'", started)
        db.set_setting("collections_built", time.time())
        log.info("collections built: %s", db.one("SELECT COUNT(*) AS n FROM collections")["n"])
    finally:
        _building = False


def building():
    return _building


async def keep_fresh():
    await asyncio.sleep(20)
    while True:
        try:
            if time.time() - float(db.get_setting("collections_built", 0) or 0) > REFRESH:
                await build_all()
        except Exception as ex:
            log.warning("collection build failed: %s", ex)
        await asyncio.sleep(3600)


# summaries for the frontend --------------------------------------------------------
def summary(row, entries):
    ids = member_ids(row)
    seen = [i for i in ids if i in entries]
    return {"key": row["key"], "kind": row["kind"], "name": row["name"], "size": len(ids),
            "counts": json.loads(row["counts"]), "covers": json.loads(row["covers"]),
            "popularity": row["popularity"], "seen": len(seen),
            "done": sum(entries[i]["status"] == "COMPLETED" for i in seen)}
