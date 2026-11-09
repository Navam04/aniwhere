'use strict';
/* Aniwhere — single-page frontend. Hash routes:
   #/  #/search?q=&genres=&formats=&status=&sort=  #/show/:id[?pick=1]  #/watch/:id/:ep
   #/lists/:status (or HISTORY)  #/settings
   The video player lives in player.js. */

const $view = document.getElementById('view');
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const STATUS = { CURRENT: 'Watching', REPEATING: 'Rewatching', PLANNING: 'Plan to watch',
  PAUSED: 'On hold', COMPLETED: 'Completed', DROPPED: 'Dropped' };
const FORMAT = { TV: 'TV', TV_SHORT: 'TV short', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
const RELATION = { PREQUEL: 'Prequel', SEQUEL: 'Sequel', SIDE_STORY: 'Side story', SPIN_OFF: 'Spin-off',
  ALTERNATIVE: 'Alternative', PARENT: 'Parent', SUMMARY: 'Summary', OTHER: 'Related', CHARACTER: 'Shared characters' };
const DEFAULT_ACCENT = '#7c8cff';

const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15.4 4.6 8 12l7.4 7.4-1.4 1.4L5.2 12 14 3.2z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M6 5.5v13l9-6.5zM16.5 5.5h2v13h-2z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M18 5.5v13l-9-6.5zM5.5 5.5h2v13h-2z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><path d="M10.5 3a7.5 7.5 0 0 1 5.96 12.06l4.24 4.24-1.4 1.4-4.24-4.24A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"/></svg>',
  info: '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1 8v7h2v-7zm0-3v2h2V7z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><path d="M5 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 3v4.6l3.5 2.1-1 1.7-4.5-2.7V7z"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"/></svg>',
  rows: '<svg viewBox="0 0 24 24"><path d="M4 5h16v3H4zm0 5.5h16v3H4zM4 16h16v3H4z"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7zm0 3.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/></svg>',
  hide: '<svg viewBox="0 0 24 24"><path d="m3.3 2 18.7 18.7-1.4 1.4-3.5-3.5A10.7 10.7 0 0 1 12 19c-5 0-9-4.5-10-7a14 14 0 0 1 4-4.9L1.9 3.4zM12 5c5 0 9 4.5 10 7a13.5 13.5 0 0 1-2.6 3.6L8.7 4.9A10.6 10.6 0 0 1 12 5z"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M4 5h3v3H4zm5 0h11v3H9zM4 10.5h3v3H4zm5 0h11v3H9zM4 16h3v3H4zm5 0h11v3H9z"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M12 2a6 6 0 0 1 6 6v4.6l2 3.4H4l2-3.4V8a6 6 0 0 1 6-6zm-2.5 16h5a2.5 2.5 0 0 1-5 0z"/></svg>',
  bellOff: '<svg viewBox="0 0 24 24"><path d="m3.3 2 18.7 18.7-1.4 1.4-3.1-3.1H4l2-3.4V8c0-.8.2-1.6.4-2.3L1.9 3.4zM12 2a6 6 0 0 1 6 6v4.6l.8 1.4L8.1 3.3A6 6 0 0 1 12 2zM9.5 20h5a2.5 2.5 0 0 1-5 0z"/></svg>',
};

// ---------- helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const titleOf = m => m?.title?.english || m?.title?.romaji || m?.title?.native || 'Untitled';
const coverOf = m => m?.coverImage?.extraLarge || m?.coverImage?.large || '';
const bannerOf = m => m?.bannerImage || coverOf(m);
const num = e => { const n = parseFloat(e); return Number.isFinite(n) ? n : null; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cleanDesc = d => String(d || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
const isTouch = () => matchMedia('(hover: none), (pointer: coarse)').matches;

// Per-device preferences (list sort, view, player quality/speed). Storage can be unavailable; never rely on it.
const store = {
  get(k, d) { try { const v = localStorage.getItem(`anime.${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`anime.${k}`, JSON.stringify(v)); } catch { /* ignore */ } },
};

function clock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function until(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
function ago(ts) {
  if (!ts) return 'never';
  const s = Date.now() / 1000 - ts;
  return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
}
function metaLine(m) {
  return [FORMAT[m.format] || m.format, m.seasonYear, m.episodes ? `${m.episodes} ep` : null].filter(Boolean).join(' · ');
}

async function api(path, opts = {}) {
  const o = { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } };
  if (o.body && typeof o.body !== 'string') o.body = JSON.stringify(o.body);
  let r;
  try {
    r = await fetch(path, o);
  } catch {
    setOffline(true);
    throw new Error('Can\'t reach the server. Check that Tailscale is connected.');
  }
  if (offline) setOffline(false);
  let data = null;
  try { data = await r.json(); } catch { /* empty body */ }
  if (!r.ok) throw new Error(data?.detail || `Request failed (${r.status})`);
  return data;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function setAccent(color) {
  let c = DEFAULT_ACCENT;
  if (color && /^#[0-9a-f]{6}$/i.test(color)) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum > 0.28) c = color;
  }
  document.documentElement.style.setProperty('--accent', c);
}

const spinner = () => '<div class="spinner" aria-label="Loading"></div>';
const errorBox = e => `<div class="error-box">${esc(e.message || e)}</div>`;

// ---------- skeletons (grey placeholders while a page loads) ----------
const sk = {
  card: () => '<div class="card sk-card"><div class="poster sk"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div></div>',
  wcard: () => '<div class="wcard"><div class="thumb sk"></div><div class="sk sk-line"></div></div>',
  row: (n = 8, wide = false) => `<section class="section"><div class="section-head"><div class="sk sk-title"></div></div>
    <div class="row ${wide ? 'wide' : ''}">${Array.from({ length: n }, wide ? sk.wcard : sk.card).join('')}</div></section>`,
  grid: (n = 18) => `<div class="grid">${Array.from({ length: n }, sk.card).join('')}</div>`,
  home: () => `<section class="hero sk-hero"><div class="hero-body"><div class="sk sk-line short"></div>
    <div class="sk sk-h1"></div><div class="sk sk-line"></div><div class="sk sk-line"></div></div></section>${sk.row(4, true)}${sk.row()}${sk.row()}`,
  eps: (n = 4) => `<div class="eplist">${Array.from({ length: n }, () => `<div class="eprow"><div class="ep-thumb sk"></div>
    <div class="ep-head"><div class="sk sk-line"></div><div class="sk sk-line short"></div></div></div>`).join('')}</div>`,
  show: () => `<div class="show-hero"><div class="show-top"><div class="poster sk"></div>
    <div class="show-info"><div class="sk sk-h1"></div><div class="sk sk-line short"></div></div></div></div>
    <div class="show-cols"><div><div class="sk sk-line"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div>
    <section class="section">${sk.eps()}</section></div><aside class="side panel"><div class="sk sk-line"></div><div class="sk sk-input"></div></aside></div>`,
  rows: (n = 8) => `<div class="clist">${Array.from({ length: n }, () => `<div class="crow"><div class="crow-img sk"></div>
    <div class="crow-body"><div class="sk sk-line"></div><div class="sk sk-line short"></div></div></div>`).join('')}</div>`,
};

// ---------- cards ----------
function posterCard(m, { badge = '', sub = '', href } = {}) {
  return `<a class="card" data-id="${m.id}" data-title="${esc(titleOf(m))}" href="${href || `#/show/${m.id}`}">
    <div class="poster"><img loading="lazy" src="${esc(coverOf(m))}" alt="">${badge}
      <button class="card-more" aria-label="More options" tabindex="-1">${I.more}</button></div>
    <div><div class="t">${esc(titleOf(m))}</div><div class="m">${esc(sub || metaLine(m))}</div></div></a>`;
}

function watchCard(it) {
  const m = it.media;
  const pct = it.duration ? Math.min(100, it.position / it.duration * 100) : 0;
  const left = it.duration && it.position ? `${clock(it.duration - it.position)} left` : 'Up next';
  return `<div class="wcard" data-id="${m.id}" data-ep="${esc(it.episode)}" data-title="${esc(titleOf(m))}">
    <a class="thumb" href="#/watch/${m.id}/${encodeURIComponent(it.episode)}"><img loading="lazy" src="${esc(bannerOf(m))}" alt="">
      <div class="play">${I.play}<span>Episode ${esc(it.episode)}</span></div>
      ${pct ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}</a>
    <div class="wcard-foot"><a href="#/watch/${m.id}/${encodeURIComponent(it.episode)}" class="wcard-text">
      <div class="t">${esc(titleOf(m))}</div><div class="m">${esc(left)}</div></a>
      <button class="icon-btn plain wcard-more" aria-label="Options for ${esc(titleOf(m))}">${I.more}</button></div></div>`;
}

// A collection card: fanned covers, name, what's in it, and how much of it you've seen.
function countsLine(c) {
  const n = c.counts || {};
  return [n.series ? `${n.series} series` : '', n.movies ? `${n.movies} movie${n.movies > 1 ? 's' : ''}` : '',
    n.other ? `${n.other} more` : ''].filter(Boolean).join(' · ');
}
function collectionCard(c) {
  const covers = (c.covers || []).slice(0, 3);
  return `<a class="ccard" href="#/collection/${encodeURIComponent(c.key)}">
    <div class="ccovers">${covers.map((src, i) => `<img loading="lazy" src="${esc(src)}" alt="" style="--i:${i}">`).join('')}
      ${c.seen ? `<span class="badge">${c.done ? `${c.done}/${c.size} done` : `${c.seen} on your lists`}</span>` : ''}</div>
    <div><div class="t">${esc(c.name)}</div>
      <div class="m">${c.kind === 'studio' ? 'Studio' : 'Franchise'} · ${esc(countsLine(c) || `${c.size} titles`)}</div></div></a>`;
}

function section(title, inner, cls = 'row') {
  return `<section class="section"><div class="section-head"><h2>${esc(title)}</h2></div><div class="${cls}">${inner}</div></section>`;
}

// ---------- action sheet (popover on desktop, bottom sheet on touch / narrow screens) ----------
let sheetEl = null;
function closeSheet() {
  if (!sheetEl) return;
  const el = sheetEl;
  sheetEl = null;
  el.classList.remove('open');
  setTimeout(() => el.remove(), 180);
}
/**
 * items: [{ label, sub, icon, checked, danger, onClick, keep }] — onClick may return a promise;
 * `keep` leaves the sheet open (for sub-pages). Strings render as section labels.
 */
function openSheet({ title, sub, items, at }) {
  closeSheet();
  const wrap = document.createElement('div');
  const asSheet = isTouch() || window.innerWidth < 640 || !at;
  wrap.className = `sheet-wrap ${asSheet ? 'bottom' : 'pop'}`;
  wrap.innerHTML = `<div class="sheet" role="menu">${title ? `<div class="sheet-head"><strong>${esc(title)}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}</div>` : ''}
    <div class="sheet-body"></div></div>`;
  document.body.appendChild(wrap);
  sheetEl = wrap;
  const body = $('.sheet-body', wrap);
  // popovers open at the pointer, kept inside the window (re-done whenever the content changes size)
  const place = () => {
    if (asSheet) return;
    const s = $('.sheet', wrap);
    const r = s.getBoundingClientRect();
    s.style.left = `${Math.min(Math.max(8, at.x), window.innerWidth - r.width - 8)}px`;
    s.style.top = `${Math.max(8, Math.min(at.y, window.innerHeight - r.height - 8))}px`;
  };
  const render = list => {
    body.innerHTML = list.map((it, i) => typeof it === 'string' ? `<div class="sheet-label">${esc(it)}</div>`
      : `<button class="sheet-item ${it.danger ? 'danger' : ''} ${it.checked ? 'checked' : ''}" data-i="${i}" role="menuitem">
          ${it.icon || '<i class="sheet-gap"></i>'}<span>${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>
          ${it.checked ? I.check : ''}</button>`).join('');
    $$('.sheet-item', body).forEach(b => b.onclick = async () => {
      const it = list[+b.dataset.i];
      if (!it.keep) closeSheet();
      try { await it.onClick?.(render); } catch (e) { toast(e.message); }
    });
    place();
  };
  render(items);
  wrap.addEventListener('click', e => { if (e.target === wrap) closeSheet(); });
  requestAnimationFrame(() => wrap.classList.add('open'));
  return { render };
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
window.addEventListener('hashchange', closeSheet);

// Quick menu for any poster: status, score, play, remove.
async function quickMenu(id, title, at) {
  const sheet = openSheet({ title, items: ['Loading…'], at });
  let q;
  try { q = await api(`/api/media/${id}/quick`); } catch (e) { closeSheet(); toast(e.message); return; }
  if (sheetEl === null) return;
  const entry = q.entry;
  const save = async patch => {
    const body = entry ? { status: entry.status, ...patch } : { status: 'PLANNING', ...patch };
    const r = await api(`/api/list/${id}`, { method: 'PUT', body });
    toast(r.entry ? `${title} · ${STATUS[r.entry.status]}${patch.score !== undefined ? ` · ★ ${r.entry.score || '–'}` : ''}` : `Removed ${title} from your list`);
    softRefresh();
  };
  const main = () => {
    const items = [];
    if (q.next) {
      const n = q.next;
      const label = n.position ? `Resume episode ${n.episode}` : n.again ? 'Watch again from episode 1' : `Play episode ${n.episode}`;
      items.push({ label, sub: n.position ? `from ${clock(n.position)}` : '', icon: I.play,
        onClick: () => { location.hash = `#/watch/${id}/${encodeURIComponent(n.episode)}`; } });
    }
    items.push(entry ? 'Move to' : 'Add to');
    for (const [k, v] of Object.entries(STATUS)) {
      items.push({ label: v, checked: entry?.status === k, onClick: () => (entry?.status === k ? null : save({ status: k })) });
    }
    if (entry) {
      items.push('More');
      items.push({ label: 'Set score', sub: entry.score ? `Currently ★ ${entry.score}` : 'Not scored', icon: I.star, keep: true, onClick: r => r(scores()) });
      items.push({ label: 'Remove from list', icon: I.trash, danger: true,
        onClick: () => (confirm(`Remove ${title} from your lists?`) ? save({ status: null }) : null) });
    }
    items.push({ label: 'Go to show', icon: I.info, onClick: () => { location.hash = `#/show/${id}`; } });
    return items;
  };
  const scores = () => ['Score', ...[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(s => ({ label: `★ ${s}`, checked: entry.score === s, onClick: () => save({ score: s }) })),
    { label: 'No score', checked: !entry.score, onClick: () => save({ score: 0 }) },
    { label: 'Back', icon: I.back, keep: true, onClick: r => r(main()) }];
  sheet.render(main());
}

// Menu on a Continue watching card.
function continueMenu(card, at) {
  const id = +card.dataset.id, ep = card.dataset.ep, title = card.dataset.title;
  const statusItems = render => render(['Change list status', ...Object.entries(STATUS).map(([k, v]) => ({ label: v, onClick: async () => {
    await api(`/api/list/${id}`, { method: 'PUT', body: { status: k } });
    toast(`${title} · ${v}`);
    softRefresh();
  } })), { label: 'Back', icon: I.back, keep: true, onClick: r => r(main) }]);
  const main = [
    { label: 'Go to show', icon: I.info, onClick: () => { location.hash = `#/show/${id}`; } },
    { label: `Mark episode ${ep} watched`, icon: I.check, onClick: async () => {
      await api('/api/watched', { method: 'POST', body: { anilist_id: id, episode: ep, watched: true } });
      toast(`Episode ${ep} marked as watched`);
      softRefresh();
    } },
    { label: 'Change list status', icon: I.list, keep: true, onClick: statusItems },
    { label: 'Remove from Continue watching', icon: I.hide, danger: true, onClick: async () => {
      await api(`/api/continue/${id}/hide`, { method: 'POST' });
      card.remove();
      toast(`Removed ${title} from Continue watching`);
    } },
  ];
  openSheet({ title, sub: `Episode ${ep}`, items: main, at });
}

// Long-press (touch), right-click and ⋯ buttons open the menus above. One set of listeners for the whole app.
(function cardMenus() {
  let press = null;
  const target = el => el.closest('.wcard[data-id]') || el.closest('.card[data-id]') || el.closest('.crow[data-id]');
  const open = (el, at) => {
    if (el.classList.contains('wcard')) continueMenu(el, at);
    else quickMenu(+el.dataset.id, el.dataset.title, at);
  };
  document.addEventListener('click', e => {
    const btn = e.target.closest('.card-more, .wcard-more');
    if (btn) {
      e.preventDefault(); e.stopPropagation();
      const r = btn.getBoundingClientRect();
      open(target(btn), { x: r.left, y: r.bottom + 4 });
      return;
    }
    if (press?.fired) { e.preventDefault(); e.stopPropagation(); press = null; }
  }, true);
  document.addEventListener('contextmenu', e => {
    const el = target(e.target);
    if (!el || isTouch()) return;
    e.preventDefault();
    open(el, { x: e.clientX, y: e.clientY });
  });
  document.addEventListener('touchstart', e => {
    const el = target(e.target);
    if (!el || e.touches.length !== 1) return;
    const t = e.touches[0];
    press = { el, x: t.clientX, y: t.clientY, fired: false };
    press.timer = setTimeout(() => {
      if (!press) return;
      press.fired = true;
      navigator.vibrate?.(10);
      open(el, null);
    }, 500);
  }, { passive: true });
  const cancel = e => {
    if (!press || press.fired) return;
    const t = e.touches?.[0];
    if (e.type === 'touchmove' && t && Math.hypot(t.clientX - press.x, t.clientY - press.y) < 10) return;
    clearTimeout(press.timer);
    press = null;
  };
  document.addEventListener('touchmove', cancel, { passive: true });
  document.addEventListener('touchend', e => {
    if (press?.fired) { e.preventDefault(); setTimeout(() => { press = null; }, 400); return; }
    cancel(e);
  });
  document.addEventListener('touchcancel', cancel);
}());

// ---------- connection banner ----------
let offline = false;
function setOffline(on) {
  if (on === offline) return;
  offline = on;
  $('#netbar').hidden = !on;
  if (on) pollServer();
  else if ($('.error-box', $view)) route(true);
}
async function pollServer() {
  while (offline) {
    await sleep(4000);
    try {
      const r = await fetch('/api/ping', { cache: 'no-store' });
      if (r.ok) { setOffline(false); toast('Connected again'); }
    } catch { /* still offline */ }
  }
}
window.addEventListener('offline', () => setOffline(true));
window.addEventListener('online', () => { if (offline) fetch('/api/ping', { cache: 'no-store' }).then(r => r.ok && setOffline(false)).catch(() => {}); });

// ---------- router ----------
let cleanup = null;
let routeId = 0;

function setNav(name) {
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === name));
}

// Each history entry remembers its scroll position (and how many result pages were loaded), so going
// Back puts you where you were. Saved into history.state as you scroll; new entries start empty.
let restoring = false, scrollTimer = null;
window.addEventListener('scroll', () => {
  if (restoring || scrollTimer) return;
  scrollTimer = setTimeout(() => {
    scrollTimer = null;
    if (!restoring) history.replaceState({ ...(history.state || {}), y: window.scrollY }, '');
  }, 250);
}, { passive: true });
function rememberPages(pages) { history.replaceState({ ...(history.state || {}), pages }, ''); }

// The tab you came from stays highlighted on show, player and collection pages.
const NAV_OF = { undefined: 'home', search: 'search', collections: 'collections', lists: 'lists', settings: 'settings' };
let lastNav = 'home';

// keepScroll: re-render the current page in place (pull to refresh, after a menu action)
async function route(keepScroll = false) {
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  const id = ++routeId;
  const saved = keepScroll ? null : history.state; // read before anything scrolls and overwrites it
  restoring = true;
  const y = window.scrollY;
  const hash = location.hash.slice(1) || '/';
  const [path, query = ''] = hash.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query);
  document.body.classList.toggle('watching', parts[0] === 'watch');
  document.documentElement.classList.toggle('ptr-on', ['show', 'lists', 'collections', 'collection', undefined].includes(parts[0]));
  if (String(parts[0]) in NAV_OF) lastNav = NAV_OF[parts[0]];
  setNav(lastNav);
  if (!keepScroll) { setAccent(null); window.scrollTo(0, 0); }
  const stale = () => id !== routeId;
  try {
    switch (parts[0]) {
      case undefined: await viewHome(stale, keepScroll); break;
      case 'search': await viewSearch(stale, params, saved?.pages || 1); break;
      case 'show': await viewShow(stale, +parts[1], { pick: params.get('pick') === '1', keepScroll }); break;
      case 'watch': await viewWatch(stale, +parts[1], parts[2], params.get('mode')); break;
      case 'lists': await viewLists(stale, parts[1] || 'CURRENT', keepScroll); break;
      case 'collections': await viewCollections(stale, keepScroll); break;
      case 'collection': await viewCollection(stale, parts[1], keepScroll); break;
      case 'settings': await viewSettings(stale); break;
      default: $view.innerHTML = '<div class="empty">Page not found.</div>';
    }
  } catch (e) {
    if (!stale()) $view.innerHTML = `<div class="section">${errorBox(e)}</div>`;
  }
  if (stale()) return;
  if (keepScroll) window.scrollTo(0, y);
  else if (saved?.y) window.scrollTo(0, saved.y);
  restoring = false;
  if (saved && !keepScroll) history.replaceState({ ...(history.state || {}), y: saved.y, pages: saved.pages }, '');
}
window.addEventListener('hashchange', () => route());

// Re-render the current page after a change made from a menu (not on the player).
function softRefresh() {
  if (!location.hash.startsWith('#/watch') && !location.hash.startsWith('#/search')) route(true);
}

// ---------- pull to refresh (touch: Home, Lists, Show pages) ----------
(function pullToRefresh() {
  const el = document.createElement('div');
  el.className = 'ptr';
  el.innerHTML = '<div class="ptr-dot"></div>';
  document.body.appendChild(el);
  let startY = null, dist = 0, busy = false;
  const enabled = () => document.documentElement.classList.contains('ptr-on') && !sheetEl && !$('.modal') && !busy;
  const paint = () => {
    el.style.transform = `translate(-50%, ${dist - 50}px)`;
    el.style.opacity = Math.min(1, dist / 60);
    el.classList.toggle('ready', dist >= 70);
    $view.style.transform = dist ? `translateY(${dist * 0.4}px)` : '';
  };
  document.addEventListener('touchstart', e => {
    startY = enabled() && window.scrollY <= 0 && e.touches.length === 1 && !e.target.closest('input, textarea, select') ? e.touches[0].clientY : null;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || window.scrollY > 0) { if (dist) { dist = 0; paint(); } return; }
    dist = Math.min(110, dy * 0.55);
    paint();
  }, { passive: true });
  document.addEventListener('touchend', async () => {
    if (startY === null) return;
    startY = null;
    if (dist >= 70) {
      busy = true;
      dist = 70; paint(); el.classList.add('spin');
      $view.style.transform = '';
      try { await route(true); } finally {
        busy = false; el.classList.remove('spin');
      }
    }
    dist = 0;
    el.style.transition = $view.style.transition = 'transform .2s, opacity .2s';
    paint();
    setTimeout(() => { el.style.transition = $view.style.transition = ''; }, 220);
  });
}());

// ---------- TV mode: big-screen layout driven by a remote's arrow keys ----------
// On per device (Settings, or open the app with ?tv=1). Arrows move focus to the nearest item in that
// direction, OK/Enter opens it, Back/Escape goes back. The player keeps its own keys.
const tvMode = () => document.body.classList.contains('tv');
function setTvMode(on) {
  document.body.classList.toggle('tv', on);
  store.set('tvMode', on);
}
if (new URLSearchParams(location.search).get('tv') === '1') store.set('tvMode', true);
if (store.get('tvMode', false)) document.body.classList.add('tv');

function focusables() {
  return $$('#view a[href], #view button:not([disabled]), #view select, #view input, .topbar a, .sheet-item')
    .filter(el => el.offsetParent !== null && el.tabIndex !== -1 && !el.closest('[hidden]') && !el.matches('.wcard-text, .wcard-more'));
}
function tvMove(dir) {
  const items = focusables();
  const inBar = el => !!el.closest('.topbar');
  const visible = el => { const r = el.getBoundingClientRect(); return r.bottom > 90 && r.top < innerHeight - 20; };
  const go = el => {
    if (!el) return;
    el.focus({ preventScroll: true });
    if (inBar(el)) return;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    const r = el.getBoundingClientRect();
    if (r.top < 90) window.scrollBy({ top: r.top - 110, behavior: 'smooth' }); // keep clear of the top bar
  };
  const content = items.filter(el => !inBar(el)), bar = items.filter(inBar);
  const cur = items.includes(document.activeElement) ? document.activeElement : null;
  if (!cur) { go(content.find(visible) || content[0]); return; }
  // the top bar stays on screen, so it's its own strip: left/right inside it, down back into the page
  if (inBar(cur)) {
    const i = bar.indexOf(cur);
    if (dir === 'left') go(bar[i - 1]);
    else if (dir === 'right') go(bar[i + 1]);
    else if (dir === 'down') go(content.find(visible) || content[0]);
    return;
  }
  // page items are compared in page coordinates, so off-screen items are measured correctly
  const pos = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 + window.scrollY, h: r.height }; };
  const a = pos(cur);
  let best = null, bestScore = Infinity;
  for (const el of content) {
    if (el === cur) continue;
    const b = pos(el), dx = b.x - a.x, dy = b.y - a.y;
    const sameRow = Math.abs(dy) < Math.max(a.h, b.h) / 2 + 4;
    const ok = { left: dx < -4 && sameRow, right: dx > 4 && sameRow, up: dy < -4 && !sameRow, down: dy > 4 && !sameRow }[dir];
    if (!ok) continue;
    // prefer things straight ahead: distance along the direction plus a penalty for drifting sideways
    const along = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
    const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = along + side * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (!best && dir === 'up') best = bar.find(el => el.classList.contains('on')) || bar[0];
  go(best);
}
document.addEventListener('keydown', e => {
  if (!tvMode() || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = ['input', 'textarea'].includes(tag) && !['checkbox', 'range'].includes(e.target.type);
  if (location.hash.startsWith('#/watch') && !sheetEl) {
    if ((e.key === 'Backspace' || e.key === 'BrowserBack') && !typing) { e.preventDefault(); history.back(); }
    return; // the player handles its own keys
  }
  const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
  if (dir && !(typing && (dir === 'left' || dir === 'right')) && tag !== 'select') { e.preventDefault(); tvMove(dir); return; }
  if ((e.key === 'Backspace' || e.key === 'BrowserBack') && !typing) {
    e.preventDefault();
    if (sheetEl) closeSheet(); else history.back();
  }
});
// after each page renders, put focus on its first item so the remote has somewhere to start
window.addEventListener('hashchange', () => {
  if (!tvMode()) return;
  setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) focusables().find(el => el.closest('#view'))?.focus({ preventScroll: true }); }, 900);
});

