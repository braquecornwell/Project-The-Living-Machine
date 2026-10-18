'use strict';
// ---- Data-driven definitions -------------------------------------------
const HOT_START = 70, COOL = 0.05; // heat above HOT_START slows modules; passive cooling = COOL * stored heat per second
const WEAR = 0.05, REPAIR_COST = 0.4, DRONE_RATE = 2; // condition points lost per running second (x2 when hot); repair cost factor; drone repair points per second
// Operating modes (unlocked by Overclock Control): output, input and wear multipliers. Overclocking costs more input per output.
const MODES = { eco: { out: 0.6, inp: 0.5, wear: 0.5 }, normal: { out: 1, inp: 1, wear: 1 }, oc: { out: 1.5, inp: 1.8, wear: 2.5 } };
const TICK = 0.1, SAVE_KEY = 'living-machine-v1', VERSION = 1;
const RES = {
  energy:      { name: 'Energy',      cap: 200 },
  material:    { name: 'Material',    cap: 500 },
  computation: { name: 'Computation', cap: 500 },
  heat:        { name: 'Heat',        cap: 100 },
  signal:      { name: 'Signal data', cap: 200 },
};
const MODULES = {
  generator: { name: 'Basic Generator',   base: 15, in: {},             out: { energy: 4, heat: 2 },
    desc: 'A failing fuel cell. Makes energy and waste heat.' },
  extractor: { name: 'Salvage Extractor', base: 20, in: { energy: 2 },   out: { material: 1 },
    desc: 'Strips the hull for structural material.' },
  computer:  { name: 'Computation Core',  base: 30, in: { energy: 3 },   out: { computation: 1, heat: 1.5 },
    desc: 'Dormant processors. Computation pays for research.' },
  scanner:   { name: 'Survey Array',      base: 40, in: { energy: 2 },   out: { signal: 0.5, heat: 1 },
    desc: 'Listens to dormant systems. Signal data is needed to understand unknown architecture.' },
  fabricator:{ name: 'Fabrication Bay',   base: 60, in: { energy: 3, material: 2 }, out: { computation: 2, heat: 2 }, hidden: true,
    desc: 'Reprocesses salvage into processing substrate. Turns spare material into computation, at a cost in energy and heat.' },
};
const TECHS = {
  overclock:  { name: 'Overclock Control', type: 'New system', cost: 150, signal: 25, req: ['thermal'],
    desc: 'Set each module to Eco (60% output, 50% input, half wear) or Overclock (150% output, 180% input, 2.5x wear and proportionally more heat).' },
  drones:     { name: 'Repair Drones', type: 'New capability', cost: 120, signal: 20, req: ['diagnostics'],
    desc: 'Automatically repair worn modules below a threshold you set, using material and a little energy.' },
  bus:        { name: 'Shared Resource Bus', type: 'New system', cost: 140, signal: 30, req: ['allocation'],
    desc: 'Energy that would be wasted at full storage can be routed into material (2:1) or signal data (4:1).' },
  analysis:   { name: 'Dormant-System Analysis', type: 'New system', cost: 100, signal: 20, req: [],
    desc: 'Decode survey signals to reveal a hidden module: the Fabrication Bay.' },
  conductors: { name: 'Improved Conductors', type: 'Efficiency', cost: 30, req: [],
    desc: 'Generators produce 25% more energy.' },
  thermal:    { name: 'Thermal Recovery', type: 'New capability', cost: 60, req: [],
    desc: 'Converts 15% of stored heat per second into energy (50% efficiency). Heat stops being only waste.' },
  allocation: { name: 'Automated Allocation', type: 'New system', cost: 80, req: [],
    desc: 'Set which modules get energy first when it is scarce.' },
  diagnostics:{ name: 'Integrated Diagnostics', type: 'New capability', cost: 110, req: ['allocation'],
    desc: 'Shows time until each resource runs out or fills.' },
  radiators:  { name: 'Passive Radiators', type: 'Efficiency', cost: 70, req: ['thermal'],
    desc: 'Passive cooling doubles (5% to 10% of stored heat per second).' },
};

