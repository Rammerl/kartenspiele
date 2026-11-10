'use strict';
/* Oberfläche: Startseite, Spielfeld, Ziehen/Tippen, Rückgängig, Tipp, Speichern */

const VERSION = 5; // zusammen mit CACHE in sw.js erhöhen
const GAMES = { spider: Spider, klondike: Klondike, freecell: FreeCell };
const SUIT = { s: '♠︎', h: '♥︎', d: '♦︎', c: '♣︎' };
const DESC = {
  spider: 'Reihen vom König bis zum Ass in einer Farbe bilden.',
  klondike: 'Der Klassiker: alle Karten auf die vier Ablagestapel legen.',
  freecell: 'Mit vier freien Feldern. Fast jedes Spiel ist lösbar.',
};
const FAN = {
  spider: [[13, 's'], [12, 's'], [11, 's']],
  klondike: [[1, 'h'], [13, 's'], [12, 'h']],
  freecell: [[7, 'd'], [6, 'c'], [5, 'h']],
};
const TABLES = { green: '#2b7559', blue: '#2d5d8c', wine: '#7d3148', slate: '#4d5866' };
const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/></svg>',
  hint: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0012 3z"/></svg>',
  renew: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0113.7-5.7L20 8.5"/><path d="M20 3.5v5h-5"/><path d="M20 12a8 8 0 01-13.7 5.7L4 15.5"/><path d="M4 20.5v-5h5"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  wand: '<svg viewBox="0 0 24 24"><path d="M4 20L14.5 9.5"/><path d="M14 3v3M19.5 8.5h-3M18 4.5l-2 2M11 4.5l1 1.5M19.5 12l-1.5-1"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
};

const KEY = 'kartenspiele.v1.';
const store = {
  get(k, d) { try { const v = localStorage.getItem(KEY + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { /* Speicher voll oder gesperrt */ } },
};

const settings = Object.assign(
  { spiderSuits: 1, klondikeDraw: 1, tap: 'double', labels: 'jqk', table: 'green' },
  store.get('settings', {})
);
const stats = store.get('stats', {});

const $ = id => document.getElementById(id);
const board = $('board'), modal = $('modal'), sheet = $('sheet');

let G = null, st = null, hist = [];
let cardEls = {}, slotEls = {}, cardLoc = {}, geo = [], M = {};
let drag = null, lastTap = null, busy = false;

/* ---------- Hilfen ---------- */
function rankLabel(r) {
  if (r === 1) return 'A';
  if (r <= 10) return String(r);
  const de = settings.labels === 'bdk';
  return r === 11 ? (de ? 'B' : 'J') : r === 12 ? (de ? 'D' : 'Q') : 'K';
}
const statOf = id => stats[id] || (stats[id] = { played: 0, won: 0 });

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3400);
}

function applyTable() {
  document.body.dataset.table = settings.table;
  document.querySelector('meta[name=theme-color]').content = TABLES[settings.table];
}

/* ---------- Dialoge ---------- */
let modalActions = {}, modalDismiss = true;
function openModal(html, actions = {}, dismiss = true) {
  sheet.innerHTML = html;
  modalActions = actions;
  modalDismiss = dismiss;
  modal.classList.remove('hidden');
}
function closeModal() {
  modal.classList.add('hidden');
  sheet.innerHTML = '';
}
function confirmBox(title, text, okLabel, fn) {
  openModal(
    `<h2>${title}</h2><p class="lead">${text}</p>
     <div class="acts"><button class="btn ghost" data-act="no">Abbrechen</button><button class="btn primary" data-act="yes">${okLabel}</button></div>`,
    { no: closeModal, yes: () => { closeModal(); fn(); } }
  );
}
modal.addEventListener('click', e => {
  if (e.target === modal) { if (modalDismiss) closeModal(); return; }
  const a = e.target.closest('[data-act]');
  if (a && modalActions[a.dataset.act]) { modalActions[a.dataset.act](); return; }
  const b = e.target.closest('[data-key] > button');
  if (b) {
    const key = b.parentElement.dataset.key;
    let v = b.dataset.v;
    if (/^\d+$/.test(v)) v = +v;
    settings[key] = v;
    store.set('settings', settings);
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if (key === 'table') applyTable();
  }
});

