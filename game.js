'use strict';
// ---- Data-driven definitions -------------------------------------------
const HOT_START = 60, TRIP_CLEAR = 40, TRIP_DAMAGE = 15, COOL = 0.05; // above HOT_START modules slow and wear faster; at the cap a thermal trip shuts everything down until heat < TRIP_CLEAR; passive cooling = COOL * stored heat per second
const WEAR = 0.05, REPAIR_COST = 0.4, DRONE_RATE = 2; // condition points lost per running second (x2 when hot); repair cost factor; drone repair points per second
// Operating modes (unlocked by Overclock Control): output, input and wear multipliers. Overclocking costs more input per output.
const MODES = { eco: { out: 0.6, inp: 0.5, wear: 0.5 }, normal: { out: 1, inp: 1, wear: 1 }, oc: { out: 1.5, inp: 1.8, wear: 2.5 } };
const RULE_UPKEEP = 0.2, SLOT_COST = [0, 20, 40]; // computation per second per active rule; components to unlock rule slots 2 and 3
// The structure is a building whose lower floors lie underground. Floors are grouped by what they handle and open downward as the player progresses.
const FLOORS = [
  { name: 'ENERGY',   short: 'ENERGY',   mods: ['generator', 'flux'],              rev: () => true },
  { name: 'MATERIAL', short: 'MATERIAL', mods: ['extractor', 'fabricator'],        rev: () => true },
  { name: 'COMPUTATION AND SIGNAL', short: 'COMPUTE', mods: ['computer', 'scanner', 'archive'], rev: s => s.res.material >= 10 || s.mods.computer.units > 0 },
  { name: 'THERMAL',  short: 'THERMAL',  mods: ['cooler'],                         rev: s => !!s.tech.analysis || !!s.sectors.cooling },
];
const TICK = 0.1, SAVE_KEY = 'living-machine-v1', VERSION = 1;
const RES = {
  energy:      { name: 'Energy',      cap: 200 },
  material:    { name: 'Material',    cap: 500 },
  computation: { name: 'Computation', cap: 500 },
  heat:        { name: 'Heat',        cap: 100 },
  signal:      { name: 'Signal data', cap: 200 },
  components:  { name: 'Components',  cap: 200 },
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
MODULES.cooler = { name: 'Active Cooler', base: 50, comp: 8, in: { energy: 3, material: 0.3 }, out: {}, cool: 4, sector: 'cooling',
  desc: 'Pumps heat out of the structure. Costs energy and a little material, and it wears like everything else.' };
MODULES.flux = { name: 'Flux Core', base: 80, comp: 12, in: {}, out: {}, flux: 0.1, wear: 2, sector: 'flux',
  desc: 'Turns stored heat into energy: it makes 10% of the stored heat per second, so running warm pays. Wears twice as fast.' };
MODULES.archive = { name: 'Archive Stacks', base: 60, comp: 10, in: { energy: 1, computation: 2 }, out: { signal: 1, heat: 0.5 }, sector: 'archive',
  desc: 'Decodes stored archives into signal data: a steady supply for further surveys.' };
const FAB_COMP = { in: { energy: 3, material: 3 }, out: { components: 1, heat: 2 } }; // Fabrication Bay recipe: material -> components
const def = (s, id) => id === 'fabricator' && s.recipe === 'components' ? { ...MODULES.fabricator, ...FAB_COMP } : MODULES[id];
// Sectors are hidden sections of the machine. The Survey Array surveys them with signal data and time, and each holds a module.
const SECTORS = {
  cooling: { name: 'Cooling Lattice', module: 'cooler',  cost: 30, time: 45, req: ['analysis'],                 hint: 'Cold spots show up in the thermal survey.' },
  flux:    { name: 'Flux Chamber',    module: 'flux',    cost: 50, time: 60, req: ['analysis', 'thermal'],      hint: 'A chamber that glows when the structure runs hot.' },
  archive: { name: 'Archive Stacks',  module: 'archive', cost: 70, time: 90, req: ['analysis', 'diagnostics'],  hint: 'Dense data returns from deep inside.' },
};
const METRICS = { heat: 'Heat (%)', energy: 'Energy stored (%)', material: 'Material stored (%)', computation: 'Computation stored (%)', mincond: 'Lowest condition (%)', tripEta: 'Seconds to thermal trip' };
const TECHS = {
  rules:      { name: 'Control Rules', type: 'New system', cost: 160, signal: 30, req: ['diagnostics'],
    desc: 'Write if-then rules that switch modules between modes automatically. One slot at first, two more for components. Each active rule costs computation every second.' },
  predict:    { name: 'Predictive Maintenance', type: 'New capability', cost: 130, signal: 20, req: ['diagnostics'],
    desc: 'Forecasts thermal trips and module wear, and adds a trip forecast that rules can react to.' },
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
    desc: 'Converts 8% of stored heat per second into energy (50% efficiency). Heat stops being only waste and cools the machine.' },
  allocation: { name: 'Automated Allocation', type: 'New system', cost: 80, req: [],
    desc: 'Set which modules get energy first when it is scarce.' },
  diagnostics:{ name: 'Integrated Diagnostics', type: 'New capability', cost: 110, req: ['allocation'],
    desc: 'Shows time until each resource runs out or fills.' },
  radiators:  { name: 'Passive Radiators', type: 'Efficiency', cost: 70, req: ['thermal'],
    desc: 'Passive cooling doubles (5% to 10% of stored heat per second).' },
};