// ---------- row arrows (mouse) and top bar ----------
// Rows scroll sideways; a mouse wheel can't do that, so hovering a row shows ‹ › buttons.
(function rowArrows() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const paint = row => {
    const max = row.scrollWidth - row.clientWidth;
    row._arrows[0].hidden = row.scrollLeft <= 4;
    row._arrows[1].hidden = row.scrollLeft >= max - 4;
  };
  document.addEventListener('mouseover', e => {
    const row = e.target.closest?.('.row');
    if (!row || row._arrows || row.scrollWidth <= row.clientWidth + 4) return;
    const host = row.parentElement;
    host.classList.add('has-arrows');
    const media = row.querySelector('.poster, .thumb, .ccovers');
    const mid = row.offsetTop + (media ? media.offsetHeight : row.offsetHeight) / 2;
    row._arrows = [-1, 1].map(dir => {
      const b = document.createElement('button');
      b.className = `row-arrow ${dir < 0 ? 'left' : 'right'}`;
      b.setAttribute('aria-label', dir < 0 ? 'Scroll left' : 'Scroll right');
      b.innerHTML = I.back;
      b.style.top = `${mid}px`;
      b.onclick = () => row.scrollBy({ left: dir * row.clientWidth * 0.85, behavior: 'smooth' });
      host.appendChild(b);
      return b;
    });
    row.addEventListener('scroll', () => paint(row), { passive: true });
    paint(row);
  });
}());
window.addEventListener('scroll', () => document.body.classList.toggle('scrolled', window.scrollY > 8), { passive: true });

// ---------- home ----------
async function viewHome(stale, keepScroll) {
  if (!keepScroll) $view.innerHTML = sk.home();
  // "Because you watched" rows need several AniList lookups. Wait briefly for them so the page appears in
  // one go; if they're slower, keep a placeholder row in their place so nothing jumps much when they land.
  const recsP = api('/api/home/recs').catch(() => []);
  const d = await api('/api/home');
  const quick = await Promise.race([recsP, sleep(800).then(() => null)]);
  if (stale()) return;
  const recsHtml = rows => rows.map(r => section(`Because you watched ${titleOf(r.seed)}`,
    r.items.map(m => posterCard(m)).join(''))).join('');
  const lead = d.continue[0];
  const heroM = lead ? lead.media : d.trending[0];
  let hero = '';
  if (heroM) {
    const playHref = lead ? `#/watch/${heroM.id}/${encodeURIComponent(lead.episode)}` : `#/show/${heroM.id}`;
    hero = `<section class="hero"><div class="hero-bg" style="background-image:url('${esc(bannerOf(heroM))}')"></div>
      <div class="hero-body">
        <div class="eyebrow">${lead ? `Continue · ${lead.media.format === 'MOVIE' ? 'Movie' : `Episode ${esc(lead.episode)}`}` : 'Trending now'}</div>
        <h1>${esc(titleOf(heroM))}</h1>
        <p>${esc(cleanDesc(heroM.description))}</p>
        <div class="actions">
          <a class="btn primary" href="${playHref}">${I.play}${lead ? (lead.position ? 'Resume' : 'Play') : 'View'}</a>
          <a class="btn" href="#/show/${heroM.id}">${I.info}Details</a>
        </div></div></section>`;
  }
  let html = hero;
  if (d.continue.length) html += section('Continue watching', d.continue.map(watchCard).join(''), 'row wide');
  if (d.new.length) {
    html += section('New episodes', d.new.map(n => posterCard(n.media, {
      badge: `<span class="badge">${n.unwatched} new</span>`, sub: `Next: episode ${n.episode}`,
      href: `#/watch/${n.media.id}/${encodeURIComponent(n.episode)}` })).join(''));
  }
  html += `<div id="recs">${quick ? recsHtml(quick) : sk.row()}</div>`;
  if (d.trending.length) html += section('Trending now', d.trending.map(m => posterCard(m)).join(''));
  if (d.season.length) html += section('Popular this season', d.season.map(m => posterCard(m, {
    badge: m.nextAiringEpisode ? `<span class="badge right">Ep ${m.nextAiringEpisode.episode} in ${until(m.nextAiringEpisode.timeUntilAiring)}</span>` : '' })).join(''));
  if (d.popular.length) html += section('All-time popular', d.popular.map(m => posterCard(m)).join(''));
  if (!heroM) html += '<div class="empty">Couldn\'t reach AniList right now. Try again in a minute.</div>';
  $view.innerHTML = html;

  if (!quick) recsP.then(rows => { if (!stale()) $('#recs').innerHTML = recsHtml(rows || []); });
}