function seg(key, opts) {
  return `<div class="seg" data-key="${key}">${opts
    .map(([v, l]) => `<button data-v="${v}" class="${settings[key] === v ? 'on' : ''}">${l}</button>`)
    .join('')}</div>`;
}
function openSettings() {
  const sw = Object.entries(TABLES)
    .map(([k, c]) => `<button data-v="${k}" class="${settings.table === k ? 'on' : ''}" style="background:${c}" aria-label="${k}"></button>`)
    .join('');
  openModal(
    `<h2>Einstellungen</h2>
     <div class="opt"><label>Spider – Anzahl der Farben</label>${seg('spiderSuits', [[1, '1 Farbe'], [2, '2 Farben'], [4, '4 Farben']])}<small>Gilt ab dem nächsten neuen Spiel.</small></div>
     <div class="opt"><label>Solitär – Karten vom Stapel nehmen</label>${seg('klondikeDraw', [[1, '1 Karte'], [3, '3 Karten']])}<small>Gilt ab dem nächsten neuen Spiel.</small></div>
     <div class="opt"><label>Karte automatisch anlegen durch</label>${seg('tap', [['double', 'Doppeltippen'], ['single', 'Einmal tippen']])}</div>
     <div class="opt"><label>Beschriftung der Bildkarten</label>${seg('labels', [['jqk', 'J · Q · K'], ['bdk', 'B · D · K']])}</div>
     <div class="opt"><label>Tischfarbe</label><div class="swatches" data-key="table">${sw}</div></div>
     <div class="opt"><label>Spiel weitergeben</label><button class="btn ghost wide" data-act="qr">QR-Code zum Abrufen zeigen</button></div>
     <div class="acts"><button class="btn primary" data-act="close">Fertig</button></div>
     <p class="version">Version ${VERSION}</p>`,
    { close: closeModal, qr: openQR }
  );
}
function openQR() {
  const url = location.origin + location.pathname.replace(/index\.html$/, '');
  let img;
  try { img = QR.svg(url); } catch (e) { img = '<p class="lead">QR-Code konnte nicht erstellt werden.</p>'; }
  openModal(
    `<h2>Spiel abrufen</h2>
     <p class="lead">Mit der Kamera eines anderen Handys oder Tablets scannen – dann öffnet sich das Spiel dort.</p>
     <div class="qr">${img}</div>
     <p class="qr-url">${url.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>
     <div class="acts"><button class="btn ghost" data-act="back">Zurück</button><button class="btn primary" data-act="close">Fertig</button></div>`,
    { back: openSettings, close: closeModal }
  );
}

/* ---------- Startseite ---------- */
function renderHome() {
  const h = new Date().getHours();
  $('greet').textContent = h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend';
  $('tiles').innerHTML = Object.values(GAMES)
    .map(g => {
      const sv = store.get('save.' + g.id, null);
      const cont = sv && sv.st && !sv.st.won && sv.st.moves > 0;
      const won = statOf(g.id).won;
      const fan = FAN[g.id]
        .map(([r, s]) => `<div class="mini ${isRed(s) ? 'red' : ''}"><b>${rankLabel(r)}</b><i>${SUIT[s]}</i></div>`)
        .join('');
      return `<article class="tile" data-g="${g.id}">
        <div class="art">${fan}</div>
        <div><h2>${g.name}</h2><p>${DESC[g.id]}</p>
        <div class="meta">${won ? (won === 1 ? '1 Spiel gewonnen' : won + ' Spiele gewonnen') : ''}</div></div>
        <div class="acts"><button class="btn primary" data-act="play">${cont ? 'Weiterspielen' : 'Spielen'}</button>
        ${cont ? '<button class="btn ghost" data-act="new">Neu</button>' : ''}</div>
      </article>`;
    })
    .join('');
}
$('tiles').addEventListener('click', e => {
  const tile = e.target.closest('.tile');
  if (!tile) return;
  const id = tile.dataset.g;
  if (e.target.closest('[data-act="new"]'))
    confirmBox('Neues Spiel beginnen?', 'Das angefangene Spiel wird dabei beendet.', 'Neues Spiel', () => openGame(id, true));
  else openGame(id, false);
});

/* ---------- Spiel öffnen / schließen ---------- */
function openGame(id, fresh) {
  G = GAMES[id];
  $('home').classList.add('hidden');
  $('game').classList.remove('hidden');
  if (!history.state || !history.state.game) history.pushState({ game: id }, '');
  const sv = store.get('save.' + id, null);
  if (!fresh && sv && sv.st && !sv.st.won) {
    st = sv.st;
    hist = sv.hist || [];
    build();
    render(false);
    updateBar();
  } else startNew();
}
function showHome() {
  if (G) save();
  G = null;
  if (reloadPending) { location.reload(); return; }
  closeModal();
  $('game').classList.add('hidden');
  $('home').classList.remove('hidden');
  renderHome();
}
window.addEventListener('popstate', () => { if (G) showHome(); });