// ---- State ---------------------------------------------------------------
function newState() {
  return { v: VERSION, t: 0, levels: 2,
    res: { energy: 20, material: 0, computation: 0, heat: 0, signal: 0, components: 0 },
    sectors: { cooling: false, flux: false, archive: false }, survey: { id: null, p: 0 }, recipe: 'compute', rules: [null, null, null], slots: 1, ruleT: 0, rulesOK: true,
    mods: Object.fromEntries(Object.keys(MODULES).map(id => [id, { units: id === 'generator' || id === 'extractor' ? 1 : 0, on: true, cond: 100, mode: 'normal' }])), repairAt: 0,
    tech: {}, bus: 'off', trip: false, crit: false, order: ['computer', 'extractor', 'scanner', 'fabricator', 'cooler', 'archive'], log: [], rates: {}, short: false, hot: false };
}
function log(s, m) { s.log.unshift({ t: Math.floor(s.t), m }); s.log.length = Math.min(s.log.length, 40); }
function visible(s, id) { const d = MODULES[id]; return d.sector ? !!s.sectors[d.sector] : (!d.hidden || !!s.tech.analysis); }
function cost(s, id) { return Math.ceil(MODULES[id].base * Math.pow(1.4, s.mods[id].units)); }
function compCost(s, id) { return MODULES[id].comp ? Math.ceil(MODULES[id].comp * Math.pow(1.3, s.mods[id].units)) : 0; }
function tripEta(s) { const r = s.rates.heat || { p: 0, c: 0 }, net = r.p - r.c; return net > 0.01 ? Math.max(0, (RES.heat.cap - s.res.heat) / net) : Infinity; }
function ruleValue(s, m) {
  if (m === 'mincond') return Math.min(100, ...Object.keys(s.mods).filter(id => s.mods[id].units > 0).map(id => s.mods[id].cond));
  if (m === 'tripEta') return Math.min(9999, tripEta(s));
  return 100 * s.res[m] / RES[m].cap;
}

