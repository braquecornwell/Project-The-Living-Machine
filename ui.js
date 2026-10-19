'use strict';
let S = load(), last = Date.now(), acc = 0, focusId = null, tab = 'mods';
const $ = id => document.getElementById(id);
const f = n => n >= 100 ? n.toFixed(0) : n.toFixed(1);
const sign = n => (n >= 0 ? '+' : '') + n.toFixed(1);

function eta(r) {
  const { p, c } = S.rates[r] || { p: 0, c: 0 }, net = p - c, v = S.res[r], cap = RES[r].cap;
  if (net < -0.05 && v > 0) return 'empty in ' + Math.ceil(v / -net) + 's';
  if (net > 0.05 && v < cap && (r === 'heat')) return 'overheats in ' + Math.ceil((cap - v) / net) + 's';
  if (net > 0.05 && v < cap) return 'full in ' + Math.ceil((cap - v) / net) + 's';
  return 'stable';
}

// ---- Structure picture: dim cutaway, each restored module lights its region -------------
const REGIONS = { // x, y, w, h in % of the picture, and what the room belongs to: a module or a technology
  generator: [55, 14, 35, 27, 'mod'], computer: [12.5, 22, 38, 15.5, 'mod'], extractor: [11, 58, 18, 29, 'mod'], scanner: [36, 52, 15, 13, 'mod'], fabricator: [59.5, 53, 24.5, 35, 'mod'],
  conductors: [55, 41, 34.2, 9.8, 'tech'], thermal: [12, 37.6, 20.5, 18, 'tech'], diagnostics: [36, 37.6, 14.5, 13, 'tech'], bus: [28.5, 67.4, 22.5, 14.6, 'tech'] };
