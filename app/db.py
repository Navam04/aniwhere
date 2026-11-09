"""SQLite storage. One connection per thread; autocommit mode.

Profiles: each Tailscale login has its own lists, progress, history, settings and notification devices.
The login for the current request (or background job) lives in a context variable, `user()`; the
per-person tables carry a `user` column. Show metadata, collections and caches are shared."""
import contextvars
import json
import os
import sqlite3
import threading
import time
from pathlib import Path

DATA_DIR = Path(os.environ.get("ANIME_DATA", "/var/lib/anime"))
DB_PATH = DATA_DIR / "anime.db"

# The owner is the first allowed login (or ANIME_OWNER); data from before profiles belongs to them,
# and requests without a login (local development) act as them.
_allowed_env = [x.strip().lower() for x in os.environ.get("ANIME_ALLOWED_LOGINS", "").split(",") if x.strip()]
OWNER = (os.environ.get("ANIME_OWNER") or (_allowed_env[0] if _allowed_env else "owner")).strip().lower()
_user = contextvars.ContextVar("user", default=OWNER)


def user():
    return _user.get()


def set_user(login):
    return _user.set((login or OWNER).lower())


SCHEMA = """
CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY, data TEXT NOT NULL, fetched_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS mapping (
    anilist_id INTEGER PRIMARY KEY, source_id TEXT, source_title TEXT,
    verified INTEGER NOT NULL DEFAULT 0, mode TEXT NOT NULL DEFAULT 'dub');
CREATE TABLE IF NOT EXISTS source_eps (
    anilist_id INTEGER PRIMARY KEY, latest REAL, count INTEGER, checked_at REAL,
    notified_latest REAL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS kitsu_map (anilist_id INTEGER PRIMARY KEY, kitsu_id TEXT, fetched_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS ep_meta (
    anilist_id INTEGER NOT NULL, number REAL NOT NULL, title TEXT, description TEXT, thumbnail TEXT,
    length INTEGER, airdate TEXT, PRIMARY KEY (anilist_id, number));
CREATE TABLE IF NOT EXISTS ep_meta_page (
    anilist_id INTEGER NOT NULL, page INTEGER NOT NULL, fetched_at REAL NOT NULL, PRIMARY KEY (anilist_id, page));
CREATE TABLE IF NOT EXISTS skip_times (
    mal_id INTEGER NOT NULL, episode TEXT NOT NULL, data TEXT NOT NULL, fetched_at REAL NOT NULL,
    PRIMARY KEY (mal_id, episode));
CREATE TABLE IF NOT EXISTS recs (anilist_id INTEGER PRIMARY KEY, ids TEXT NOT NULL, fetched_at REAL NOT NULL);
"""

# per-person tables (current shape)
USER_SCHEMA = """
CREATE TABLE IF NOT EXISTS list_entry (
    user TEXT NOT NULL, anilist_id INTEGER NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
    score REAL NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', updated_at REAL NOT NULL,
    PRIMARY KEY (user, anilist_id));
CREATE TABLE IF NOT EXISTS watch (
    user TEXT NOT NULL, anilist_id INTEGER NOT NULL, episode TEXT NOT NULL, position REAL NOT NULL DEFAULT 0,
    duration REAL NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0, updated_at REAL NOT NULL,
    PRIMARY KEY (user, anilist_id, episode));
CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, anilist_id INTEGER NOT NULL, episode TEXT NOT NULL,
    position REAL NOT NULL DEFAULT 0, duration REAL NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0,
    watched_at REAL NOT NULL);
CREATE INDEX IF NOT EXISTS history_user_time ON history(user, watched_at);
CREATE TABLE IF NOT EXISTS continue_hidden (
    user TEXT NOT NULL, anilist_id INTEGER NOT NULL, hidden_at REAL NOT NULL, PRIMARY KEY (user, anilist_id));
CREATE TABLE IF NOT EXISTS push_sub (endpoint TEXT PRIMARY KEY, user TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS user_settings (user TEXT NOT NULL, key TEXT NOT NULL, value TEXT, PRIMARY KEY (user, key));
CREATE TABLE IF NOT EXISTS user_mode (user TEXT NOT NULL, anilist_id INTEGER NOT NULL, mode TEXT NOT NULL,
    PRIMARY KEY (user, anilist_id));
CREATE TABLE IF NOT EXISTS notified (user TEXT NOT NULL, anilist_id INTEGER NOT NULL, latest REAL NOT NULL,
    PRIMARY KEY (user, anilist_id));
"""