// ---------- search & browse ----------
let genreCache = null;
const FORMAT_CHIPS = [['TV', 'TV'], ['MOVIE', 'Movie'], ['OVA', 'OVA'], ['ONA', 'ONA'], ['SPECIAL', 'Special']];
const AIRING = { '': 'Any status', RELEASING: 'Airing', FINISHED: 'Finished', NOT_YET_RELEASED: 'Upcoming' };
const SORTS = { match: 'Best match', popularity: 'Most popular', score: 'Highest rated', trending: 'Trending', newest: 'Newest' };

// Search results are kept for 10 minutes, so going Back to a long list of results is instant.
const discoverCache = new Map();
async function discover(query) {
  const hit = discoverCache.get(query);
  if (hit && Date.now() - hit.at < 600000) return hit.data;
  const data = await api(`/api/discover?${query}`);
  discoverCache.set(query, { at: Date.now(), data });
  if (discoverCache.size > 200) discoverCache.delete(discoverCache.keys().next().value);
  return data;
}

async function viewSearch(stale, params, restorePages = 1) {
  const state = {
    q: params.get('q') || '',
    genres: (params.get('genres') || '').split(',').filter(Boolean),
    formats: (params.get('formats') || '').split(',').filter(Boolean),
    status: params.get('status') || '',
    sort: params.get('sort') || '',
  };
  $view.innerHTML = `<h1 class="page-title">Search &amp; Browse</h1>
    <div class="searchbar">${I.search}<input type="search" id="q" placeholder="Search anime" value="${esc(state.q)}" autocomplete="off" enterkeyhint="search">
      <button class="icon-btn plain clear-q" aria-label="Clear search" ${state.q ? '' : 'hidden'}>${I.x}</button></div>
    <div class="filters">
      <div class="chip-row" id="genres"><span class="chip sk" style="width:70px"></span><span class="chip sk" style="width:90px"></span><span class="chip sk" style="width:60px"></span></div>
      <div class="filter-row">
        <div class="chip-row" id="formats">${FORMAT_CHIPS.map(([k, v]) => `<button class="fchip" data-format="${k}">${v}</button>`).join('')}</div>
        <select id="status" aria-label="Airing status">${Object.entries(AIRING).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <select id="sort" aria-label="Sort by"></select>
        <button class="linkish" id="reset" hidden>Clear filters</button>
      </div>
    </div>
    <div id="results"></div>`;
  const input = $('#q'), out = $('#results');
  const filtered = () => state.genres.length || state.formats.length || state.status || (state.sort && state.sort !== 'match' && state.sort !== 'popularity');
  let seq = 0, page = 1, loading = false, hasMore = false, observer = null, timer;

  function paintFilters() {
    $$('#genres .fchip').forEach(b => b.classList.toggle('on', state.genres.includes(b.dataset.genre)));
    $$('#formats .fchip').forEach(b => b.classList.toggle('on', state.formats.includes(b.dataset.format)));
    $('#status').value = state.status;
    const sorts = Object.entries(SORTS).filter(([k]) => k !== 'match' || state.q.trim());
    $('#sort').innerHTML = sorts.map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('#sort').value = state.sort && (state.sort !== 'match' || state.q.trim()) ? state.sort : (state.q.trim() ? 'match' : 'popularity');
    $('#reset').hidden = !filtered();
    $('.clear-q').hidden = !state.q;
  }
  function writeUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.genres.length) p.set('genres', state.genres.join(','));
    if (state.formats.length) p.set('formats', state.formats.join(','));
    if (state.status) p.set('status', state.status);
    if (state.sort) p.set('sort', state.sort);
    const s = p.toString();
    history.replaceState(null, '', s ? `#/search?${s}` : '#/search');
  }
  const qs = pg => {
    const formats = state.formats.flatMap(f => (f === 'TV' ? ['TV', 'TV_SHORT'] : [f]));
    return new URLSearchParams({ q: state.q.trim(), genres: state.genres.join(','), formats: formats.join(','),
      status: state.status, sort: $('#sort').value, page: pg }).toString();
  };

  async function recents() {
    try {
      const items = await api('/api/searches');
      if (!items.length) return '';
      return `<section class="recent"><div class="section-head"><h2>Recent searches</h2><button class="linkish" id="clear-recent">Clear all</button></div>
        <ul class="recent-list">${items.map(s => `<li><button class="recent-q" data-q="${esc(s)}">${I.clock}<span>${esc(s)}</span></button>
          <button class="icon-btn plain recent-x" data-q="${esc(s)}" aria-label="Remove ${esc(s)}">${I.x}</button></li>`).join('')}</ul></section>`;
    } catch { return ''; }
  }

  // upto: load this many result pages before showing them (used when coming Back to the page)
  async function run(upto = 1) {
    const mine = ++seq;
    page = 1;
    paintFilters();
    writeUrl();
    if (observer) { observer.disconnect(); observer = null; }
    const text = state.q.trim();
    if (text.length === 1 && !filtered()) { out.innerHTML = '<div class="empty">Keep typing…</div>'; return; }
    const showRecents = !text && !filtered();
    out.innerHTML = sk.grid(12);
    try {
      const [first, rec, cols] = await Promise.all([discover(qs(1)), showRecents ? recents() : '',
        text.length >= 2 ? api(`/api/collections/search?q=${encodeURIComponent(text)}`).catch(() => []) : []]);
      if (mine !== seq || stale()) return;
      const r = { ...first, items: [...first.items] }; // a copy: extra pages get added to it, not to the cache
      hasMore = r.has_more;
      while (page < upto && hasMore) {
        const more = await discover(qs(page + 1));
        if (mine !== seq || stale()) return;
        r.items = r.items.concat(more.items);
        hasMore = more.has_more;
        page++;
      }
      if (page > 1) rememberPages(page);
      const heading = showRecents ? '<div class="section-head"><h2>Popular right now</h2></div>'
        : cols.length ? '<div class="section-head"><h2>Shows</h2></div>' : '';
      const colRow = cols.length ? `<section class="search-cols"><div class="section-head"><h2>Collections</h2></div>
        <div class="row crow-row">${cols.map(collectionCard).join('')}</div></section>` : '';
      out.innerHTML = rec + colRow + heading + (r.items.length ? `<div class="grid" id="grid">${r.items.map(m => posterCard(m)).join('')}</div><div id="more"></div>`
        : '<div class="empty">Nothing matches. Try fewer filters or another title.</div>');
      wireRecents();
      watchMore(mine);
    } catch (e) { if (mine === seq) out.innerHTML = errorBox(e); }
  }

  function watchMore(mine) {
    const sentinel = $('#more');
    if (!sentinel || !hasMore) return;
    observer = new IntersectionObserver(async entries => {
      if (!entries[0].isIntersecting || loading || !hasMore || mine !== seq) return;
      loading = true;
      sentinel.innerHTML = spinner();
      try {
        const r = await discover(qs(page + 1));
        if (mine !== seq || stale()) return;
        page++;
        hasMore = r.has_more;
        rememberPages(page);
        $('#grid').insertAdjacentHTML('beforeend', r.items.map(m => posterCard(m)).join(''));
        sentinel.innerHTML = '';
        if (!hasMore) observer.disconnect();
      } catch (e) { sentinel.innerHTML = errorBox(e); observer.disconnect(); }
      finally { loading = false; }
    }, { rootMargin: '600px' });
    observer.observe(sentinel);
  }

  function wireRecents() {
    $$('.recent-q', out).forEach(b => b.onclick = () => { input.value = state.q = b.dataset.q; remember(); run(); });
    $$('.recent-x', out).forEach(b => b.onclick = async () => {
      await api(`/api/searches?q=${encodeURIComponent(b.dataset.q)}`, { method: 'DELETE' }).catch(() => {});
      b.closest('li').remove();
      if (!$('.recent-list li', out)) $('.recent', out)?.remove();
    });
    const clear = $('#clear-recent', out);
    if (clear) clear.onclick = async () => { await api('/api/searches', { method: 'DELETE' }).catch(() => {}); $('.recent', out)?.remove(); };
  }

  // a search is remembered when you press Enter or open one of its results
  const remember = () => { if (state.q.trim().length >= 2) api('/api/searches', { method: 'POST', body: { q: state.q.trim() } }).catch(() => {}); };
  out.addEventListener('click', e => { if (e.target.closest('a.card')) remember(); });

  input.addEventListener('input', () => {
    state.q = input.value;
    $('.clear-q').hidden = !state.q;
    clearTimeout(timer);
    timer = setTimeout(run, 350);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(timer); remember(); run(); input.blur(); } });
  $('.clear-q').onclick = () => { input.value = state.q = ''; if (state.sort === 'match') state.sort = ''; run(); input.focus(); };
  $$('#formats .fchip').forEach(b => b.onclick = () => {
    const f = b.dataset.format;
    state.formats = state.formats.includes(f) ? state.formats.filter(x => x !== f) : [...state.formats, f];
    run();
  });
  $('#status').onchange = e => { state.status = e.target.value; run(); };
  $('#sort').onchange = e => { state.sort = e.target.value; run(); };
  $('#reset').onclick = () => { Object.assign(state, { genres: [], formats: [], status: '', sort: '' }); run(); };

  if (!genreCache) genreCache = await api('/api/genres').catch(() => []);
  if (stale()) return;
  $('#genres').innerHTML = genreCache.map(g => `<button class="fchip" data-genre="${esc(g)}">${esc(g)}</button>`).join('');
  $$('#genres .fchip').forEach(b => b.onclick = () => {
    const g = b.dataset.genre;
    state.genres = state.genres.includes(g) ? state.genres.filter(x => x !== g) : [...state.genres, g];
    run();
  });
  if (!state.q && !isTouch()) input.focus({ preventScroll: true });
  await run(restorePages);
}

// ---------- show ----------
const seasonCache = new Map(); // show id -> its series' season list, so the selector appears instantly on a switch