const TECH_LABEL = { conductors: 'Conductors', thermal: 'Thermal', diagnostics: 'Diagnostics', bus: 'Bus' };
// Resource flows: abstract conduits drawn over the picture; brightness and speed follow the real rates.
const modLoad = (id, r) => { const m = S.mods[id]; return !S.trip && m.run > 0 ? m.run * m.units * (MODULES[id].in[r] || 0) * MODES[S.tech.overclock ? m.mode : 'normal'].inp : 0; };
const rate = r => (S.rates[r] || { p: 0 }).p;
const FLOWS = [ // d: path in % of the picture; v: intensity 0..1
  { id: 'egen', res: 'energy', d: 'M72 39.5 H54.5', v: () => S.trip ? 0 : rate('energy') / 12 },
  { id: 'etrunk', res: 'energy', d: 'M54.5 39.5 V84.5', v: () => ['extractor', 'computer', 'scanner', 'fabricator'].reduce((a, id) => a + modLoad(id, 'energy'), 0) / 10 },
  { id: 'ecomp', res: 'energy', d: 'M54.5 36.4 H38', v: () => modLoad('computer', 'energy') / 6 },
  { id: 'escan', res: 'energy', d: 'M54.5 60 H44', v: () => modLoad('scanner', 'energy') / 3 },
  { id: 'efab', res: 'energy', d: 'M54.5 77 H68', v: () => modLoad('fabricator', 'energy') / 4 },
  { id: 'eext', res: 'energy', d: 'M54.5 84.5 H22', v: () => modLoad('extractor', 'energy') / 4 },
  { id: 'mat', res: 'material', d: 'M24 82.2 H53.5 V79 H68', v: () => modLoad('fabricator', 'material') / 4 },
  { id: 'heat', res: 'heat', d: 'M56.4 84 V12', v: () => S.trip ? 0 : rate('heat') / 12 },
];
let flowEls = [], flowOff = [], flowLast = 0;
const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function animateFlows(t) {
  const dt = Math.min(0.1, (t - flowLast) / 1000 || 0); flowLast = t;
  FLOWS.forEach((fl, i) => { if (fl.i > 0.02) { flowOff[i] -= (2 + 14 * Math.min(1, fl.i)) * dt; flowEls[i].setAttribute('stroke-dashoffset', flowOff[i]); } });
  requestAnimationFrame(animateFlows);
}
let zones = {};
function modStat(id) { const m = S.mods[id]; return m.units < 1 ? 'dormant' : S.trip ? 'tripped' : !m.on ? 'off' : m.cond < 50 ? 'worn' : m.run < 0.99 ? 'strained' : 'live'; }
function initStage() {
  $('stage').innerHTML = `<div class="stagebox">${Object.entries(REGIONS).map(([id, [x, y, w, h]]) =>
    `<button class="zone dormant" data-a="focus" data-id="${id}" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%;--bs:${10000 / w}% ${10000 / h}%;--bp:${100 * x / (100 - w)}% ${100 * y / (100 - h)}%">
      <span class="zl"></span><span class="zc"><i></i></span></button>`).join('')}<svg class="flows" viewBox="0 0 100 100" preserveAspectRatio="none">${FLOWS.map(f => `<path class="fbase f-${f.res}" d="${f.d}"/>`).join('')}${FLOWS.map(f => `<path class="fdash f-${f.res}" d="${f.d}"/>`).join('')}</svg><div class="hglow"></div></div>`;
  flowEls = [...$('stage').querySelectorAll('.fdash')]; flowOff = FLOWS.map(() => 0); if (!initStage.started && !calm && typeof requestAnimationFrame === 'function') { initStage.started = true; requestAnimationFrame(animateFlows); }
  zones = {}; $('stage').querySelectorAll('.zone').forEach(z => { zones[z.dataset.id] = z; });
}
function updateStage() {
  for (const id in REGIONS) {
    const z = zones[id]; if (!z) continue;
    if (REGIONS[id][4] === 'tech') { // rooms that wake up when their technology is researched
      const have = !!S.tech[id];
      z.className = 'zone tech ' + (have ? 'live' : 'dormant');
      z.querySelector('.zl').textContent = have ? TECH_LABEL[id] : '';
      z.title = TECHS[id].name + (have ? ': active' : ': not researched');
      continue;
    }
    const m = S.mods[id];
    const locked = !visible(S, id), mode = S.tech.overclock && m.units > 0 && m.mode !== 'normal' ? m.mode : '';
    z.className = 'zone ' + (locked ? 'locked' + (S.mods.scanner.units < 1 ? ' hide' : '') : modStat(id) + ' ' + mode);
    z.querySelector('.zl').textContent = locked ? '?' : MODULES[id].name.split(' ').pop();
    z.querySelector('.zc i').style.width = (m.units < 1 ? 0 : m.cond) + '%';
    z.title = locked ? 'Unidentified signal. Needs analysis.' : MODULES[id].name + ': ' + (m.units < 1 ? 'not restored' : Math.round(m.cond) + '% condition');
  }
  FLOWS.forEach((fl, i) => { fl.i = fl.v(); if (flowEls[i]) flowEls[i].style.opacity = fl.i > 0.02 ? 0.3 + 0.7 * Math.min(1, fl.i) : 0; });
  const g = $('stage').querySelector('.hglow'); if (g) { g.style.opacity = Math.min(1, S.res.heat / 100) * 0.7; g.className = 'hglow' + (S.hot ? ' hot' : ''); }
}
function render() {
  updateStage();
  const ready = Object.entries(TECHS).filter(([id, t]) => !S.tech[id] && t.req.every(r => S.tech[r]) && S.res.computation >= t.cost && S.res.signal >= (t.signal || 0)).length;
  $('tab-mods').className = tab === 'mods' ? 'on' : ''; $('tab-tech').className = tab === 'tech' ? 'on' : '';
  $('tab-tech').textContent = 'Research' + (ready ? ' (' + ready + ' ready)' : '');
  $('mods').hidden = tab !== 'mods'; $('tech').hidden = tab !== 'tech';
  $('res').innerHTML = Object.keys(RES).map(r => {
    const x = S.rates[r] || { p: 0, c: 0 }, v = S.res[r], cap = RES[r].cap;
    const warn = (r === 'energy' && S.short) ? '<b class="warn">shortage</b>' : (r === 'heat' && S.hot) ? ('<b class="warn">' + (S.trip ? 'THERMAL TRIP' : 'overheating') + '</b>') : '';
    return `<div class="res ${r}"><div class="row"><span>${RES[r].name} ${warn}</span><span>${f(v)} / ${cap}</span></div>
      <div class="bar"><i style="width:${100 * v / cap}%"></i></div>
      <div class="row dim"><span>+${x.p.toFixed(1)} / -${x.c.toFixed(1)} per s</span><span>${S.tech.diagnostics ? eta(r) : sign(x.p - x.c) + '/s'}</span></div></div>`;
  }).join('') + `<button data-a="salvage">Salvage by hand (+2 material)</button>`;

  const ids = ['generator', ...S.order].filter(id => visible(S, id)), vis = S.order.filter(id => visible(S, id));
  $('map').innerHTML = `<div class="gauge"><div class="row dim"><span>Structure heat</span><span>${f(S.res.heat)} / ${RES.heat.cap}${S.trip ? ' <b class="warn">THERMAL TRIP: cooling to ' + TRIP_CLEAR + '</b>' : S.hot ? ' <b class="warn">slowing and wearing modules</b>' : ''}</span></div>
    <div class="gbar ${S.hot ? 'hot' : ''}"><i style="width:${S.res.heat}%"></i><u style="left:${HOT_START}%" title="Modules slow and wear faster above ${HOT_START}"></u>${S.trip ? `<u style="left:${TRIP_CLEAR}%" title="Systems restart below ${TRIP_CLEAR}"></u>` : ''}</div></div>`;

  const busCard = S.tech.bus ? `<div class="mod"><div class="row"><b>Resource Bus</b><span class="dim">overflow energy</span></div>
    <p class="dim">When energy storage is full, route the excess instead of wasting it.</p>
    ${[['off', 'Waste it'], ['material', 'To material (2:1)'], ['signal', 'To signal (4:1)']].map(([k, n]) => `<button data-a="bus" data-id="${k}" ${S.bus === k ? 'disabled' : ''}>${n}</button>`).join('')}</div>` : '';
  const droneCard = S.tech.drones ? `<div class="mod"><div class="row"><b>Repair Drones</b><span class="dim">${S.repairAt ? 'repairing below ' + S.repairAt + '%' : 'idle'}</span></div>
    <p class="dim">Higher thresholds keep output up but spend more material and energy.</p>
    ${[[0, 'Off'], [40, 'Below 40%'], [70, 'Below 70%'], [95, 'Below 95%']].map(([k, n]) => `<button data-a="repairAt" data-id="${k}" ${S.repairAt === k ? 'disabled' : ''}>${n}</button>`).join('')}</div>` : '';
  $('mods').innerHTML = droneCard + busCard + ids.map(id => {
    const d = MODULES[id], m = S.mods[id], c = cost(S, id), ok = S.res.material >= c;
    const io = o => Object.entries(o).map(([r, n]) => n * Math.max(1, m.units) + ' ' + RES[r].name.toLowerCase()).join(', ') || 'nothing';
    const i = vis.indexOf(id);
    const prio = S.tech.allocation && i >= 0 ? `<span class="prio">priority ${i + 1}
      <button data-a="up" data-id="${id}">▲</button><button data-a="down" data-id="${id}">▼</button></span>` : '';
    return `<div class="mod ${focusId === id ? 'focus' : ''}" id="mod-${id}"><div class="row"><b>${d.name}</b><span class="dim">${m.units < 1 ? 'dormant' : S.trip ? 'thermal trip' : m.on ? 'running ' + Math.round(m.run * 100) + '%' : 'switched off'}</span></div>
      <p class="dim">${d.desc}</p><p class="dim">Uses ${io(d.in)}/s. Makes ${io(d.out)}/s.</p>
      ${m.units > 0 ? `<p class="dim">Condition ${Math.round(m.cond)}%${m.cond < 50 ? ' <b class="warn">worn</b>' : ''}</p>` : ''}
      <button data-a="buy" data-id="${id}" ${ok ? '' : 'disabled'}>${m.units < 1 ? 'Restore' : 'Add unit'} (${c} material)</button>
      ${S.tech.overclock && m.units > 0 ? [['eco', 'Eco'], ['normal', 'Normal'], ['oc', 'Overclock']].map(([k, n]) => `<button data-a="mode" data-id="${id}" data-m="${k}" ${m.mode === k ? 'disabled' : ''}>${n}</button>`).join('') + '<br>' : ''}
      ${m.units > 0 && m.cond < 99 ? `<button data-a="repair" data-id="${id}" ${S.res.material >= repairCost(S, id) ? '' : 'disabled'}>Repair (${repairCost(S, id)} material)</button>` : ''}
      ${m.units > 0 ? `<button data-a="toggle" data-id="${id}">${m.on ? 'Switch off' : 'Switch on'}</button>` : ''}${prio}</div>`;
  }).join('');

  $('tech').innerHTML = Object.entries(TECHS).map(([id, t]) => {
    const have = S.tech[id], reqOk = t.req.every(r => S.tech[r]), ok = reqOk && S.res.computation >= t.cost && S.res.signal >= (t.signal || 0);
    return `<div class="mod ${have ? 'done' : ''} ${focusId === id ? 'focus' : ''}" id="tech-${id}"><div class="row"><b>${t.name}</b><span class="dim">${t.type}</span></div><p class="dim">${t.desc}</p>
      ${have ? '<span class="dim">Researched</span>' : reqOk ? `<button data-a="research" data-id="${id}" ${ok ? '' : 'disabled'}>Research (${t.cost} computation${t.signal ? ' + ' + t.signal + ' signal' : ''})</button>`
      : `<span class="dim">Requires ${t.req.map(r => TECHS[r].name).join(', ')}</span>`}</div>`;
  }).join('');

  $('log').innerHTML = S.log.map(e => `<li><span class="dim">${e.t}s</span> ${e.m}</li>`).join('') || '<li class="dim">Nothing yet. The structure is silent.</li>';
}
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('button[data-a]'); if (!b || b.disabled) return;
  const a = b.dataset.a, id = b.dataset.id;
  if (a === 'salvage') salvage(S); if (a === 'buy') buy(S, id); if (a === 'toggle') toggle(S, id);
  if (a === 'tab') tab = id; if (a === 'bus') setBus(S, id); if (a === 'mode') setMode(S, id, b.dataset.m); if (a === 'repair') repair(S, id); if (a === 'repairAt') setRepairAt(S, +id); if (a === 'research') research(S, id); if (a === 'up') move(S, id, -1); if (a === 'down') move(S, id, 1);
  if (a === 'reset' && confirm('Erase the saved machine and start over?')) { S = newState(); save(S); }
  if (a === 'save') save(S);
  render();
  if (a === 'focus' && REGIONS[id] && (REGIONS[id][4] === 'tech' || visible(S, id))) {
    tab = REGIONS[id][4] === 'tech' ? 'tech' : 'mods'; focusId = id; setTimeout(() => { if (focusId === id) focusId = null; }, 1500); render();
    const el = $((REGIONS[id][4] === 'tech' ? 'tech-' : 'mod-') + id); if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  }
});
setInterval(() => {
  const now = Date.now(); acc += Math.min(now - last, 5000) / 1000; last = now;
  while (acc >= TICK) { tick(S, TICK); acc -= TICK; }
  render();
}, 100);
setInterval(() => save(S), 5000);
window.addEventListener('beforeunload', () => save(S));
initStage();
render();
