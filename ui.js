'use strict';
// The whole game is one drawing. A fixed 900-unit-high sheet is scaled to the window: 16:9 is the base, and extra width (up to about 21:9, and slightly beyond for windows with browser bars) becomes permanent side panels.
let S = load(), last = Date.now(), acc = 0, open = null, tabR = 'works', W = 1600, built = 0;
const H0 = 900, $ = id => document.getElementById(id);
const f = n => n >= 100 ? n.toFixed(0) : n.toFixed(1);
const sign = n => (n >= 0 ? '+' : '') + n.toFixed(1);
const names = ids => ids.map(r => TECHS[r].name).join(', ');
const mmss = t => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const trunc = (t, n) => t.length > n ? t.slice(0, n - 1) + '.' : t;
const wide = () => W >= 1900;
function put(el, html) { // replace markup only when it changed, keeping scroll position
  if (el._h === html) return;
  const b = el.querySelector('.pbody'), st = b ? b.scrollTop : 0; el.innerHTML = html; el._h = html;
  const nb = el.querySelector('.pbody'); if (nb) nb.scrollTop = st;
}
function eta(r) {
  const { p, c } = S.rates[r] || { p: 0, c: 0 }, net = p - c, v = S.res[r], cap = RES[r].cap;
  if (net < -0.05 && v > 0) return 'empty in ' + Math.ceil(v / -net) + 's';
  if (net > 0.05 && v < cap && (r === 'heat')) return 'overheats in ' + Math.ceil((cap - v) / net) + 's';
  if (net > 0.05 && v < cap) return 'full in ' + Math.ceil((cap - v) / net) + 's';
  return 'stable';
}