async function viewShow(stale, id, { pick = false, keepScroll = false } = {}) {
  if (!keepScroll) $view.innerHTML = sk.show();
  const d = await api(`/api/media/${id}`);
  if (stale()) return;
  const m = d.media;
  let entry = d.entry, mode = d.mode, watch = d.watch || {}, episodes = null, notify = d.notify, devices = d.devices;
  setAccent(m.coverImage?.color);

  const alt = m.title?.romaji && m.title.romaji !== titleOf(m) ? m.title.romaji : '';
  const chips = [
    FORMAT[m.format] || m.format, m.seasonYear, m.episodes && m.format !== 'MOVIE' ? `${m.episodes} episode${m.episodes === 1 ? '' : 's'}` : null,
    m.averageScore ? `★ ${(m.averageScore / 10).toFixed(1)}` : null,
  ].filter(Boolean).map(c => `<span class="chip">${esc(c)}</span>`).join('')
    + (m.status === 'RELEASING' ? '<span class="chip live">Airing</span>' : '')
    + (m.nextAiringEpisode ? `<span class="chip">Ep ${m.nextAiringEpisode.episode} in ${until(m.nextAiringEpisode.timeUntilAiring)}</span>` : '')
    + (m.genres || []).slice(0, 4).map(g => `<a class="chip" href="#/search?genres=${encodeURIComponent(g)}">${esc(g)}</a>`).join('');
  const desc = cleanDesc(m.description);
  const relations = (m.relations?.edges || []).filter(e => e.node.type === 'ANIME' && RELATION[e.relationType]);
  relations.sort((a, b) => ['PREQUEL', 'SEQUEL'].indexOf(b.relationType) - ['PREQUEL', 'SEQUEL'].indexOf(a.relationType));

  $view.innerHTML = `
    <div class="show-hero">
      <button class="icon-btn back-btn" id="back" aria-label="Back">${I.back}</button>
      <div class="bg" style="background-image:url('${esc(bannerOf(m))}')"></div>
      <div class="show-top">
        <div class="poster"><img src="${esc(coverOf(m))}" alt=""></div>
        <div class="show-info">
          <h1>${esc(titleOf(m))}</h1>${alt ? `<div class="alt">${esc(alt)}</div>` : ''}
          <div class="chips">${chips}</div>
          <div class="actions desk play-actions"></div>
        </div>
      </div>
    </div>
    <div class="actions mobile-only play-actions" style="margin-top:18px"></div>
    <div class="chips mobile-only" style="margin-top:14px">${chips}</div>
    <div id="seasons"></div>
    <div id="collection-link"></div>
    <div class="show-cols">
      <div>
        ${desc ? `<p class="desc clamp" id="desc">${esc(desc)}</p><button class="linkish" id="more">Show more</button>` : ''}
        <section class="section">
          <div class="section-head"><h2>${m.format === 'MOVIE' ? 'Movie' : 'Episodes'}</h2>
            <label class="filler-toggle" id="ftog" hidden><input type="checkbox" class="sw-input" id="skipfill"><i class="sw"></i>Skip filler</label>
            <div class="seg" id="mode" role="group" aria-label="Audio">
              <button data-mode="sub">Sub</button><button data-mode="dub">Dub</button></div></div>
          <div id="eps">${sk.eps()}</div>
          <div id="source-info" class="faint" style="margin-top:14px;font-size:13.5px"></div>
        </section>
        ${relations.length ? section('Related', relations.map(e => posterCard(e.node, {
          sub: RELATION[e.relationType], badge: '' })).join('')) : ''}
        <div id="similar">${sk.row(6)}</div>
      </div>
      <aside class="side panel" id="list-panel"></aside>
    </div>`;

  $('#back').onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/'));
  const more = $('#more');
  if (more) {
    const p = $('#desc');
    if (p.scrollHeight <= p.clientHeight + 4) more.remove();
    more.onclick = () => { p.classList.toggle('clamp'); more.textContent = p.classList.contains('clamp') ? 'Show more' : 'Show less'; };
  }

  // Season selector: every season of the series; picking one swaps this page to that season in place.
  let seasons = seasonCache.get(id) || null;
  // "Attack on Titan Season 3 Part 2" -> "Season 3 Part 2": the title minus the first season's title
  const seasonLabel = s => {
    const base = titleOf(seasons[0]), t = titleOf(s);
    if (s.number === 1) return 'Season 1';
    const rest = t.toLowerCase().startsWith(base.toLowerCase()) ? t.slice(base.length).replace(/^[\s:–—-]+/, '').trim() : '';
    return rest && rest.length <= 32 ? rest : `Season ${s.number}`;
  };
  function paintSeasons() {
    const box = $('#seasons');
    if (!box || !seasons || seasons.length < 2) { if (box) box.innerHTML = ''; return; }
    box.innerHTML = `<div class="season-row" role="tablist" aria-label="Seasons">${seasons.map(s => {
      const st = s.id === id ? entry?.status : s.entry?.status;
      const sub = [s.seasonYear, st ? STATUS[st] : null].filter(Boolean).join(' · ');
      return `<a class="season ${s.id === id ? 'on' : ''}" href="#/show/${s.id}" data-sid="${s.id}" role="tab"
        aria-selected="${s.id === id}" title="${esc(titleOf(s))}"><strong>${esc(seasonLabel(s))}</strong>
        <small>${esc(sub || FORMAT[s.format] || '')}</small>${st === 'COMPLETED' ? `<i class="season-done">${I.check}</i>` : ''}</a>`;
    }).join('')}</div>`;
    $$('.season', box).forEach(a => a.onclick = e => {
      e.preventDefault();
      if (+a.dataset.sid === id) return;
      history.replaceState(null, '', `#/show/${a.dataset.sid}`); // switching seasons doesn't pile up Back steps
      $$('.season', box).forEach(x => x.classList.toggle('on', x === a));
      $$('.show-hero, .show-cols, .mobile-only').forEach(el => el.classList.add('switching')); // dim until it loads
      route(true);
    });
    $('.season.on', box)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  paintSeasons();
  api(`/api/media/${id}/seasons`).then(list => {
    if (stale()) return;
    seasons = list;
    list.forEach(s => seasonCache.set(s.id, list));
    paintSeasons();
  }).catch(() => {});

  // "Part of the Naruto collection" link (the collection is built on first visit if it isn't known yet)
  api(`/api/media/${id}/collection`).then(c => {
    if (stale() || !c) return;
    $('#collection-link').innerHTML = `<a class="coll-link" href="#/collection/${encodeURIComponent(c.key)}">
      <span class="coll-mini">${(c.covers || []).slice(0, 3).map(s => `<img src="${esc(s)}" alt="">`).join('')}</span>
      <span><small>Part of a collection</small><strong>${esc(c.name)}</strong><em>${esc(countsLine(c))}</em></span>${I.back}</a>`;
  }).catch(() => {});

  api(`/api/media/${id}/recommendations`).then(items => {
    if (stale()) return;
    $('#similar').innerHTML = items.length ? section('More like this', items.map(r => posterCard(r)).join('')) : '';
  }).catch(() => { if (!stale()) $('#similar').innerHTML = ''; });

  // sub / dub
  const paintMode = () => $$('#mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  paintMode();
  $$('#mode button').forEach(b => b.onclick = async () => {
    mode = b.dataset.mode; paintMode();
    try { await api(`/api/media/${id}/mode`, { method: 'PUT', body: { mode } }); toast(`This show will play ${mode === 'dub' ? 'dubbed' : 'subtitled'}`); }
    catch (e) { toast(e.message); }
  });

  // a movie (one "episode" on the stream source) gets a Play movie button instead of an episode list
  const movieLike = () => m.format === 'MOVIE' && episodes && episodes.length === 1;
  const isWatched = ep => !!(watch[ep]?.completed) || (num(ep) !== null && entry && num(ep) <= entry.progress);

  function nextUp() {
    if (!episodes || !episodes.length) return null;
    const partial = Object.values(watch).filter(w => !w.completed && w.position > 10 && episodes.includes(w.episode))
      .sort((a, b) => b.updated_at - a.updated_at)[0];
    if (partial) return { ep: partial.episode, resume: partial.position };
    const isFiller = e => skipFiller && fillerMap[Math.trunc(num(e))] === 'filler';
    const first = episodes.find(e => !isWatched(e) && !isFiller(e)) || episodes.find(e => !isWatched(e));
    return first ? { ep: first } : { ep: episodes[0], again: true };
  }

  // filler episodes (long shows only), and the per-person "Skip filler" switch
  let fillerMap = {}, skipFiller = false, cachedEps = new Set();
  async function loadFiller() {
    try {
      const r = await api(`/api/media/${id}/filler`);
      if (stale() || !Object.keys(r.episodes).length) return;
      fillerMap = r.episodes; skipFiller = r.skip;
      const tog = $('#ftog'), box = $('#skipfill');
      tog.hidden = false;
      box.checked = skipFiller;
      box.onchange = async () => {
        skipFiller = box.checked;
        try { await api('/api/settings', { method: 'PUT', body: { skip_filler: skipFiller } }); }
        catch (e) { toast(e.message); }
        toast(skipFiller ? 'Up next and autoplay will skip filler episodes' : 'Filler episodes play as normal');
        paintEpisodes(); paintActions();
      };
      paintEpisodes(); paintActions();
    } catch { /* filler info is optional */ }
  }

  function paintActions() {
    const up = nextUp();
    let btn;
    if (!episodes) btn = `<button class="btn primary" disabled>${I.play}Finding episodes…</button>`;
    else if (!up) btn = `<button class="btn primary" disabled>${I.play}No episodes yet</button>`;
    else {
      const label = movieLike()
        ? (up.resume ? `Resume · ${clock(up.resume)}` : up.again ? 'Watch again' : 'Play movie')
        : (up.resume ? `Resume E${up.ep} · ${clock(up.resume)}` : up.again ? 'Watch again' : `Play episode ${up.ep}`);
      btn = `<a class="btn primary" href="#/watch/${id}/${encodeURIComponent(up.ep)}">${I.play}${esc(label)}</a>`;
    }
    const add = entry ? '' : '<button class="btn add-list wide-only">+ My list</button>';
    // narrow screens: the list panel sits below the episodes, so status is one tap away here instead
    const status = `<button class="btn status-btn narrow-only">${entry ? `${I.check}${esc(STATUS[entry.status])}` : '+ My list'}</button>`;
    // bell: only for shows that are airing or coming out
    const airing = ['RELEASING', 'NOT_YET_RELEASED'].includes(m.status);
    const bellOn = notify === 'watching' || notify === 'bell';
    const bellLabel = { watching: 'Alerts on', muted: 'Muted', bell: 'Notifying you', off: m.status === 'NOT_YET_RELEASED' ? 'Notify me' : 'Notify me of new episodes' }[notify];
    const bellBtn = airing && notify ? `<button class="btn ${bellOn ? 'bell-on' : 'ghost'} bell-btn" aria-pressed="${bellOn}"
      title="${notify === 'watching' ? 'You get an alert when a new episode is out. Tap to mute.' : ''}">${bellOn ? I.bell : I.bellOff}${esc(bellLabel)}</button>` : '';
    $$('.play-actions').forEach(el => { el.innerHTML = btn + add + status + bellBtn; });
    $$('.bell-btn').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try {
        const r = await api(`/api/media/${id}/notify`, { method: 'PUT', body: { on: !bellOn } });
        notify = r.notify; devices = r.devices;
        toast(!devices && (notify === 'bell' || notify === 'watching')
          ? 'Saved. Turn on notifications in Settings to get alerts on this device.'
          : { watching: 'Alerts on for new episodes', muted: 'Muted: no alerts for this show', bell: m.status === 'NOT_YET_RELEASED' ? 'We\'ll tell you when episode 1 is out' : 'We\'ll tell you when the next episode is out', off: 'Alerts off' }[notify]);
        paintActions();
      } catch (e) { toast(e.message); b.disabled = false; }
    });
    $$('.add-list').forEach(b => b.onclick = () => saveEntry({ status: 'PLANNING' }));
    $$('.status-btn').forEach(b => b.onclick = () => openSheet({ title: titleOf(m), items: [
      entry ? 'Move to' : 'Add to',
      ...Object.entries(STATUS).map(([k, v]) => ({ label: v, checked: entry?.status === k, onClick: () => (entry?.status === k ? null : saveEntry({ status: k })) })),
      ...(entry ? ['More',
        { label: 'Progress, score & notes', icon: I.list, onClick: () => $('#list-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }) },
        { label: 'Remove from list', icon: I.trash, danger: true, onClick: () => (confirm(`Remove ${titleOf(m)} from your lists?`) ? saveEntry({ status: null }) : null) }] : []),
    ] }));
  }

  // Episode list: one column, Netflix-style. Long shows are split into ranges of 100;
  // titles/synopses/thumbnails load per range from /episode-details.
  const RANGE = 100;
  const details = {};
  const loadedRanges = new Set();
  let rangeIdx = null;
  const ranges = () => {
    const out = [];
    for (let i = 0; i < episodes.length; i += RANGE) out.push(episodes.slice(i, i + RANGE));
    return out;
  };

  async function loadDetails(list) {
    const nums = list.map(num).filter(n => n !== null);
    if (!nums.length || loadedRanges.has(list[0])) return;
    loadedRanges.add(list[0]);
    try {
      const r = await api(`/api/media/${id}/episode-details?start=${Math.min(...nums)}&end=${Math.max(...nums)}`);
      if (stale()) return;
      Object.assign(details, r);
      paintEpisodes();
    } catch { /* details are optional */ }
  }

  function paintEpisodes() {
    const box = $('#eps');
    if (!episodes.length) { box.innerHTML = '<div class="empty">No episodes are available yet.</div>'; return; }
    const all = ranges();
    const up = nextUp();
    if (rangeIdx === null) rangeIdx = Math.max(0, all.findIndex(c => up && c.includes(up.ep)));
    const list = all[rangeIdx] || all[0];
    const fallbackImg = bannerOf(m);
    const picker = all.length > 1 ? `<div class="ep-range"><select id="eprange" aria-label="Episode range">${all.map((c, i) =>
      `<option value="${i}" ${i === rangeIdx ? 'selected' : ''}>Episodes ${esc(c[0])}–${esc(c[c.length - 1])}</option>`).join('')}</select></div>` : '';

    if (movieLike()) {
      const ep = episodes[0], done = isWatched(ep), w = watch[ep];
      const pct = w && !w.completed && w.duration ? Math.min(100, w.position / w.duration * 100) : 0;
      box.innerHTML = `<div class="movie-row">${m.duration ? `<span class="chip">${m.duration >= 60 ? `${Math.floor(m.duration / 60)}h ` : ''}${m.duration % 60}m</span>` : ''}
        ${pct ? `<span class="faint">${esc(clock(w.duration - w.position))} left</span>` : ''}
        <button class="btn small ${done ? 'watched' : 'ghost'} tick" data-ep="${esc(ep)}" aria-pressed="${done}">${I.check}${done ? 'Watched' : 'Mark watched'}</button></div>`;
    } else box.innerHTML = `${picker}<div class="eplist">${list.map(ep => {
      const w = watch[ep], done = isWatched(ep), info = details[ep] || {};
      const pct = w && !w.completed && w.duration ? Math.min(100, w.position / w.duration * 100) : 0;
      const isNext = up && up.ep === ep && !up.again;
      const fill = fillerMap[Math.trunc(num(ep))];
      const mins = info.length ? `${info.length}m` : w?.duration ? `${Math.round(w.duration / 60)}m` : '';
      const status = done ? 'Watched' : pct ? `${clock(w.duration - w.position)} left` : '';
      const href = `#/watch/${id}/${encodeURIComponent(ep)}`;
      const title = info.title && !/^episode\s+\d+$/i.test(info.title) ? info.title : `Episode ${ep}`;
      return `<article class="eprow ${done ? 'done' : ''} ${isNext ? 'next' : ''} ${fill === 'filler' ? 'is-filler' : ''}">
        <a class="ep-thumb" href="${href}" aria-label="Play episode ${esc(ep)}">
          <img loading="lazy" src="${esc(info.thumbnail || fallbackImg)}" alt="" class="${info.thumbnail ? '' : 'fallback'}">
          <span class="ep-play">${I.play}</span>
          ${mins ? `<span class="ep-len">${esc(mins)}</span>` : ''}
          ${pct ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}
        </a>
        <div class="ep-head">
          <div class="ep-title"><span class="ep-num">${esc(ep)}</span>${esc(title)}</div>
          <div class="ep-meta">${isNext ? '<span class="ep-tag">Up next</span>' : ''}${fill ? `<span class="fill-tag ${fill}">${fill === 'filler' ? 'Filler' : 'Part filler'}</span>` : ''}${cachedEps.has(ep) ? '<span class="saved-tag" title="Kept on the server: starts instantly">Saved</span>' : ''}${status ? `<span>${esc(status)}</span>` : ''}</div>
        </div>
        ${info.description ? `<p class="ep-desc">${esc(info.description)}</p>` : ''}
        <div class="ep-actions">
          <a class="btn small primary" href="${href}">${I.play}${pct ? 'Resume' : done ? 'Rewatch' : 'Play'}</a>
          <button class="btn small ${done ? 'watched' : 'ghost'} tick" data-ep="${esc(ep)}" aria-pressed="${done}">${I.check}${done ? 'Watched' : 'Mark watched'}</button>
        </div>
      </article>`;
    }).join('')}</div>`;

    const sel = $('#eprange', box);
    if (sel) sel.onchange = () => { rangeIdx = +sel.value; paintEpisodes(); box.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
    $$('.ep-desc', box).forEach(p => p.onclick = () => p.classList.toggle('open'));
    $$('.tick', box).forEach(b => b.onclick = async () => {
      const ep = b.dataset.ep, watched = !isWatched(ep);
      b.disabled = true;
      try {
        const r = await api('/api/watched', { method: 'POST', body: { anilist_id: id, episode: ep, watched } });
        entry = r.entry;
        watch[ep] = { ...(watch[ep] || { episode: ep, position: 0, duration: 0 }), completed: watched ? 1 : 0, position: 0 };
        paintEpisodes(); paintActions(); paintList();
      } catch (e) { toast(e.message); b.disabled = false; }
    });
    if (!movieLike()) loadDetails(list);
  }

  const choose = () => openPicker(m, async picked => {
    const r = await api(`/api/media/${id}/mapping`, { method: 'PUT', body: picked });
    episodes = r.episodes; rangeIdx = null; paintSource(r.mapping); paintEpisodes(); paintActions();
  });

  function paintSource(mapping) {
    const info = $('#source-info');
    if (!mapping) {
      info.innerHTML = `<div class="note-box">Couldn't match this show on the stream source automatically.
        <button class="linkish" id="pick">Choose it manually</button></div>`;
    } else {
      info.innerHTML = `Source: ${esc(mapping.source_title)}${mapping.verified === 0 ? ' · matched by title' : ''}
        · <button class="linkish" id="pick">Wrong show?</button>`;
    }
    $('#pick').onclick = choose;
  }

  async function loadEpisodes() {
    try {
      const r = await api(`/api/media/${id}/episodes`);
      if (stale()) return;
      episodes = r.episodes;
      cachedEps = new Set(r.cached || []);
      paintSource(r.mapping);
      paintEpisodes();
      if (episodes.length >= 40) loadFiller();
    } catch (e) {
      if (stale()) return;
      episodes = [];
      $('#eps').innerHTML = errorBox(e);
    }
    paintActions();
    if (pick && !stale()) {
      history.replaceState(null, '', `#/show/${id}`);
      choose();
    }
  }

  // list editor
  async function saveEntry(patch) {
    try {
      const body = entry ? { status: entry.status, ...patch } : { status: 'PLANNING', ...patch };
      const r = await api(`/api/list/${id}`, { method: 'PUT', body });
      entry = r.entry;
      api(`/api/media/${id}`).then(x => { notify = x.notify; paintActions(); }).catch(() => {});
      toast(entry ? `Saved · ${STATUS[entry.status]}` : 'Removed from your list');
      paintList(); paintActions(); paintSeasons(); if (episodes) paintEpisodes();
    } catch (e) { toast(e.message); }
  }

  function paintList() {
    const p = $('#list-panel');
    const total = m.episodes || '?';
    p.innerHTML = `<h3>My list</h3>
      <div class="field"><label for="st">Status</label>
        <select id="st"><option value="">Not on my list</option>
          ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${entry?.status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select></div>
      ${entry ? `<div class="two">
        <div class="field"><label for="pr">Episodes watched</label>
          <input type="number" id="pr" min="0" ${m.episodes ? `max="${m.episodes}"` : ''} value="${entry.progress}" inputmode="numeric"></div>
        <div class="field"><label for="sc">Score (0–10)</label>
          <input type="number" id="sc" min="0" max="10" step="0.5" value="${entry.score || ''}" inputmode="decimal" placeholder="–"></div>
      </div>
      <div class="faint" style="font-size:12.5px;margin-top:-4px">${entry.progress} of ${total} episodes</div>
      <div class="field"><label for="nt">Notes</label><textarea id="nt" placeholder="Private notes">${esc(entry.notes)}</textarea></div>` : ''}`;
    $('#st').onchange = e => saveEntry({ status: e.target.value || null });
    if (entry) {
      $('#pr').onchange = e => saveEntry({ progress: parseInt(e.target.value || '0', 10) });
      $('#sc').onchange = e => saveEntry({ score: parseFloat(e.target.value || '0') });
      $('#nt').onchange = e => saveEntry({ notes: e.target.value });
    }
  }

  paintList();
  paintActions();
  loadEpisodes();
}