function startNew() {
  st = G.create(G.options(settings));
  hist = [];
  lastTap = null;
  statOf(G.id).played++;
  store.set('stats', stats);
  build();
  dealAnimation();
  save();
  updateBar();
}
function save() {
  if (G && st) store.set('save.' + G.id, { st, hist: hist.slice(-60) });
}
function pushHist(snap) {
  hist.push(snap);
  if (hist.length > 300) hist.shift();
}

/* ---------- Karten aufbauen ---------- */
function makeCard(card) {
  const el = document.createElement('div');
  el.className = 'card ' + (isRed(card.s) ? 'red' : 'blk');
  el.dataset.id = card.id;
  const L = rankLabel(card.r), S = SUIT[card.s];
  const center = card.r > 10
    ? `<div class="court"><span>${L}</span><i>${S}</i></div>`
    : `<div class="pip${card.r === 1 ? ' ace' : ''}">${S}</div>`;
  el.innerHTML = `<div class="wob"><div class="inner"><div class="face"><div class="idx"><b>${L}</b><i>${S}</i></div>${center}</div><div class="back"></div></div></div>`;
  return el;
}
function build() {
  board.innerHTML = '';
  cardEls = {};
  slotEls = {};
  st.piles.forEach((pile, p) => {
    if (G.place(p).slot === false) return;
    const el = document.createElement('div');
    el.className = 'slot';
    el.dataset.p = p;
    if (pile.t === 'found') el.textContent = 'A';
    if (pile.t === 'stock') el.innerHTML = ICON.renew;
    board.appendChild(el);
    slotEls[p] = el;
  });
  st.piles.forEach(pile => pile.c.forEach(card => {
    const el = makeCard(card);
    cardEls[card.id] = el;
    board.appendChild(el);
  }));
}

/* ---------- Anordnung ---------- */
function metrics() {
  const W = board.clientWidth, H = board.clientHeight, n = G.cols;
  const pad = Math.round(Math.max(10, Math.min(W, H) * 0.02));
  let cw = (W - 2 * pad) / (n + 0.12 * (n - 1));
  cw = Math.floor(Math.min(cw, (H - 2 * pad) / 3.7 / 1.4));
  const ch = Math.round(cw * 1.4);
  const gap = Math.floor(Math.min(cw * 0.45, (W - 2 * pad - n * cw) / (n - 1)));
  const x0 = Math.round((W - (n * cw + (n - 1) * gap)) / 2);
  M = { W, H, pad, cw, ch, gap, x0, topY: pad, tabY: pad + ch + Math.round(ch * 0.14) };
  board.style.setProperty('--cw', cw + 'px');
  board.style.setProperty('--ch', ch + 'px');
}
const colX = c => M.x0 + c * (M.cw + M.gap);

function pileGeo(p) {
  const pile = st.piles[p], pl = G.place(p), n = pile.c.length, pos = [];
  const k = pl.k || 0;
  const x = pl.kind === 'spiderFound' ? colX(0) + k * Math.round(M.cw * 0.28) : colX(pl.col);
  const y = pl.row === 'top' ? M.topY : M.tabY;
  if (pl.row === 'tab') {
    // Abstand der Karten: zuerst verdeckte Karten zusammenschieben, dann offene
    const avail = Math.max(0, M.H - M.pad - y - M.ch);
    let fd = M.ch * 0.1, fu = M.ch * 0.27, downs = 0, ups = 0;
    for (let i = 0; i < n - 1; i++) pile.c[i].up ? ups++ : downs++;
    if (downs * fd + ups * fu > avail) {
      const fdMin = M.ch * 0.045;
      if (ups && avail - ups * fu >= downs * fdMin) fd = (avail - ups * fu) / downs;
      else { fd = Math.min(fd, fdMin); fu = ups ? Math.max(0, avail - downs * fd) / ups : fu; }
    }
    let yy = y;
    for (let i = 0; i < n; i++) { pos.push([x, Math.round(yy)]); yy += pile.c[i].up ? fu : fd; }
  } else if (pl.kind === 'waste') {
    const show = Math.min(n, st.opts.draw === 3 ? 3 : 1);
    for (let i = 0; i < n; i++) {
      const j = i - (n - show);
      pos.push([x + (j > 0 ? Math.round(j * M.cw * 0.3) : 0), y]);
    }
  } else if (pl.kind === 'spiderStock') {
    const groups = Math.ceil(n / 10);
    for (let i = 0; i < n; i++) pos.push([x - (groups - 1 - Math.floor(i / 10)) * Math.round(M.cw * 0.16), y]);
  } else for (let i = 0; i < n; i++) pos.push([x, y]);
  return { x, y, pos, z: k * 20 + 1, row: pl.row };
}