// ---- State ---------------------------------------------------------------
function newState() {
  return { v: VERSION, t: 0,
    res: { energy: 20, material: 0, computation: 0, heat: 0, signal: 0 },
    mods: Object.fromEntries(Object.keys(MODULES).map(id => [id, { units: id === 'generator' || id === 'extractor' ? 1 : 0, on: true, cond: 100, mode: 'normal' }])), repairAt: 0,
    tech: {}, bus: 'off', order: ['computer', 'extractor', 'scanner', 'fabricator'], log: [], rates: {}, short: false, hot: false };
}
function log(s, m) { s.log.unshift({ t: Math.floor(s.t), m }); s.log.length = Math.min(s.log.length, 40); }
function visible(s, id) { return !MODULES[id].hidden || !!s.tech.analysis; }
function cost(s, id) { return Math.ceil(MODULES[id].base * Math.pow(1.4, s.mods[id].units)); }

// ---- Simulation (fixed step, deterministic order) -------------------------
function tick(s, dt) {
  const p = {}, c = {}, R = s.res;
  for (const r in RES) p[r] = c[r] = 0;
  const hot = R.heat > HOT_START, eff = hot ? 1 - 0.5 * Math.min(1, (R.heat - HOT_START) / (RES.heat.cap - HOT_START)) : 1;
  let starved = false;
  // Generators first, then consumers in player-set priority order.
  for (const id of ['generator', ...s.order]) {
    const d = MODULES[id], m = s.mods[id];
    m.run = 0;
    if (!m.on || m.units < 1) continue;
    const md = MODES[s.tech.overclock ? m.mode : 'normal'];
    let k = 1; // fraction of demanded input actually available (never overdraws)
    for (const r in d.in) k = Math.min(k, R[r] / (d.in[r] * m.units * dt * md.inp));
    if (k < 0.999) starved = true;
    const run = k * (id === 'generator' ? 1 : eff) * (0.5 + 0.5 * m.cond / 100); m.run = run;
    m.cond = Math.max(0, m.cond - WEAR * dt * (hot ? 2 : 1) * md.wear); // condition falls while running; low condition cuts output
    if (m.cond < 50 && !m.warned) { m.warned = true; log(s, MODULES[id].name + ' is badly worn: output reduced.'); } // heat slows consumers, not the generators that make it (avoids a death spiral)
    for (const r in d.in) { const a = d.in[r] * m.units * dt * run * md.inp; R[r] -= a; c[r] += a; }
    for (const r in d.out) {
      const bonus = (id === 'generator' && r === 'energy' && s.tech.conductors) ? 1.25 : 1;
      const a = d.out[r] * m.units * dt * run * md.out * bonus; R[r] += a; p[r] += a;
    }
  }
  if (s.tech.drones && s.repairAt > 0) { // automation: repair the most worn module under the threshold
    let w = null; for (const id of ['generator', ...s.order]) { const m = s.mods[id]; if (m.units > 0 && m.cond < s.repairAt && (!w || m.cond < s.mods[w].cond)) w = id; }
    if (w && R.energy >= dt) {
      const m = s.mods[w], a = Math.min(DRONE_RATE * dt, 100 - m.cond), mc = a * MODULES[w].base * m.units * REPAIR_COST / 100;
      if (R.material >= mc) { m.cond += a; R.material -= mc; c.material += mc; R.energy -= dt; c.energy += dt; if (m.cond > 80) m.warned = false; }
    }
  }
  if (s.tech.thermal) { // rule change: heat -> energy
    const x = R.heat * 0.15 * dt; R.heat -= x; c.heat += x; R.energy += x / 2; p.energy += x / 2;
  }
  const d = R.heat * COOL * (s.tech.radiators ? 2 : 1) * dt; R.heat -= d; c.heat += d;
  if (s.tech.bus && s.bus !== 'off') { // rule change: overflow energy is exchanged over the bus instead of wasted
    const over = Math.max(0, R.energy - RES.energy.cap);
    if (over > 0) { const y = over * (s.bus === 'material' ? 0.5 : 0.25); R[s.bus] += y; p[s.bus] += y; c.energy += over; }
  }
  for (const r in RES) { R[r] = Math.max(0, Math.min(R[r], RES[r].cap)); s.rates[r] = { p: p[r] / dt, c: c[r] / dt }; }
  if (starved && !s.short) log(s, 'Energy shortage: modules are throttled.');
  if (!starved && s.short) log(s, 'Energy supply recovered.');
  if (hot && !s.hot) log(s, 'Running hot: above ' + HOT_START + ' heat, consumer modules slow down (down to 50% at full).');
  s.short = starved; s.hot = hot; s.t += dt;
}