// ---- Geometry (drawing units) ---------------------------------------------------------
const FL_X = 100, FL_TOP = 118, FL_H = 170, SLOT = 240, RW = 215, RH = 105, RISE_E = 1060, RISE_H = 1084;
const IDS = FLOORS.flatMap(fl => fl.mods);
const geo = id => { const fi = FLOORS.findIndex(fl => fl.mods.includes(id)), si = FLOORS[fi].mods.indexOf(id), top = FL_TOP + FL_H * fi; return { fi, si, top, x: FL_X + si * SLOT, y: top + 12, w: RW, h: RH }; };
const laneY = top => ({ e: top + 130, h: top + 142, m: top + 154 });
const md = id => MODES[S.tech.overclock ? S.mods[id].mode : 'normal'];
const run = id => (S.trip ? 0 : S.mods[id].run || 0);
const modOut = (id, r) => {
  const m = S.mods[id], d = def(S, id), k = run(id) * m.units * md(id).out;
  if (id === 'flux') return r === 'energy' ? d.flux * S.res.heat * k : 0;
  return (d.out[r] || 0) * k * (id === 'generator' && r === 'energy' && S.tech.conductors ? 1.25 : 1);
};
const modIn = (id, r) => (def(S, id).in[r] || 0) * run(id) * S.mods[id].units * md(id).inp;
const modCool = id => (MODULES[id].cool || 0) * run(id) * S.mods[id].units * md(id).out;
const rate = r => (S.rates[r] || { p: 0 }).p;
const sum = (fis, fn) => FLOORS.reduce((a, fl, i) => fis(i) ? a + fl.mods.reduce((b, id) => b + fn(id), 0) : a, 0);
const prodE = id => id === 'generator' || id === 'flux';
const FLOWS = [], DOTS = []; // d: pipe path; v: intensity 0..1; fi: floor; mod: room it serves
FLOORS.forEach((fl, fi) => {
  const top = FL_TOP + FL_H * fi, ly = laneY(top), mods = fl.mods;
  mods.forEach(id => {
    const g = geo(id), d = MODULES[id], rb = g.y + g.h;
    if (prodE(id) || d.in.energy) { const x = g.x + 40; FLOWS.push({ fi, mod: id, res: 'energy', d: prodE(id) ? `M${x} ${rb} V${ly.e}` : `M${x} ${ly.e} V${rb}`, v: () => prodE(id) ? modOut(id, 'energy') / 6 : modIn(id, 'energy') / 4 }); DOTS.push({ fi, mod: id, res: 'energy', x, y: ly.e }); }
    if (d.out.heat || d.cool) { const x = g.x + 110, sink = !!d.cool; FLOWS.push({ fi, mod: id, res: 'heat', d: sink ? `M${x} ${ly.h} V${rb}` : `M${x} ${rb} V${ly.h}`, v: () => sink ? modCool(id) / 6 : modOut(id, 'heat') / 4 }); DOTS.push({ fi, mod: id, res: 'heat', x, y: ly.h }); }
  });
  const xe = mods.filter(id => prodE(id) || MODULES[id].in.energy).map(id => geo(id).x + 40), prod = mods.some(prodE);
  if (xe.length) FLOWS.push({ fi, res: 'energy', d: prod ? `M${Math.min(...xe)} ${ly.e} H${RISE_E}` : `M${RISE_E} ${ly.e} H${Math.min(...xe)}`, v: () => (prod ? mods.reduce((a, id) => a + modOut(id, 'energy'), 0) : mods.reduce((a, id) => a + modIn(id, 'energy'), 0)) / 8 });
  const xh = mods.filter(id => MODULES[id].out.heat || MODULES[id].cool).map(id => geo(id).x + 110), sink = mods.some(id => MODULES[id].cool);
  if (xh.length) FLOWS.push({ fi, res: 'heat', d: sink ? `M${RISE_H} ${ly.h} H${Math.min(...xh)}` : `M${Math.min(...xh)} ${ly.h} H${RISE_H}`, v: () => mods.reduce((a, id) => a + (sink ? modCool(id) : modOut(id, 'heat')), 0) / 8 });
  if (fi > 0) { const pv = laneY(top - FL_H);
    FLOWS.push({ fi, res: 'energy', d: `M${RISE_E} ${pv.e} V${ly.e}`, v: () => sum(i => i >= fi, id => modIn(id, 'energy')) / 10 });
    FLOWS.push({ fi, res: 'heat', d: `M${RISE_H} ${ly.h} V${pv.h}`, v: () => sum(i => i >= fi, id => modOut(id, 'heat')) / 10 });
  }
});
FLOWS.push({ fi: 0, res: 'heat', d: `M${RISE_H} ${laneY(FL_TOP).h} V${FL_TOP - 6}`, v: () => S.trip ? 0 : rate('heat') / 12 });
{ const ex = geo('extractor'), fa = geo('fabricator'); FLOWS.push({ fi: ex.fi, mod: 'fabricator', res: 'material', d: `M${ex.x + 175} ${ex.y + ex.h} V${laneY(ex.top).m} H${fa.x + 175} V${fa.y + fa.h}`, v: () => modIn('fabricator', 'material') / 4 }); }
const SYM = { // 40 x 40 line symbols, drawn like drawing-office icons
  generator: '<circle cx="20" cy="20" r="12"/><path d="M22 10 15 22h6l-3 9M2 20h6M32 20h6"/>',
  flux: '<circle cx="20" cy="20" r="5"/><circle cx="20" cy="20" r="12"/><path d="M20 2v6M20 32v6M2 20h6M32 20h6"/>',
  cooler: '<path d="M20 4v32M6 12l28 16M6 28l28-16"/><circle cx="20" cy="20" r="3"/>',
  extractor: '<path d="M6 8h28l-8 16H14zM20 26v10M16 32l4 4 4-4"/>',
  computer: '<rect x="10" y="10" width="20" height="20"/><rect x="15" y="15" width="10" height="10"/><path d="M14 10V4M20 10V4M26 10V4M14 30v6M20 30v6M26 30v6M10 14H4M10 20H4M10 26H4M30 14h6M30 20h6M30 26h6"/>',
  scanner: '<path d="M6 22q14 18 28 0zM20 30v6M14 36h12M26 6a10 10 0 0 1 8 8M22 2a15 15 0 0 1 16 14"/>',
  fabricator: '<circle cx="20" cy="20" r="9"/><circle cx="20" cy="20" r="3"/><path d="M20 4v5M20 31v5M4 20h5M31 20h5M9 9l4 4M31 9l-4 4M9 31l4-4M31 31l-4-4"/>',
  archive: '<path d="M8 8h24v8H8zM8 18h24v8H8zM8 28h24v8H8zM12 12h6M12 22h6M12 32h6"/>',
  unknown: '<circle cx="20" cy="20" r="14" stroke-dasharray="3 3"/><path d="M15 15q0-6 5-6t5 5q0 3-5 6v3M20 29v2"/>',
};
let rooms = {}, flowEls = [], flowPipes = [], dotEls = [], floorEls = [], flowOff = [], flowLast = 0, parts = {};
const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function animateFlows(t) {
  const dt = Math.min(0.1, (t - flowLast) / 1000 || 0); flowLast = t;
  FLOWS.forEach((fl, i) => { if (fl.i > 0.02 && flowEls[i]) { flowOff[i] -= (3 + 18 * Math.min(1, fl.i)) * dt; flowEls[i].setAttribute('stroke-dashoffset', flowOff[i]); } });
  requestAnimationFrame(animateFlows);
}
function modStat(id) { const m = S.mods[id]; return m.units < 1 ? 'dormant' : S.trip ? 'tripped' : !m.on ? 'off' : m.cond < 50 ? 'worn' : m.run < 0.99 ? 'strained' : 'live'; }

