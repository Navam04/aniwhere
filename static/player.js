'use strict';
/* Aniwhere — video player with its own controls, so overlays (skip buttons, Up next, double-tap seek)
   work everywhere, including "fullscreen" on iPhone, where only the bare <video> could go fullscreen.
   Loaded before app.js; uses app.js helpers (api, toast, esc, store, clock, titleOf, ...) only at run time. */

const PI = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 4.5h4.2v15H6zm7.8 0H18v15h-4.2z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M6 5.5v13l9-6.5zM16.5 5.5h2v13h-2z"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4.5v15L8 15H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4.5v15L8 15H4zm12.3.1 1.4-1.4 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1 2.1 2.1-1.4 1.4-2.1-2.1-2.1 2.1-1.4-1.4 2.1-2.1z"/></svg>',
  cc: '<svg viewBox="0 0 24 24"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm7.6 5.2A3 3 0 0 0 6 12a3 3 0 0 0 4.6 1.8l-1-1.4A1.3 1.3 0 0 1 7.8 12a1.3 1.3 0 0 1 1.8-1.2zm7 0A3 3 0 0 0 13 12a3 3 0 0 0 4.6 1.8l-1-1.4a1.3 1.3 0 0 1-1.8-1.2 1.3 1.3 0 0 1 1.8-1.2z"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm-1.4-6.5h2.8l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.4 2.4-2 1.7c.1.6.1 1.3 0 1.9l2 1.7-1.4 2.4-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-2.8l-.5-2.6c-.6-.2-1.2-.5-1.7-.9l-2.5.9-1.4-2.4 2-1.7a6 6 0 0 1 0-1.9l-2-1.7 1.4-2.4 2.5.9c.5-.4 1.1-.7 1.7-.9z"/></svg>',
  pip: '<svg viewBox="0 0 24 24"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v10h16V7zm8 4h7v5h-7z"/></svg>',
  airplay: '<svg viewBox="0 0 24 24"><path d="M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-3l-1.6-2H20V6H4v9h2.6L5 17H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm9 9 6 7H6z"/></svg>',
  fs: '<svg viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/></svg>',
  fsExit: '<svg viewBox="0 0 24 24"><path d="M8 4h2v6H4V8h4zm6 0h2v4h4v2h-6zM4 14h6v6H8v-4H4zm10 0h6v2h-4v4h-2z"/></svg>',
  back10: '<svg viewBox="0 0 24 24"><path d="M12 5V1.5L7 6l5 4.5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg>',
  fwd10: '<svg viewBox="0 0 24 24"><path d="M12 5V1.5L17 6l-5 4.5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="m9.4 4.6 7.4 7.4-7.4 7.4L8 18l6-6-6-6z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15.4 4.6 8 12l7.4 7.4-1.4 1.4L5.2 12 14 3.2z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z"/></svg>',
};
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

// Subtitle look, per device (a phone and a TV want different sizes). Used by the player and Settings.
const SUB_SIZES = { s: ['Small', 0.8], m: ['Medium', 1], l: ['Large', 1.3], xl: ['Extra large', 1.65] };
const SUB_BGS = { none: ['None (outlined text)', 'transparent'], shade: ['Shaded', 'rgba(0,0,0,.55)'], solid: ['Solid black', 'rgba(0,0,0,.92)'] };
const SUB_POS = { bottom: ['Bottom', 'auto'], higher: ['Higher', -4] };
function subPrefs() {
  const p = store.get('subs', {}) || {};
  return { size: SUB_SIZES[p.size] ? p.size : 'm', bg: SUB_BGS[p.bg] ? p.bg : 'shade', pos: SUB_POS[p.pos] ? p.pos : 'bottom' };
}
function applySubStyle() {
  const p = subPrefs();
  let el = document.getElementById('cue-style');
  if (!el) { el = document.createElement('style'); el.id = 'cue-style'; document.head.appendChild(el); }
  el.textContent = `.player video::cue { font-size: calc(clamp(16px, 2.6vw, 34px) * ${SUB_SIZES[p.size][1]});
    background: ${SUB_BGS[p.bg][1]}; ${p.bg === 'none' ? 'text-shadow: 0 0 4px #000, 0 0 2px #000, 0 1px 2px #000;' : ''} }`;
}
function positionCues(video) {
  const line = SUB_POS[subPrefs().pos][1];
  for (const t of video?.textTracks || []) for (const c of t.cues || []) c.line = line;
}
const UPNEXT_SECONDS = 10;
const STILL_WATCHING_AFTER = 3; // episodes autoplayed in a row with no interaction

// Episodes started by autoplay since the viewer last touched anything. Any tap, click or key resets it.
let autoChain = 0;
['pointerdown', 'keydown', 'touchstart'].forEach(t => document.addEventListener(t, () => { autoChain = 0; }, { capture: true, passive: true }));

const isAppleDevice = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || navigator.vendor === 'Apple Computer, Inc.';

/**
 * Mount the player into `host`.
 *   data   — the /api/play response
 *   reload — async () => fresh /api/play response (new stream links), used once to recover from failures
 *   fail   — (message) => void, called when playback can't be recovered
 * Returns { destroy }.
 */
