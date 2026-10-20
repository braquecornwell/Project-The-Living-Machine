const g=require('./game.js');let s=g.newState(),bad=0;
for(let i=0;i<6000;i++){ if(i%50==0){g.salvage(s);g.buy(s,'computer');g.buy(s,'scanner');g.buy(s,'fabricator');g.buy(s,'generator');for(const t in g.TECHS)g.research(s,t);}
 g.tick(s,g.TICK); for(const r in g.RES) if(!(s.res[r]>=0&&s.res[r]<=g.RES[r].cap))bad++; }
const s2=g.deserialize(g.serialize(s));
console.log('negatives/overcap:',bad,'| techs:',Object.keys(s.tech).length,'| roundtrip tech ok:',Object.keys(s2.tech).length===Object.keys(s.tech).length,'| junk save ok:',!!g.deserialize('{bad').res);
// old-format save (pre-signal, 2-module order) must still load
const old=g.deserialize(JSON.stringify({v:1,t:5,res:{energy:10,material:3,computation:1,heat:0},order:['extractor','computer'],mods:{generator:{units:2,on:true}},tech:{thermal:true}}));
console.log('old save ok:',old.mods.generator.units===2&&old.tech.thermal&&old.res.signal===0&&old.order.length===6,'| fabricator hidden before analysis:',!g.visible(g.newState(),'fabricator'));
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
// ---- sectors, survey, new modules, recipes, rules, forecast ----
const mk=()=>{const q=g.newState();q.res.energy=200;q.mods.scanner.units=1;return q;};
let v=mk();v.res.signal=100;g.startSurvey(v,'cooling');console.log('survey blocked without analysis:',v.survey.id===null&&v.res.signal===100);
v.tech.analysis=true;g.startSurvey(v,'cooling');console.log('survey starts + pays signal:',v.survey.id==='cooling'&&v.res.signal===70);
for(let i=0;i<500;i++){v.res.energy=200;g.tick(v,g.TICK);} console.log('survey completes (45s) and reveals module:',v.sectors.cooling&&!v.survey.id&&g.visible(v,'cooler'));
let v2=mk();v2.tech.analysis=true;v2.res.signal=100;g.startSurvey(v2,'cooling');v2.mods.scanner.on=false;for(let i=0;i<600;i++)g.tick(v2,g.TICK);console.log('survey stalls when scanner is off:',v2.survey.p===0);
v2.mods.scanner.on=true;
let cl=mk();cl.sectors.cooling=true;cl.mods.cooler.units=1;cl.res.material=50;cl.res.heat=50;cl.mods.generator.on=false;cl.mods.extractor.on=false;g.tick(cl,g.TICK);
let nc=mk();nc.res.heat=50;nc.mods.generator.on=false;nc.mods.extractor.on=false;g.tick(nc,g.TICK);console.log('cooler removes heat beyond passive:',cl.res.heat<nc.res.heat-0.2);
let fx=mk();fx.sectors.flux=true;fx.mods.flux.units=1;fx.mods.generator.on=false;fx.mods.extractor.on=false;fx.res.energy=0;fx.res.heat=60;g.tick(fx,g.TICK);const eHot=fx.res.energy;
fx.res.energy=0;fx.res.heat=20;g.tick(fx,g.TICK);console.log('flux core makes more energy when hotter:',eHot>fx.res.energy*2&&fx.res.energy>0);
let fb=mk();fb.tech.analysis=true;fb.mods.fabricator.units=1;fb.res.material=100;g.setRecipe(fb,'components');for(let i=0;i<50;i++){fb.res.energy=200;g.tick(fb,g.TICK);}console.log('fabricator makes components:',fb.res.components>0,'| computation not made:',fb.res.computation===0);
let by=mk();by.sectors.cooling=true;by.res.material=500;g.buy(by,'cooler');console.log('sector module needs components:',by.mods.cooler.units===0);by.res.components=20;g.buy(by,'cooler');console.log('buy with components ok:',by.mods.cooler.units===1&&by.res.components<20);
// rules
let ru=mk();ru.tech.rules=true;ru.tech.overclock=true;ru.mods.computer.units=1;ru.res.computation=100;
g.setRule(ru,0,{m:'heat',op:'>',v:50,mod:'computer',act:'eco'});ru.res.heat=70;ru.t=10;for(let i=0;i<10;i++){ru.res.heat=70;g.tick(ru,g.TICK);}
console.log('rule fires:',ru.mods.computer.mode==='eco'&&ru.rules[0].hit);
ru.t=30;ru.res.heat=10;for(let i=0;i<10;i++){ru.res.heat=10;g.tick(ru,g.TICK);}console.log('rule restores when false:',ru.mods.computer.mode==='normal'&&!ru.rules[0].hit);
g.setRule(ru,1,{m:'heat',op:'>',v:1,mod:'computer',act:'off'});console.log('locked slot refuses rule:',ru.rules[1]===null);ru.res.components=100;g.unlockSlot(ru);console.log('unlock slot costs components:',ru.slots===2&&ru.res.components===80);
const cu=ru.res.computation;ru.rules[0].en=true;g.tick(ru,g.TICK);console.log('rule upkeep costs computation:',ru.res.computation<cu+0.5);
let rp=mk();rp.tech.rules=true;rp.res.computation=0;g.setRule(rp,0,{m:'heat',op:'>',v:0,mod:'generator',act:'off'});rp.res.heat=50;for(let i=0;i<30;i++){rp.res.heat=50;g.tick(rp,g.TICK);}console.log('rules pause with no computation:',rp.mods.generator.on===true);
let pr=mk();g.setRule(pr,0,{m:'tripEta',op:'<',v:20,mod:'generator',act:'off'});console.log('trip forecast metric needs Predictive Maintenance:',pr.rules[0]===null||pr.rules[0].m!=='tripEta');
let te=g.newState();te.rates={heat:{p:5,c:1}};te.res.heat=60;console.log('trip forecast:',Math.round(g.tripEta(te))===10);
// persistence of new state
const sv=g.newState();sv.tech.rules=true;sv.slots=2;sv.sectors.flux=true;sv.survey={id:'cooling',p:12};sv.recipe='components';sv.res.components=7;g.setRule(sv,0,{m:'heat',op:'>',v:55,mod:'computer',act:'off'});sv.mods.computer.units=1;sv.rules[0].hit=true;sv.rules[0].prev={on:true,mode:'normal'};
const sl=g.deserialize(g.serialize(sv));console.log('roundtrip sectors/survey/recipe/rules:',sl.sectors.flux&&sl.survey.id==='cooling'&&sl.recipe==='components'&&sl.slots===2&&sl.res.components===7);
console.log('roundtrip rule is intact:',JSON.stringify([sl.rules[0].m,sl.rules[0].v,sl.rules[0].act,sl.rules[0].hit]));
const junk=g.deserialize(JSON.stringify({rules:[{m:'nope',op:'?',v:'x',mod:'zzz',act:'boom'},5,null],slots:99,survey:{id:'zzz'},sectors:{flux:'yes'}}));console.log('junk rules/survey ignored:',junk.slots===3&&junk.survey.id===null&&junk.sectors.flux===false);
// floors open downward
const fl=g.newState();console.log('floors: start with 2:',fl.levels===2);
fl.res.material=10;g.tick(fl,g.TICK);console.log('floor 3 opens with material:',fl.levels===3,'| log says so:',/Level 3/.test(fl.log[0].m));
console.log('floor 4 needs analysis:',fl.levels<4);fl.tech.analysis=true;g.tick(fl,g.TICK);console.log('floor 4 opens after analysis:',fl.levels===4);
console.log('every module is on a floor:',Object.keys(g.MODULES).every(id=>g.FLOORS.some(f=>f.mods.includes(id))));
const fl2=g.deserialize(g.serialize(fl));console.log('levels saved:',fl2.levels===4,'| junk levels clamped:',g.deserialize('{"levels":99}').levels===4&&g.deserialize('{"levels":-3}').levels===2);
