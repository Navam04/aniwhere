"""Server health: recent errors, stream-source and AniList status, and database backups."""
import collections
import logging
import shutil
import sqlite3
import time

from . import db

STARTED = time.time()
BACKUP_DIR = db.DATA_DIR / "backups"
KEEP_BACKUPS = 7

# recent warnings and errors from any part of the app, newest last
recent = collections.deque(maxlen=30)


class _Recorder(logging.Handler):
    def emit(self, record):
        if record.levelno >= logging.WARNING:
            recent.append({"at": record.created, "where": record.name, "message": record.getMessage()[:300]})


def install():
    logging.getLogger().addHandler(_Recorder())


# stream source (ani-cli) lookups -------------------------------------------------
source_stats = {"ok": 0, "failed": 0, "last_ok": None, "last_error": None, "last_error_at": None}


def source_ok():
    source_stats["ok"] += 1
    source_stats["last_ok"] = time.time()


def source_failed(message):
    source_stats["failed"] += 1
    source_stats["last_error"] = message[:300]
    source_stats["last_error_at"] = time.time()


# AniList rate limit, from its response headers ------------------------------------
anilist_stats = {"limit": None, "remaining": None, "seen_at": None, "last_429": None}


def anilist_headers(headers, status):
    if headers.get("x-ratelimit-limit"):
        anilist_stats["limit"] = int(headers["x-ratelimit-limit"])
        anilist_stats["remaining"] = int(headers.get("x-ratelimit-remaining") or 0)
        anilist_stats["seen_at"] = time.time()
    if status == 429:
        anilist_stats["last_429"] = time.time()


# backups ----------------------------------------------------------------------
def backups():
    if not BACKUP_DIR.exists():
        return []
    files = sorted(BACKUP_DIR.glob("anime-*.db"), reverse=True)
    return [{"name": f.name, "size": f.stat().st_size, "at": f.stat().st_mtime} for f in files]


def make_backup():
    """Consistent copy of the live database (SQLite's online backup), keeping the newest KEEP_BACKUPS."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    path = BACKUP_DIR / time.strftime("anime-%Y%m%d-%H%M%S.db")
    dst = sqlite3.connect(path)
    try:
        sqlite3.connect(db.DB_PATH).backup(dst)
    finally:
        dst.close()
    for old in sorted(BACKUP_DIR.glob("anime-*.db"), reverse=True)[KEEP_BACKUPS:]:
        old.unlink(missing_ok=True)
    db.set_setting("last_backup", time.time())
    return path


def backup_due():
    return time.time() - float(db.get_setting("last_backup", 0) or 0) > 86400


def disk():
    u = shutil.disk_usage(db.DATA_DIR)
    return {"total": u.total, "used": u.used, "free": u.free}