function mountPlayer(host, { data, id, ep, reload, fail }) {
  let d = data;
  const m = d.media;
  const touch = matchMedia('(hover: none), (pointer: coarse)').matches;
  const prefs = { ...d.prefs };
  const next = nextTarget();
  const epLabel = m.format === 'MOVIE' ? 'Movie' : `Episode ${ep}`;

  host.innerHTML = `<div class="player paused show ${touch ? 'touch' : 'mouse'}" tabindex="-1">
    <video playsinline webkit-playsinline preload="auto" x-webkit-airplay="allow"></video>
    <div class="p-surface"></div>
    <div class="p-ripple l"><span></span></div><div class="p-ripple r"><span></span></div>
    <div class="p-flash"></div>
    <div class="p-wait"><div class="spinner"></div></div>
    <div class="p-top"><button class="p-btn p-exit" aria-label="Exit fullscreen">${PI.back}</button>
      <div class="p-top-t"><strong>${esc(titleOf(m))}</strong><span>${esc(epLabel)}</span></div></div>
    <div class="p-center">
      <button class="p-btn p-jump" data-by="-10" aria-label="Back 10 seconds">${PI.back10}<i>10</i></button>
      <button class="p-btn p-big" aria-label="Play">${PI.play}</button>
      <button class="p-btn p-jump" data-by="10" aria-label="Forward 10 seconds">${PI.fwd10}<i>10</i></button>
    </div>
    <div class="p-side"><button class="p-skip" hidden></button><div class="p-notice" hidden></div><div class="p-upnext" hidden></div></div>
    <div class="p-bottom">
      <div class="p-seek" role="slider" aria-label="Seek" tabindex="-1">
        <div class="p-track"><i class="p-buf"></i><i class="p-prog"></i><span class="p-mark intro" hidden></span><span class="p-mark outro" hidden></span></div>
        <div class="p-knob"></div><div class="p-tip"></div></div>
      <div class="p-row">
        <button class="p-btn p-pp" aria-label="Play">${PI.play}</button>
        ${next ? `<button class="p-btn p-next" aria-label="Next">${PI.next}</button>` : ''}
        <div class="p-vol"><button class="p-btn p-mute" aria-label="Mute">${PI.vol}</button>
          <input type="range" class="p-volume" min="0" max="1" step="0.05" aria-label="Volume"></div>
        <div class="p-time"><span class="p-cur">0:00</span> / <span class="p-dur">0:00</span></div>
        <div class="p-grow"></div>
        ${d.subtitles ? `<button class="p-btn p-cc" aria-label="Subtitles">${PI.cc}</button>` : ''}
        <button class="p-btn p-gear" aria-label="Settings">${PI.gear}</button>
        <button class="p-btn p-air" aria-label="AirPlay" hidden>${PI.airplay}</button>
        <button class="p-btn p-pip" aria-label="Picture in picture" hidden>${PI.pip}</button>
        <button class="p-btn p-fs" aria-label="Fullscreen">${PI.fs}</button>
      </div>
    </div>
    <div class="p-menu" hidden></div>
    <div class="p-overlay" hidden></div>
  </div>`;

  const root = host.querySelector('.player');
  const v = root.querySelector('video');
  const q = s => root.querySelector(s);
  const ui = {
    surface: q('.p-surface'), big: q('.p-big'), pp: q('.p-pp'), seek: q('.p-seek'), prog: q('.p-prog'), buf: q('.p-buf'),
    knob: q('.p-knob'), tip: q('.p-tip'), cur: q('.p-cur'), dur: q('.p-dur'), mute: q('.p-mute'), volume: q('.p-volume'),
    cc: q('.p-cc'), gear: q('.p-gear'), air: q('.p-air'), pip: q('.p-pip'), fs: q('.p-fs'), menu: q('.p-menu'),
    skip: q('.p-skip'), notice: q('.p-notice'), upnext: q('.p-upnext'), overlay: q('.p-overlay'), flash: q('.p-flash'),
    markIntro: q('.p-mark.intro'), markOutro: q('.p-mark.outro'),
  };

  // everything registered here is undone by destroy()
  const offs = [];
  const on = (el, type, fn, opts) => { el.addEventListener(type, fn, opts); offs.push(() => el.removeEventListener(type, fn, opts)); };
  const timers = {};
  const later = (name, fn, ms) => { clearTimeout(timers[name]); timers[name] = setTimeout(fn, ms); };
  let dead = false;

  // ---------- source ----------
  const canHlsJs = !!(window.Hls && Hls.isSupported());
  let useNative = isAppleDevice() && !!v.canPlayType('application/vnd.apple.mpegurl');
  let hls = null, fatalCount = 0, retried = false;
  let speed = SPEEDS.includes(store.get('speed', 1)) ? store.get('speed', 1) : 1;

  function srcUrl() {
    const lock = store.get('quality', 'auto');
    return lock === 'auto' || !d.qualities?.length ? d.src : `${d.src}?q=${lock}`;
  }

  function attach(at) {
    if (hls) { hls.destroy(); hls = null; }
    if (useNative || !canHlsJs) {
      v.src = srcUrl();
      if (at) v.addEventListener('loadedmetadata', () => { v.currentTime = at; }, { once: true });
    } else {
      hls = new Hls({ startPosition: at || -1, maxBufferLength: 60 });
      hls.on(Hls.Events.ERROR, (_e, info) => { if (info.fatal) onFatal(info); });
      hls.on(Hls.Events.LEVEL_SWITCHED, () => { if (!ui.menu.hidden) renderMenu(menuPage); });
      hls.loadSource(srcUrl());
      hls.attachMedia(v);
    }
    v.defaultPlaybackRate = v.playbackRate = speed;
  }

  function onFatal(info) {
    fatalCount++;
    if (fatalCount === 1 && info.type === Hls.ErrorTypes.NETWORK_ERROR) { hls.startLoad(); return; }
    if (fatalCount === 1 && info.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
    recover();
  }

  on(v, 'error', () => {
    if (dead || hls || !v.getAttribute('src')) return; // hls.js reports its own errors
    if (useNative && canHlsJs) { useNative = false; attach(v.currentTime); v.play().catch(() => {}); return; }
    recover();
  });

  // One automatic retry with freshly resolved stream links, from the same spot; then hand over to `fail`.
  async function recover() {
    if (dead) return;
    if (retried) { fail('Playback failed again after a retry.'); return; }
    retried = true;
    const at = v.currentTime;
    flash('Reconnecting…');
    try {
      const fresh = await reload();
      if (dead) return;
      d = { ...d, src: fresh.src, subtitles: fresh.subtitles, qualities: fresh.qualities };
      fatalCount = 0;
      attach(at);
      v.play().catch(() => {});
    } catch (e) {
      if (!dead) fail(e.message);
    }
  }

  // subtitles: shown by default when playing subbed
  if (d.subtitles) {
    const tr = document.createElement('track');
    Object.assign(tr, { kind: 'subtitles', srclang: 'en', label: 'English', src: d.subtitles });
    v.appendChild(tr);
    tr.track.mode = d.mode === 'sub' ? 'showing' : 'hidden';
    tr.addEventListener('load', () => positionCues(v));
  }
  applySubStyle();
  const volume = store.get('volume', 1);
  v.volume = Math.min(1, Math.max(0, +volume || 1));
  v.muted = !!store.get('muted', false);

  attach(d.start || 0);
  v.play().catch(() => { /* autoplay blocked: needs a tap */ });

  // ---------- controls visibility ----------
  let overBar = false;
  function poke() {
    root.classList.add('show');
    later('hide', () => {
      if (!v.paused && ui.menu.hidden && ui.overlay.hidden && !overBar && !scrubbing) root.classList.remove('show');
    }, 3000);
  }
  function hideNow() { if (!v.paused) root.classList.remove('show'); }
  on(root, 'mousemove', poke);
  on(q('.p-bottom'), 'mouseenter', () => { overBar = true; });
  on(q('.p-bottom'), 'mouseleave', () => { overBar = false; poke(); });
  on(root, 'mouseleave', () => { if (!v.paused) later('hide', hideNow, 600); });

  // ---------- play state ----------
  function togglePlay() { v.paused || v.ended ? v.play().catch(() => {}) : v.pause(); }
  function paintPlay() {
    const paused = v.paused;
    root.classList.toggle('paused', paused);
    [ui.big, ui.pp].forEach(b => { b.innerHTML = paused ? PI.play : PI.pause; b.setAttribute('aria-label', paused ? 'Play' : 'Pause'); });
    if (paused) root.classList.add('show'); else poke();
  }
  on(v, 'play', paintPlay);
  on(v, 'pause', paintPlay);
  on(v, 'playing', () => { root.classList.remove('waiting'); fatalCount = 0; });
  on(v, 'waiting', () => root.classList.add('waiting'));
  on(v, 'canplay', () => root.classList.remove('waiting'));
  on(ui.big, 'click', togglePlay);
  on(ui.pp, 'click', togglePlay);
  $$('.p-jump', root).forEach(b => on(b, 'click', () => { seekTo(v.currentTime + +b.dataset.by); flash(`${+b.dataset.by > 0 ? '+' : '−'}10s`); poke(); }));

  function seekTo(t) {
    if (!Number.isFinite(v.duration)) return;
    v.currentTime = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.5));
  }

  // ---------- seek bar ----------
  let scrubbing = false, scrubPct = 0;
  const pctAt = e => { const r = ui.seek.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
  function paintTime() {
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    const pct = scrubbing ? scrubPct : dur ? v.currentTime / dur : 0;
    ui.prog.style.width = `${pct * 100}%`;
    ui.knob.style.left = `${pct * 100}%`;
    ui.cur.textContent = clock(scrubbing ? scrubPct * dur : v.currentTime);
    ui.dur.textContent = clock(dur);
    let end = 0;
    for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime + 1) end = Math.max(end, v.buffered.end(i));
    ui.buf.style.width = dur ? `${Math.min(100, end / dur * 100)}%` : '0';
  }
  on(ui.seek, 'pointerdown', e => {
    if (!v.duration) return;
    scrubbing = true; scrubPct = pctAt(e);
    ui.seek.setPointerCapture(e.pointerId);
    root.classList.add('scrubbing');
    paintTime(); poke(); e.preventDefault();
  });
  on(ui.seek, 'pointermove', e => {
    const p = pctAt(e);
    if (Number.isFinite(v.duration)) { ui.tip.textContent = clock(p * v.duration); ui.tip.style.left = `${p * 100}%`; }
    if (scrubbing) { scrubPct = p; paintTime(); poke(); }
  });
  const endScrub = commit => {
    if (!scrubbing) return;
    scrubbing = false; root.classList.remove('scrubbing');
    if (commit) seekTo(scrubPct * v.duration);
    paintTime();
  };
  on(ui.seek, 'pointerup', () => endScrub(true));
  on(ui.seek, 'pointercancel', () => endScrub(false));
  on(v, 'timeupdate', paintTime);
  on(v, 'progress', paintTime);
  on(v, 'durationchange', paintTime);

  // ---------- volume ----------
  function paintVolume() {
    ui.mute.innerHTML = v.muted || v.volume === 0 ? PI.mute : PI.vol;
    ui.volume.value = v.muted ? 0 : v.volume;
    ui.volume.style.setProperty('--v', `${(v.muted ? 0 : v.volume) * 100}%`);
  }
  function setVolume(x) {
    v.volume = Math.min(1, Math.max(0, x));
    v.muted = v.volume === 0;
  }
  on(ui.mute, 'click', () => { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 0.5; });
  on(ui.volume, 'input', () => setVolume(+ui.volume.value));
  on(v, 'volumechange', () => { paintVolume(); store.set('volume', v.volume); store.set('muted', v.muted); });
  paintVolume();

  // ---------- subtitles ----------
  const track = () => v.textTracks && v.textTracks[0];
  function paintCC() { if (ui.cc) ui.cc.classList.toggle('on', track()?.mode === 'showing'); }
  function toggleCC() {
    const t = track();
    if (!t) return;
    t.mode = t.mode === 'showing' ? 'hidden' : 'showing';
    paintCC();
    flash(t.mode === 'showing' ? 'Subtitles on' : 'Subtitles off');
  }
  if (ui.cc) { on(ui.cc, 'click', toggleCC); paintCC(); }

  // ---------- fullscreen ----------
  const canRealFS = !!((document.fullscreenEnabled && root.requestFullscreen) || (document.webkitFullscreenEnabled && root.webkitRequestFullscreen));
  const realFS = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const isFS = () => realFS() || root.classList.contains('pseudo-fs');
  async function enterFS() {
    if (canRealFS) {
      try {
        await (root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen());
        screen.orientation?.lock?.('landscape')?.catch?.(() => {});
        return;
      } catch { /* fall through to the in-page version */ }
    }
    root.classList.add('pseudo-fs');
    document.body.classList.add('pseudo-fs');
    paintFS();
  }
  function exitFS() {
    if (root.classList.contains('pseudo-fs')) {
      root.classList.remove('pseudo-fs');
      document.body.classList.remove('pseudo-fs');
    } else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
    paintFS();
  }
  const toggleFS = () => (isFS() ? exitFS() : enterFS());
  function paintFS() {
    const fs = isFS();
    root.classList.toggle('is-fs', fs);
    ui.fs.innerHTML = fs ? PI.fsExit : PI.fs;
    ui.fs.setAttribute('aria-label', fs ? 'Exit fullscreen' : 'Fullscreen');
  }
  on(ui.fs, 'click', toggleFS);
  on(q('.p-exit'), 'click', exitFS);
  on(document, 'fullscreenchange', paintFS);
  on(document, 'webkitfullscreenchange', paintFS);

  // ---------- picture in picture & AirPlay ----------
  const pipStd = document.pictureInPictureEnabled && v.requestPictureInPicture;
  const pipWebkit = typeof v.webkitSupportsPresentationMode === 'function' && v.webkitSupportsPresentationMode('picture-in-picture');
  if (pipStd || pipWebkit) {
    ui.pip.hidden = false;
    on(ui.pip, 'click', () => {
      if (pipStd) (document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture()).catch(() => {});
      else v.webkitSetPresentationMode(v.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
    });
  }
  if (window.WebKitPlaybackTargetAvailabilityEvent) {
    on(v, 'webkitplaybacktargetavailabilitychanged', e => { ui.air.hidden = e.availability !== 'available'; });
    on(ui.air, 'click', () => v.webkitShowPlaybackTargetPicker());
  }

  // ---------- surface: mouse ----------
  let lastTouchEnd = 0;
  on(ui.surface, 'click', () => {
    if (Date.now() - lastTouchEnd < 700) return;
    later('click', () => { togglePlay(); flash(v.paused ? PI.pause : PI.play, true); }, 220);
  });
  on(ui.surface, 'dblclick', () => { clearTimeout(timers.click); if (Date.now() - lastTouchEnd > 700) toggleFS(); });

  // ---------- surface: touch (tap = controls, double-tap sides = seek, swipe down = exit fullscreen) ----------
  let touchStart = null, lastTap = { t: 0, side: null }, streak = { side: null, total: 0, until: 0 };
  on(ui.surface, 'touchstart', e => {
    if (e.touches.length !== 1) { touchStart = null; return; }
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
  }, { passive: true });
  on(ui.surface, 'touchend', e => {
    lastTouchEnd = Date.now();
    const start = touchStart;
    touchStart = null;
    if (!start || e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0], dx = t.clientX - start.x, dy = t.clientY - start.y;
    if (isFS() && dy > 80 && Math.abs(dx) < 80) { e.preventDefault(); exitFS(); return; }
    if (Math.abs(dx) > 14 || Math.abs(dy) > 14 || Date.now() - start.time > 450) return;
    e.preventDefault(); // no synthetic click, no double-tap zoom
    const r = ui.surface.getBoundingClientRect();
    const rel = (t.clientX - r.left) / r.width;
    const side = rel < 0.38 ? 'l' : rel > 0.62 ? 'r' : null;
    const now = Date.now();
    if (side && streak.side === side && now < streak.until) { tapSeek(side, now); return; }
    if (side && lastTap.side === side && now - lastTap.t < 300) {
      clearTimeout(timers.tap);
      lastTap = { t: 0, side: null };
      streak = { side, total: 0, until: 0 };
      tapSeek(side, now);
      return;
    }
    lastTap = { t: now, side };
    const shown = root.classList.contains('show');
    later('tap', () => (shown && !v.paused ? hideNow() : poke()), side ? 300 : 0);
  });
  function tapSeek(side, now) {
    const by = side === 'l' ? -10 : 10;
    streak.total += by;
    streak.until = now + 800;
    seekTo(v.currentTime + by);
    const rip = q(`.p-ripple.${side}`);
    rip.querySelector('span').textContent = `${side === 'l' ? '«' : '»'} ${Math.abs(streak.total)}s`;
    rip.classList.remove('go'); void rip.offsetWidth; rip.classList.add('go');
    later(`rip${side}`, () => rip.classList.remove('go'), 800);
  }

  // ---------- flash (center feedback for keys / taps) ----------
  function flash(content, isIcon) {
    ui.flash.innerHTML = isIcon ? content : `<span>${esc(content)}</span>`;
    ui.flash.classList.remove('go'); void ui.flash.offsetWidth; ui.flash.classList.add('go');
  }

  // ---------- keyboard ----------
  on(document, 'keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.body.classList.contains('tv')) {
      poke();
      if (e.key === 'Enter' && (document.activeElement === document.body || document.activeElement === root)) {
        e.preventDefault(); togglePlay(); return;
      }
    }
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) && e.target !== ui.volume) return;
    const k = e.key;
    if (k === 'Escape') {
      if (!ui.overlay.hidden && ui.overlay.dataset.kind === 'help') { closeOverlay(); return; }
      if (!ui.menu.hidden) { closeMenu(); return; }
      if (root.classList.contains('pseudo-fs')) exitFS();
      return;
    }
    if (!ui.overlay.hidden && ui.overlay.dataset.kind === 'help') { closeOverlay(); e.preventDefault(); return; }
    const handled = () => { e.preventDefault(); poke(); };
    if (k === ' ' || k === 'k' || k === 'K') { if (tag === 'button' && k === ' ') return; togglePlay(); flash(v.paused ? PI.pause : PI.play, true); handled(); }
    else if (k === 'ArrowLeft' || k === 'j' || k === 'J') { seekTo(v.currentTime - 10); flash('−10s'); handled(); }
    else if (k === 'ArrowRight' || k === 'l' || k === 'L') { seekTo(v.currentTime + 10); flash('+10s'); handled(); }
    else if (k === 'ArrowUp') { setVolume(v.volume + 0.1); flash(`Volume ${Math.round(v.volume * 100)}%`); handled(); }
    else if (k === 'ArrowDown') { setVolume(v.volume - 0.1); flash(`Volume ${Math.round(v.volume * 100)}%`); handled(); }
    else if (k === 'f' || k === 'F') { toggleFS(); handled(); }
    else if (k === 'm' || k === 'M') { v.muted = !v.muted; flash(v.muted ? 'Muted' : 'Sound on'); handled(); }
    else if (k === 'c' || k === 'C') { toggleCC(); handled(); }
    else if (/^[0-9]$/.test(k) && Number.isFinite(v.duration)) { seekTo(v.duration * +k / 10); flash(`${+k * 10}%`); handled(); }
    else if (k === '?') { showHelp(); handled(); }
  });

  function showHelp() {
    const rows = [['Space / K', 'Play or pause'], ['← / J', 'Back 10 seconds'], ['→ / L', 'Forward 10 seconds'],
      ['↑ / ↓', 'Volume up / down'], ['M', 'Mute'], ['F', 'Fullscreen'], ['C', 'Subtitles on / off'],
      ['0 – 9', 'Jump to 0% – 90%'], ['?', 'Show this help']];
    openOverlay('help', `<div class="p-card"><h3>Keyboard shortcuts</h3>
      <dl class="keys">${rows.map(([key, what]) => `<dt><kbd>${esc(key)}</kbd></dt><dd>${esc(what)}</dd>`).join('')}</dl>
      <button class="btn small p-close">Close</button></div>`);
    on(q('.p-close'), 'click', closeOverlay);
  }

  // ---------- overlays (help, still watching) ----------
  function openOverlay(kind, html) {
    ui.overlay.dataset.kind = kind;
    ui.overlay.innerHTML = html;
    ui.overlay.hidden = false;
    root.classList.add('show');
  }
  function closeOverlay() { ui.overlay.hidden = true; ui.overlay.innerHTML = ''; poke(); }
  on(ui.overlay, 'click', e => { if (e.target === ui.overlay && ui.overlay.dataset.kind === 'help') closeOverlay(); });

  // ---------- settings menu ----------
  let menuPage = 'main';
  const qualityLabel = () => {
    const lock = store.get('quality', 'auto');
    if (lock !== 'auto' && d.qualities?.length) return `${d.qualities.find(x => x <= +lock) || d.qualities[d.qualities.length - 1]}p`;
    const lvl = hls && hls.levels && hls.levels[hls.currentLevel];
    return lvl && lvl.height ? `Auto (${lvl.height}p)` : 'Auto';
  };
  const speedLabel = s => (s === 1 ? 'Normal' : `${s}x`);
  function renderMenu(page) {
    menuPage = page;
    const sw = (key, label, sub) => `<button class="pm-row" data-toggle="${key}" role="switch" aria-checked="${prefs[key]}">
      <span>${label}${sub ? `<small>${sub}</small>` : ''}</span><i class="sw ${prefs[key] ? 'on' : ''}"></i></button>`;
    let html;
    if (page === 'quality') {
      const lock = String(store.get('quality', 'auto'));
      html = `<button class="pm-head" data-page="main">${PI.back}Quality</button>
        ${['auto', ...(d.qualities || []).map(String)].map(x => `<button class="pm-row" data-quality="${x}">
          <span>${x === 'auto' ? 'Auto' : `${x}p`}</span>${lock === x ? PI.check : ''}</button>`).join('')}
        <p class="pm-note">Saved on this device.</p>`;
    } else if (page === 'subs') {
      const p = subPrefs();
      const group = (title, attr, opts, cur) => `<p class="pm-note pm-group">${title}</p>${Object.entries(opts).map(([k, [label]]) =>
        `<button class="pm-row" data-${attr}="${k}"><span>${label}</span>${cur === k ? PI.check : ''}</button>`).join('')}`;
      html = `<button class="pm-head" data-page="main">${PI.back}Subtitles</button>
        ${group('Size', 'subsize', SUB_SIZES, p.size)}${group('Background', 'subbg', SUB_BGS, p.bg)}${group('Position', 'subpos', SUB_POS, p.pos)}
        <p class="pm-note">Saved on this device.</p>`;
    } else if (page === 'speed') {
      html = `<button class="pm-head" data-page="main">${PI.back}Playback speed</button>
        ${SPEEDS.map(s => `<button class="pm-row" data-speed="${s}"><span>${speedLabel(s)}</span>${speed === s ? PI.check : ''}</button>`).join('')}
        <p class="pm-note">Saved on this device.</p>`;
    } else {
      html = `${d.qualities?.length ? `<button class="pm-row" data-page="quality"><span>Quality</span><em>${esc(qualityLabel())}</em>${PI.chev}</button>` : ''}
        <button class="pm-row" data-page="speed"><span>Speed</span><em>${speedLabel(speed)}</em>${PI.chev}</button>
        ${d.subtitles ? `<button class="pm-row" data-page="subs"><span>Subtitles</span><em>${SUB_SIZES[subPrefs().size][0]}</em>${PI.chev}</button>` : ''}
        ${sw('autoplay', 'Autoplay next episode')}
        ${sw('autoskip', 'Auto-skip intros & credits')}
        ${sw('skip_filler', 'Skip filler episodes')}
        ${touch ? '' : '<button class="pm-row" data-help="1"><span>Keyboard shortcuts</span><em>?</em></button>'}`;
    }
    ui.menu.innerHTML = html;
  }
  function openMenu() { renderMenu('main'); ui.menu.hidden = false; root.classList.add('show', 'menu-open'); }
  function closeMenu() { ui.menu.hidden = true; root.classList.remove('menu-open'); poke(); }
  on(ui.gear, 'click', () => (ui.menu.hidden ? openMenu() : closeMenu()));
  on(document, 'pointerdown', e => {
    if (!ui.menu.hidden && !ui.menu.contains(e.target) && !ui.gear.contains(e.target)) closeMenu();
  }, true);
  on(ui.menu, 'click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.page) renderMenu(b.dataset.page);
    else if (b.dataset.help) { closeMenu(); showHelp(); }
    else if (b.dataset.subsize || b.dataset.subbg || b.dataset.subpos) {
      const p = subPrefs();
      if (b.dataset.subsize) p.size = b.dataset.subsize;
      if (b.dataset.subbg) p.bg = b.dataset.subbg;
      if (b.dataset.subpos) p.pos = b.dataset.subpos;
      store.set('subs', p);
      applySubStyle();
      positionCues(v);
      renderMenu('subs');
    }
    else if (b.dataset.speed) {
      speed = +b.dataset.speed;
      v.defaultPlaybackRate = v.playbackRate = speed;
      store.set('speed', speed);
      renderMenu('main');
    } else if (b.dataset.quality) {
      const before = String(store.get('quality', 'auto'));
      store.set('quality', b.dataset.quality === 'auto' ? 'auto' : +b.dataset.quality);
      if (before !== b.dataset.quality) {
        const at = v.currentTime, wasPlaying = !v.paused;
        attach(at);
        if (wasPlaying) v.play().catch(() => {});
      }
      renderMenu('main');
    } else if (b.dataset.toggle) {
      const key = b.dataset.toggle;
      prefs[key] = !prefs[key];
      renderMenu(menuPage);
      if (key === 'autoplay' && !prefs.autoplay) hideUpNext(true);
      try { await api('/api/settings', { method: 'PUT', body: { [key]: prefs[key] } }); }
      catch (err) { toast(err.message); }
    }
  });

  // ---------- intro / credits ----------
  let skips = { intro: null, outro: null };
  const skipState = { intro: { auto: false, undone: false }, outro: { auto: false, undone: false } };
  on(v, 'loadedmetadata', async () => {
    if (skips.intro || skips.outro || !Number.isFinite(v.duration)) return;
    try {
      skips = await api(`/api/skip/${id}/${encodeURIComponent(ep)}?length=${Math.round(v.duration)}`);
    } catch { return; }
    if (dead) return;
    for (const [kind, el] of [['intro', ui.markIntro], ['outro', ui.markOutro]]) {
      const s = skips[kind];
      if (!s) continue;
      el.hidden = false;
      el.style.left = `${s[0] / v.duration * 100}%`;
      el.style.width = `${(s[1] - s[0]) / v.duration * 100}%`;
    }
  });
  const inRange = (r, t) => r && t >= r[0] && t < r[1] - 1;

  function updateSkip() {
    const t = v.currentTime;
    const kind = inRange(skips.intro, t) ? 'intro' : inRange(skips.outro, t) ? 'outro' : null;
    // during credits the Up next card replaces the skip button
    if (!kind || (kind === 'outro' && !ui.upnext.hidden)) { ui.skip.hidden = true; return; }
    const st = skipState[kind];
    if (prefs.autoskip && !st.auto && !st.undone && !(kind === 'outro' && upnextWanted())) {
      st.auto = true;
      const from = t;
      seekTo(skips[kind][1]);
      notice(`Skipped ${kind === 'intro' ? 'intro' : 'credits'}`, () => { st.undone = true; seekTo(from); });
      return;
    }
    ui.skip.textContent = kind === 'intro' ? 'Skip intro' : 'Skip credits';
    ui.skip.dataset.kind = kind;
    ui.skip.hidden = false;
  }
  on(ui.skip, 'click', () => {
    const r = skips[ui.skip.dataset.kind];
    if (r) seekTo(r[1]);
    ui.skip.hidden = true;
  });
  function notice(text, undo) {
    ui.notice.innerHTML = `<span>${esc(text)}</span>${undo ? '<button class="linkish">Undo</button>' : ''}`;
    ui.notice.hidden = false;
    if (undo) ui.notice.querySelector('button').onclick = () => { undo(); ui.notice.hidden = true; };
    later('notice', () => { ui.notice.hidden = true; }, 5000);
  }

  // ---------- up next ----------
  function nextTarget() {
    if (d.next) return { href: `#/watch/${id}/${encodeURIComponent(d.next)}`, label: `Episode ${d.next}`, title: '', img: bannerOf(m), ep: d.next,
      skipped: d.skipped_filler || 0 };
    if (d.next_season) {
      const s = d.next_season;
      return { href: `#/watch/${s.id}/1`, label: 'Next season', title: titleOf(s), img: coverOf(s), season: true };
    }
    return null;
  }
  // thumbnail + title for the next episode
  if (next && next.ep && num(next.ep) !== null) {
    api(`/api/media/${id}/episode-details?start=${num(next.ep)}&end=${num(next.ep)}`).then(r => {
      const info = r[next.ep] || Object.values(r)[0];
      if (!info || dead) return;
      if (info.title && !/^episode\s+\d+$/i.test(info.title)) next.title = info.title;
      if (info.thumbnail) next.img = info.thumbnail;
      if (!ui.upnext.hidden) paintUpNext();
    }).catch(() => {});
  }

  let upnextDismissed = false, countdown = null;
  const upnextStart = () => (skips.outro ? skips.outro[0] : Number.isFinite(v.duration) && v.duration > 60 ? v.duration - 20 : Infinity);
  const upnextWanted = () => !!next && prefs.autoplay && !upnextDismissed;

  function paintUpNext() {
    const counting = countdown && countdown.left > 0;
    ui.upnext.innerHTML = `<div class="un-img"><img src="${esc(next.img)}" alt=""></div>
      <div class="un-body"><div class="un-label">${next.season ? 'Next season' : 'Up next'}${next.skipped ? ` · skipping ${next.skipped} filler` : ''}</div>
        <div class="un-title">${esc(next.season ? next.title : next.title ? `${next.label} · ${next.title}` : next.label)}</div>
        <div class="un-actions">
          <button class="btn small primary un-play" style="--p:${counting ? (1 - countdown.left / UPNEXT_SECONDS) * 100 : 100}%">
            ${PI.play}${counting ? `Next in ${Math.ceil(countdown.left)}` : 'Play now'}</button>
          <button class="btn small ghost un-cancel">${counting ? 'Cancel' : 'Close'}</button></div></div>`;
    ui.upnext.querySelector('.un-play').onclick = () => goNext(false);
    ui.upnext.querySelector('.un-cancel').onclick = () => hideUpNext(true);
  }
  function showUpNext(withCountdown) {
    if (!next || !ui.upnext.hidden) return;
    countdown = withCountdown ? { left: UPNEXT_SECONDS } : null;
    ui.skip.hidden = true;
    ui.upnext.hidden = false;
    paintUpNext();
    if (countdown) tick();
  }
  function tick() {
    clearTimeout(timers.count);
    if (!countdown || dead) return;
    timers.count = setTimeout(() => {
      if (!countdown) return;
      if (!v.paused || v.ended) countdown.left -= 0.25; // pausing the video pauses the countdown
      if (countdown.left <= 0) { countdown = null; goNext(true); return; }
      if (Math.abs(countdown.left - Math.round(countdown.left)) < 0.01) paintUpNext();
      else ui.upnext.querySelector('.un-play')?.style.setProperty('--p', `${(1 - countdown.left / UPNEXT_SECONDS) * 100}%`);
      tick();
    }, 250);
  }
  function hideUpNext(dismiss) {
    if (dismiss) upnextDismissed = true;
    countdown = null;
    clearTimeout(timers.count);
    ui.upnext.hidden = true;
  }
  function goNext(automatic) {
    hideUpNext(false);
    if (automatic) {
      if (autoChain >= STILL_WATCHING_AFTER) { stillWatching(); return; }
      autoChain++;
    } else autoChain = 0;
    sendProgress(v.currentTime >= upnextStart());
    location.hash = next.href;
  }
  function stillWatching() {
    v.pause();
    openOverlay('still', `<div class="p-card"><h3>Still watching?</h3>
      <p class="muted">${esc(titleOf(m))} · ${esc(next.season ? next.title : next.label)} is next.</p>
      <div class="actions"><button class="btn primary p-cont">${PI.play}Continue watching</button>
        <a class="btn ghost" href="#/show/${id}">Back to show</a></div></div>`);
    q('.p-cont').onclick = () => { autoChain = 0; sendProgress(true); location.hash = next.href; };
  }

  on(v, 'timeupdate', () => {
    updateSkip();
    if (!next) return;
    const t = v.currentTime, start = upnextStart();
    if (t < start - 1 && !ui.upnext.hidden && countdown) { hideUpNext(false); } // seeked back out of the credits
    if (t >= start && upnextWanted() && ui.upnext.hidden) showUpNext(true);
  });
  on(v, 'seeking', () => { if (v.currentTime < upnextStart() - 1) upnextDismissed = false; });
  on(v, 'ended', () => {
    sendProgress(true);
    if (!next) return;
    if (upnextWanted()) showUpNext(true);
    else if (ui.upnext.hidden) { upnextDismissed = false; countdown = null; ui.upnext.hidden = false; paintUpNext(); }
  });
  if (next) on(q('.p-next'), 'click', () => goNext(false));

  // ---------- progress ----------
  let lastSent = 0, finished = false;
  function sendProgress(ended, beacon) {
    if (!v.duration || !Number.isFinite(v.duration) || v.currentTime < 1) return;
    const body = { anilist_id: id, episode: ep, position: v.currentTime, duration: v.duration, ended: !!ended };
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/progress', new Blob([JSON.stringify(body)], { type: 'application/json' }));
      return;
    }
    api('/api/progress', { method: 'POST', body }).then(r => {
      if (r.completed && !finished) { finished = true; toast(`${epLabel} marked as watched`); }
    }).catch(() => {});
  }
  on(v, 'timeupdate', () => { if (!v.paused && Date.now() - lastSent > 10000) { lastSent = Date.now(); sendProgress(false); } });
  on(v, 'pause', () => { if (!v.ended) sendProgress(false); });
  on(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') sendProgress(false, true); });
  on(window, 'pagehide', () => sendProgress(false, true));

  // ---------- lock screen / media keys ----------
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: epLabel, artist: titleOf(m), artwork: [{ src: coverOf(m), sizes: '460x650' }] });
    const handlers = {
      play: () => v.play(), pause: () => v.pause(),
      seekbackward: () => seekTo(v.currentTime - 10), seekforward: () => seekTo(v.currentTime + 10),
      nexttrack: next ? () => goNext(false) : null,
      previoustrack: d.prev ? () => { location.hash = `#/watch/${id}/${encodeURIComponent(d.prev)}`; } : null,
    };
    for (const [k, fn] of Object.entries(handlers)) { try { navigator.mediaSession.setActionHandler(k, fn); } catch { /* unsupported */ } }
  }

  paintPlay();
  paintFS();
  paintTime();
  poke();

  return {
    destroy() {
      dead = true;
      sendProgress(false, true);
      Object.values(timers).forEach(clearTimeout);
      offs.forEach(f => f());
      if (root.classList.contains('pseudo-fs')) document.body.classList.remove('pseudo-fs');
      if (realFS()) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
      if (hls) hls.destroy();
      v.pause(); v.removeAttribute('src'); v.load();
      if ('mediaSession' in navigator) {
        ['nexttrack', 'previoustrack', 'seekbackward', 'seekforward'].forEach(k => { try { navigator.mediaSession.setActionHandler(k, null); } catch { /* ignore */ } });
      }
    },
  };
}
