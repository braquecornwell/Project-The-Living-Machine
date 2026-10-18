'use strict';
let S = load(), last = Date.now(), acc = 0, focusId = null;
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
function render() {
  $('res').innerHTML = Object.keys(RES).map(r => {
    const x = S.rates[r] || { p: 0, c: 0 }, v = S.res[r], cap = RES[r].cap;
    const warn = (r === 'energy' && S.short) ? '<b class="warn">shortage</b>' : (r === 'heat' && S.hot) ? '<b class="warn">overheating</b>' : '';
    return `<div class="res ${r}"><div class="row"><span>${RES[r].name} ${warn}</span><span>${f(v)} / ${cap}</span></div>
      <div class="bar"><i style="width:${100 * v / cap}%"></i></div>
      <div class="row dim"><span>+${x.p.toFixed(1)} / -${x.c.toFixed(1)} per s</span><span>${S.tech.diagnostics ? eta(r) : sign(x.p - x.c) + '/s'}</span></div></div>`;
  }).join('') + `<button data-a="salvage">Salvage by hand (+2 material)</button>`;

  const ids = ['generator', ...S.order].filter(id => visible(S, id)), vis = S.order.filter(id => visible(S, id));
  const stat = id => { const m = S.mods[id]; return m.units < 1 ? 'dormant' : !m.on ? 'off' : m.cond < 50 ? 'worn' : m.run < 0.99 ? 'strained' : 'live'; };
  const rooms = ids.map(id => {
    const m = S.mods[id], cc = m.cond < 30 ? 'bad' : m.cond < 60 ? 'mid' : '';
    const tag = m.units < 1 ? 'dormant' : !m.on ? 'switched off' : 'running ' + Math.round(m.run * 100) + '%';
    const mode = S.tech.overclock && m.units > 0 && m.mode !== 'normal' ? `<span class="mode">${m.mode === 'oc' ? 'overclocked' : 'eco mode'}</span>` : '';
    return `<button class="room ${stat(id)}" data-a="focus" data-id="${id}" title="Show ${MODULES[id].name}"><b>${MODULES[id].name.split(' ').pop()}</b>
      <span>${m.units < 1 ? 'not restored' : m.units + (m.units === 1 ? ' unit' : ' units')}</span>${mode}
      <div class="cond ${cc}" title="Condition ${Math.round(m.cond)}%"><i style="width:${m.units < 1 ? 0 : m.cond}%"></i></div><span>${tag}</span></button>`;
  });
  if (!S.tech.analysis && S.mods.scanner.units > 0) rooms.push('<div class="room locked"><b>Unknown</b><span>unidentified signal</span><div class="cond"></div><span>needs analysis</span></div>');
  const linked = rooms.map((h, i) => i && i <= ids.length - 1 && S.mods[ids[i - 1]].run > 0 && S.mods[ids[i]].run > 0 ? '<div class="link flow"></div>' : '<div class="link"></div>');
  $('map').innerHTML = `<div class="rooms">${rooms.map((h, i) => (i ? linked[i] : '') + h).join('')}</div>
    <div class="gauge"><div class="row dim"><span>Structure heat</span><span>${f(S.res.heat)} / ${RES.heat.cap}${S.hot ? ' <b class="warn">slowing modules</b>' : ''}</span></div>
    <div class="gbar ${S.hot ? 'hot' : ''}"><i style="width:${S.res.heat}%"></i><u style="left:${HOT_START}%" title="Modules slow above ${HOT_START}"></u></div></div>`;
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
    return `<div class="mod ${focusId === id ? 'focus' : ''}" id="mod-${id}"><div class="row"><b>${d.name}</b><span class="dim">${m.units < 1 ? 'dormant' : m.on ? 'running ' + Math.round(m.run * 100) + '%' : 'switched off'}</span></div>
      <p class="dim">${d.desc}</p><p class="dim">Uses ${io(d.in)}/s. Makes ${io(d.out)}/s.</p>
      ${m.units > 0 ? `<p class="dim">Condition ${Math.round(m.cond)}%${m.cond < 50 ? ' <b class="warn">worn</b>' : ''}</p>` : ''}
      <button data-a="buy" data-id="${id}" ${ok ? '' : 'disabled'}>${m.units < 1 ? 'Restore' : 'Add unit'} (${c} material)</button>
      ${S.tech.overclock && m.units > 0 ? [['eco', 'Eco'], ['normal', 'Normal'], ['oc', 'Overclock']].map(([k, n]) => `<button data-a="mode" data-id="${id}" data-m="${k}" ${m.mode === k ? 'disabled' : ''}>${n}</button>`).join('') + '<br>' : ''}
      ${m.units > 0 && m.cond < 99 ? `<button data-a="repair" data-id="${id}" ${S.res.material >= repairCost(S, id) ? '' : 'disabled'}>Repair (${repairCost(S, id)} material)</button>` : ''}
      ${m.units > 0 ? `<button data-a="toggle" data-id="${id}">${m.on ? 'Switch off' : 'Switch on'}</button>` : ''}${prio}</div>`;
  }).join('');

  $('tech').innerHTML = Object.entries(TECHS).map(([id, t]) => {
    const have = S.tech[id], reqOk = t.req.every(r => S.tech[r]), ok = reqOk && S.res.computation >= t.cost && S.res.signal >= (t.signal || 0);
    return `<div class="mod ${have ? 'done' : ''}"><div class="row"><b>${t.name}</b><span class="dim">${t.type}</span></div><p class="dim">${t.desc}</p>
      ${have ? '<span class="dim">Researched</span>' : reqOk ? `<button data-a="research" data-id="${id}" ${ok ? '' : 'disabled'}>Research (${t.cost} computation${t.signal ? ' + ' + t.signal + ' signal' : ''})</button>`
      : `<span class="dim">Requires ${t.req.map(r => TECHS[r].name).join(', ')}</span>`}</div>`;
  }).join('');

  $('log').innerHTML = S.log.map(e => `<li><span class="dim">${e.t}s</span> ${e.m}</li>`).join('') || '<li class="dim">Nothing yet. The structure is silent.</li>';
}
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('button[data-a]'); if (!b || b.disabled) return;
  const a = b.dataset.a, id = b.dataset.id;
  if (a === 'salvage') salvage(S); if (a === 'buy') buy(S, id); if (a === 'toggle') toggle(S, id);
  if (a === 'bus') setBus(S, id); if (a === 'mode') setMode(S, id, b.dataset.m); if (a === 'repair') repair(S, id); if (a === 'repairAt') setRepairAt(S, +id); if (a === 'research') research(S, id); if (a === 'up') move(S, id, -1); if (a === 'down') move(S, id, 1);
  if (a === 'reset' && confirm('Erase the saved machine and start over?')) { S = newState(); save(S); }
  if (a === 'save') save(S);
  render();
  if (a === 'focus' && S.mods[id]) {
    focusId = id; setTimeout(() => { if (focusId === id) focusId = null; }, 1500); render();
    const el = $('mod-' + id); if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  }
});
setInterval(() => {
  const now = Date.now(); acc += Math.min(now - last, 5000) / 1000; last = now;
  while (acc >= TICK) { tick(S, TICK); acc -= TICK; }
  render();
}, 100);
setInterval(() => save(S), 5000);
window.addEventListener('beforeunload', () => save(S));
render();
