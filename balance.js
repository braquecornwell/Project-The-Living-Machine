// Pacing check: scripted "typical" player. Run: node balance.js
const g = require('./game.js');
function run(clickSecs = 120, total = 1800, verbose = true) {
  const s = g.newState(), ev = [], seen = new Set(); let trips = 0, wasTrip = false, heatCapSecs = 0, shortSecs = 0, heatSum = 0;
  const mark = (k) => { if (!seen.has(k)) { seen.add(k); ev.push(Math.round(s.t) + 's ' + k); } };
  for (let i = 0; i < total * 10; i++) {
    if (i % 10 === 0) { // player acts once per second
      if (s.t < clickSecs) g.salvage(s);
      if (!s.mods.computer.units) g.buy(s, 'computer');
      else {
        if (!s.hot && s.res.heat < 45 && (s.short || s.res.energy < 15)) { if (s.res.material >= 15 * Math.pow(1.4, s.mods.generator.units)) { g.buy(s, 'generator'); mark('gen' + s.mods.generator.units); } }
        for (const t of ['conductors', 'thermal', 'allocation', 'analysis', 'bus', 'drones', 'overclock', 'rules', 'predict', 'diagnostics', 'radiators']) {
          const before = !!s.tech[t]; g.research(s, t); if (!before && s.tech[t]) mark('tech:' + t);
        }
        const surplus = !s.short && (s.rates.energy.p - s.rates.energy.c) > 2;
        if (surplus && !s.mods.scanner.units && s.res.material >= 40) { g.buy(s, 'scanner'); mark('scanner restored'); }
        if (surplus && g.visible(s, 'fabricator') && !s.mods.fabricator.units && s.res.material >= 60) { g.buy(s, 'fabricator'); mark('fabricator restored'); }
        if (s.mods.computer.units < 3 && s.res.material > 60 && s.res.heat < 45) g.buy(s, 'computer');
        else if (s.res.material > 100 && !s.short && (s.rates.energy.p - s.rates.energy.c) > 2) g.buy(s, 'extractor');
      }
      for (const id in s.mods) if (s.mods[id].units && s.mods[id].cond < 60) g.repair(s, id);
      if (s.tech.drones && !seen.has('drones on')) { g.setRepairAt(s, 70); mark('drones on'); }
      for (const sid in g.SECTORS) {
        if (s.sectors[sid]) { mark('sector:' + sid); const mid = g.SECTORS[sid].module;
          if (!s.mods[mid].units && s.res.material >= 50 && s.res.components >= g.compCost(s, mid) && !s.hot) { g.buy(s, mid); mark('restored:' + mid); } }
        else g.startSurvey(s, sid);
      }
      if (s.tech.analysis && s.mods.fabricator.units) { // keep components flowing when a sector module is waiting for them
        const waiting = Object.values(g.SECTORS).some(x => s.sectors[Object.keys(g.SECTORS).find(k => g.SECTORS[k] === x)] && !s.mods[x.module].units);
        g.setRecipe(s, waiting || s.res.components < 15 ? 'components' : 'compute');
      }
      if (s.tech.analysis && !s.mods.fabricator.units && s.res.material >= 60 && !s.short) g.buy(s, 'fabricator');
      if (s.tech.allocation && !seen.has('prio')) { g.move(s, 'extractor', -1); mark('prio'); }
    }
    g.tick(s, g.TICK);
    if (s.trip && !wasTrip) { trips++; mark('TRIP'); } wasTrip = s.trip; heatSum += s.res.heat; if (s.hot) heatCapSecs += g.TICK; if (s.short) shortSecs += g.TICK;
    if (s.t >= 1 && s.mods.computer.units) mark('computer restored');
  }
  if (verbose) console.log(ev.join('\n'), '\n cond', JSON.stringify(Object.fromEntries(Object.entries(s.mods).map(([k, m]) => [k, Math.round(m.cond)]))), '| trips:', trips, '| hot:', heatCapSecs.toFixed(0) + 's, short:', shortSecs.toFixed(0) + 's of', total, '| units', JSON.stringify(Object.fromEntries(Object.entries(s.mods).map(([k, m]) => [k, m.units]))));
  return s;
}
if (require.main === module) run();
module.exports = { run };