// ---- Actions ---------------------------------------------------------------
function salvage(s) { s.res.material = Math.min(RES.material.cap, s.res.material + 2); }
function buy(s, id) {
  const c = cost(s, id), m = s.mods[id];
  if (s.res.material < c) return;
  s.res.material -= c; m.units++;
  if (m.units === 1) log(s, MODULES[id].name + ' restored.');
}
function setBus(s, id) {
  if (!s.tech.bus || !['off', 'material', 'signal'].includes(id) || s.bus === id) return;
  s.bus = id; log(s, id === 'off' ? 'Bus: overflow energy is wasted again.' : 'Bus: overflow energy now routed into ' + id + '.');
}
function repairCost(s, id) { const m = s.mods[id]; return Math.ceil(MODULES[id].base * m.units * REPAIR_COST * (100 - m.cond) / 100); }
function repair(s, id) {
  const m = s.mods[id], c = repairCost(s, id);
  if (m.units < 1 || m.cond > 99 || s.res.material < c) return;
  s.res.material -= c; m.cond = 100; m.warned = false;
}
function setRepairAt(s, v) { if (s.tech.drones && [0, 40, 70, 95].includes(v)) s.repairAt = v; }
function setMode(s, id, mode) { if (s.tech.overclock && MODES[mode] && s.mods[id]) s.mods[id].mode = mode; }
function toggle(s, id) { s.mods[id].on = !s.mods[id].on; }
function research(s, id) {
  const t = TECHS[id];
  if (s.tech[id] || s.res.computation < t.cost || s.res.signal < (t.signal || 0) || !t.req.every(r => s.tech[r])) return;
  s.res.computation -= t.cost; s.res.signal -= (t.signal || 0); s.tech[id] = true;
  log(s, 'Researched ' + t.name + '. ' + t.desc);
  if (id === 'analysis') log(s, 'Discovery: a dormant Fabrication Bay is now accessible.');
}
function move(s, id, dir) { // swaps with the neighbouring *visible* module
  const vis = s.order.filter(x => visible(s, x)), i = vis.indexOf(id), j = i + dir;
  if (!s.tech.allocation || i < 0 || j < 0 || j >= vis.length) return;
  const a = s.order.indexOf(id), b = s.order.indexOf(vis[j]);
  [s.order[a], s.order[b]] = [s.order[b], s.order[a]];
}

// ---- Persistence ------------------------------------------------------------
function serialize(s) { return JSON.stringify({ v: s.v, t: s.t, bus: s.bus, repairAt: s.repairAt, res: s.res, tech: s.tech, order: s.order, log: s.log,
  mods: Object.fromEntries(Object.entries(s.mods).map(([k, m]) => [k, { units: m.units, on: m.on, cond: m.cond, mode: m.mode }])) }); }
function deserialize(txt) { // tolerant of missing/invalid fields
  const s = newState();
  try {
    const d = JSON.parse(txt), num = (x, f) => (typeof x === 'number' && isFinite(x) && x >= 0 ? x : f);
    s.t = num(d.t, 0);
    for (const r in RES) s.res[r] = Math.min(num(d.res && d.res[r], s.res[r]), RES[r].cap);
    for (const id in MODULES) if (d.mods && d.mods[id]) {
      s.mods[id].units = Math.floor(num(d.mods[id].units, s.mods[id].units)); s.mods[id].on = d.mods[id].on !== false; s.mods[id].cond = Math.min(100, num(d.mods[id].cond, 100)); if (MODES[d.mods[id].mode]) s.mods[id].mode = d.mods[id].mode;
    }
    for (const id in TECHS) if (d.tech && d.tech[id]) s.tech[id] = true;
    if (Array.isArray(d.order) && d.order.length === s.order.length && s.order.every(x => d.order.includes(x))) s.order = d.order;
    if ([0, 40, 70, 95].includes(d.repairAt)) s.repairAt = d.repairAt;
    if (['off', 'material', 'signal'].includes(d.bus)) s.bus = d.bus;
    if (Array.isArray(d.log)) s.log = d.log.slice(0, 40);
  } catch (e) { return newState(); }
  return s;
}
function save(s) { try { localStorage.setItem(SAVE_KEY, serialize(s)); } catch (e) {} }
function load() { try { const t = localStorage.getItem(SAVE_KEY); return t ? deserialize(t) : newState(); } catch (e) { return newState(); } }

if (typeof module !== 'undefined') module.exports = { setMode, repair, repairCost, setRepairAt, setBus, visible, MODULES, newState, tick, buy, research, salvage, move, toggle, serialize, deserialize, RES, TECHS, TICK };