// ---- Simulation (fixed step, deterministic order) -------------------------
function tick(s, dt) {
  const p = {}, c = {}, R = s.res;
  for (const r in RES) p[r] = c[r] = 0;
  if (!s.trip && R.heat >= RES.heat.cap - 0.01) { // thermal trip: the real cost of running too hot
    s.trip = true; for (const id in s.mods) if (s.mods[id].units > 0) s.mods[id].cond = Math.max(0, s.mods[id].cond - TRIP_DAMAGE);
    log(s, 'THERMAL TRIP: heat hit the limit. Every module shuts down and is damaged until heat falls below ' + TRIP_CLEAR + '.');
  } else if (s.trip && R.heat <= TRIP_CLEAR) { s.trip = false; log(s, 'Thermal trip cleared: systems restarting.'); }
  const frac = Math.max(0, Math.min(1, (R.heat - HOT_START) / (RES.heat.cap - HOT_START))), hot = frac > 0, eff = 1 - 0.6 * frac;
  let starved = false;
  // Generators first, then consumers in player-set priority order.
  for (const id of ['generator', 'flux', ...s.order]) {
    const d = def(s, id), m = s.mods[id];
    m.run = 0;
    if (!m.on || m.units < 1 || s.trip) continue;
    const md = MODES[s.tech.overclock ? m.mode : 'normal'];
    let k = 1; // fraction of demanded input actually available (never overdraws)
    for (const r in d.in) k = Math.min(k, R[r] / (d.in[r] * m.units * dt * md.inp));
    if (k < 0.999) starved = true;
    const run = k * (id === 'generator' ? 1 : eff) * (0.5 + 0.5 * m.cond / 100); m.run = run;
    m.cond = Math.max(0, m.cond - WEAR * dt * (1 + 3 * frac) * md.wear * (d.wear || 1)); // condition falls while running; low condition cuts output
    if (m.cond < 50 && !m.warned) { m.warned = true; log(s, MODULES[id].name + ' is badly worn: output reduced.'); } // heat slows consumers, not the generators that make it (avoids a death spiral)
    for (const r in d.in) { const a = d.in[r] * m.units * dt * run * md.inp; R[r] -= a; c[r] += a; }
    if (d.cool) { const a = Math.min(R.heat, d.cool * m.units * dt * run * md.out); R.heat -= a; c.heat += a; }
    if (d.flux) { const a = d.flux * R.heat * m.units * dt * run * md.out, h = Math.min(R.heat, a * 0.3); R.heat -= h; c.heat += h; R.energy += a; p.energy += a; }
    for (const r in d.out) {
      const bonus = (id === 'generator' && r === 'energy' && s.tech.conductors) ? 1.25 : 1;
      const a = d.out[r] * m.units * dt * run * md.out * bonus; R[r] += a; p[r] += a;
    }
  }
  if (s.survey.id && s.mods.scanner.run > 0) { // surveying only advances while the Survey Array is running
    s.survey.p += dt * s.mods.scanner.run * (1 + 0.5 * (s.mods.scanner.units - 1));
    const sc = SECTORS[s.survey.id];
    if (s.survey.p >= sc.time) { s.sectors[s.survey.id] = true; log(s, 'Survey complete: ' + sc.name + ' mapped. The ' + MODULES[sc.module].name + ' can now be restored.'); s.survey = { id: null, p: 0 }; }
  }
  const nRules = s.tech.rules ? s.rules.filter((r, i) => r && r.en && i < s.slots).length : 0, up = nRules * RULE_UPKEEP * dt;
  s.rulesOK = R.computation >= up; if (s.rulesOK) { R.computation -= up; c.computation += up; }
  s.ruleT += dt; if (s.ruleT >= 0.5) { s.ruleT = 0; if (s.tech.rules) runRules(s); }
  if (s.tech.drones && s.repairAt > 0) { // automation: repair the most worn module under the threshold
    let w = null; for (const id of ['generator', ...s.order]) { const m = s.mods[id]; if (m.units > 0 && m.cond < s.repairAt && (!w || m.cond < s.mods[w].cond)) w = id; }
    if (w && R.energy >= dt) {
      const m = s.mods[w], a = Math.min(DRONE_RATE * dt, 100 - m.cond), mc = a * MODULES[w].base * m.units * REPAIR_COST / 100;
      if (R.material >= mc) { m.cond += a; R.material -= mc; c.material += mc; R.energy -= dt; c.energy += dt; if (m.cond > 80) m.warned = false; }
    }
  }
  if (s.tech.thermal) { // rule change: heat -> energy
    const x = R.heat * 0.08 * dt; R.heat -= x; c.heat += x; R.energy += x / 2; p.energy += x / 2;
  }
  const d = R.heat * COOL * (s.tech.radiators ? 2 : 1) * dt; R.heat -= d; c.heat += d;
  if (s.tech.bus && s.bus !== 'off') { // rule change: overflow energy is exchanged over the bus instead of wasted
    const over = Math.max(0, R.energy - RES.energy.cap);
    if (over > 0) { const y = over * (s.bus === 'material' ? 0.5 : 0.25); R[s.bus] += y; p[s.bus] += y; c.energy += over; }
  }
  for (const r in RES) { R[r] = Math.max(0, Math.min(R[r], RES[r].cap)); s.rates[r] = { p: p[r] / dt, c: c[r] / dt }; }
  if (starved && !s.short) log(s, 'Energy shortage: modules are throttled.');
  if (!starved && s.short) log(s, 'Energy supply recovered.');
  if (hot && !s.hot) log(s, 'Running hot: above ' + HOT_START + ' heat, consumer modules slow and every module wears faster.');
  if (R.heat >= 90 && !s.crit) { s.crit = true; log(s, 'Critical heat: the structure trips at ' + RES.heat.cap + '.'); }
  if (R.heat < 80) s.crit = false;
  s.short = starved; s.hot = hot; s.t += dt;
  while (s.levels < FLOORS.length && FLOORS[s.levels].rev(s)) { s.levels++; log(s, 'A stairwell opens below: Level ' + s.levels + ', ' + FLOORS[s.levels - 1].name.toLowerCase() + '.'); }
}