# settings that belong to a person rather than to the server
USER_KEYS = {"anilist_token", "anilist_user_id", "anilist_name", "anilist_avatar", "anilist_client_id",
             "anilist_last_sync", "autoplay", "autoskip", "recent_searches", "default_mode",
             "skip_filler", "notify_mute", "notify_watch", "watch_orders"}

_local = threading.local()


def conn() -> sqlite3.Connection:
    c = getattr(_local, "c", None)
    if c is None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        c = sqlite3.connect(DB_PATH, timeout=15, isolation_level=None)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA busy_timeout=15000")
        _local.c = c
    return c


def _columns(table):
    return {r["name"] for r in q(f"PRAGMA table_info({table})")}


def _migrate_to_profiles():
    """One-time move of data from before profiles into per-person tables, owned by OWNER."""
    c = conn()
    old = {t: _columns(t) for t in ("list_entry", "watch", "history", "continue_hidden", "push_sub")}
    if all(not cols or "user" in cols for cols in old.values()):
        return
    c.execute("BEGIN")
    try:
        for t, cols in old.items():
            if cols and "user" not in cols:
                c.execute(f"ALTER TABLE {t} RENAME TO {t}_old")
        for stmt in [s for s in USER_SCHEMA.split(";") if s.strip()]:
            c.execute(stmt)
        o = OWNER
        if "user" not in (old["list_entry"] or {"user"}):
            c.execute("INSERT INTO list_entry SELECT ?, anilist_id, status, progress, score, notes, updated_at "
                      "FROM list_entry_old", (o,))
        if "user" not in (old["watch"] or {"user"}):
            c.execute("INSERT INTO watch SELECT ?, anilist_id, episode, position, duration, completed, updated_at "
                      "FROM watch_old", (o,))
        if "user" not in (old["history"] or {"user"}):
            c.execute("INSERT INTO history(id,user,anilist_id,episode,position,duration,completed,watched_at) "
                      "SELECT id, ?, anilist_id, episode, position, duration, completed, watched_at FROM history_old", (o,))
        if "user" not in (old["continue_hidden"] or {"user"}):
            c.execute("INSERT INTO continue_hidden SELECT ?, anilist_id, hidden_at FROM continue_hidden_old", (o,))
        if "user" not in (old["push_sub"] or {"user"}):
            c.execute("INSERT INTO push_sub SELECT endpoint, ?, data FROM push_sub_old", (o,))
        for t, cols in old.items():
            if cols and "user" not in cols:
                c.execute(f"DROP TABLE {t}_old")
        c.execute("DROP INDEX IF EXISTS history_time")
        # personal settings, per-show Sub/Dub choices and notification state move to the owner
        for k in USER_KEYS:
            c.execute("INSERT OR IGNORE INTO user_settings(user,key,value) SELECT ?, key, value FROM settings WHERE key=?",
                      (o, k))
            c.execute("DELETE FROM settings WHERE key=?", (k,))
        c.execute("INSERT OR IGNORE INTO user_mode(user,anilist_id,mode) "
                  "SELECT ?, anilist_id, mode FROM mapping WHERE mode IS NOT NULL AND mode!=''", (o,))
        c.execute("INSERT OR IGNORE INTO notified(user,anilist_id,latest) "
                  "SELECT ?, anilist_id, notified_latest FROM source_eps WHERE notified_latest IS NOT NULL", (o,))
        c.execute("COMMIT")
    except Exception:
        c.execute("ROLLBACK")
        raise


def init():
    c = conn()
    c.executescript(SCHEMA)
    _migrate_to_profiles()
    for stmt in [s for s in USER_SCHEMA.split(";") if s.strip()]:
        c.execute(stmt)
    # first run with the history table: seed it from what's already been watched
    if not get_setting("history_seeded"):
        run("INSERT INTO history(user,anilist_id,episode,position,duration,completed,watched_at) "
            "SELECT user, anilist_id, episode, position, duration, completed, updated_at FROM watch "
            "WHERE completed=1 OR position>10")
        set_setting("history_seeded", 1)


def users():
    """Everyone who has any data here (the owner always included)."""
    rows = q("SELECT user FROM list_entry UNION SELECT user FROM watch UNION SELECT user FROM user_settings "
             "UNION SELECT user FROM push_sub")
    return sorted({OWNER, *(r["user"] for r in rows)})