function position(el, card, xy, z) {
  el.classList.toggle('up', card.up);
  el._z = z;
  const key = xy[0] + ',' + xy[1];
  if (el._key !== key) {
    el._key = key;
    el.style.transform = `translate3d(${xy[0]}px,${xy[1]}px,0)`;
    // während der Bewegung über allen anderen Karten
    el.style.zIndex = 1000 + z;
    el._pend = (el._pend || 0) + 1;
    setTimeout(() => { if (--el._pend === 0) el.style.zIndex = el._z; }, 420 + (el._delay || 0));
  } else if (!el._pend) el.style.zIndex = z;
}

function render(anim = true) {
  if (!G) return;
  metrics();
  if (!anim) board.classList.add('noanim');
  cardLoc = {};
  geo = [];
  st.piles.forEach((pile, p) => {
    const g = (geo[p] = pileGeo(p));
    if (slotEls[p]) slotEls[p].style.transform = `translate(${g.x}px,${g.y}px)`;
    pile.c.forEach((card, i) => {
      cardLoc[card.id] = { p, i };
      position(cardEls[card.id], card, g.pos[i], g.z + i);
    });
  });
  if (!anim) { void board.offsetWidth; board.classList.remove('noanim'); }
}

function setDelay(id, ms) {
  const el = cardEls[id];
  el._delay = ms;
  el.style.setProperty('--d', ms + 'ms');
  setTimeout(() => { el._delay = 0; el.style.removeProperty('--d'); }, ms + 700);
}

function dealAnimation() {
  metrics();
  const sp = st.piles.findIndex(p => p.t === 'stock');
  const o = sp >= 0 ? pileGeo(sp) : { x: Math.round((M.W - M.cw) / 2), y: M.H };
  board.classList.add('noanim');
  Object.values(cardEls).forEach(el => {
    el.classList.remove('up');
    el.style.transform = `translate3d(${o.x}px,${o.y}px,0)`;
    el._key = 'start';
  });
  void board.offsetWidth;
  board.classList.remove('noanim');
  const cols = st.piles.filter(p => p.t === 'tab');
  cols.forEach((pile, col) => pile.c.forEach((c, i) => setDelay(c.id, (i * cols.length + col) * 14)));
  render();
}

/* ---------- Züge ---------- */
function doMove(p, i, to) {
  pushHist(JSON.stringify(st));
  const cards = st.piles[p].c.splice(i);
  st.piles[to].c.push(...cards);
  st.moves++;
  if (G.after) G.after(st);
  changed();
}

function doDeal() {
  if (busy) return;
  const snap = JSON.stringify(st);
  const sp = st.piles.findIndex(p => p.t === 'stock');
  const before = new Set(st.piles[sp].c.map(c => c.id));
  if (!G.deal(st)) { toast('Der Stapel ist leer.'); return; }
  pushHist(snap);
  st.moves++;
  if (G.after) G.after(st);
  let k = 0;
  st.piles.forEach(pile => {
    if (pile.t !== 'stock') pile.c.forEach(c => { if (before.has(c.id)) setDelay(c.id, k++ * 45); });
  });
  changed();
}

function changed() {
  lastTap = null;
  render();
  updateBar();
  if (!st.won && G.won(st)) {
    st.won = true;
    statOf(G.id).won++;
    store.set('stats', stats);
    setTimeout(showWin, 800);
  }
  save();
}

function undo() {
  if (busy || !hist.length) return;
  st = JSON.parse(hist.pop());
  lastTap = null;
  render();
  updateBar();
  save();
}

function bestTarget(p, i) {
  const cards = st.piles[p].c.slice(i), N = st.piles.length;
  let best = null, bestKey = Infinity;
  st.piles.forEach((_, to) => {
    if (to === p || !G.canDrop(st, cards, to)) return;
    const r = G.prefer(st, p, i, to);
    if (r == null) return;
    // bei Gleichstand: der nächste Platz rechts vom Ausgangsstapel
    const key = r * 1000 + ((to - p + N) % N);
    if (key < bestKey) { bestKey = key; best = to; }
  });
  return best;
}