function openPicker(m, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `<div class="panel" role="dialog" aria-label="Choose source">
    <h3>Pick the right show</h3>
    <p class="muted" style="margin:0;font-size:14px">Search the stream source and choose the entry that matches “${esc(titleOf(m))}”.</p>
    <div class="searchbar" style="margin:0">${I.search}<input type="search" id="pq" value="${esc(m.title?.romaji || titleOf(m))}"></div>
    <div id="pr-list" style="display:flex;flex-direction:column;gap:8px"></div>
    <button class="btn ghost" id="pc">Cancel</button></div>`;
  document.body.appendChild(wrap);
  const close = () => { wrap.remove(); window.removeEventListener('hashchange', close); };
  window.addEventListener('hashchange', close);
  wrap.onclick = e => { if (e.target === wrap) close(); };
  $('#pc', wrap).onclick = close;
  const list = $('#pr-list', wrap), input = $('#pq', wrap);
  let timer;
  const run = async () => {
    list.innerHTML = spinner();
    try {
      const items = await api(`/api/source/search?q=${encodeURIComponent(input.value)}`);
      list.innerHTML = items.length ? items.map(it => `<div class="pick" data-id="${esc(it.id)}" data-title="${esc(it.title)}">
          <span>${esc(it.title)}</span><span class="faint" style="font-size:12px">${esc(it.id)}</span></div>`).join('')
        : '<div class="empty">Nothing found. Try another title.</div>';
      $$('.pick', list).forEach(el => el.onclick = async () => {
        el.classList.add('on');
        try { await onPick({ source_id: el.dataset.id, source_title: el.dataset.title }); close(); toast('Source updated'); }
        catch (e) { toast(e.message); }
      });
    } catch (e) { list.innerHTML = errorBox(e); }
  };
  input.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 400); };
  run();
}

// ---------- watch ----------
async function viewWatch(stale, id, ep, modeParam) {
  $view.innerHTML = `<div class="player-wrap" id="pw"><div class="player-ph"><div class="spinner"></div></div></div>
    <div class="watch-bar"><div class="title">
      <a class="icon-btn" href="#/show/${id}" aria-label="Back to show" style="background:var(--surface-2)">${I.back}</a>
      <div style="min-width:0"><h1 id="wt">Loading…</h1><div class="sub" id="ws">Episode ${esc(ep)}</div></div></div>
      <div class="actions" id="wa"></div></div>
    <div class="watch-note" id="wn"></div>
    <div class="watch-more" id="wmore"></div>`;
  let player = null;
  cleanup = () => { player?.destroy(); document.title = 'Aniwhere'; };
  const request = fresh => api('/api/play', { method: 'POST', body: { anilist_id: id, episode: ep, mode: modeParam || null, fresh } });

  // Smart recovery: one automatic retry with fresh links, then a panel with every way out.
  function showRecovery(message) {
    if (stale()) return;
    player?.destroy();
    player = null;
    $('#wt').textContent = $('#wt').textContent === 'Loading…' ? 'Couldn\'t load this episode' : $('#wt').textContent;
    $('#pw').innerHTML = `<div class="recover"><div class="recover-card">
      <h2>Episode ${esc(ep)} won't play</h2><p class="muted">${esc(message)}</p>
      <div class="actions">
        <button class="btn primary" id="rv-retry">Retry</button>
        <button class="btn" id="rv-mode">Switch Sub/Dub</button>
        <button class="btn" id="rv-upd">Update ani-cli</button>
        <a class="btn ghost" href="#/show/${id}?pick=1">Wrong show?</a>
      </div></div></div>`;
    const busy = async (btn, fn) => { $$('.recover button').forEach(b => { b.disabled = true; }); btn.textContent += '…'; try { await fn(); } catch (e) { toast(e.message); route(); } };
    $('#rv-retry').onclick = e => busy(e.target, () => start(true));
    $('#rv-mode').onclick = e => busy(e.target, async () => {
      const cur = (await api(`/api/media/${id}`)).mode;
      const other = cur === 'dub' ? 'sub' : 'dub';
      await api(`/api/media/${id}/mode`, { method: 'PUT', body: { mode: other } });
      toast(`Trying ${other === 'dub' ? 'dubbed' : 'subtitled'}`);
      modeParam = other;
      await start(true);
    });
    $('#rv-upd').onclick = e => busy(e.target, async () => {
      const r = await api('/api/system/update', { method: 'POST' });
      toast(`ani-cli is on version ${r.version}`);
      await start(true);
    });
  }

  async function start(fresh) {
    $('#pw').innerHTML = '<div class="player-ph"><div class="spinner"></div></div>';
    let d;
    try {
      d = await request(fresh);
    } catch (e) {
      if (stale()) return;
      if (offline) { showRecovery(e.message); return; }
      if (fresh) { showRecovery(e.message); return; }
      await sleep(1200); // automatic retry, with freshly resolved links
      if (stale()) return;
      try { d = await request(true); } catch (e2) { showRecovery(e2.message); return; }
    }
    if (stale()) return;
    const m = d.media;
    setAccent(m.coverImage?.color);
    document.title = `${titleOf(m)} · E${ep}`;
    $('#wt').textContent = titleOf(m);
    $('#ws').textContent = `${m.format === 'MOVIE' ? 'Movie' : `Episode ${ep}`} · ${d.mode === 'dub' ? 'Dub' : 'Sub'}${d.cached ? ' · from the server' : ''}`;
    $('#wn').innerHTML = d.fell_back ? '<div class="note-box">No dub for this episode yet, so it\'s playing subtitled.</div>' : '';
    $('#wa').innerHTML = `
      ${d.prev ? `<a class="btn small ghost" href="#/watch/${id}/${encodeURIComponent(d.prev)}">${I.prev}Prev</a>` : ''}
      <div class="seg"><button data-mode="sub" class="${d.mode === 'sub' ? 'on' : ''}">Sub</button><button data-mode="dub" class="${d.mode === 'dub' ? 'on' : ''}">Dub</button></div>
      ${d.next ? `<a class="btn small" href="#/watch/${id}/${encodeURIComponent(d.next)}">Next${I.next}</a>`
        : d.next_season ? `<a class="btn small" href="#/watch/${d.next_season.id}/1">Next season${I.next}</a>` : ''}`;
    $$('#wa .seg button').forEach(b => b.onclick = async () => {
      if (b.dataset.mode === d.mode) return;
      await api(`/api/media/${id}/mode`, { method: 'PUT', body: { mode: b.dataset.mode } }).catch(() => {});
      route();
    });
    player?.destroy();
    player = mountPlayer($('#pw'), { data: d, id, ep, reload: () => request(true), fail: showRecovery });
    paintMore(m);
  }

  // Below the player: this episode's synopsis and the show's episode list, current one highlighted.
  async function paintMore(m) {
    const box = $('#wmore');
    const n = num(ep);
    let eps, info = {}, detail;
    try {
      [eps, detail] = await Promise.all([api(`/api/media/${id}/episodes`), api(`/api/media/${id}`)]);
      if (n !== null) {
        const start = Math.max(1, n - 15);
        info = await api(`/api/media/${id}/episode-details?start=${start}&end=${start + 60}`).catch(() => ({}));
      }
    } catch { return; }
    if (stale() || !box) return;
    const list = eps.episodes || [];
    const watch = detail.watch || {}, entry = detail.entry;
    const cur = info[ep] || {};
    const about = cur.description || (m.format === 'MOVIE' || list.length <= 1 ? cleanDesc(m.description) : '');
    const idx = list.indexOf(ep);
    const before = matchMedia('(max-width: 760px)').matches ? 1 : 15; // phones: no inner scroll box, so start just above the current episode
    const shown = list.length > 1 ? list.slice(Math.max(0, idx - before), Math.max(0, idx - before) + 60) : [];
    box.innerHTML = `${about || cur.title ? `<section class="about-ep">
        ${cur.title && !/^episode\s+\d+$/i.test(cur.title) ? `<h2>${esc(cur.title)}</h2>` : ''}
        ${about ? `<p class="desc clamp" id="wdesc">${esc(about)}</p>` : ''}</section>` : ''}
      ${shown.length ? `<section class="section"><div class="section-head"><h2>Episodes</h2>
        <a class="linkish" href="#/show/${id}">All episodes &amp; details</a></div>
        <div class="wlist">${shown.map(e => {
          const i = info[e] || {}, w = watch[e];
          const done = !!w?.completed || (num(e) !== null && entry && num(e) <= entry.progress);
          const pct = w && !w.completed && w.duration ? Math.min(100, w.position / w.duration * 100) : 0;
          const title = i.title && !/^episode\s+\d+$/i.test(i.title) ? i.title : `Episode ${e}`;
          return `<a class="wrow ${e === ep ? 'on' : ''} ${done ? 'done' : ''}" href="#/watch/${id}/${encodeURIComponent(e)}" ${e === ep ? 'aria-current="true"' : ''}>
            <span class="wthumb"><img loading="lazy" src="${esc(i.thumbnail || bannerOf(m))}" alt="" class="${i.thumbnail ? '' : 'fallback'}">
              ${pct ? `<span class="bar"><i style="width:${pct}%"></i></span>` : ''}</span>
            <span class="wtext"><strong><span class="ep-num">${esc(e)}</span>${esc(title)}</strong>
              <small>${e === ep ? 'Now playing' : done ? 'Watched' : pct ? `${clock(w.duration - w.position)} left` : i.length ? `${i.length}m` : ''}</small></span></a>`;
        }).join('')}</div></section>` : ''}`;
    const p = $('#wdesc', box);
    if (p && p.scrollHeight > p.clientHeight + 4) {
      p.insertAdjacentHTML('afterend', '<button class="linkish" id="wdmore">Show more</button>');
      $('#wdmore', box).onclick = e => { p.classList.toggle('clamp'); e.target.textContent = p.classList.contains('clamp') ? 'Show more' : 'Show less'; };
    }
    const on = $('.wrow.on', box);
    const lst = $('.wlist', box);
    if (on && lst) lst.scrollTop = on.offsetTop - lst.offsetTop - 8;
  }

  await start(false);
}

// ---------- collections ----------
const skCollections = (n = 8) => `<div class="cgrid">${Array.from({ length: n }, () =>
  '<div class="ccard"><div class="ccovers sk"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div></div>').join('')}</div>`;

async function viewCollections(stale, keepScroll) {
  if (!keepScroll) $view.innerHTML = `<h1 class="page-title">Collections</h1>${skCollections()}`;
  const d = await api('/api/collections');
  if (stale()) return;
  let tab = store.get('collectionsTab', 'all');
  const render = () => {
    const tabs = [['all', 'All'], ['franchise', 'Franchises'], ['studio', 'Studios']].map(([k, v]) =>
      `<a href="#/collections" data-tab="${k}" class="${tab === k ? 'on' : ''}">${v}</a>`).join('');
    let html = `<h1 class="page-title">Collections</h1><div class="tabs">${tabs}</div>`;
    if (d.building && d.franchises.length < 10) {
      html += '<div class="note-box" style="margin-bottom:18px">Collections are being put together from AniList. The first time takes a few minutes; pull down or come back shortly to see more.</div>';
    }
    if (tab === 'all' && d.recommended.length) {
      html += section('Recommended for you', d.recommended.map(collectionCard).join(''), 'row crow-row');
    }
    if (tab !== 'studio' && d.franchises.length) {
      html += `<section class="section"><div class="section-head"><h2>${tab === 'all' ? 'Most popular franchises' : 'Franchises'}</h2></div>
        <div class="cgrid">${d.franchises.slice(0, tab === 'all' ? 24 : 60).map(collectionCard).join('')}</div>
        ${tab === 'all' && d.franchises.length > 24 ? '<div class="center"><button class="btn" data-more="franchise">See all franchises</button></div>' : ''}</section>`;
    }
    if (tab !== 'franchise' && d.studios.length) {
      html += `<section class="section"><div class="section-head"><h2>Studios</h2></div>
        <div class="cgrid">${d.studios.slice(0, tab === 'all' ? 12 : 30).map(collectionCard).join('')}</div>
        ${tab === 'all' && d.studios.length > 12 ? '<div class="center"><button class="btn" data-more="studio">See all studios</button></div>' : ''}</section>`;
    }
    if (!d.franchises.length && !d.studios.length && !d.building) html += '<div class="empty">No collections yet.</div>';
    $view.innerHTML = html;
    $$('.tabs a[data-tab]').forEach(a => a.onclick = e => { e.preventDefault(); tab = a.dataset.tab; store.set('collectionsTab', tab); render(); });
    $$('[data-more]').forEach(b => b.onclick = () => { tab = b.dataset.more; store.set('collectionsTab', tab); render(); window.scrollTo(0, 0); });
  };
  render();
}

const COLLECTION_GROUPS = [
  ['Series', m => ['TV', 'TV_SHORT', 'ONA'].includes(m.format)],
  ['Movies', m => m.format === 'MOVIE'],
  ['OVAs & specials', m => ['OVA', 'SPECIAL'].includes(m.format)],
  ['Other', () => true],
];