// ---- The drawing ------------------------------------------------------------------
function blueprint() {
  let grid = '', ticks = '';
  for (let x = 20; x <= W - 20; x += 20) grid += `<path class="${(x - 20) % 100 ? 'gm' : 'gM'}" d="M${x} 20V880"/>`;
  for (let y = 20; y <= 880; y += 20) grid += `<path class="${(y - 20) % 100 ? 'gm' : 'gM'}" d="M20 ${y}H${W - 20}"/>`;
  for (let i = 40; i < W - 10; i += 40) ticks += `M${i} 10v8M${i} 882v8`; for (let i = 40; i < 880; i += 40) ticks += `M10 ${i}h8M${W - 18} ${i}h8`;
  const gy = FL_TOP + FL_H;
  const floors = FLOORS.map((fl, i) => { const y = FL_TOP + FL_H * i; return `<g class="fl" data-f="${i}"><path class="slab" d="M90 ${y}H1100"/><text class="fln" x="54" y="${y + 56}" text-anchor="middle">L0${i + 1}</text><text class="fls" x="54" y="${y + 72}" text-anchor="middle">${fl.short}</text><text class="fls" x="54" y="${y + 86}" text-anchor="middle">${i ? '-' + 6 * i : '0'} M</text></g>`; }).join('');
  const pipes = FLOWS.map((fl, i) => `<g class="pipe" data-i="${i}"><path class="po f-${fl.res}" d="${fl.d}"/><path class="pi" d="${fl.d}"/></g>`).join('');
  const dashes = FLOWS.map(fl => `<path class="fdash f-${fl.res}" d="${fl.d}" marker-end="url(#ar-${fl.res})"/>`).join('');
  const dots = DOTS.map(d => `<circle class="jd f-${d.res}" cx="${d.x}" cy="${d.y}" r="3.5"/>`).join('');
  const rms = IDS.map((id, n) => { const r = geo(id);
    return `<g class="room hide" data-a="room" data-id="${id}" tabindex="0" role="button"><title></title>
      <rect class="rbg" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/><rect class="rhatch" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="url(#hatch)"/>
      <rect class="frame" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/><path class="corner" d="M${r.x - 5} ${r.y + 8}v-13h13M${r.x + r.w + 5} ${r.y + 8}v-13h-13M${r.x - 5} ${r.y + r.h - 8}v13h13M${r.x + r.w + 5} ${r.y + r.h - 8}v13h-13"/>
      <text class="rn" x="${r.x + 12}" y="${r.y + 22}"></text><text class="rid" x="${r.x + r.w}" y="${r.y - 5}" text-anchor="end">R-0${n + 1}</text>
      <use class="sym" href="#sy-${id}" x="${r.x + r.w - 62}" y="${r.y + 26}" width="48" height="48"/>
      <text class="s1" x="${r.x + 12}" y="${r.y + 44}"></text><text class="s2" x="${r.x + 12}" y="${r.y + 60}"></text><text class="s3" x="${r.x + 12}" y="${r.y + 76}"></text>
      ${Array.from({ length: 10 }, (_, k) => `<rect class="ct" x="${r.x + 12 + k * 17}" y="${r.y + 86}" width="13" height="6"/>`).join('')}</g>`; }).join('');
  const marks = [0, 20, 40, 80].map(v => `<path class="fr1" d="M1146 ${790 - 660 * v / 100}h10"/><text class="sm" x="1160" y="${794 - 660 * v / 100}">${v}</text>`).join('');
  return `<svg class="bp" width="${W}" height="${H0}" viewBox="0 0 ${W} ${H0}" role="group" aria-label="The Living Machine"><defs>
    <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v8" class="ht"/></pattern>
    <pattern id="earth" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><path d="M0 0v10" class="ht"/></pattern>
    ${['energy', 'material', 'heat'].map(k => `<marker id="ar-${k}" viewBox="0 0 9 9" refX="9" refY="4.5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 9 4.5 0 9z" style="fill:var(--${k === 'material' ? 'material' : k});stroke:none"/></marker>`).join('')}
    ${Object.entries(SYM).map(([k, p]) => `<symbol id="sy-${k}" viewBox="0 0 40 40">${p}</symbol>`).join('')}</defs>
    <g class="grid">${grid}</g><rect class="fr1" x="8" y="8" width="${W - 16}" height="884"/><rect class="fr2" x="14" y="14" width="${W - 28}" height="872"/><path class="fr1" d="${ticks}"/>
    <rect class="earth" x="90" y="${gy}" width="1010" height="${800 - gy}" fill="url(#earth)"/><path class="gline" d="M90 ${gy}H1100"/><text class="sm" x="96" y="${gy - 6}">GROUND LEVEL 0.0</text>
    <g class="ghost"><rect x="${FL_X}" y="0" width="${RW}" height="${RH}"/><text x="${FL_X + RW / 2}" y="0" text-anchor="middle">UNSURVEYED</text></g>
    ${floors}${pipes}${dashes}${dots}${rms}
    <g class="hg"><text class="lt" x="1131" y="112" text-anchor="middle">HEAT</text><rect class="hgf" x="1118" y="130" width="26" height="660"/><rect class="hgv" x="1120" y="788" width="22" height="0"/>${marks}
      <path class="hgs" d="M1112 ${790 - 660 * HOT_START / 100}h38"/><text class="sm hs" x="1154" y="${790 - 660 * HOT_START / 100 + 4}">SLOW 60</text><path class="hgt" d="M1112 130h38"/><text class="sm hs" x="1154" y="134">TRIP 100</text><circle class="lamp" cx="1131" cy="810" r="6"/></g>
    <path class="leader" d=""/><circle class="ldot" r="3" cx="-9" cy="-9"/></svg>`;
}
function build() {
  $('stage').innerHTML = blueprint(); built = W;
  rooms = {}; $('stage').querySelectorAll('.room').forEach(g => { const q = s => g.querySelector(s); rooms[g.dataset.id] = { g, t: q('title'), n: q('.rn'), s1: q('.s1'), s2: q('.s2'), s3: q('.s3'), sym: q('.sym'), ct: [...g.querySelectorAll('.ct')] }; });
  flowEls = [...$('stage').querySelectorAll('.bp > .fdash')]; flowPipes = [...$('stage').querySelectorAll('.pipe')]; dotEls = [...$('stage').querySelectorAll('.jd')]; floorEls = [...$('stage').querySelectorAll('.fl')]; flowOff = FLOWS.map(() => 0);
  parts = { hgv: $('stage').querySelector('.hgv'), lamp: $('stage').querySelector('.lamp'), ghost: $('stage').querySelector('.ghost'), leader: $('stage').querySelector('.leader'), ldot: $('stage').querySelector('.ldot') };
  if (!build.started && !calm && typeof requestAnimationFrame === 'function') { build.started = true; requestAnimationFrame(animateFlows); }
}
const LETTER = { energy: 'E', material: 'M', computation: 'C', signal: 'S', components: 'K', heat: 'H' };
function spec(id) { // live per-second figures, like annotations on a drawing
  const d = def(S, id), p = [];
  for (const r in d.in) p.push(LETTER[r] + '-' + modIn(id, r).toFixed(1));
  for (const r in d.out) p.push(LETTER[r] + '+' + modOut(id, r).toFixed(1));
  if (id === 'flux') p.push('E+' + modOut(id, 'energy').toFixed(1));
  if (d.cool) p.push('H-' + modCool(id).toFixed(1));
  return p.join('  ');
}
function updateStage() {
  const scanner = S.mods.scanner.units > 0;
  for (const id of IDS) {
    const r = rooms[id]; if (!r) continue;
    const g = geo(id), m = S.mods[id], d = MODULES[id], vis = visible(S, id);
    let cls = 'room' + (open === id ? ' open' : ''), n = '', s1 = '', s2 = '', s3 = '', pct = 0, sym = id, tip = '';
    if (g.fi >= S.levels) cls += ' hide';
    else if (vis) {
      const mode = S.tech.overclock && m.units > 0 && m.mode !== 'normal' ? m.mode : '';
      cls += ' ' + modStat(id) + (mode ? ' ' + mode : ''); n = d.name.toUpperCase(); pct = m.units < 1 ? 0 : m.cond;
      s1 = m.units < 1 ? 'NOT RESTORED' : S.trip ? 'THERMAL TRIP' : !m.on ? 'SWITCHED OFF' : 'RUN ' + Math.round(m.run * 100) + '%';
      s2 = m.units < 1 ? '' : m.units + (m.units === 1 ? ' UNIT' : ' UNITS') + (mode ? (mode === 'oc' ? ', OVERCLOCK' : ', ECO') : '');
      s3 = m.units < 1 ? 'RESTORE ' + cost(S, id) + ' M' + (compCost(S, id) ? ' + ' + compCost(S, id) + ' K' : '') : spec(id); tip = d.desc;
    } else if (!scanner) cls += ' hide';
    else {
      cls += ' locked'; sym = 'unknown';
      if (d.sector) {
        const sc = SECTORS[d.sector], met = sc.req.every(q => S.tech[q]), act = S.survey.id === d.sector;
        if (act) { cls += ' surveying'; pct = 100 * S.survey.p / sc.time; }
        n = act ? 'SURVEYING' : met ? 'UNMAPPED SECTOR' : 'SEALED SECTION'; s1 = act ? Math.round(pct) + '%' : met ? 'READY' : 'LOCKED';
        s2 = met ? '' : trunc('NEEDS ' + names(sc.req.filter(q => !S.tech[q])).toUpperCase(), 30); s3 = met && !act ? 'SURVEY ' + sc.cost + ' S, ' + sc.time + 'S' : ''; tip = met ? sc.hint : 'Needs ' + names(sc.req.filter(q => !S.tech[q]));
      } else { n = 'UNIDENTIFIED SIGNAL'; s1 = 'LOCKED'; s2 = 'NEEDS ANALYSIS'; tip = 'Needs ' + TECHS.analysis.name; }
    }
    r.g.setAttribute('class', cls); r.t.textContent = (n ? n + (s1 ? ': ' + s1 : '') : '') + (tip ? '. ' + tip : '');
    r.n.textContent = n; r.s1.textContent = s1; r.s2.textContent = s2; r.s3.textContent = trunc(s3, 32); r.sym.setAttribute('href', '#sy-' + sym);
    r.ct.forEach((c, k) => c.setAttribute('class', 'ct' + (k < Math.round(pct / 10) ? ' on' : '')));
  }
  const shown = (fl, i) => fl.fi !== undefined ? fl.fi < S.levels : i < S.levels;
  FLOWS.forEach((fl, i) => {
    fl.i = fl.v(); if (!flowEls[i]) return;
    flowEls[i].style.opacity = fl.i > 0.02 && fl.fi < S.levels ? 0.35 + 0.65 * Math.min(1, fl.i) : 0;
    flowPipes[i].style.opacity = fl.fi >= S.levels || (fl.mod && !(visible(S, fl.mod) && S.mods[fl.mod].units > 0)) ? 0 : '';
  });
  DOTS.forEach((d, i) => { if (dotEls[i]) dotEls[i].style.opacity = d.fi >= S.levels || !(visible(S, d.mod) && S.mods[d.mod].units > 0) ? 0 : ''; });
  floorEls.forEach((el, i) => el.setAttribute('class', 'fl' + (i >= S.levels ? ' hide' : '')));
  if (parts.ghost) { // the next floor, not yet surveyed
    const has = S.levels < FLOORS.length, y = FL_TOP + FL_H * S.levels + 12;
    parts.ghost.setAttribute('class', 'ghost' + (has ? '' : ' hide'));
    parts.ghost.querySelector('rect').setAttribute('y', y); parts.ghost.querySelector('text').setAttribute('y', y + RH / 2 + 4);
  }
  const hp = Math.min(100, S.res.heat) / 100; parts.hgv.setAttribute('y', 790 - 660 * hp); parts.hgv.setAttribute('height', 660 * hp - 2); parts.hgv.setAttribute('class', 'hgv' + (S.hot ? ' hot' : ''));
  parts.lamp.setAttribute('class', 'lamp' + (S.trip ? ' trip' : S.hot ? ' warm' : ''));
}

