'use strict';
/* Spielregeln für Spider, Solitär (Klondike) und FreeCell.
   Ein Spielstand besteht aus Stapeln: { t: Typ, c: [Karten] }.
   Karte: { id, s: Farbe (s h d c), r: Wert 1–13, up: aufgedeckt } */

const isRed = s => s === 'h' || s === 'd';
const topOf = pile => pile.c[pile.c.length - 1];

function makeDeck(suits, copies) {
  const cards = [];
  let id = 0;
  for (let k = 0; k < copies; k++)
    for (const s of suits)
      for (let r = 1; r <= 13; r++) cards.push({ id: id++, s, r, up: false });
  return cards;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// absteigende Reihe in gleicher Farbe (Spider)
function suitRun(c, i) {
  if (!c[i] || !c[i].up) return false;
  for (let k = i + 1; k < c.length; k++)
    if (!c[k].up || c[k].s !== c[k - 1].s || c[k].r !== c[k - 1].r - 1) return false;
  return true;
}

// absteigende Reihe mit wechselnden Farben rot/schwarz (Solitär, FreeCell)
function altRun(c, i) {
  if (!c[i] || !c[i].up) return false;
  for (let k = i + 1; k < c.length; k++)
    if (!c[k].up || isRed(c[k].s) === isRed(c[k - 1].s) || c[k].r !== c[k - 1].r - 1) return false;
  return true;
}

function fitsFoundation(pile, card) {
  const t = topOf(pile);
  return t ? t.s === card.s && card.r === t.r + 1 : card.r === 1;
}

function flipTops(st) {
  for (const pile of st.piles) {
    if (pile.t !== 'tab') continue;
    const t = topOf(pile);
    if (t && !t.up) t.up = true;
  }
}

const foundCount = st => st.piles.reduce((n, p) => n + (p.t === 'found' ? p.c.length : 0), 0);

/* ---------------- Spider ---------------- */
// Stapel: 0–9 Spalten, 10 Talon, 11–18 fertige Reihen
const Spider = {
  id: 'spider',
  name: 'Spider',
  cols: 10,
  options: s => ({ suits: s.spiderSuits }),
  subtitle(st) {
    const done = st.piles.filter(p => p.t === 'found' && p.c.length).length;
    return (st.opts.suits === 1 ? '1 Farbe' : st.opts.suits + ' Farben') + ' · ' + done + ' von 8 Reihen';
  },
  create(o) {
    const suits = o.suits === 4 ? ['s', 'h', 'd', 'c'] : o.suits === 2 ? ['s', 'h'] : ['s'];
    const deck = shuffle(makeDeck(suits, 8 / suits.length));
    const piles = [];
    for (let i = 0; i < 10; i++) piles.push({ t: 'tab', c: [] });
    for (let i = 0; i < 54; i++) piles[i % 10].c.push(deck.pop());
    piles.forEach(p => (topOf(p).up = true));
    piles.push({ t: 'stock', c: deck });
    for (let i = 0; i < 8; i++) piles.push({ t: 'found', c: [] });
    return { piles, moves: 0, opts: { suits: suits.length } };
  },
  place(p) {
    if (p < 10) return { row: 'tab', col: p };
    if (p === 10) return { row: 'top', col: 9, kind: 'spiderStock', slot: false };
    return { row: 'top', col: 0, kind: 'spiderFound', k: p - 11, slot: false };
  },
  canPick(st, p, i) {
    const pile = st.piles[p];
    return pile.t === 'tab' && suitRun(pile.c, i);
  },
  canDrop(st, cards, to) {
    const pile = st.piles[to];
    if (pile.t !== 'tab') return false;
    const t = topOf(pile);
    return !t || t.r === cards[0].r + 1;
  },
  after(st) {
    for (const pile of st.piles) {
      if (pile.t !== 'tab') continue;
      const n = pile.c.length;
      if (n >= 13 && pile.c[n - 13].r === 13 && suitRun(pile.c, n - 13)) {
        const f = st.piles.find(q => q.t === 'found' && !q.c.length);
        f.c.push(...pile.c.splice(n - 13));
      }
    }
    flipTops(st);
  },
  deal(st) {
    const stock = st.piles[10];
    if (!stock.c.length) return false;
    for (let i = 0; i < 10 && stock.c.length; i++) {
      const c = stock.c.pop();
      c.up = true;
      st.piles[i].c.push(c);
    }
    return true;
  },
  won: st => foundCount(st) === 104,
  // Rangfolge für den Doppeltipp: kleiner = besser, null = nicht anbieten
  prefer(st, p, i, to) {
    const card = st.piles[p].c[i], t = topOf(st.piles[to]);
    if (t) return t.s === card.s ? 0 : 1;
    return i > 0 ? 2 : null;
  },
  // Bewertung für „Tipp“: größer = besser, null = sinnloser Zug
  score(st, p, i, to) {
    const src = st.piles[p].c, card = src[i], below = src[i - 1], t = topOf(st.piles[to]);
    const placed = below && below.up && below.r === card.r + 1;
    if (!t) {
      if (i === 0 || (placed && below.s === card.s)) return null;
      return below.up ? 1 : 4;
    }
    if (placed && (below.s === card.s || t.s !== card.s)) return null;
    let s = 2;
    if (t.s === card.s) s += 3;
    if (below && !below.up) s += 4;
    if (i === 0) s += 2;
    return s;
  },
};

/* ---------------- Solitär (Klondike) ---------------- */
// Stapel: 0 Talon, 1 Ablage, 2–5 Zielstapel, 6–12 Spalten
const Klondike = {
  id: 'klondike',
  name: 'Solitär',
  cols: 7,
  autoFinish: true,
  options: s => ({ draw: s.klondikeDraw }),
  subtitle: st => (st.opts.draw === 3 ? '3 Karten ziehen' : '1 Karte ziehen'),
  create(o) {
    const deck = shuffle(makeDeck(['s', 'h', 'd', 'c'], 1));
    const piles = [{ t: 'stock', c: [] }, { t: 'waste', c: [] }];
    for (let i = 0; i < 4; i++) piles.push({ t: 'found', c: [] });
    for (let k = 0; k < 7; k++) {
      const pile = { t: 'tab', c: [] };
      for (let j = 0; j <= k; j++) pile.c.push(deck.pop());
      topOf(pile).up = true;
      piles.push(pile);
    }
    piles[0].c = deck;
    return { piles, moves: 0, opts: { draw: o.draw === 3 ? 3 : 1 } };
  },
  place(p) {
    if (p === 0) return { row: 'top', col: 0 };
    if (p === 1) return { row: 'top', col: 1, kind: 'waste', slot: false };
    if (p < 6) return { row: 'top', col: p + 1 };
    return { row: 'tab', col: p - 6 };
  },
  canPick(st, p, i) {
    const pile = st.piles[p];
    if (pile.t === 'tab') return altRun(pile.c, i);
    if (pile.t === 'waste' || pile.t === 'found') return i >= 0 && i === pile.c.length - 1;
    return false;
  },
  canDrop(st, cards, to) {
    const pile = st.piles[to];
    if (pile.t === 'found') return cards.length === 1 && fitsFoundation(pile, cards[0]);
    if (pile.t !== 'tab') return false;
    const t = topOf(pile);
    return t ? t.up && isRed(t.s) !== isRed(cards[0].s) && t.r === cards[0].r + 1 : cards[0].r === 13;
  },
  after: flipTops,
  deal(st) {
    const stock = st.piles[0], waste = st.piles[1];
    if (stock.c.length) {
      for (let n = Math.min(st.opts.draw, stock.c.length); n > 0; n--) {
        const c = stock.c.pop();
        c.up = true;
        waste.c.push(c);
      }
      return true;
    }
    if (!waste.c.length) return false;
    while (waste.c.length) {
      const c = waste.c.pop();
      c.up = false;
      stock.c.push(c);
    }
    return true;
  },
  won: st => foundCount(st) === 52,
  prefer(st, p, i, to) {
    const src = st.piles[p], tgt = st.piles[to];
    if (tgt.t === 'found') return src.t === 'found' ? null : 0;
    if (tgt.c.length) return 1;
    return src.t === 'tab' && i === 0 ? null : 2;
  },
  score(st, p, i, to) {
    const src = st.piles[p], tgt = st.piles[to], below = src.c[i - 1];
    if (src.t === 'found') return null;
    const reveals = src.t === 'tab' && below && !below.up;
    if (tgt.t === 'found') return 6 + (reveals ? 3 : 0);
    if (src.t === 'waste') return 4;
    if (!tgt.c.length && i === 0) return null;
    if (reveals) return 5;
    if (i === 0) return 3;
    return null;
  },
};

/* ---------------- FreeCell ---------------- */
// Stapel: 0–3 freie Felder, 4–7 Zielstapel, 8–15 Spalten
const FreeCell = {
  id: 'freecell',
  name: 'FreeCell',
  cols: 8,
  autoFinish: true,
  options: () => ({}),
  subtitle: () => '',
  create() {
    const deck = shuffle(makeDeck(['s', 'h', 'd', 'c'], 1));
    const piles = [];
    for (let i = 0; i < 4; i++) piles.push({ t: 'cell', c: [] });
    for (let i = 0; i < 4; i++) piles.push({ t: 'found', c: [] });
    for (let i = 0; i < 8; i++) piles.push({ t: 'tab', c: [] });
    deck.forEach((c, i) => {
      c.up = true;
      piles[8 + (i % 8)].c.push(c);
    });
    return { piles, moves: 0, opts: {} };
  },
  place(p) {
    if (p < 8) return { row: 'top', col: p };
    return { row: 'tab', col: p - 8 };
  },
  // wie viele Karten auf einmal verschoben werden dürfen
  maxMove(st, to) {
    const free = st.piles.filter(p => p.t === 'cell' && !p.c.length).length;
    const empty = st.piles.filter((p, k) => p.t === 'tab' && !p.c.length && k !== to).length;
    return (free + 1) * Math.pow(2, empty);
  },
  canPick(st, p, i) {
    const pile = st.piles[p];
    if (pile.t === 'tab') return altRun(pile.c, i) && pile.c.length - i <= this.maxMove(st, -1);
    if (pile.t === 'cell' || pile.t === 'found') return i >= 0 && i === pile.c.length - 1;
    return false;
  },
  canDrop(st, cards, to) {
    const pile = st.piles[to];
    if (pile.t === 'cell') return cards.length === 1 && !pile.c.length;
    if (pile.t === 'found') return cards.length === 1 && fitsFoundation(pile, cards[0]);
    if (pile.t !== 'tab' || cards.length > this.maxMove(st, to)) return false;
    const t = topOf(pile);
    return !t || (isRed(t.s) !== isRed(cards[0].s) && t.r === cards[0].r + 1);
  },
  won: st => foundCount(st) === 52,
  prefer(st, p, i, to) {
    const src = st.piles[p], tgt = st.piles[to];
    if (tgt.t === 'found') return src.t === 'found' ? null : 0;
    if (tgt.t === 'tab') return tgt.c.length ? 1 : src.t === 'tab' && i === 0 ? null : 2;
    return src.t === 'tab' ? 3 : null;
  },
  score(st, p, i, to) {
    const src = st.piles[p], tgt = st.piles[to], card = src.c[i], below = src.c[i - 1];
    if (src.t === 'found' || tgt.t === 'cell') return null;
    if (tgt.t === 'found') return 6;
    if (src.t === 'cell') return tgt.c.length ? 5 : 1;
    if (below && isRed(below.s) !== isRed(card.s) && below.r === card.r + 1) return null;
    if (!tgt.c.length) return i === 0 ? null : 1;
    return 3;
  },
};
