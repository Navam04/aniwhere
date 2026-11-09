"""HLS proxy. The browser only talks to this server; the server fetches playlists and
segments from the stream host (adding the Referer it requires) and rewrites playlist URLs."""
import base64
import hashlib
import hmac
import re
import secrets
import time
from urllib.parse import urljoin, urlsplit

import httpx
from fastapi import HTTPException
from fastapi.responses import Response, StreamingResponse
from starlette.background import BackgroundTask

from . import db

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
client = httpx.AsyncClient(timeout=httpx.Timeout(30, connect=10), follow_redirects=True,
                           headers={"User-Agent": UA}, limits=httpx.Limits(max_connections=40))
M3U8 = "application/vnd.apple.mpegurl"
SESSION_TTL = 8 * 3600
_sessions = {}

BANDWIDTH = {"1080": (5_000_000, "1920x1080"), "720": (2_800_000, "1280x720"),
             "480": (1_400_000, "854x480"), "360": (800_000, "640x360")}


def _secret():
    s = db.get_setting("proxy_secret")
    if not s:
        s = secrets.token_hex(32)
        db.set_setting("proxy_secret", s)
    return s.encode()


def new_session(res):
    now = time.time()
    for k in [k for k, v in _sessions.items() if now - v["created"] > SESSION_TTL]:
        del _sessions[k]
    tok = secrets.token_urlsafe(9)
    _sessions[tok] = {**res, "created": now}
    return tok


def _session(tok):
    s = _sessions.get(tok)
    if not s:
        raise HTTPException(410, "Playback session expired, reload the episode")
    return s


def _sign(tok, url):
    return hmac.new(_secret(), f"{tok}|{url}".encode(), hashlib.sha256).hexdigest()[:24]


def _proxied(tok, url):
    u = base64.urlsafe_b64encode(url.encode()).decode().rstrip("=")
    kind = "p" if ".m3u8" in urlsplit(url).path else "s"
    return f"/hls/{tok}/{kind}?u={u}&sig={_sign(tok, url)}"


def _unwrap(tok, u, sig):
    url = base64.urlsafe_b64decode(u + "=" * (-len(u) % 4)).decode()
    if not hmac.compare_digest(sig, _sign(tok, url)):
        raise HTTPException(403, "Bad signature")
    return url


def quality_of(label):
    q = re.sub(r"\D", "", label or "")
    return int(q) if q else None


def qualities(res):
    """Distinct numeric qualities (e.g. [1080, 720]) a resolved stream offers, best first."""
    return sorted({q for q in (quality_of(label) for label, _url in res["links"]) if q}, reverse=True)


def master(tok, q=None):
    """Master playlist. With q (e.g. 720) only that quality is offered, or the closest one below it,
    so a locked quality also works with Safari's own HLS player."""
    s = _session(tok)
    links = s["links"]
    if q:
        have = qualities(s)
        pick = next((x for x in have if x <= q), have[-1] if have else None)
        if pick:
            links = [(label, url) for label, url in links if quality_of(label) == pick][:1]
    lines = ["#EXTM3U", "#EXT-X-VERSION:3"]
    audio_attr = ""
    if s.get("audio"):
        lines.append(f'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Audio",DEFAULT=YES,AUTOSELECT=YES,'
                     f'URI="{_proxied(tok, s["audio"])}"')
        audio_attr = ',AUDIO="aud"'
    for quality, url in links:
        bw, res = BANDWIDTH.get(str(quality_of(quality) or ""), (3_000_000, None))
        res_attr = f",RESOLUTION={res}" if res else ""
        lines.append(f"#EXT-X-STREAM-INF:BANDWIDTH={bw}{res_attr}{audio_attr}")
        lines.append(_proxied(tok, url))
    return Response("\n".join(lines) + "\n", media_type=M3U8, headers={"Cache-Control": "no-store"})


def _rewrite(tok, text, base):
    out = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("#"):
            s = re.sub(r'URI="([^"]+)"', lambda m: f'URI="{_proxied(tok, urljoin(base, m.group(1)))}"', s)
            out.append(s)
        else:
            out.append(_proxied(tok, urljoin(base, s)))
    return "\n".join(out) + "\n"


async def playlist(tok, u, sig):
    s = _session(tok)
    url = _unwrap(tok, u, sig)
    try:
        r = await client.get(url, headers={"Referer": s.get("refr", "")})
    except httpx.HTTPError as ex:
        raise HTTPException(502, f"Stream host unreachable: {ex.__class__.__name__}")
    if r.status_code != 200:
        raise HTTPException(502, f"Stream host returned HTTP {r.status_code}")
    return Response(_rewrite(tok, r.text, str(r.url)), media_type=M3U8, headers={"Cache-Control": "no-store"})


async def _strip_disguise(chunks):
    """Some hosts prefix MPEG-TS segments with fake image bytes. Skip to the first TS sync byte."""
    head = b""
    async for chunk in chunks:
        if head is not None:
            head += chunk
            if len(head) < 1024:
                continue
            if head[0] != 0x47:
                for i in range(min(len(head) - 377, 8192)):
                    if head[i] == 0x47 and head[i + 188] == 0x47 and head[i + 376] == 0x47:
                        head = head[i:]
                        break
            yield head
            head = None
        else:
            yield chunk
    if head:
        yield head


async def segment(tok, u, sig, range_header=None):
    s = _session(tok)
    url = _unwrap(tok, u, sig)
    headers = {"Referer": s.get("refr", "")}
    if range_header:
        headers["Range"] = range_header
    try:
        r = await client.send(client.build_request("GET", url, headers=headers), stream=True)
    except httpx.HTTPError as ex:
        raise HTTPException(502, f"Stream host unreachable: {ex.__class__.__name__}")
    if r.status_code >= 400:
        await r.aclose()
        raise HTTPException(502, f"Stream host returned HTTP {r.status_code}")
    path = urlsplit(url).path.lower()
    ctype = r.headers.get("content-type", "application/octet-stream")
    out_headers = {"Cache-Control": "private, max-age=3600"}
    if ".ts" in path or ctype.startswith("image/"):
        body = _strip_disguise(r.aiter_bytes())
        ctype = "video/mp2t"
    else:
        body = r.aiter_bytes()
        if "content-length" in r.headers and "content-encoding" not in r.headers:
            out_headers["Content-Length"] = r.headers["content-length"]
        for h in ("content-range", "accept-ranges"):
            if h in r.headers:
                out_headers[h.title()] = r.headers[h]
    return StreamingResponse(body, status_code=r.status_code, media_type=ctype, headers=out_headers,
                             background=BackgroundTask(r.aclose))


async def subtitles(tok):
    s = _session(tok)
    if not s.get("sub"):
        raise HTTPException(404, "No subtitles")
    try:
        r = await client.get(s["sub"], headers={"Referer": s.get("refr", "")})
    except httpx.HTTPError:
        raise HTTPException(502, "Subtitle host unreachable")
    if r.status_code != 200:
        raise HTTPException(502, f"Subtitle host returned HTTP {r.status_code}")
    return Response(r.content, media_type="text/vtt; charset=utf-8", headers={"Cache-Control": "private, max-age=3600"})
