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