async function viewCollection(stale, key, keepScroll) {
  if (!keepScroll) $view.innerHTML = `${sk.show().split('<div class="show-cols">')[0]}${sk.grid(12)}`;
  const d = await api(`/api/collections/${encodeURIComponent(key)}`);
  if (stale()) return;
  let items = d.items, entries = d.entries, page = 1, hasMore = d.has_more;
  // watch order (franchises): release groups, the story-order guide, or your own order
  let mode = d.order?.mode || 'release', custom = d.order?.custom || null, editing = null;
  const byId = Object.fromEntries(items.map(m => [m.id, m]));
  const ordered = () => (mode === 'story' && d.story ? d.story.ids : mode === 'custom' && custom ? custom : null)?.filter(i => byId[i]);
  const lead = [...items].sort((a, b) => (b.bannerImage ? 1 : 0) - (a.bannerImage ? 1 : 0))[0];
  setAccent(lead?.coverImage?.color);
  const card = m => {
    const e = entries[m.id];
    return posterCard(m, { badge: e ? `<span class="badge status">${esc(STATUS[e.status])}</span>` : '' });
  };

  async function saveOrder(newMode, ids) {
    try { await api(`/api/collections/${encodeURIComponent(key)}/order`, { method: 'PUT', body: { mode: newMode, ids } }); }
    catch (e) { toast(e.message); }
  }
  function wireOrder() {
    $$('.order-bar .seg button').forEach(b => b.onclick = () => {
      mode = b.dataset.mode;
      if (mode === 'custom' && !custom) editing = (d.story?.ids || items.filter(m => (d.main || []).includes(m.id) || ['TV', 'TV_SHORT', 'ONA', 'MOVIE'].includes(m.format)).map(m => m.id)).filter(i => byId[i]);
      saveOrder(mode);
      render();
    });
    const ed = $('#oedit');
    if (ed) ed.onclick = () => { editing = [...(custom || d.story?.ids || items.map(m => m.id))].filter(i => byId[i]); render(); };
    const list = $('#olist');
    if (!list) return;
    const move = (from, to) => {
      if (to < 0 || to >= editing.length) return;
      const [x] = editing.splice(from, 1);
      editing.splice(to, 0, x);
      render();
      $(`.orow[data-id="${x}"]`)?.scrollIntoView({ block: 'nearest' });
    };
    $$('.orow', list).forEach((row, n) => {
      $('.oup', row).onclick = () => move(n, n - 1);
      $('.odown', row).onclick = () => move(n, n + 1);
      $('.oout', row).onclick = () => { editing.splice(n, 1); render(); };
      row.ondragstart = e => { e.dataTransfer.setData('text/plain', String(n)); row.classList.add('dragging'); };
      row.ondragend = () => row.classList.remove('dragging');
      row.ondragover = e => { e.preventDefault(); row.classList.add('over'); };
      row.ondragleave = () => row.classList.remove('over');
      row.ondrop = e => { e.preventDefault(); move(+e.dataTransfer.getData('text/plain'), n); };
    });
    // touch: drag by the handle
    $$('.ohandle', list).forEach((h, n) => {
      h.ontouchstart = () => { h.closest('.orow').classList.add('dragging'); };
      h.ontouchmove = e => { e.preventDefault(); };
      h.ontouchend = e => {
        const t = e.changedTouches[0];
        const over = document.elementFromPoint(t.clientX, t.clientY)?.closest('.orow');
        h.closest('.orow').classList.remove('dragging');
        if (over) move(n, $$('.orow', list).indexOf(over));
      };
    });
    $$('.oadd').forEach(b => b.onclick = () => { editing.push(+b.dataset.id); render(); });
    $('#ocancel').onclick = () => { editing = null; if (!custom) mode = d.story ? 'story' : 'release'; render(); };
    $('#osave').onclick = async () => {
      custom = [...editing]; editing = null; mode = 'custom';
      await saveOrder('custom', custom);
      toast('Your order is saved');
      render();
    };
  }

  function render() {
    const done = items.filter(m => entries[m.id]?.status === 'COMPLETED').length;
    const onList = items.filter(m => entries[m.id]).length;
    // "Up next": the first series or movie in release order you haven't completed
    const mainSet = d.main ? new Set(d.main) : null;
    const isMain = m => (mainSet ? mainSet.has(m.id) : ['TV', 'TV_SHORT', 'ONA', 'MOVIE'].includes(m.format));
    const order = ordered();
    const pool = order ? order.map(i => byId[i]) : items.filter(isMain);
    const next = d.kind === 'franchise' && pool.find(m => m.status !== 'NOT_YET_RELEASED' && entries[m.id]?.status !== 'COMPLETED');
    const counts = { series: 0, movies: 0, other: 0 };
    items.forEach(m => { counts[COLLECTION_GROUPS[0][1](m) ? 'series' : m.format === 'MOVIE' ? 'movies' : 'other']++; });
    let body;
    const switcher = d.kind === 'franchise' ? `<div class="order-bar"><div class="seg" role="group" aria-label="Watch order">
        <button data-mode="release" class="${mode === 'release' ? 'on' : ''}">Release order</button>
        ${d.story ? `<button data-mode="story" class="${mode === 'story' ? 'on' : ''}">Story order</button>` : ''}
        <button data-mode="custom" class="${mode === 'custom' ? 'on' : ''}">My order</button></div>
        ${mode === 'story' && d.story ? '<span class="faint">The order most watch guides recommend</span>' : ''}
        ${mode === 'custom' && !editing ? `<button class="btn small" id="oedit">${custom ? 'Edit my order' : 'Make my order'}</button>` : ''}</div>` : '';
    if (editing) {
      // reorder: drag rows (mouse/touch) or use the arrows; "Leave out" moves a title below the line
      body = `<section class="section"><div class="section-head"><h2>Your order</h2>
          <div class="actions"><button class="btn small ghost" id="ocancel">Cancel</button><button class="btn small primary" id="osave">Save order</button></div></div>
        <ol class="olist" id="olist">${editing.map((i, n) => `<li class="orow" data-id="${i}" draggable="true">
          <span class="ohandle" aria-hidden="true">⋮⋮</span><span class="onum">${n + 1}</span>
          <img src="${esc(byId[i].coverImage?.large || coverOf(byId[i]))}" alt=""><span class="otitle">${esc(titleOf(byId[i]))}<small>${esc(metaLine(byId[i]))}</small></span>
          <button class="icon-btn plain oup" aria-label="Move up">${I.back}</button><button class="icon-btn plain odown" aria-label="Move down">${I.back}</button>
          <button class="icon-btn plain oout" aria-label="Leave out of your order">${I.x}</button></li>`).join('')}</ol>
        ${items.some(m => !editing.includes(m.id)) ? `<h3 class="sub-h" style="margin-top:18px">Not in your order</h3><div class="ochips">${items.filter(m => !editing.includes(m.id))
          .map(m => `<button class="fchip oadd" data-id="${m.id}">+ ${esc(titleOf(m))}</button>`).join('')}</div>` : ''}</section>`;
    } else if (order) {
      const rest = items.filter(m => !order.includes(m.id));
      body = `${switcher}<section class="section"><ol class="ogrid">${order.map((i, n) => `<li><span class="onum big">${n + 1}</span>${card(byId[i])}</li>`).join('')}</ol></section>
        ${rest.length ? `<section class="section"><div class="section-head"><h2>Not in this order <span class="faint">${rest.length}</span></h2>
          <span class="faint">Spin-offs, recaps and alternate versions</span></div><div class="grid">${rest.map(card).join('')}</div></section>` : ''}`;
    } else if (d.kind === 'franchise') {
      const used = new Set();
      const groups = mainSet ? [['Main story', isMain], ['Spin-offs & side stories', COLLECTION_GROUPS[0][1]], ...COLLECTION_GROUPS.slice(1)]
        : COLLECTION_GROUPS;
      body = groups.map(([label, test]) => {
        const group = items.filter(m => !used.has(m.id) && test(m));
        group.forEach(m => used.add(m.id));
        return group.length ? `<section class="section"><div class="section-head"><h2>${label} <span class="faint">${group.length}</span></h2></div>
          <div class="grid">${group.map(card).join('')}</div></section>` : '';
      }).join('');
      body = switcher + body;
    } else {
      body = `<section class="section"><div class="grid" id="cgrid">${items.map(card).join('')}</div>
        ${hasMore ? '<div class="center"><button class="btn" id="cmore">Load more</button></div>' : ''}</section>`;
    }
    $view.innerHTML = `
      <div class="show-hero coll-hero">
        <button class="icon-btn back-btn" id="back" aria-label="Back">${I.back}</button>
        <div class="bg" style="background-image:url('${esc(bannerOf(lead))}')"></div>
        <div class="coll-top">
          <div class="eyebrow">${d.kind === 'studio' ? 'Studio' : 'Franchise'}</div>
          <h1>${esc(d.name)}</h1>
          <div class="chips">${[`${items.length}${hasMore ? '+' : ''} titles`, counts.series ? `${counts.series} series` : '',
            counts.movies ? `${counts.movies} movies` : '', counts.other ? `${counts.other} OVAs, specials & more` : '']
            .filter(Boolean).map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>
          ${onList ? `<div class="coll-progress"><div class="pbar"><i style="width:${done / items.length * 100}%"></i></div>
            <span>${done} of ${items.length} completed · ${onList} on your lists</span></div>` : ''}
          <div class="actions">
            ${next ? `<a class="btn primary" href="#/show/${next.id}">${I.play}${entries[next.id] ? 'Continue with' : 'Start with'} ${esc(titleOf(next))}</a>` : ''}
            ${d.kind === 'franchise' && done < items.length ? `<button class="btn" id="cdone">${I.check}Mark as watched</button>` : ''}
          </div>
        </div>
      </div>${body}`;
    $('#back').onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/collections'));
    wireOrder();
    const markBtn = $('#cdone');
    if (markBtn) markBtn.onclick = () => {
      // how many titles each choice would change: released, and not already completed
      const todo = main => items.filter(m => (!main || isMain(m))
        && !['RELEASING', 'NOT_YET_RELEASED'].includes(m.status) && entries[m.id]?.status !== 'COMPLETED').length;
      const airing = items.filter(m => ['RELEASING', 'NOT_YET_RELEASED'].includes(m.status)).length;
      const run = async scope => {
        const n = todo(scope === 'main');
        if (!n) { toast('Nothing left to mark'); return; }
        if (!confirm(`Mark ${n} title${n > 1 ? 's' : ''} in ${d.name} as Completed? Scores and notes are kept.`)) return;
        markBtn.disabled = true;
        const r = await api(`/api/collections/${encodeURIComponent(key)}/complete`, { method: 'POST', body: { scope } });
        entries = r.entries;
        toast(`Marked ${r.changed} as completed${r.skipped.length ? ` · skipped ${r.skipped.length} still airing` : ''}`);
        render();
      };
      const r = markBtn.getBoundingClientRect();
      openSheet({ title: `Mark ${d.name} as watched`, sub: airing ? `${airing} still airing or upcoming will be skipped` : '',
        at: { x: r.left, y: r.bottom + 6 }, items: [
          { label: 'Everything', sub: `${todo(false)} titles, including OVAs & specials`, icon: I.check, onClick: () => run('all') },
          { label: mainSet ? 'Main story only' : 'Series & movies only', sub: `${todo(true)} titles${mainSet ? ', no spin-offs or recaps' : ''}`, icon: I.check, onClick: () => run('main') },
        ] });
    };
    const more = $('#cmore');
    if (more) more.onclick = async () => {
      more.disabled = true;
      try {
        const r = await api(`/api/collections/${encodeURIComponent(key)}?page=${page + 1}`);
        page++; hasMore = r.has_more;
        items = items.concat(r.items); Object.assign(entries, r.entries);
        render();
      } catch (e) { toast(e.message); more.disabled = false; }
    };
  }
  render();
}

// ---------- lists ----------
const LIST_SORTS = {
  updated: ['Recently updated', (a, b) => b.updated_at - a.updated_at],
  title: ['Title A–Z', (a, b) => titleOf(a.media).localeCompare(titleOf(b.media))],
  mine: ['My score', (a, b) => (b.score || 0) - (a.score || 0)],
  anilist: ['AniList score', (a, b) => (b.media.averageScore || 0) - (a.media.averageScore || 0)],
  fresh: ['New episodes', (a, b) => newCount(b) - newCount(a)],
};
const newCount = it => (it.available && ['CURRENT', 'REPEATING'].includes(it.status) ? Math.max(0, Math.round(it.available - it.progress)) : 0);

function listTabs(counts, current) {
  return `<div class="tabs">${Object.entries(STATUS).map(([k, v]) =>
    `<a href="#/lists/${k}" class="${k === current ? 'on' : ''}">${v}<span>${counts[k] || 0}</span></a>`).join('')}
    <a href="#/lists/HISTORY" class="${current === 'HISTORY' ? 'on' : ''}">${I.clock}History</a>
    <a href="#/lists/STATS" class="${current === 'STATS' ? 'on' : ''}">${I.star}Stats</a></div>`;
}

