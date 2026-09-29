// Stylised creature voices, generated locally. Not recordings of real species.
// Care sounds use a voiced/noisy waveform with mouth resonances, not note chords.
(()=>{
 const profiles={auri:{pitch:245,warmth:.9},nexo:{pitch:170,warmth:1.15},bruma:{pitch:310,warmth:.76}};
 const cache=new WeakMap();let active=null;
 function makeBuffer(ctx,pet,action){
  let bank=cache.get(ctx);if(!bank){bank=new Map();cache.set(ctx,bank);}
  const key=pet+':'+action;if(bank.has(key))return bank.get(key);
  const profile=profiles[pet]||profiles.auri,rate=24000;
  const parts=action==='pet'?[[0,.68,.62,.95,1],[.68,.22,1.2,.85,0]]:
   action==='feed'?[[0,.16,.7,.8,0],[.22,.17,.75,.9,0],[.46,.4,.72,.58,1]]:
   [[0,.3,.9,1.55,0],[.4,.5,1.1,.78,0]];
  const buffer=ctx.createBuffer(1,Math.ceil(1.05*rate),rate),out=buffer.getChannelData(0);
  let seed=pet.length*97+action.length*31,peak=0;
  const noise=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2147483648-1;};
  for(const [offset,duration,from,to,purr] of parts){
   let phase=0,breath=0;const n=Math.floor(duration*rate),start=Math.floor(offset*rate);
   for(let i=0;i<n;i++){
    const t=i/rate,u=i/n,env=Math.min(1,t/.035,(duration-t)/.10);
    const bend=Math.sin(u*Math.PI)*.17,f0=profile.pitch*(from+(to-from)*u+bend)*(1+.012*Math.sin(t*31));
    phase+=2*Math.PI*f0/rate;
    let voiced=0;
    for(let h=1;h<=12;h++){
     const hz=h*f0,vowel=profile.warmth*(1+.16*Math.sin(u*Math.PI));
     const resonances=.75*Math.exp(-Math.pow((hz-550*vowel)/230,2))+.45*Math.exp(-Math.pow((hz-1350*vowel)/440,2));
     voiced+=Math.sin(h*phase)*(.13/h+resonances/Math.pow(h,.72));
    }
    breath=.7*breath+.3*noise();
    const pulse=purr?.48+.52*Math.pow(.5+.5*Math.sin(t*2*Math.PI*26),2):.85+.15*Math.sin(t*35);
    const lick=action==='feed'?Math.exp(-t*60)*breath*.4:0;
    const value=env*(voiced*pulse+breath*.045+lick);
    out[start+i]+=value;peak=Math.max(peak,Math.abs(out[start+i]));
   }
  }
  if(peak)for(let i=0;i<out.length;i++)out[i]=Math.tanh(out[i]/peak*1.15)*.14;
  bank.set(key,buffer);return buffer;
 }
 function stop(){
  if(!active)return;const old=active;active=null;
  try{old.gain.gain.cancelScheduledValues(old.ctx.currentTime);old.gain.gain.setTargetAtTime(0,old.ctx.currentTime,.012);old.source.stop(old.ctx.currentTime+.05);}catch{}
 }
 function play(ctx,pet,action){
  stop();const source=ctx.createBufferSource(),gain=ctx.createGain();
  source.buffer=makeBuffer(ctx,pet,action);gain.gain.value=.5;source.connect(gain);gain.connect(ctx.destination);
  const item={ctx,source,gain};active=item;
  source.onended=()=>{source.disconnect();gain.disconnect();if(active===item)active=null;};source.start();
 }
 window.PetVoice={play,stop,makeBuffer};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 addEventListener('pagehide',stop);
})();