// ---- Panels, instruments and detail drawings (HTML laid over the drawing) ----------------
function forecast(id) { // predictive maintenance: seconds until a module drops below 50% condition
  const m = S.mods[id], frac = Math.max(0, Math.min(1, (S.res.heat - HOT_START) / (RES.heat.cap - HOT_START)));
  const r = WEAR * (1 + 3 * frac) * MODES[S.tech.overclock ? m.mode : 'normal'].wear * (MODULES[id].wear || 1);
  return m.on && m.cond > 50 ? (m.cond - 50) / r : null;
}
function rulesPanel() {
  if (!S.tech.rules) return '<div class="co-card"><p class="dim">NO CONTROL LOGIC INSTALLED.</p><p class="dim">Approve Control Rules under Proposed Works to wire rules between sensors and rooms.</p></div>';
  const mods = Object.keys(MODULES).filter(id => visible(S, id) && S.mods[id].units > 0);
  const opt = (v, label, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  const actions = [['off', 'switch off'], ['normal', 'Normal'], ...(S.tech.overclock ? [['eco', 'Eco'], ['oc', 'Overclock']] : [])];
  const n = S.rules.filter((r, i) => r && r.en && i < S.slots).length;
  let h = `<div class="co-card"><p class="dim">When the condition is true, the room is switched to the chosen setting. When it stops being true, the room goes back to what it was. Rules wait at least 5s between changes, and two rules on one room will fight. Each active rule costs ${RULE_UPKEEP} computation per second (${(n * RULE_UPKEEP).toFixed(1)}/s now).${S.rulesOK ? '' : ' <b class="warn">Not enough computation: rules are paused.</b>'}</p></div>`;
  for (let i = 0; i < 3; i++) {
    if (i >= S.slots) { h += `<div class="co-card"><div class="row"><b>RULE ${i + 1}</b><span class="dim">LOCKED</span></div>${i === S.slots ? `<button data-a="slot" ${S.res.components >= SLOT_COST[i] ? '' : 'disabled'}>UNLOCK SLOT (${SLOT_COST[i]} K)</button>` : '<p class="dim">Unlock the previous slot first.</p>'}</div>`; continue; }
    const r = S.rules[i];
    if (!r) { h += `<div class="co-card"><div class="row"><b>RULE ${i + 1}</b><span class="dim">EMPTY</span></div><button data-a="rule-new" data-id="${i}" ${mods.length ? '' : 'disabled'}>CREATE RULE</button></div>`; continue; }
    h += `<div class="co-card ${r.hit ? 'firing' : ''}"><div class="row"><b>RULE ${i + 1}</b><span class="dim">${!r.en ? 'DISABLED' : r.hit ? 'ACTIVE' : 'WAITING'}</span></div>
      <p>IF <select data-r="${i}" data-k="m">${Object.entries(METRICS).filter(([k]) => k !== 'tripEta' || S.tech.predict).map(([k, n]) => opt(k, n, r.m)).join('')}</select>
      <select data-r="${i}" data-k="op">${opt('>', 'is above', r.op)}${opt('<', 'is below', r.op)}</select>
      <input type="number" data-r="${i}" data-k="v" value="${r.v}" min="0" max="9999" step="5" aria-label="threshold"></p>
      <p>THEN <select data-r="${i}" data-k="mod">${mods.map(id => opt(id, MODULES[id].name, r.mod)).join('')}</select>
      <select data-r="${i}" data-k="act">${actions.map(([k, n]) => opt(k, n, r.act)).join('')}</select></p>
      <button data-a="rule-en" data-id="${i}">${r.en ? 'DISABLE' : 'ENABLE'}</button><button data-a="rule-clear" data-id="${i}">DELETE</button></div>`;
  }
  return h;
}
function worksPanel() {
  const rows = Object.entries(TECHS), ready = ([, t]) => t.req.every(r => S.tech[r]);
  const todo = rows.filter(([id]) => !S.tech[id]).sort((a, b) => (ready(b) - ready(a)) || a[1].cost - b[1].cost), done = rows.filter(([id]) => S.tech[id]);
  return `<div class="pbody">${todo.map(([id, t]) => {
    const rq = ready([id, t]), ok = rq && S.res.computation >= t.cost && S.res.signal >= (t.signal || 0);
    return `<div class="cloud ${rq ? '' : 'locked'}"><div class="row"><b>${t.name.toUpperCase()}</b><span class="dim">${t.type.toUpperCase()}</span></div><p class="dim">${t.desc}</p>
      ${rq ? `<div class="row"><span>COST ${t.cost} C${t.signal ? ' + ' + t.signal + ' S' : ''}</span><button data-a="research" data-id="${id}" ${ok ? '' : 'disabled'}>APPROVE</button></div>` : `<div class="dim">REQUIRES ${names(t.req).toUpperCase()}</div>`}</div>`; }).join('')}
    ${done.length ? `<div class="appr"><b>APPROVED</b>${done.map(([, t]) => `<div>${t.name.toUpperCase()}</div>`).join('')}</div>` : ''}</div>`;
}
function panelHead(which) {
  const pending = Object.keys(TECHS).filter(id => !S.tech[id]).length;
  if (wide()) return `<div class="phead"><b>${which === 'works' ? 'PROPOSED WORKS' : 'CONTROL LOGIC'}</b><span class="dim">${which === 'works' ? pending + ' PENDING' : S.tech.rules ? S.slots + ' SLOTS' : 'NOT INSTALLED'}</span></div>`;
  return `<div class="ptabs"><button data-a="tabR" data-id="works" class="${which === 'works' ? 'on' : ''}">PROPOSED WORKS (${pending})</button><button data-a="tabR" data-id="logic" class="${which === 'logic' ? 'on' : ''}">CONTROL LOGIC</button></div>`;
}
function placePanels() {
  const w = $('works'), l = $('logic'), x = W - 390;
  w.style.left = (wide() ? x - 390 : x) + 'px'; l.style.left = x + 'px';
  w.style.display = wide() || tabR === 'works' ? '' : 'none'; l.style.display = wide() || tabR === 'logic' ? '' : 'none';
}
function coHTML(id) {
  const head = (t, extra = '') => `<div class="row coh"><b>${t}</b><button data-a="close" aria-label="Close">CLOSE X</button></div>${extra}`;
  if (id === 'bus') return head('DETAIL: RESOURCE BUS') + `<div class="pbody"><p class="dim">When energy storage is full, route the excess instead of wasting it.</p>${[['off', 'WASTE IT'], ['material', 'TO MATERIAL 2:1'], ['signal', 'TO SIGNAL 4:1']].map(([k, n]) => `<button data-a="bus" data-id="${k}" ${S.bus === k ? 'disabled' : ''}>${n}</button>`).join('')}</div>`;
  if (id === 'drones') return head('DETAIL: REPAIR DRONES') + `<div class="pbody"><p class="dim">Drones repair the most worn room below the threshold. Higher thresholds keep output up but spend more material and energy. ${S.repairAt ? 'Repairing below ' + S.repairAt + '%.' : 'Idle.'}</p>${[[0, 'OFF'], [40, 'BELOW 40%'], [70, 'BELOW 70%'], [95, 'BELOW 95%']].map(([k, n]) => `<button data-a="repairAt" data-id="${k}" ${S.repairAt === k ? 'disabled' : ''}>${n}</button>`).join('')}</div>`;
  const d = MODULES[id], m = S.mods[id], g = geo(id), n = IDS.indexOf(id) + 1;
  if (!visible(S, id)) {
    if (!d.sector) return head('DETAIL: R-0' + n + ' UNIDENTIFIED SIGNAL') + `<div class="pbody"><p class="dim">Something is down here. The Survey Array picked up a signal, but it can't be read yet.</p><p>NEEDS ${TECHS.analysis.name.toUpperCase()}</p></div>`;
    const sc = SECTORS[d.sector], miss = sc.req.filter(r => !S.tech[r]), act = S.survey.id === d.sector;
    return head('DETAIL: R-0' + n + ' ' + (miss.length ? 'SEALED SECTION' : 'UNMAPPED SECTOR')) + `<div class="pbody"><p class="dim">${miss.length ? 'The way in is closed.' : sc.hint}</p>
      ${miss.length ? `<p>NEEDS ${names(miss).toUpperCase()}</p>` : act ? `<p>SURVEYING ${Math.round(100 * S.survey.p / sc.time)}%</p><div class="bar signal"><i style="width:${100 * S.survey.p / sc.time}%"></i></div><p class="dim">Advances only while the Survey Array is running.</p>`
        : `<p class="dim">A survey costs signal data and about ${sc.time}s of the Survey Array running.</p><button data-a="survey" data-id="${d.sector}" ${S.mods.scanner.units > 0 && !S.survey.id && S.res.signal >= sc.cost ? '' : 'disabled'}>SURVEY (${sc.cost} S)</button>${S.survey.id ? '<p class="warn">Another survey is in progress.</p>' : ''}`}</div>`;
  }
  const dd = def(S, id), c = cost(S, id), cc = compCost(S, id), ok = S.res.material >= c && S.res.components >= cc, fc = S.tech.predict && m.units > 0 ? forecast(id) : null;
  const vis = S.order.filter(x => visible(S, x)), pi = vis.indexOf(id);
  const io = o => Object.entries(o).map(([r, q]) => q * Math.max(1, m.units) + ' ' + RES[r].name.toLowerCase()).join(', ') || 'nothing';
  const effect = dd.cool ? `Removes ${dd.cool * Math.max(1, m.units)} heat/s. ` : dd.flux ? `Makes ${(dd.flux * 100).toFixed(0)}% of stored heat per second as energy. ` : '';
  return head('DETAIL: R-0' + n + ' ' + d.name.toUpperCase()) + `<div class="pbody"><p class="dim">${d.desc}</p><p class="dim">${effect}Uses ${io(dd.in)}/s. Makes ${io(dd.out)}/s.</p>
    ${m.units > 0 ? `<p class="dim">Condition ${Math.round(m.cond)}%${m.cond < 50 ? ' <b class="warn">WORN</b>' : ''}${fc !== null ? ', below 50% in about ' + Math.ceil(fc) + 's' : ''}</p>` : ''}
    ${id === 'fabricator' && S.tech.analysis ? '<p class="dim">RECIPE</p>' + [['compute', 'MAKE COMPUTATION'], ['components', 'MAKE COMPONENTS']].map(([k, nm]) => `<button data-a="recipe" data-id="${k}" ${S.recipe === k ? 'disabled' : ''}>${nm}</button>`).join('') : ''}
    ${S.tech.overclock && m.units > 0 ? '<p class="dim">MODE</p>' + [['eco', 'ECO'], ['normal', 'NORMAL'], ['oc', 'OVERCLOCK']].map(([k, nm]) => `<button data-a="mode" data-id="${id}" data-m="${k}" ${m.mode === k ? 'disabled' : ''}>${nm}</button>`).join('') : ''}
    <p class="dim">CONTROLS</p>
    ${m.units > 0 ? `<button data-a="toggle" data-id="${id}">${m.on ? 'SWITCH OFF' : 'SWITCH ON'}</button>` : ''}
    ${m.units > 0 && m.cond < 99 ? `<button data-a="repair" data-id="${id}" ${S.res.material >= repairCost(S, id) ? '' : 'disabled'}>REPAIR (${repairCost(S, id)} M)</button>` : ''}
    <button data-a="buy" data-id="${id}" ${ok ? '' : 'disabled'}>${m.units < 1 ? 'RESTORE' : 'ADD UNIT'} (${c} M${cc ? ' + ' + cc + ' K' : ''})</button>
    ${S.tech.allocation && pi >= 0 ? `<p class="dim">ENERGY PRIORITY ${pi + 1} OF ${vis.length}</p><button data-a="up" data-id="${id}">HIGHER</button><button data-a="down" data-id="${id}">LOWER</button>` : ''}</div>`;
}
function coPos(id) {
  if (id === 'bus' || id === 'drones') return { x: 740, y: 112, ax: null };
  const g = geo(id), right = g.x + g.w + 16 + 340 <= 1100, x = right ? g.x + g.w + 16 : g.x - 16 - 340;
  return { x, y: Math.max(112, Math.min(g.y - 10, 470)), g, right };
}
function renderOverlay() {
  const meters = Object.keys(RES).filter(r => r !== 'heat' && (r !== 'components' || S.tech.analysis || S.res.components > 0));
  const te = S.tech.predict && !S.trip ? tripEta(S) : Infinity, state = S.trip ? 'THERMAL TRIP' : S.hot ? 'RUNNING HOT' : S.short ? 'ENERGY SHORT' : 'NOMINAL';
  put($('inst'), meters.map((r, i) => {
    const x = S.rates[r] || { p: 0, c: 0 }, v = S.res[r], cap = RES[r].cap;
    return `<div class="mt ${r} ${r === 'energy' && S.short ? 'warn' : ''}" style="left:${90 + i * 200}px"><div class="row"><b>${RES[r].name.toUpperCase()}</b><span>${f(v)} / ${cap}</span></div>
      <div class="mb"><i style="width:${100 * v / cap}%"></i></div><div class="dim">+${x.p.toFixed(1)} -${x.c.toFixed(1)} /S${S.tech.diagnostics ? '  ' + eta(r).toUpperCase() : ''}</div></div>`;
  }).join('') + `<div class="state ${S.trip || S.hot || S.short ? 'bad' : ''}" style="left:1100px"><div class="dim">STATE</div><b>${state}</b><div class="dim">${S.trip ? 'COOLING TO ' + TRIP_CLEAR : isFinite(te) && te < 300 ? 'TRIP IN ABOUT ' + Math.ceil(te) + 'S' : 'HEAT ' + f(S.res.heat) + ' / ' + RES.heat.cap}</div></div>
    <div class="fits" style="left:1275px">${S.tech.bus ? `<button data-a="fit" data-id="bus" class="${open === 'bus' ? 'on' : ''}">BUS</button>` : ''}${S.tech.drones ? `<button data-a="fit" data-id="drones" class="${open === 'drones' ? 'on' : ''}">DRONES</button>` : ''}</div>
    <button class="salvage" data-a="salvage">BREAK OFF SALVAGE (+2 M)</button>`);
  placePanels();
  put($('works'), panelHead('works') + worksPanel());
  const ae = document.activeElement;
  if (!($('logic').contains(ae) && ae.matches('select,input'))) put($('logic'), panelHead('logic') + '<div class="pbody">' + rulesPanel() + '</div>');
  if (open && (open === 'bus' || open === 'drones' || IDS.includes(open))) {
    const p = coPos(open); put($('co'), `<div class="co" style="left:${p.x}px;top:${p.y}px">${coHTML(open)}</div>`);
    if (p.g) { const ay = p.g.y + 36, ax = p.right ? p.g.x + p.g.w : p.g.x, bx = p.right ? p.x : p.x + 340; parts.leader.setAttribute('d', `M${ax} ${ay}H${bx}`); parts.ldot.setAttribute('cx', ax); parts.ldot.setAttribute('cy', ay); }
    else { parts.leader.setAttribute('d', ''); parts.ldot.setAttribute('cx', -9); }
  } else { put($('co'), ''); parts.leader.setAttribute('d', ''); parts.ldot.setAttribute('cx', -9); }
  put($('notes'), '<div class="dim nt">NOTES</div>' + (S.log.slice(0, 3).map((e, i) => `<div class="${i ? 'dim' : 'new'}">${mmss(e.t)}  ${trunc(e.m, 120)}</div>`).join('') || '<div class="dim">THE STRUCTURE IS SILENT.</div>'));
  const revs = S.log.filter(e => e.m.startsWith('Researched ')).slice(0, 3).map((e, i) => `<div class="row dim"><span>REV ${String.fromCharCode(67 - i)}  ${trunc(e.m.slice(11, e.m.indexOf('. ')).toUpperCase(), 30)}</span><span>${mmss(e.t)}</span></div>`).join('');
  put($('tb'), `<div class="revs">${revs || '<div class="dim">REV A  FIRST POWER</div>'}</div><div class="tbk"><div class="tt">THE LIVING MACHINE</div><div class="dim">STRUCTURAL SECTION  /  LEVELS ${S.levels} OF ${FLOORS.length}+</div>
    <div class="row"><span class="dim">T+${mmss(S.t)}</span><span><button data-a="save">SAVE</button><button data-a="reset">RESET</button></span></div><div class="dim leg"><i class="le">E</i> ENERGY <i class="lm">M</i> MATERIAL <i class="lh">H</i> HEAT</div></div>`);
}
function render() { updateStage(); renderOverlay(); }
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
  const a = b.dataset.a, id = b.dataset.id;
  if (a === 'room') open = open === id ? null : id; if (a === 'fit') open = open === id ? null : id; if (a === 'close') open = null;
  if (a === 'salvage') salvage(S); if (a === 'buy') buy(S, id); if (a === 'toggle') toggle(S, id);
  if (a === 'tabR') tabR = id; if (a === 'bus') setBus(S, id); if (a === 'mode') setMode(S, id, b.dataset.m); if (a === 'repair') repair(S, id); if (a === 'repairAt') setRepairAt(S, +id);
  if (a === 'research') research(S, id); if (a === 'up') move(S, id, -1); if (a === 'down') move(S, id, 1);
  if (a === 'survey') startSurvey(S, id); if (a === 'recipe') setRecipe(S, id); if (a === 'slot') unlockSlot(S);
  if (a === 'rule-new') setRule(S, +id, { mod: Object.keys(MODULES).find(m => visible(S, m) && S.mods[m].units > 0) });
  if (a === 'rule-en') setRule(S, +id, { en: !S.rules[+id].en }); if (a === 'rule-clear') clearRule(S, +id);
  if (a === 'reset' && confirm('Erase the saved machine and start over?')) { S = newState(); save(S); open = null; }
  if (a === 'save') save(S);
  render();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { open = null; render(); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest) { const r = e.target.closest('.room'); if (r) { e.preventDefault(); r.dispatchEvent(new Event('pointerdown', { bubbles: true })); } }
});
document.addEventListener('change', e => {
  const t = e.target; if (!t.dataset || t.dataset.r === undefined) return;
  setRule(S, +t.dataset.r, { [t.dataset.k]: t.dataset.k === 'v' ? +t.value : t.value }); $('logic')._h = null; render();
});
function fit() {
  const a = innerWidth / innerHeight; W = Math.round(Math.max(1600, Math.min(2400, H0 * a)));
  const s = Math.min(innerWidth / W, innerHeight / H0), el = $('sheet');
  el.style.width = W + 'px'; el.style.height = H0 + 'px'; el.style.transform = `translate(-50%,-50%) scale(${s})`;
  if (built !== W) build();
}
window.addEventListener('resize', () => { fit(); render(); });
setInterval(() => {
  const now = Date.now(); acc += Math.min(now - last, 5000) / 1000; last = now;
  while (acc >= TICK) { tick(S, TICK); acc -= TICK; }
  render();
}, 100);
setInterval(() => save(S), 5000);
window.addEventListener('beforeunload', () => save(S));
fit(); render();
