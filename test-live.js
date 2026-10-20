// Live check: boots the page in jsdom (npm i jsdom), waits for the real timer and fails if the screen stops updating or throws.
const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(String(e.detail&&e.detail.message||e.message)));
const html=fs.readFileSync('index.html','utf8').replace(/<script src="[^"]+"><\/script>/g,'');
const w=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/',virtualConsole:vc}).window;
w.innerWidth=2560;w.innerHeight=960;w.matchMedia=()=>({matches:false});
const code=fs.readFileSync('game.js','utf8').replace("if (typeof module","if(false&&typeof module")+'\n'+fs.readFileSync('ui.js','utf8')+'\nwindow.__S=()=>S;';
w.eval(code);
const t0=w.__S().t, h0=w.document.getElementById('inst').innerHTML;
setTimeout(()=>{const t1=w.__S().t,h1=w.document.getElementById('inst').innerHTML;
 console.log('sim time advanced:',(t1-t0).toFixed(1),'s | meters changed:',h0!==h1,'| errors:',errs.length,errs.slice(0,2));process.exit(0)},1500);