def log_history(anilist_id, episode, position, duration, completed):
    """One history row per viewing session: updates the row from the last 3 hours, else adds one."""
    now = time.time()
    row = one("SELECT id, completed FROM history WHERE user=? AND anilist_id=? AND episode=? AND watched_at>? "
              "ORDER BY watched_at DESC LIMIT 1", user(), anilist_id, episode, now - 3 * 3600)
    if row:
        run("UPDATE history SET position=?, duration=?, completed=?, watched_at=? WHERE id=?",
            position, duration, int(completed or row["completed"]), now, row["id"])
    else:
        run("INSERT INTO history(user,anilist_id,episode,position,duration,completed,watched_at) VALUES(?,?,?,?,?,?,?)",
            user(), anilist_id, episode, position, duration, int(completed), now)


def get_json(key, default):
    v = get_setting(key)
    if v is None:
        return default
    try:
        return json.loads(v)
    except ValueError:
        return default


def set_json(key, value):
    set_setting(key, json.dumps(value))


def q(sql, *args):
    return [dict(r) for r in conn().execute(sql, args).fetchall()]


def one(sql, *args):
    r = conn().execute(sql, args).fetchone()
    return dict(r) if r else None


def run(sql, *args):
    conn().execute(sql, args)


# settings: personal keys (USER_KEYS) are stored per person, everything else is server-wide -------------
def get_setting(key, default=None):
    if key in USER_KEYS:
        r = one("SELECT value FROM user_settings WHERE user=? AND key=?", user(), key)
    else:
        r = one("SELECT value FROM settings WHERE key=?", key)
    return r["value"] if r and r["value"] is not None else default


def set_setting(key, value):
    if key in USER_KEYS:
        if value is None:
            run("DELETE FROM user_settings WHERE user=? AND key=?", user(), key)
        else:
            run("INSERT INTO user_settings(user,key,value) VALUES(?,?,?) "
                "ON CONFLICT(user,key) DO UPDATE SET value=excluded.value", user(), key, str(value))
    elif value is None:
        run("DELETE FROM settings WHERE key=?", key)
    else:
        run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            key, str(value))


# media cache ------------------------------------------------------------
def cached_media(ids, max_age):
    if not ids:
        return {}
    marks = ",".join("?" * len(ids))
    now = time.time()
    rows = q(f"SELECT id, data, fetched_at FROM media WHERE id IN ({marks})", *ids)
    return {r["id"]: json.loads(r["data"]) for r in rows if now - r["fetched_at"] < max_age}


def store_media(items):
    now = time.time()
    for m in items:
        run("INSERT INTO media(id,data,fetched_at) VALUES(?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET data=excluded.data, fetched_at=excluded.fetched_at",
            m["id"], json.dumps(m), now)


# list entries (current person) ---------------------------------------------
def get_entry(anilist_id):
    return one("SELECT * FROM list_entry WHERE user=? AND anilist_id=?", user(), anilist_id)


def entries():
    return q("SELECT * FROM list_entry WHERE user=?", user())


def save_entry(anilist_id, status, progress, score, notes, updated_at=None):
    run("INSERT INTO list_entry(user,anilist_id,status,progress,score,notes,updated_at) VALUES(?,?,?,?,?,?,?) "
        "ON CONFLICT(user,anilist_id) DO UPDATE SET status=excluded.status, progress=excluded.progress, "
        "score=excluded.score, notes=excluded.notes, updated_at=excluded.updated_at",
        user(), anilist_id, status, int(progress or 0), float(score or 0), notes or "", updated_at or time.time())


def delete_entry(anilist_id):
    run("DELETE FROM list_entry WHERE user=? AND anilist_id=?", user(), anilist_id)


# mapping (shared: which stream-source show an AniList show is) ------------------
def get_mapping(anilist_id):
    return one("SELECT * FROM mapping WHERE anilist_id=?", anilist_id)


def save_mapping(anilist_id, source_id, source_title, verified):
    run("INSERT INTO mapping(anilist_id,source_id,source_title,verified) VALUES(?,?,?,?) "
        "ON CONFLICT(anilist_id) DO UPDATE SET source_id=excluded.source_id, "
        "source_title=excluded.source_title, verified=excluded.verified",
        anilist_id, source_id, source_title, verified)


# Sub/Dub choice (per person) ----------------------------------------------------
def get_mode(anilist_id, default=None):
    r = one("SELECT mode FROM user_mode WHERE user=? AND anilist_id=?", user(), anilist_id)
    return r["mode"] if r else (default or get_setting("default_mode", "dub"))


def set_mode(anilist_id, mode):
    run("INSERT INTO user_mode(user,anilist_id,mode) VALUES(?,?,?) "
        "ON CONFLICT(user,anilist_id) DO UPDATE SET mode=excluded.mode", user(), anilist_id, mode)
