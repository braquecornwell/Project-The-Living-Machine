const g=require('./game.js');let s=g.newState(),bad=0;
for(let i=0;i<6000;i++){ if(i%50==0){g.salvage(s);g.buy(s,'computer');g.buy(s,'scanner');g.buy(s,'fabricator');g.buy(s,'generator');for(const t in g.TECHS)g.research(s,t);}
 g.tick(s,g.TICK); for(const r in g.RES) if(!(s.res[r]>=0&&s.res[r]<=g.RES[r].cap))bad++; }
const s2=g.deserialize(g.serialize(s));
console.log('negatives/overcap:',bad,'| techs:',Object.keys(s.tech).length,'| roundtrip tech ok:',Object.keys(s2.tech).length===Object.keys(s.tech).length,'| junk save ok:',!!g.deserialize('{bad').res);
// old-format save (pre-signal, 2-module order) must still load
const old=g.deserialize(JSON.stringify({v:1,t:5,res:{energy:10,material:3,computation:1,heat:0},order:['extractor','computer'],mods:{generator:{units:2,on:true}},tech:{thermal:true}}));
console.log('old save ok:',old.mods.generator.units===2&&old.tech.thermal&&old.res.signal===0&&old.order.length===4,'| fabricator hidden before analysis:',!g.visible(g.newState(),'fabricator'));