const seqEls = (p, i) => st.piles[p].c.slice(i).map(c => cardEls[c.id]);
function mark(els, cls, ms) {
  els.forEach(el => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); });
  setTimeout(() => els.forEach(el => el.classList.remove(cls)), ms);
}
function targetEl(to) {
  const t = topOf(st.piles[to]);
  return t ? cardEls[t.id] : slotEls[to];
}

function tryAuto(p, i) {
  const to = G.canPick(st, p, i) ? bestTarget(p, i) : null;
  if (to == null) { mark(seqEls(p, Math.max(0, i)), 'shake', 400); return; }
  doMove(p, i, to);
}

function onTap(d) {
  if (settings.tap === 'single') { tryAuto(d.p, d.i); return; }
  const now = performance.now();
  if (lastTap && lastTap.id === d.id && now - lastTap.t < 600) {
    lastTap = null;
    tryAuto(d.p, d.i);
  } else {
    lastTap = { id: d.id, t: now };
    if (d.can) mark(seqEls(d.p, d.i), 'sel', 600);
  }
}

/* ---------- Ziehen und Tippen ---------- */
board.addEventListener('contextmenu', e => e.preventDefault());
board.addEventListener('pointerdown', e => {
  if (busy || drag) return;
  const el = e.target.closest('.card');
  if (!el) {
    const sl = e.target.closest('.slot');
    if (sl && st.piles[+sl.dataset.p].t === 'stock') doDeal();
    return;
  }
  let { p, i } = cardLoc[+el.dataset.id];
  const pile = st.piles[p];
  if (pile.t === 'stock') { doDeal(); return; }
  if (pile.t !== 'tab') i = pile.c.length - 1;
  drag = { id: pile.c[i].id, p, i, x: e.clientX, y: e.clientY, moved: false, can: G.canPick(st, p, i), pid: e.pointerId };
  board.setPointerCapture(e.pointerId);
});
board.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.pid) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved) {
    if (!drag.can || Math.hypot(dx, dy) < 14) return;
    drag.moved = true;
    drag.els = seqEls(drag.p, drag.i);
    drag.base = geo[drag.p].pos.slice(drag.i);
    drag.els.forEach((el, k) => { el.classList.add('drag'); el._key = null; el.style.zIndex = 5000 + k; });
  }
  drag.dx = dx;
  drag.dy = dy;
  drag.els.forEach((el, k) => {
    el.style.transform = `translate3d(${drag.base[k][0] + dx}px,${drag.base[k][1] + dy}px,0)`;
  });
});
function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
function dropTarget(d) {
  const cards = st.piles[d.p].c.slice(d.i);
  const r = { x: d.base[0][0] + d.dx, y: d.base[0][1] + d.dy, w: M.cw, h: M.ch };
  let best = null, bestA = 0;
  geo.forEach((g, to) => {
    if (to === d.p) return;
    const last = g.pos.length ? g.pos[g.pos.length - 1][1] : g.y;
    const area = overlap(r, { x: g.x, y: g.y, w: M.cw, h: last - g.y + M.ch });
    if (area > bestA && G.canDrop(st, cards, to)) { best = to; bestA = area; }
  });
  return best;
}
board.addEventListener('pointerup', e => {
  if (!drag || e.pointerId !== drag.pid) return;
  const d = drag;
  drag = null;
  if (!d.moved) { onTap(d); return; }
  d.els.forEach(el => el.classList.remove('drag'));
  const to = dropTarget(d);
  if (to != null) doMove(d.p, d.i, to);
  else render();
});
board.addEventListener('pointercancel', () => {
  if (drag && drag.moved) { drag.els.forEach(el => el.classList.remove('drag')); drag = null; render(); }
  drag = null;
});

/* ---------- Tipp und automatisches Beenden ---------- */
function showHint() {
  if (busy) return;
  let best = null;
  st.piles.forEach((pile, p) => pile.c.forEach((_, i) => {
    if (!G.canPick(st, p, i)) return;
    const cards = pile.c.slice(i);
    st.piles.forEach((_, to) => {
      if (to === p || !G.canDrop(st, cards, to)) return;
      const s = G.score(st, p, i, to);
      if (s != null && (!best || s > best.s)) best = { p, i, to, s };
    });
  }));
  if (best) {
    mark(seqEls(best.p, best.i), 'hint', 2300);
    const t = targetEl(best.to);
    if (t) mark([t], 'hint', 2300);
    return;
  }
  const sp = st.piles.findIndex(p => p.t === 'stock');
  const waste = st.piles.find(p => p.t === 'waste');
  if (sp >= 0 && (st.piles[sp].c.length || (waste && waste.c.length))) {
    const t = targetEl(sp);
    if (t) mark([t], 'hint', 2300);
    toast('Auf den Stapel tippen, um neue Karten zu bekommen.');
    return;
  }
  if (st.piles.some(p => p.t === 'cell' && !p.c.length)) toast('Eine Karte in ein freies Feld oben links legen.');
  else toast('Kein sinnvoller Zug gefunden. Mit „Rückgängig“ geht es zurück.');
}