// ---- Actions ---------------------------------------------------------------
function salvage(s) { s.res.material = Math.min(RES.material.cap, s.res.material + 2); }
function buy(s, id) {
  const c = cost(s, id), cc = compCost(s, id), m = s.mods[id];
  if (!visible(s, id) || s.res.material < c || s.res.components < cc) return;
  s.res.material -= c; s.res.components -= cc; m.units++;
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
function startSurvey(s, id) {
  const sc = SECTORS[id];
  if (!sc || s.survey.id || s.sectors[id] || s.mods.scanner.units < 1 || !sc.req.every(r => s.tech[r]) || s.res.signal < sc.cost) return;
  s.res.signal -= sc.cost; s.survey = { id, p: 0 }; log(s, 'Survey started: ' + sc.name + '. It needs the Survey Array running for about ' + sc.time + 's.');
}
function setRecipe(s, r) { if (s.tech.analysis && (r === 'compute' || r === 'components')) s.recipe = r; }
// Control rules: IF metric op value THEN module -> action. A rule holds its action while true, then restores what it changed.
const ACTIONS = ['off', 'eco', 'normal', 'oc'];
function ruleRelease(s, r) { if (r && r.hit) { const m = s.mods[r.mod]; if (m && r.prev) { m.on = r.prev.on; m.mode = r.prev.mode; } r.hit = false; } }
function runRules(s) {
  s.rules.forEach((r, i) => {
    if (!r || i >= s.slots) return;
    const m = s.mods[r.mod]; if (!m || m.units < 1) return;
    const v = ruleValue(s, r.m), want = s.rulesOK && r.en && (r.op === '>' ? v > r.v : v < r.v);
    if (want && !r.hit && s.t - (r.last || -99) >= 5) {
      r.hit = true; r.last = s.t; r.prev = { on: m.on, mode: m.mode };
      log(s, 'Rule ' + (i + 1) + ': ' + METRICS[r.m] + ' ' + r.op + ' ' + r.v + ', so ' + MODULES[r.mod].name + ' set to ' + r.act + '.');
    } else if (!want && r.hit && s.t - r.last >= 5) { ruleRelease(s, r); r.last = s.t; }
    if (r.hit) { if (r.act === 'off') m.on = false; else { m.on = true; m.mode = r.act; } }
  });
}
function setRule(s, i, patch) {
  if (!s.tech.rules || !(i >= 0 && i < s.slots)) return;
  const r = s.rules[i] || { en: true, m: 'heat', op: '>', v: 70, mod: 'computer', act: s.tech.overclock ? 'eco' : 'off', hit: false };
  ruleRelease(s, r);
  const ok = { m: x => METRICS[x] && (x !== 'tripEta' || s.tech.predict), op: x => x === '>' || x === '<', v: x => typeof x === 'number' && isFinite(x), mod: x => MODULES[x] && visible(s, x),
    act: x => ACTIONS.includes(x) && (s.tech.overclock || x === 'off' || x === 'normal'), en: x => typeof x === 'boolean' };
  for (const k in patch) if (ok[k] && ok[k](patch[k])) r[k] = k === 'v' ? Math.max(0, Math.min(9999, Math.round(patch[k]))) : patch[k];
  s.rules[i] = r;
}
function clearRule(s, i) { if (s.rules[i]) { ruleRelease(s, s.rules[i]); s.rules[i] = null; } }
function unlockSlot(s) {
  const c = SLOT_COST[s.slots];
  if (!s.tech.rules || s.slots >= 3 || s.res.components < c) return;
  s.res.components -= c; s.slots++; log(s, 'Control rule slot ' + s.slots + ' unlocked.');
}
function toggle(s, id) { s.mods[id].on = !s.mods[id].on; }
function research(s, id) {
  const t = TECHS[id];
  if (s.tech[id] || s.res.computation < t.cost || s.res.signal < (t.signal || 0) || !t.req.every(r => s.tech[r])) return;
  s.res.computation -= t.cost; s.res.signal -= (t.signal || 0); s.tech[id] = true;
  log(s, 'Researched ' + t.name + '. ' + t.desc);
  if (id === 'analysis') log(s, 'Discovery: a dormant Fabrication Bay is now accessible, and the Survey Array can map hidden sectors.');
}
function move(s, id, dir) { // swaps with the neighbouring *visible* module
  const vis = s.order.filter(x => visible(s, x)), i = vis.indexOf(id), j = i + dir;
  if (!s.tech.allocation || i < 0 || j < 0 || j >= vis.length) return;
  const a = s.order.indexOf(id), b = s.order.indexOf(vis[j]);
  [s.order[a], s.order[b]] = [s.order[b], s.order[a]];
}

// ---- Persistence ------------------------------------------------------------
function serialize(s) { return JSON.stringify({ v: s.v, t: s.t, levels: s.levels, sectors: s.sectors, survey: s.survey, recipe: s.recipe, slots: s.slots,
  rules: s.rules.map(r => r && { en: r.en, m: r.m, op: r.op, v: r.v, mod: r.mod, act: r.act, hit: !!r.hit, prev: r.prev, last: r.last }), bus: s.bus, trip: s.trip, repairAt: s.repairAt, res: s.res, tech: s.tech, order: s.order, log: s.log,
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
    s.levels = Math.max(2, Math.min(FLOORS.length, Math.floor(num(d.levels, 2))));
    if (d.trip === true) s.trip = true;
    if (d.sectors) for (const k in SECTORS) s.sectors[k] = d.sectors[k] === true;
    if (d.survey && SECTORS[d.survey.id] && !s.sectors[d.survey.id]) s.survey = { id: d.survey.id, p: num(d.survey.p, 0) };
    if (d.recipe === 'components') s.recipe = 'components';
    s.slots = Math.max(1, Math.min(3, Math.floor(num(d.slots, 1))));
    if (Array.isArray(d.rules)) d.rules.slice(0, 3).forEach((r, i) => { // rebuild through the validator so bad rules are dropped
      if (!r || typeof r !== 'object') return;
      const keep = s.tech.rules, saveSlots = s.slots; s.tech.rules = true; s.slots = 3; setRule(s, i, { m: r.m, op: r.op, v: r.v, mod: r.mod, act: r.act, en: r.en });
      const x = s.rules[i]; if (x) { x.hit = r.hit === true && r.prev && typeof r.prev.on === 'boolean' && !!MODES[r.prev.mode]; if (x.hit) x.prev = { on: r.prev.on, mode: r.prev.mode }; x.last = num(r.last, 0); }
      s.tech.rules = keep; s.slots = saveSlots;
    });
    if ([0, 40, 70, 95].includes(d.repairAt)) s.repairAt = d.repairAt;
    if (['off', 'material', 'signal'].includes(d.bus)) s.bus = d.bus;
    if (Array.isArray(d.log)) s.log = d.log.slice(0, 40);
  } catch (e) { return newState(); }
  return s;
}
function save(s) { try { localStorage.setItem(SAVE_KEY, serialize(s)); } catch (e) {} }
function load() { try { const t = localStorage.getItem(SAVE_KEY); return t ? deserialize(t) : newState(); } catch (e) { return newState(); } }

if (typeof module !== 'undefined') module.exports = { FLOORS, SECTORS, METRICS, startSurvey, setRecipe, setRule, clearRule, unlockSlot, tripEta, compCost, def, TRIP_CLEAR, setMode, repair, repairCost, setRepairAt, setBus, visible, MODULES, newState, tick, buy, research, salvage, move, toggle, serialize, deserialize, RES, TECHS, TICK };
