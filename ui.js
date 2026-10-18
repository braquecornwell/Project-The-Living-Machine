'use strict';
let S = load(), last = Date.now(), acc = 0;
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

  const ids = ['generator', ...S.order];
  $('map').innerHTML = ids.map(id => {
    const m = S.mods[id], st = m.units < 1 ? 'dormant' : !m.on ? 'off' : m.run < 0.99 ? 'strained' : 'live';
    return `<div class="room ${st}"><b>${MODULES[id].name.split(' ').pop()}</b><span>${m.units} unit${m.units === 1 ? '' : 's'}</span></div>`;
  }).join('<div class="link"></div>') + `<div class="heat ${S.hot ? 'hot' : ''}" style="--h:${S.res.heat}%"></div>`;

  $('mods').innerHTML = ids.map(id => {
    const d = MODULES[id], m = S.mods[id], c = cost(S, id), ok = S.res.material >= c;
    const io = o => Object.entries(o).map(([r, n]) => n * Math.max(1, m.units) + ' ' + RES[r].name.toLowerCase()).join(', ') || 'nothing';
    const i = S.order.indexOf(id);
    const prio = S.tech.allocation && i >= 0 ? `<span class="prio">priority ${i + 1}
      <button data-a="up" data-id="${id}">▲</button><button data-a="down" data-id="${id}">▼</button></span>` : '';
    return `<div class="mod"><div class="row"><b>${d.name}</b><span class="dim">${m.units < 1 ? 'dormant' : m.on ? 'running ' + Math.round(m.run * 100) + '%' : 'switched off'}</span></div>
      <p class="dim">${d.desc}</p><p class="dim">Uses ${io(d.in)}/s. Makes ${io(d.out)}/s.</p>
      <button data-a="buy" data-id="${id}" ${ok ? '' : 'disabled'}>${m.units < 1 ? 'Restore' : 'Add unit'} (${c} material)</button>
      ${m.units > 0 ? `<button data-a="toggle" data-id="${id}">${m.on ? 'Switch off' : 'Switch on'}</button>` : ''}${prio}</div>`;
  }).join('');

  $('tech').innerHTML = Object.entries(TECHS).map(([id, t]) => {
    const have = S.tech[id], reqOk = t.req.every(r => S.tech[r]), ok = reqOk && S.res.computation >= t.cost;
    return `<div class="mod ${have ? 'done' : ''}"><div class="row"><b>${t.name}</b><span class="dim">${t.type}</span></div><p class="dim">${t.desc}</p>
      ${have ? '<span class="dim">Researched</span>' : reqOk ? `<button data-a="research" data-id="${id}" ${ok ? '' : 'disabled'}>Research (${t.cost} computation)</button>`
      : `<span class="dim">Requires ${t.req.map(r => TECHS[r].name).join(', ')}</span>`}</div>`;
  }).join('');

  $('log').innerHTML = S.log.map(e => `<li><span class="dim">${e.t}s</span> ${e.m}</li>`).join('') || '<li class="dim">Nothing yet. The structure is silent.</li>';
}
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('button[data-a]'); if (!b || b.disabled) return;
  const a = b.dataset.a, id = b.dataset.id;
  if (a === 'salvage') salvage(S); if (a === 'buy') buy(S, id); if (a === 'toggle') toggle(S, id);
  if (a === 'research') research(S, id); if (a === 'up') move(S, id, -1); if (a === 'down') move(S, id, 1);
  if (a === 'reset' && confirm('Erase the saved machine and start over?')) { S = newState(); save(S); }
  if (a === 'save') save(S);
  render();
});
setInterval(() => {
  const now = Date.now(); acc += Math.min(now - last, 5000) / 1000; last = now;
  while (acc >= TICK) { tick(S, TICK); acc -= TICK; }
  render();
}, 100);
setInterval(() => save(S), 5000);
window.addEventListener('beforeunload', () => save(S));
render();
