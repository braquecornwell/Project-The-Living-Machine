'use strict';
// ---- Data-driven definitions -------------------------------------------
const TICK = 0.1, SAVE_KEY = 'living-machine-v1', VERSION = 1;
const RES = {
  energy:      { name: 'Energy',      cap: 200 },
  material:    { name: 'Material',    cap: 500 },
  computation: { name: 'Computation', cap: 500 },
  heat:        { name: 'Heat',        cap: 100 },
};
const MODULES = {
  generator: { name: 'Basic Generator',   base: 15, in: {},             out: { energy: 4, heat: 2 },
    desc: 'A failing fuel cell. Makes energy and waste heat.' },
  extractor: { name: 'Salvage Extractor', base: 20, in: { energy: 2 },   out: { material: 1 },
    desc: 'Strips the hull for structural material.' },
  computer:  { name: 'Computation Core',  base: 30, in: { energy: 3 },   out: { computation: 1, heat: 1.5 },
    desc: 'Dormant processors. Computation pays for research.' },
};
const TECHS = {
  conductors: { name: 'Improved Conductors', type: 'Efficiency', cost: 30, req: [],
    desc: 'Generators produce 25% more energy.' },
  thermal:    { name: 'Thermal Recovery', type: 'New capability', cost: 60, req: [],
    desc: 'Converts up to 3 heat/s into 1.5 energy/s. Heat stops being only waste.' },
  allocation: { name: 'Automated Allocation', type: 'New system', cost: 80, req: [],
    desc: 'Set which modules get energy first when it is scarce.' },
  diagnostics:{ name: 'Integrated Diagnostics', type: 'New capability', cost: 110, req: ['allocation'],
    desc: 'Shows time until each resource runs out or fills.' },
  radiators:  { name: 'Passive Radiators', type: 'Efficiency', cost: 70, req: ['thermal'],
    desc: 'Passive heat dissipation doubles (1/s to 2/s).' },
};

// ---- State ---------------------------------------------------------------
function newState() {
  return { v: VERSION, t: 0,
    res: { energy: 20, material: 0, computation: 0, heat: 0 },
    mods: { generator: { units: 1, on: true }, extractor: { units: 1, on: true }, computer: { units: 0, on: true } },
    tech: {}, order: ['computer', 'extractor'], log: [], rates: {}, short: false, hot: false };
}
function log(s, m) { s.log.unshift({ t: Math.floor(s.t), m }); s.log.length = Math.min(s.log.length, 40); }
function cost(s, id) { return Math.ceil(MODULES[id].base * Math.pow(1.4, s.mods[id].units)); }

// ---- Simulation (fixed step, deterministic order) -------------------------
function tick(s, dt) {
  const p = {}, c = {}, R = s.res;
  for (const r in RES) p[r] = c[r] = 0;
  const hot = R.heat >= RES.heat.cap - 0.01, eff = hot ? 0.5 : 1;
  let starved = false;
  // Generators first, then consumers in player-set priority order.
  for (const id of ['generator', ...s.order]) {
    const d = MODULES[id], m = s.mods[id];
    m.run = 0;
    if (!m.on || m.units < 1) continue;
    let k = 1; // fraction of demanded input actually available (never overdraws)
    for (const r in d.in) k = Math.min(k, R[r] / (d.in[r] * m.units * dt));
    if (k < 0.999) starved = true;
    const run = k * eff; m.run = run;
    for (const r in d.in) { const a = d.in[r] * m.units * dt * run; R[r] -= a; c[r] += a; }
    for (const r in d.out) {
      const bonus = (id === 'generator' && r === 'energy' && s.tech.conductors) ? 1.25 : 1;
      const a = d.out[r] * m.units * dt * run * bonus; R[r] += a; p[r] += a;
    }
  }
  if (s.tech.thermal) { // rule change: heat -> energy
    const x = Math.min(R.heat, 3 * dt); R.heat -= x; c.heat += x; R.energy += x / 2; p.energy += x / 2;
  }
  const d = Math.min(R.heat, (s.tech.radiators ? 2 : 1) * dt); R.heat -= d; c.heat += d;
  for (const r in RES) { R[r] = Math.max(0, Math.min(R[r], RES[r].cap)); s.rates[r] = { p: p[r] / dt, c: c[r] / dt }; }
  if (starved && !s.short) log(s, 'Energy shortage: modules are throttled.');
  if (!starved && s.short) log(s, 'Energy supply recovered.');
  if (hot && !s.hot) log(s, 'Overheating: all modules at 50% until heat drops.');
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
function toggle(s, id) { s.mods[id].on = !s.mods[id].on; }
function research(s, id) {
  const t = TECHS[id];
  if (s.tech[id] || s.res.computation < t.cost || !t.req.every(r => s.tech[r])) return;
  s.res.computation -= t.cost; s.tech[id] = true;
  log(s, 'Researched ' + t.name + '. ' + t.desc);
}
function move(s, id, dir) {
  const i = s.order.indexOf(id), j = i + dir;
  if (!s.tech.allocation || j < 0 || j >= s.order.length) return;
  [s.order[i], s.order[j]] = [s.order[j], s.order[i]];
}

// ---- Persistence ------------------------------------------------------------
function serialize(s) { return JSON.stringify({ v: s.v, t: s.t, res: s.res, tech: s.tech, order: s.order, log: s.log,
  mods: Object.fromEntries(Object.entries(s.mods).map(([k, m]) => [k, { units: m.units, on: m.on }])) }); }
function deserialize(txt) { // tolerant of missing/invalid fields
  const s = newState();
  try {
    const d = JSON.parse(txt), num = (x, f) => (typeof x === 'number' && isFinite(x) && x >= 0 ? x : f);
    s.t = num(d.t, 0);
    for (const r in RES) s.res[r] = Math.min(num(d.res && d.res[r], s.res[r]), RES[r].cap);
    for (const id in MODULES) if (d.mods && d.mods[id]) {
      s.mods[id].units = Math.floor(num(d.mods[id].units, s.mods[id].units)); s.mods[id].on = d.mods[id].on !== false;
    }
    for (const id in TECHS) if (d.tech && d.tech[id]) s.tech[id] = true;
    if (Array.isArray(d.order) && d.order.length === s.order.length && s.order.every(x => d.order.includes(x))) s.order = d.order;
    if (Array.isArray(d.log)) s.log = d.log.slice(0, 40);
  } catch (e) { return newState(); }
  return s;
}
function save(s) { try { localStorage.setItem(SAVE_KEY, serialize(s)); } catch (e) {} }
function load() { try { const t = localStorage.getItem(SAVE_KEY); return t ? deserialize(t) : newState(); } catch (e) { return newState(); } }

if (typeof module !== 'undefined') module.exports = { newState, tick, buy, research, salvage, move, toggle, serialize, deserialize, RES, TECHS, TICK };
