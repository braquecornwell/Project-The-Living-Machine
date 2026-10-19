const g=require('./game.js');let s=g.newState(),bad=0;
for(let i=0;i<6000;i++){ if(i%50==0){g.salvage(s);g.buy(s,'computer');g.buy(s,'scanner');g.buy(s,'fabricator');g.buy(s,'generator');for(const t in g.TECHS)g.research(s,t);}
 g.tick(s,g.TICK); for(const r in g.RES) if(!(s.res[r]>=0&&s.res[r]<=g.RES[r].cap))bad++; }
const s2=g.deserialize(g.serialize(s));
console.log('negatives/overcap:',bad,'| techs:',Object.keys(s.tech).length,'| roundtrip tech ok:',Object.keys(s2.tech).length===Object.keys(s.tech).length,'| junk save ok:',!!g.deserialize('{bad').res);
// old-format save (pre-signal, 2-module order) must still load
const old=g.deserialize(JSON.stringify({v:1,t:5,res:{energy:10,material:3,computation:1,heat:0},order:['extractor','computer'],mods:{generator:{units:2,on:true}},tech:{thermal:true}}));
console.log('old save ok:',old.mods.generator.units===2&&old.tech.thermal&&old.res.signal===0&&old.order.length===4,'| fabricator hidden before analysis:',!g.visible(g.newState(),'fabricator'));
// bus: overflow energy is routed, not created from nothing; stays within caps
const b=g.newState();b.tech.bus=true;g.setBus(b,'material');b.mods.generator.units=12;b.mods.extractor.on=false;b.res.energy=200;const m0=b.res.material;g.tick(b,g.TICK);
console.log('bus routes overflow:',b.res.material>m0&&b.res.energy<=g.RES.energy.cap);
const w=g.newState();w.tech.bus=true;g.setBus(w,'off');w.mods.generator.units=12;w.mods.extractor.on=false;w.res.energy=200;g.tick(w,g.TICK);console.log('bus off wastes overflow:',w.res.material===0);
// maintenance: wear, repair, drones, old-save default
const w2=g.newState();for(let i=0;i<1000;i++)g.tick(w2,g.TICK);
const c0=w2.mods.generator.cond;w2.res.material=100;const m1=w2.res.material;g.repair(w2,'generator');
console.log('wear:',c0<100&&c0>80,'| repair restores+charges:',w2.mods.generator.cond===100&&w2.res.material<m1);
const d2=g.newState();d2.tech.drones=true;g.setRepairAt(d2,70);d2.mods.generator.cond=50;d2.res.material=50;d2.res.energy=100;for(let i=0;i<100;i++)g.tick(d2,g.TICK);
console.log('drones repair:',d2.mods.generator.cond>60,'| old save cond default:',old.mods.generator.cond===100);
// overclock: throughput, input cost and wear scale by mode
function mode(x){const q=g.newState();q.tech.overclock=true;q.mods.computer.units=1;g.setMode(q,'computer',x);q.mods.generator.on=false;q.res.energy=200;
 for(let i=0;i<100;i++){q.res.energy=200;g.tick(q,g.TICK);} return q;}
const E=mode('eco'),N=mode('normal'),O=mode('oc');
console.log('modes output eco<normal<oc:',E.res.computation<N.res.computation&&N.res.computation<O.res.computation,'| wear oc>normal>eco:',O.mods.computer.cond<N.mods.computer.cond&&N.mods.computer.cond<E.mods.computer.cond);
const nt=g.newState();nt.mods.computer.units=1;g.setMode(nt,'computer','oc');console.log('mode ignored without tech:',nt.mods.computer.mode==='normal');
// thermal trip: shuts everything down, damages modules, clears when cool
const tr=g.newState();tr.res.heat=99.99;g.tick(tr,g.TICK);
const e0=tr.res.energy;g.tick(tr,g.TICK);
console.log('trip fires:',tr.trip&&tr.mods.generator.cond<90&&tr.mods.generator.run===0);
tr.res.heat=39;g.tick(tr,g.TICK);console.log('trip clears when cool:',tr.trip===false);
const hw=g.newState(),cw=g.newState();hw.res.heat=80;for(let i=0;i<100;i++){hw.res.heat=80;g.tick(hw,g.TICK);cw.res.heat=0;g.tick(cw,g.TICK);}
console.log('hot wears faster:',hw.mods.generator.cond<cw.mods.generator.cond);