function foundationStep(s) {
  for (const pile of s.piles) {
    if (pile.t !== 'tab' && pile.t !== 'waste' && pile.t !== 'cell') continue;
    const c = topOf(pile);
    if (!c || !c.up) continue;
    const f = s.piles.find(q => q.t === 'found' && fitsFoundation(q, c));
    if (f) { f.c.push(pile.c.pop()); return true; }
  }
  return false;
}
function canAutoFinish() {
  if (!G.autoFinish || st.won) return false;
  if (st.piles.some(p => p.c.some(c => !c.up))) return false;
  const s = JSON.parse(JSON.stringify(st));
  while (foundationStep(s));
  return G.won(s);
}
function autoFinish() {
  if (busy) return;
  busy = true;
  pushHist(JSON.stringify(st));
  $('btnFinish').classList.add('hidden');
  const step = () => {
    if (foundationStep(st)) { st.moves++; render(); setTimeout(step, 130); }
    else { busy = false; changed(); }
  };
  step();
}

/* ---------- Leiste ---------- */
function updateBar() {
  $('gTitle').textContent = G.name;
  const sub = G.subtitle(st);
  $('gSub').textContent = (sub ? sub + ' · ' : '') + 'Züge: ' + st.moves;
  $('btnUndo').disabled = !hist.length;
  $('btnFinish').classList.toggle('hidden', !canAutoFinish());
}

function showWin() {
  if (!G || !st.won) return;
  const colors = ['#e6c473', '#d2a54c', '#f5f1e6', '#c32f3e', '#2b7559'];
  let conf = '';
  for (let k = 0; k < 42; k++)
    conf += `<i style="left:${Math.random() * 100}%;background:${colors[k % colors.length]};animation-duration:${2 + Math.random() * 1.6}s;animation-delay:${Math.random() * 0.8}s"></i>`;
  const won = statOf(G.id).won;
  openModal(
    `<div class="confetti">${conf}</div>
     <div class="win"><div class="badge">${ICON.star}</div>
     <h2>Gewonnen!</h2>
     <p class="lead">${G.name} in ${st.moves} Zügen gelöst.<br>Gewonnene Spiele bisher: ${won}</p>
     <div class="acts"><button class="btn ghost" data-act="menu">Zum Menü</button><button class="btn primary" data-act="again">Neues Spiel</button></div></div>`,
    { menu: () => { closeModal(); $('btnMenu').click(); }, again: () => { closeModal(); startNew(); } },
    false
  );
}

/* ---------- Knöpfe ---------- */
$('btnSettings').innerHTML = ICON.gear + '<span>Einstellungen</span>';
$('btnMenu').innerHTML = ICON.back + '<span>Menü</span>';
$('btnFinish').innerHTML = ICON.wand + '<span>Fertig spielen</span>';
$('btnHint').innerHTML = ICON.hint + '<span>Tipp</span>';
$('btnUndo').innerHTML = ICON.undo + '<span>Rückgängig</span>';
$('btnNew').innerHTML = ICON.renew + '<span>Neues Spiel</span>';

$('btnSettings').onclick = openSettings;
$('btnMenu').onclick = () => { if (history.state && history.state.game) history.back(); else showHome(); };
$('btnFinish').onclick = autoFinish;
$('btnHint').onclick = showHint;
$('btnUndo').onclick = undo;
$('btnNew').onclick = () => {
  if (busy) return;
  if (!st.moves || st.won) startNew();
  else confirmBox('Neues Spiel beginnen?', 'Das aktuelle Spiel wird dabei beendet.', 'Neues Spiel', startNew);
};

window.addEventListener('resize', () => { if (G) render(false); });
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

// Neue Version wurde im Hintergrund geladen: sofort neu laden, im Spiel erst beim Wechsel ins Menü
let reloadPending = false;
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (G) reloadPending = true;
    else location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

applyTable();
if (history.state && history.state.game) history.replaceState(null, '');
renderHome();