async function viewLists(stale, status, keepScroll) {
  if (status === 'HISTORY') return viewHistory(stale, keepScroll);
  if (status === 'STATS') return viewStats(stale, keepScroll);
  if (!keepScroll) $view.innerHTML = `<h1 class="page-title">My lists</h1><div class="tabs">${Object.values(STATUS).map(() => '<span class="chip sk" style="width:110px;height:36px"></span>').join('')}</div>${sk.grid(12)}`;
  const items = await api('/api/lists');
  if (stale()) return;
  const counts = {};
  items.forEach(it => { counts[it.status] = (counts[it.status] || 0) + 1; });
  const all = items.filter(it => it.status === status);
  let sort = store.get(`listSort.${status}`, 'updated');
  if (!LIST_SORTS[sort]) sort = 'updated';
  let view = store.get('listView', 'grid');
  let filter = '';

  $view.innerHTML = `<h1 class="page-title">My lists</h1>${listTabs(counts, status)}
    ${all.length ? `<div class="list-tools">
      <div class="searchbar small">${I.search}<input type="search" id="lf" placeholder="Filter ${esc(STATUS[status].toLowerCase())}" autocomplete="off"></div>
      <select id="ls" aria-label="Sort">${Object.entries(LIST_SORTS).map(([k, [label]]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>${label}</option>`).join('')}</select>
      <div class="seg" role="group" aria-label="View"><button data-view="grid" aria-label="Poster grid">${I.grid}</button><button data-view="rows" aria-label="Compact rows">${I.rows}</button></div>
    </div>` : ''}
    <div id="lout"></div>`;

  function paint() {
    const out = $('#lout');
    if (!all.length) {
      out.innerHTML = `<div class="empty">Nothing here yet.${status === 'CURRENT' ? ' Shows you start watching appear here automatically.' : ''}</div>`;
      return;
    }
    $$('.list-tools .seg button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
    const f = filter.trim().toLowerCase();
    const shown = all.filter(it => !f || [it.media.title?.english, it.media.title?.romaji, it.media.title?.native]
      .some(t => t && t.toLowerCase().includes(f))).sort(LIST_SORTS[sort][1]);
    if (!shown.length) { out.innerHTML = '<div class="empty">No shows match that filter.</div>'; return; }
    if (view === 'rows') {
      out.innerHTML = `<div class="clist">${shown.map(it => {
        const m = it.media, total = m.episodes || 0, fresh = newCount(it);
        const pct = total ? Math.min(100, it.progress / total * 100) : 0;
        return `<a class="crow" href="#/show/${m.id}" data-id="${m.id}" data-title="${esc(titleOf(m))}">
          <div class="crow-img"><img loading="lazy" src="${esc(m.coverImage?.large || coverOf(m))}" alt=""></div>
          <div class="crow-body"><div class="crow-t">${esc(titleOf(m))}${fresh ? `<span class="badge inline">${fresh} new</span>` : ''}</div>
            <div class="crow-m">${esc(metaLine(m))}</div>
            <div class="crow-p"><div class="pbar"><i style="width:${pct}%"></i></div><span>${it.progress} / ${total || '?'}</span></div></div>
          <div class="crow-s">${it.score ? `★ ${it.score}` : '<span class="faint">–</span>'}</div>
          <button class="icon-btn plain card-more" aria-label="More options">${I.more}</button></a>`;
      }).join('')}</div>`;
    } else {
      out.innerHTML = `<div class="grid">${shown.map(it => {
        const fresh = newCount(it);
        return posterCard(it.media, {
          sub: `${it.progress} / ${it.media.episodes || '?'}${it.score ? ` · ★ ${it.score}` : ''}`,
          badge: fresh ? `<span class="badge">${fresh} new</span>` : '' });
      }).join('')}</div>`;
    }
  }
  paint();
  if (!all.length) return;
  $('#lf').oninput = e => { filter = e.target.value; paint(); };
  $('#ls').onchange = e => { sort = e.target.value; store.set(`listSort.${status}`, sort); paint(); };
  $$('.list-tools .seg button').forEach(b => b.onclick = () => { view = b.dataset.view; store.set('listView', view); paint(); });
}

// ---------- stats ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function durationText(minutes) {
  const days = Math.floor(minutes / 1440), hours = Math.round(minutes % 1440 / 60);
  return days ? `${days}d ${hours}h` : `${Math.round(minutes / 60)}h`;
}
// one-series bar charts in the accent color: values in a hover/focus tip, and a table view for each
function hbars(rows, unit) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return `<div class="hbars">${rows.map(r => `<div class="hbar" tabindex="0" data-tip="${esc(`${r.label}: ${r.value.toLocaleString()} ${unit}`)}">
      <span class="hb-label">${esc(r.label)}</span><span class="hb-track"><i style="width:${r.value / max * 100}%"></i></span>
      <span class="hb-val">${r.value.toLocaleString()}</span></div>`).join('')}</div>`;
}
function vbars(rows, unit) {
  const max = Math.max(0.1, ...rows.map(r => r.value));
  return `<div class="vbars" role="img" aria-label="${esc(rows.map(r => `${r.label} ${r.value} ${unit}`).join(', '))}">${rows.map(r =>
    `<div class="vbar" tabindex="0" data-tip="${esc(`${r.label}: ${r.value} ${unit}`)}"><span class="vb-col"><i style="height:${r.value / max * 100}%"></i></span>
      <span class="vb-label">${esc(r.short)}</span></div>`).join('')}</div>`;
}
function tableOf(rows, head) {
  return `<details class="as-table"><summary>Show as table</summary><table><thead><tr><th>${esc(head[0])}</th><th>${esc(head[1])}</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td>${r.value.toLocaleString()}</td></tr>`).join('')}</tbody></table></details>`;
}

async function viewStats(stale, keepScroll, year = 0) {
  if (!keepScroll && !year) $view.innerHTML = `<h1 class="page-title">My lists</h1>${listTabs({}, 'STATS')}<div class="tiles">${'<div class="tile sk" style="height:96px"></div>'.repeat(4)}</div>`;
  const [d, lists] = await Promise.all([api(`/api/stats${year ? `?year=${year}` : ''}`), api('/api/lists').catch(() => [])]);
  if (stale()) return;
  const counts = {};
  lists.forEach(it => { counts[it.status] = (counts[it.status] || 0) + 1; });
  const L = d.lifetime, Y = d.year;
  const months = d.months.map(m => ({ label: `${MONTHS[+m.month.slice(5) - 1]} ${m.month.slice(0, 4)}`, short: MONTHS[+m.month.slice(5) - 1], value: m.hours }));
  const genres = d.genres.map(g => ({ label: g.name, value: g.episodes }));
  const studios = d.studios.map(g => ({ label: g.name, value: g.episodes }));
  const anyActivity = d.months.some(m => m.hours > 0);
  $view.innerHTML = `<h1 class="page-title">My lists</h1>${listTabs(counts, 'STATS')}
    <div class="tiles">
      <div class="tile"><span>Episodes watched</span><strong>${L.episodes.toLocaleString()}</strong><small>across ${L.shows} shows</small></div>
      <div class="tile"><span>Time watched</span><strong>${durationText(L.minutes)}</strong><small>estimated from episode lengths</small></div>
      <div class="tile"><span>Completed</span><strong>${L.completed}</strong><small>shows and movies</small></div>
      <div class="tile"><span>Mean score</span><strong>${L.mean_score ?? '–'}</strong><small>${L.mean_score ? 'of the shows you scored' : 'score shows to see this'}</small></div>
    </div>
    <section class="section"><div class="section-head"><h2>Hours watched in this app, last 12 months</h2></div>
      ${anyActivity ? vbars(months, 'hours') + tableOf(months, ['Month', 'Hours']) : '<div class="empty small">Nothing yet. Watching episodes here fills this in.</div>'}</section>
    <div class="stat-cols">
      <section class="section"><div class="section-head"><h2>Top genres</h2><span class="faint">by episodes watched</span></div>
        ${genres.length ? hbars(genres, 'episodes') + tableOf(genres, ['Genre', 'Episodes']) : '<div class="empty small">No episodes on your lists yet.</div>'}</section>
      <section class="section"><div class="section-head"><h2>Top studios</h2><span class="faint">by episodes watched</span></div>
        ${studios.length ? hbars(studios, 'episodes') + tableOf(studios, ['Studio', 'Episodes']) : '<div class="empty small">No studio data yet.</div>'}</section>
    </div>
    <section class="section recap"><div class="section-head"><h2>Your ${Y.year} recap</h2>
        ${d.years.length > 1 ? `<select id="recap-year" aria-label="Year">${d.years.map(y => `<option ${y === Y.year ? 'selected' : ''}>${y}</option>`).join('')}</select>` : ''}</div>
      <div class="tiles small">
        <div class="tile"><span>Hours here</span><strong>${Y.hours}</strong></div>
        <div class="tile"><span>Episodes finished here</span><strong>${Y.episodes}</strong></div>
        <div class="tile"><span>Shows completed</span><strong>${Y.finished.length}</strong></div>
      </div>
      ${Y.top.length ? section('Most watched', Y.top.map(t => posterCard(t.media, { sub: `${t.episodes} episode${t.episodes > 1 ? 's' : ''}` })).join('')) : ''}
      ${Y.finished.length ? section(`Completed in ${Y.year}`, Y.finished.map(m => posterCard(m)).join('')) : ''}
    </section>`;
  const sel = $('#recap-year');
  if (sel) sel.onchange = () => viewStats(stale, true, +sel.value);
}

function dayLabel(ts) {
  const d = new Date(ts * 1000), today = new Date();
  const startOf = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

async function viewHistory(stale, keepScroll) {
  if (!keepScroll) $view.innerHTML = `<h1 class="page-title">My lists</h1>${listTabs({}, 'HISTORY')}${sk.rows()}`;
  const [first, lists] = await Promise.all([api('/api/history'), api('/api/lists').catch(() => [])]);
  if (stale()) return;
  const counts = {};
  lists.forEach(it => { counts[it.status] = (counts[it.status] || 0) + 1; });
  let items = first.items, hasMore = first.has_more;

  $view.innerHTML = `<h1 class="page-title">My lists</h1>${listTabs(counts, 'HISTORY')}<div id="hout"></div>`;
  function paint() {
    const out = $('#hout');
    if (!items.length) { out.innerHTML = '<div class="empty">Nothing watched yet. Episodes you watch show up here.</div>'; return; }
    let html = '', lastDay = '';
    for (const h of items) {
      const day = dayLabel(h.watched_at);
      if (day !== lastDay) { html += `${lastDay ? '</div>' : ''}<h2 class="day">${esc(day)}</h2><div class="clist">`; lastDay = day; }
      const m = h.media;
      const pct = h.completed ? 100 : h.duration ? Math.min(100, h.position / h.duration * 100) : 0;
      const time = new Date(h.watched_at * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      html += `<div class="crow hrow" data-hid="${h.id}">
        <a class="crow-img wide" href="#/watch/${m.id}/${encodeURIComponent(h.episode)}"><img loading="lazy" src="${esc(bannerOf(m))}" alt="">
          <span class="ep-play">${I.play}</span><div class="bar"><i style="width:${pct}%"></i></div></a>
        <a class="crow-body" href="#/watch/${m.id}/${encodeURIComponent(h.episode)}"><div class="crow-t">${esc(titleOf(m))}</div>
          <div class="crow-m">Episode ${esc(h.episode)} · ${h.completed ? 'Finished' : `Stopped at ${clock(h.position)}`} · ${esc(time)}</div></a>
        <button class="icon-btn plain h-more" aria-label="Options">${I.more}</button></div>`;
    }
    html += '</div>';
    if (hasMore) html += '<div class="center"><button class="btn" id="hmore">Load more</button></div>';
    out.innerHTML = html;
    $$('.h-more', out).forEach(b => b.onclick = () => {
      const row = b.closest('.hrow');
      const h = items.find(x => x.id === +row.dataset.hid);
      const r = b.getBoundingClientRect();
      openSheet({ title: titleOf(h.media), sub: `Episode ${h.episode}`, at: { x: r.left - 180, y: r.bottom + 4 }, items: [
        { label: h.completed ? 'Rewatch episode' : 'Resume episode', icon: I.play, onClick: () => { location.hash = `#/watch/${h.media.id}/${encodeURIComponent(h.episode)}`; } },
        { label: 'Go to show', icon: I.info, onClick: () => { location.hash = `#/show/${h.media.id}`; } },
        { label: 'Remove from history', icon: I.trash, danger: true, onClick: async () => {
          await api(`/api/history/${h.id}`, { method: 'DELETE' });
          items = items.filter(x => x.id !== h.id);
          paint();
        } },
      ] });
    });
    const moreBtn = $('#hmore', out);
    if (moreBtn) moreBtn.onclick = async () => {
      moreBtn.disabled = true;
      try {
        const r = await api(`/api/history?before=${items[items.length - 1].watched_at}`);
        items = items.concat(r.items); hasMore = r.has_more;
        paint();
      } catch (e) { toast(e.message); moreBtn.disabled = false; }
    };
  }
  paint();
}

// ---------- settings ----------
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function b64ToBytes(b64) {
  const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

async function viewSettings(stale) {
  $view.innerHTML = `<h1 class="page-title">Settings</h1><div class="settings">${Array.from({ length: 4 }, () =>
    '<section class="panel"><div class="sk sk-title"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div></section>').join('')}</div>`;
  const s = await api('/api/settings');
  if (stale()) return;
  const cb = `${location.origin}/anilist/callback`;
  const al = s.anilist;
  const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  let anilistHtml;
  if (al.connected) {
    anilistHtml = `<div class="who">${al.avatar ? `<img src="${esc(al.avatar)}" alt="">` : ''}
        <div><strong>${esc(al.name)}</strong><div class="faint" style="font-size:13px">Last synced ${ago(al.last_sync)}</div></div></div>
      <p class="muted">Your lists and progress sync both ways every 30 minutes, and right away when you change something here.</p>
      <div class="actions"><button class="btn" id="sync">Sync now</button><button class="btn ghost" id="disc">Disconnect</button></div>`;
  } else {
    anilistHtml = `<p class="muted">Connect your AniList account to sync your lists and progress.</p>
      <ol>
        <li>Open <a class="linkish" href="https://anilist.co/settings/developer" target="_blank" rel="noopener">anilist.co/settings/developer</a> and choose <em>Create New Client</em>.</li>
        <li>Use any name. Set the <em>Redirect URL</em> to <code>${esc(cb)}</code></li>
        <li>Save, then paste the <em>Client ID</em> below.</li>
      </ol>
      <div class="field"><label for="cid">Client ID</label><input type="text" id="cid" inputmode="numeric" value="${esc(al.client_id || '')}" placeholder="e.g. 12345"></div>
      <div class="actions"><button class="btn accent" id="connect">Connect AniList</button></div>`;
  }

  let pushHtml;
  if (isIOS && !isStandalone) {
    pushHtml = `<p class="muted">On iPhone, notifications only work from the home-screen app: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, open Aniwhere from there, and come back to this page.</p>`;
  } else if (!pushSupported) {
    pushHtml = '<p class="muted">This browser doesn\'t support notifications.</p>';
  } else {
    const perm = Notification.permission;
    pushHtml = `<p class="muted">Get a notification when a new episode of a show you're watching is out (in your chosen sub/dub).
        ${s.push.devices ? `${s.push.devices} device${s.push.devices > 1 ? 's' : ''} subscribed.` : ''}</p>
      ${perm === 'denied' ? `<div class="note-box">Notifications are blocked on this device. ${isIOS
        ? 'Open the iPhone <strong>Settings</strong> app → <strong>Notifications</strong> → <strong>Aniwhere</strong> and turn on <em>Allow Notifications</em>, then come back here.'
        : 'Click the icon to the left of the address bar, set <strong>Notifications</strong> to <em>Allow</em>, then reload this page.'}</div>` : ''}
      <div class="actions">${perm === 'denied' ? '' : `<button class="btn accent" id="pushon">${perm === 'granted' && s.push.devices ? 'Turn on again for this device' : 'Turn on for this device'}</button>`}
        <button class="btn ghost" id="pushtest" ${s.push.devices ? '' : 'disabled'}>Send a test</button></div>`;
  }

  const pl = s.player || { autoplay: true, autoskip: false };
  const qLock = String(store.get('quality', 'auto'));
  const sp = store.get('speed', 1);
  const toggle = (key, label, sub) => `<label class="switch-row"><span>${label}<small>${sub}</small></span>
    <input type="checkbox" class="sw-input" data-pref="${key}" ${pl[key] ? 'checked' : ''}><i class="sw"></i></label>`;

  $view.innerHTML = `<h1 class="page-title">Settings</h1>
    <div class="settings">
      <section class="panel"><h3>Profile</h3>
        <p class="muted">Signed in as <strong>${esc(s.profile?.me || '')}</strong>${s.profile?.is_owner ? ' (owner)' : ''}.
          Your lists, progress, history and settings are your own; nobody else using this app sees them.</p>
        ${s.profile?.is_owner ? '<div id="people"></div>' : ''}</section>
      <section class="panel"><h3>AniList</h3>${anilistHtml}</section>
      <section class="panel"><h3>New episode notifications</h3>${pushHtml}</section>
      <section class="panel"><h3>Player</h3>
        ${toggle('autoplay', 'Autoplay next episode', 'Counts down 10 seconds when the credits start. All your devices.')}
        ${toggle('autoskip', 'Auto-skip intros & credits', 'Skips automatically with an Undo button. Otherwise a Skip button appears. All your devices.')}
        ${toggle('skip_filler', 'Skip filler episodes', 'Up next and autoplay jump past filler in long shows (Naruto, One Piece…). All your devices.')}
        <div class="two">
          <div class="field"><label for="pq-set">Max quality on this device</label>
            <select id="pq-set">${['auto', '1080', '720', '480', '360'].map(x => `<option value="${x}" ${qLock === x ? 'selected' : ''}>${x === 'auto' ? 'Auto' : `${x}p`}</option>`).join('')}</select></div>
          <div class="field"><label for="ps-set">Speed on this device</label>
            <select id="ps-set">${SPEEDS.map(x => `<option value="${x}" ${sp === x ? 'selected' : ''}>${x === 1 ? 'Normal' : `${x}x`}</option>`).join('')}</select></div>
        </div>
        <label class="switch-row"><span>TV mode on this device<small>Bigger text and cards, and arrow keys / a remote move between items. Or open the app with ?tv=1.</small></span>
          <input type="checkbox" class="sw-input" id="tv-set" ${tvMode() ? 'checked' : ''}><i class="sw"></i></label>
        <div class="three">${[['size', 'Subtitle size', SUB_SIZES], ['bg', 'Subtitle background', SUB_BGS], ['pos', 'Subtitle position', SUB_POS]].map(([k, label, opts]) =>
          `<div class="field"><label for="sub-${k}">${label}</label><select id="sub-${k}" data-sub="${k}">${Object.entries(opts).map(([v, [l]]) =>
            `<option value="${v}" ${subPrefs()[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`).join('')}</div>
        <p class="faint" style="font-size:.85em;margin-top:-4px">Each episode plays at the best quality it has up to this limit. The player's gear menu lists exactly what an episode offers.</p>
        <p class="muted">Shows play dubbed by default and fall back to subtitled when there's no dub. Switch any show to Sub on its page; that choice is remembered.</p></section>
      <section class="panel"><h3>Stream source</h3>
        <p class="muted">Streams are found with ani-cli ${esc(s.ani_cli_version || '(not found)')}. It updates itself daily; if episodes stop loading, update it now.</p>
        <div class="actions"><button class="btn" id="upd">Update ani-cli</button></div></section>
      <section class="panel"><h3>Server health</h3><div id="health">${spinner()}</div></section>
      ${s.profile?.is_owner ? `<section class="panel"><h3>Episodes kept on the server</h3><div id="cachebox">${spinner()}</div></section>` : ''}
      <section class="panel"><h3>About</h3>
        <p class="muted">Aniwhere ${esc(s.version || '')}: watch anime anywhere, from your own server.</p>
        <p class="muted">Made by <a class="linkish" href="https://navam.dev" target="_blank" rel="noopener">navam.dev</a> ·
          <a class="linkish" href="https://github.com/Navam04/aniwhere" target="_blank" rel="noopener">Source &amp; releases</a></p></section>
      ${isIOS && !isStandalone ? `<section class="panel"><h3>Add to home screen</h3>
        <p class="muted">Tap <strong>Share</strong> → <strong>Add to Home Screen</strong> to use Aniwhere like an app, full-screen.</p></section>` : ''}
    </div>`;

  const busy = async (btn, fn) => {
    btn.disabled = true;
    try { await fn(); } catch (e) { toast(e.message); } finally { btn.disabled = false; }
  };

  // People who may use the app (owner only). Each person signs in with their own Tailscale account.
  const peopleBox = $('#people');
  const paintPeople = list => {
    peopleBox.innerHTML = `<h4 class="sub-h">People who can use this app</h4>
      <ul class="people">${list.map(p => `<li><span>${esc(p.login)}${p.owner ? ' <em>owner</em>' : ''}${!p.has_data && !p.owner ? ' <em>hasn\'t opened it yet</em>' : ''}</span>
        ${p.removable ? `<button class="linkish" data-rm="${esc(p.login)}">Remove</button>` : p.owner ? '' : '<span class="faint" title="Set in the server\'s service file">server setting</span>'}</li>`).join('')}</ul>
      <div class="add-person"><input type="text" id="np" placeholder="their Tailscale login, e.g. name@gmail.com" autocomplete="off" inputmode="email">
        <button class="btn" id="npadd">Add</button></div>
      <p class="faint" style="font-size:.85em;margin:0">They also need to be on your tailnet (share this server with them in the Tailscale admin console). Removing someone keeps their data in case you add them back.</p>`;
    $('#npadd').onclick = e => busy(e.target, async () => {
      const login = $('#np').value.trim();
      if (!login) return;
      paintPeople(await api('/api/people', { method: 'POST', body: { login } }));
      toast(`${login} can now use the app`);
    });
    $$('[data-rm]', peopleBox).forEach(b => b.onclick = () => busy(b, async () => {
      if (!confirm(`Stop ${b.dataset.rm} from using the app? Their lists and history are kept.`)) return;
      paintPeople(await api(`/api/people/${encodeURIComponent(b.dataset.rm)}`, { method: 'DELETE' }));
    }));
  };
  if (peopleBox) api('/api/people').then(paintPeople).catch(() => { peopleBox.innerHTML = ''; });

  // Server health: is the stream source working, AniList limits, background jobs, disk, errors, backups
  const bytes = n => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`);
  const dot = ok => `<span class="hdot ${ok === true ? 'ok' : ok === false ? 'bad' : 'warn'}"></span>`;
  async function paintHealth() {
    const box = $('#health');
    if (!box) return;
    let h;
    try { h = await api('/api/health'); } catch (e) { box.innerHTML = errorBox(e); return; }
    const src = h.source, al = h.anilist, col = h.collections;
    const srcOk = src.last_error_at && (!src.last_ok || src.last_error_at > src.last_ok) ? false : src.last_ok ? true : null;
    const rate = al.limit ? `${al.remaining} of ${al.limit} requests left this minute` : 'No requests yet';
    box.innerHTML = `<dl class="health">
      <dt>${dot(srcOk)}Stream source</dt><dd>${srcOk === false ? `Last lookup failed ${ago(src.last_error_at)}: ${esc(src.last_error)}`
        : src.last_ok ? `Working · last lookup ${ago(src.last_ok)}` : 'No lookups since the server started'}
        <small>${src.ok} ok · ${src.failed} failed since start · ani-cli ${esc(src.version || '?')}${src.updated ? `, updated ${ago(src.updated)}` : ''}</small></dd>
      <dt>${dot(al.last_429 && Date.now() / 1000 - al.last_429 < 300 ? false : true)}AniList</dt><dd>${esc(rate)}
        <small>${al.connected ? `Your list synced ${ago(al.last_sync)}` : 'Your AniList isn\'t connected'}${al.last_429 ? ` · last hit the rate limit ${ago(al.last_429)}` : ''}</small></dd>
      <dt>${dot(col.built ? true : null)}Collections</dt><dd>${col.count} collections · ${col.building ? 'building now' : col.built ? `built ${ago(col.built)}` : 'not built yet'}</dd>
      <dt>${dot(h.disk.free > 1e9)}Disk</dt><dd>${bytes(h.disk.free)} free of ${bytes(h.disk.total)}</dd>
      <dt>${dot(true)}Running for</dt><dd>${until(h.uptime)}</dd></dl>
      ${h.backups ? `<h4 class="sub-h">Backups</h4>
        <p class="faint" style="margin:0;font-size:.85em">Made every night; the last 7 are kept on the server.</p>
        <ul class="people">${h.backups.length ? h.backups.map(b => `<li><span>${esc(new Date(b.at * 1000).toLocaleString())} <em>${bytes(b.size)}</em></span>
          <a class="linkish" href="/api/backups/${encodeURIComponent(b.name)}" download>Download</a></li>`).join('') : '<li class="faint">No backups yet</li>'}</ul>
        <div class="actions"><button class="btn" id="bknow">Back up now</button></div>` : ''}
      ${h.errors ? `<h4 class="sub-h">Recent problems</h4>${h.errors.length ? `<ul class="errlist">${h.errors.map(e => `<li><span class="faint">${ago(e.at)} · ${esc(e.where)}</span>${esc(e.message)}</li>`).join('')}</ul>`
        : '<p class="faint" style="margin:0">None since the server started.</p>'}` : ''}
      <div class="actions"><button class="btn ghost small" id="hrefresh">Refresh</button></div>`;
    const bk = $('#bknow');
    if (bk) bk.onclick = () => busy(bk, async () => { await api('/api/backups', { method: 'POST' }); toast('Backup made'); paintHealth(); });
    $('#hrefresh').onclick = paintHealth;
  }
  paintHealth();

  // Episode cache (owner): the next episodes of everyone's Watching shows are downloaded nightly
  async function paintCache() {
    const box = $('#cachebox');
    if (!box) return;
    let c;
    try { c = await api('/api/cache'); } catch (e) { box.innerHTML = errorBox(e); return; }
    const st = c.settings, limit = st.limit_gb * 1e9;
    box.innerHTML = `<p class="muted" style="margin:0">Every night the server downloads the next ${2} episodes of everyone's Watching shows,
        so they start instantly and play even when the stream site is down.</p>
      <label class="switch-row"><span>Keep upcoming episodes<small>Uses disk space on the server.</small></span>
        <input type="checkbox" class="sw-input" id="c-on" ${st.enabled ? 'checked' : ''}><i class="sw"></i></label>
      <div class="two">
        <div class="field"><label for="c-limit">Space to use</label><select id="c-limit">${[1, 3, 5, 10, 20, 50, 100].map(g =>
          `<option value="${g}" ${st.limit_gb === g ? 'selected' : ''}>${g} GB</option>`).join('')}</select></div>
        <div class="field"><label for="c-q">Quality</label><select id="c-q">${[1080, 720, 480].map(q =>
          `<option value="${q}" ${st.quality === q ? 'selected' : ''}>${q}p${q === 1080 ? ' (about 400 MB an episode)' : q === 720 ? ' (about 250 MB)' : ' (about 120 MB)'}</option>`).join('')}</select></div>
      </div>
      <div class="coll-progress"><div class="pbar"><i style="width:${Math.min(100, c.usage / limit * 100)}%"></i></div>
        <span>${bytes(c.usage)} of ${st.limit_gb} GB used · ${bytes(c.disk.free)} free on the server</span></div>
      <p class="faint" style="margin:0;font-size:.85em">${c.status.running ? `Downloading now${c.status.current ? `: ${esc(c.status.current)}` : ''}…`
        : c.status.last_run ? `Last run ${ago(c.status.last_run)}${c.status.done ? ` · ${c.status.done} downloaded` : ''}` : 'Runs every night.'}
        ${c.status.last_error ? `<br>Last problem: ${esc(c.status.last_error)}` : ''}</p>
      ${c.items.length ? `<ul class="people">${c.items.map(e => `<li><span>${esc(e.title)} · ${/^\d/.test(e.episode) ? 'Episode ' : ''}${esc(e.episode)} · ${e.mode === 'dub' ? 'Dub' : 'Sub'}
        <em>${e.quality ? `${e.quality}p · ` : ''}${bytes(e.size)}${e.last_used ? ` · played ${ago(e.last_used)}` : ''}</em></span>
        <button class="linkish" data-del="${e.anilist_id}|${esc(e.episode)}|${e.mode}">Delete</button></li>`).join('')}</ul>` : '<p class="faint" style="margin:0">Nothing kept yet.</p>'}
      <div class="actions"><button class="btn" id="c-run" ${c.status.running ? 'disabled' : ''}>Download now</button></div>`;
    const save = async body => { try { await api('/api/cache/settings', { method: 'PUT', body }); toast('Saved'); paintCache(); } catch (e) { toast(e.message); } };
    $('#c-on').onchange = e => save({ enabled: e.target.checked });
    $('#c-limit').onchange = e => save({ limit_gb: +e.target.value });
    $('#c-q').onchange = e => save({ quality: +e.target.value });
    $('#c-run').onclick = e => busy(e.target, async () => {
      await api('/api/cache/run', { method: 'POST' });
      toast('Downloading upcoming episodes in the background');
      setTimeout(paintCache, 1500);
    });
    $$('[data-del]', box).forEach(b => b.onclick = () => busy(b, async () => {
      const [aid, ep, mode] = b.dataset.del.split('|');
      await api(`/api/cache/${aid}/${encodeURIComponent(ep)}/${mode}`, { method: 'DELETE' });
      paintCache();
    }));
  }
  paintCache();
  $$('.sw-input').forEach(inp => inp.onchange = async () => {
    try {
      await api('/api/settings', { method: 'PUT', body: { [inp.dataset.pref]: inp.checked } });
      toast('Saved');
    } catch (e) { inp.checked = !inp.checked; toast(e.message); }
  });
  $('#pq-set').onchange = e => { store.set('quality', e.target.value === 'auto' ? 'auto' : +e.target.value); toast('Saved on this device'); };
  $('#ps-set').onchange = e => { store.set('speed', +e.target.value); toast('Saved on this device'); };
  $('#tv-set').onchange = e => { setTvMode(e.target.checked); toast(e.target.checked ? 'TV mode on for this device' : 'TV mode off'); };
  $$('[data-sub]').forEach(sel => sel.onchange = () => { store.set('subs', { ...subPrefs(), [sel.dataset.sub]: sel.value }); toast('Saved on this device'); });
  if (al.connected) {
    $('#sync').onclick = e => busy(e.target, async () => { const r = await api('/api/anilist/sync', { method: 'POST' }); toast(`Synced · ${r.changed} updated`); viewSettings(stale); });
    $('#disc').onclick = e => busy(e.target, async () => {
      if (!confirm('Disconnect AniList? Your lists stay in the app.')) return;
      await api('/api/anilist/disconnect', { method: 'POST' }); viewSettings(stale);
    });
  } else {
    $('#connect').onclick = e => busy(e.target, async () => {
      const cid = $('#cid').value.trim();
      if (!cid) { toast('Paste your AniList Client ID first'); return; }
      await api('/api/settings', { method: 'PUT', body: { anilist_client_id: cid } });
      location.href = `https://anilist.co/api/v2/oauth/authorize?client_id=${encodeURIComponent(cid)}&response_type=token`;
    });
  }
  const on = $('#pushon');
  if (on) on.onclick = e => busy(e.target, async () => {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Notifications were not allowed'); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(s.push.public_key) });
    await api('/api/push/subscribe', { method: 'POST', body: sub.toJSON() });
    toast('Notifications are on for this device');
    viewSettings(stale);
  });
  const test = $('#pushtest');
  if (test) test.onclick = e => busy(e.target, async () => { const r = await api('/api/push/test', { method: 'POST' }); toast(`Sent to ${r.sent} device${r.sent === 1 ? '' : 's'}`); });
  $('#upd').onclick = e => busy(e.target, async () => {
    e.target.textContent = 'Updating…';
    const r = await api('/api/system/update', { method: 'POST' });
    toast(`ani-cli is on version ${r.version}`);
    viewSettings(stale);
  });
}

// ---------- start ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
route();
