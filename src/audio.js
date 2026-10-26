// Recorded/physical sound design adapted from the owner's Battle Stations audio approach.
// Recording slices retain that project's measured onsets. See public/audio/CREDITS.md.
import { Vector3 } from 'three';
const FILES={sea:'bow-wave-360631.mp3',blast:'explosion-182429.mp3',distant:'distant-explosions-438693.mp3',metal:'metal-pole-drop-188206.mp3',gun:'avenger50-160355.mp3',rapid:'rapidfire-486053.mp3'};
const SLICES={blast:[[0,3]],distant:[[1.35,2.4],[6.2,2.6],[14.1,2.6],[29,2.6]],metal:[[13.02,0.8],[15.4,0.8],[17.68,0.8]],gun:[[0.615,0.18],[0.81,0.15],[0.955,0.3],[3.28,0.35]],rapid:[[0.2,0.8],[1.2,0.8],[2.4,0.8]]};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class AudioEngine {
 constructor(){this.enabled=true;this.speech=false;this.ctx=null;this.view='exterior';this.position=new Vector3();this.forward=new Vector3(0,0,-1);this.queue=[];this.voices=new Set();this.buffers={};this.clock=0;this.lastCIWS=-10;this.lastReport=-10;this.lastLaunch=-10;this.lastHit=-10;this.ambient=[];this.disposed=false;this.stats={recordings:0,voices:0,queued:0};}
 start(){
  if(this.disposed)return Promise.resolve();
  if(this.ctx){return this.ctx.resume().catch(()=>{});}
  const AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC)return Promise.resolve();
  try{
   const c=this.ctx=new AC();this.master=c.createGain();this.master.gain.value=this.enabled?0.55:0;
   const limiter=c.createDynamicsCompressor();limiter.threshold.value=-14;limiter.knee.value=15;limiter.ratio.value=5;limiter.attack.value=0.004;limiter.release.value=0.22;
   this.master.connect(limiter);limiter.connect(c.destination);
   this.outside=c.createBiquadFilter();this.outside.type='lowpass';this.outside.frequency.value=14000;this.outside.connect(this.master);
   this.cabin=c.createGain();this.cabin.gain.value=0.3;this.cabin.connect(this.master);
   this.reverb=c.createConvolver();this.reverb.buffer=this.makeImpulse();this.reverbGain=c.createGain();this.reverbGain.gain.value=0.09;this.reverb.connect(this.reverbGain);this.reverbGain.connect(this.master);
   this.noise=this.makeNoise(5);this.launchBuffer=this.makeEffect('launch',2.8);this.blastBuffer=this.makeEffect('blast',4);this.gunBuffer=this.makeEffect('gun',0.4);
   this.beginAmbience();this.setView(this.view);this.alarm();
   this.ready=this.loadRecordings();
   return c.resume().catch(()=>{});
  }catch{this.ctx=null;return Promise.resolve();}
 }
 async loadRecordings(){
  const base=import.meta.env?.BASE_URL??'/';
  await Promise.all(Object.entries(FILES).map(async([key,file])=>{try{
   const response=await fetch(`${base}audio/${file}`);if(!response.ok)return;
   const raw=await this.ctx.decodeAudioData(await response.arrayBuffer());if(this.disposed)return;
   this.buffers[key]=key==='sea'?[this.slice(raw,3,Math.min(22,raw.duration-3),true)]:SLICES[key].map(([at,dur])=>this.slice(raw,at,dur));
   this.stats.recordings++;if(key==='sea')this.addSea();
  }catch{/* synthesis is the complete offline/codec fallback */}}));
 }
 slice(raw,start,duration,loop=false){
  const n=Math.max(1,Math.min(Math.floor(duration*raw.sampleRate),raw.length-Math.floor(start*raw.sampleRate))),b=this.ctx.createBuffer(1,n,raw.sampleRate),a=b.getChannelData(0),offset=Math.max(0,Math.floor(start*raw.sampleRate));
  for(let ch=0;ch<raw.numberOfChannels;ch++){const x=raw.getChannelData(ch);for(let i=0;i<n;i++)a[i]+=(x[offset+i]||0)/raw.numberOfChannels;}
  let mean=0,peak=0;for(const x of a)mean+=x;mean/=n;for(let i=0;i<n;i++){a[i]-=mean;peak=Math.max(peak,Math.abs(a[i]));}
  for(let i=0;i<n;i++)a[i]=a[i]/Math.max(peak,0.05)*0.8*(loop?1:Math.min(1,i/(raw.sampleRate*0.004),(n-i)/(raw.sampleRate*0.09)));
  // Bake a wrap crossfade so a long sea recording never clicks at the loop boundary.
  if(loop){const fade=Math.min(Math.floor(raw.sampleRate),Math.floor(n/4));for(let i=0;i<fade;i++){const t=i/fade;a[n-fade+i]=a[n-fade+i]*(1-t)+a[i]*t;}return this.crop(b,fade,n-fade);}
  return b;
 }
 crop(raw,start,n){const b=this.ctx.createBuffer(1,n,raw.sampleRate);b.copyToChannel(raw.getChannelData(0).subarray(start,start+n),0);return b;}
 makeNoise(seconds){const c=this.ctx,b=c.createBuffer(1,c.sampleRate*seconds,c.sampleRate),a=b.getChannelData(0);let brown=0;for(let i=0;i<a.length;i++){brown=(brown+0.025*(Math.random()*2-1))/1.025;a[i]=brown*4;}return b;}
 makeImpulse(){const c=this.ctx,n=Math.floor(c.sampleRate*0.9),b=c.createBuffer(2,n,c.sampleRate);for(let ch=0;ch<2;ch++){const a=b.getChannelData(ch);for(let i=0;i<n;i++)a[i]=(Math.random()*2-1)*Math.exp(-i/(n*0.15))*(i>c.sampleRate*0.018?0.35:0);}return b;}
 makeEffect(kind,dur){const c=this.ctx,b=c.createBuffer(1,Math.floor(c.sampleRate*dur),c.sampleRate),a=b.getChannelData(0);let low=0;for(let i=0;i<a.length;i++){const t=i/c.sampleRate;low=0.92*low+0.08*(Math.random()*2-1);if(kind==='launch')a[i]=(low*2+Math.random()*0.2-0.1)*(1-Math.exp(-t*28))*Math.exp(-t*1.7)+Math.sin(t*2*Math.PI*(75-t*8))*0.2*Math.exp(-t*3);else if(kind==='blast')a[i]=(low*2+Math.sin(t*2*Math.PI*39)*0.35)*Math.exp(-t*1.6);else a[i]=(low*2+(Math.random()*2-1)*0.3)*Math.pow(0.5+0.5*Math.sin(t*2*Math.PI*75),2)*Math.exp(-t*6);}return b;}
 loop(buffer,gain,freq,bus){const c=this.ctx,s=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();s.buffer=buffer;s.loop=true;g.gain.value=gain;f.type='lowpass';f.frequency.value=freq;s.connect(f);f.connect(g);g.connect(bus);s.start();const item={s,g,f};this.ambient.push(item);return item;}
 beginAmbience(){
  const c=this.ctx;this.wind=this.loop(this.noise,0.10,2500,this.outside);this.seaFallback=this.loop(this.noise,0.18,850,this.outside);
  this.machinery=this.loop(this.noise,0.065,150,this.cabin);
  this.hum=[];for(const [freq,level]of[[42,0.045],[84,0.02],[167,0.007]]){const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=freq;g.gain.value=level;o.connect(g);g.connect(this.cabin);o.start();this.hum.push({o,g,freq});}
 }
 addSea(){if(!this.ctx||this.disposed||this.sea)return;this.sea=this.loop(this.buffers.sea[0],0,4200,this.outside);this.sea.g.gain.setTargetAtTime(0.24,this.ctx.currentTime,2);this.seaFallback.g.gain.setTargetAtTime(0.035,this.ctx.currentTime,2);}
 setView(view){this.view=view;const c=this.ctx;if(!c)return;const bridge=view==='bridge'||view===2;this.outside.frequency.setTargetAtTime(bridge?1900:13500,c.currentTime,0.5);this.cabin.gain.setTargetAtTime(bridge?1:0.25,c.currentTime,0.5);this.reverbGain.gain.setTargetAtTime(bridge?0.14:0.025,c.currentTime,0.5);}
 update(dt,{position,forward,speed=0}={}){
  if(position)this.position.copy(position);if(forward)this.forward.copy(forward).normalize();this.clock+=Math.min(Math.max(dt||0,0),1);
  const c=this.ctx;if(!c||this.disposed)return;const t=c.currentTime;this.master.gain.setTargetAtTime(this.enabled?0.55:0,t,0.07);
  const l=c.listener,p=this.position,f=this.forward;
  if(l.positionX){l.positionX.value=p.x;l.positionY.value=p.y;l.positionZ.value=p.z;l.forwardX.value=f.x;l.forwardY.value=f.y;l.forwardZ.value=f.z;l.upX.value=0;l.upY.value=1;l.upZ.value=0;}else{l.setPosition(p.x,p.y,p.z);l.setOrientation(f.x,f.y,f.z,0,1,0);}
  const motion=clamp(speed/16,0,1);this.wind.g.gain.setTargetAtTime(0.075+motion*0.08+Math.sin(this.clock*0.3)*0.012,t,0.8);
  if(this.sea)this.sea.g.gain.setTargetAtTime(0.13+motion*0.14+Math.sin(this.clock*0.5)*0.015,t,0.8);
  for(const h of this.hum){h.o.frequency.setTargetAtTime(h.freq*(0.86+motion*0.2),t,1);}
  // Acoustic travel time is wall-time based. Time compression does not pile up delayed reports.
  this.queue=this.queue.filter(item=>{item.remaining-=Math.min(Math.max(dt||0,0),0.25);if(item.remaining<=0){if(this.enabled)item.play();return false;}return true;});
  this.stats.voices=this.voices.size;this.stats.queued=this.queue.length;
 }
 schedule(pos,play,delay=true){if(!this.ctx||!this.enabled||this.disposed)return;const distance=pos?pos.distanceTo(this.position):0;if(distance>45000)return;const travel=delay?distance/343:0;if(travel<0.12)play();else{if(this.queue.length>=48)this.queue.shift();this.queue.push({remaining:travel,play});}}
 play(buffer,pos,{level=0.5,rate=1,ref=130,cutoff=12000,direct=false}={}){
  const c=this.ctx;if(!c||!buffer||!this.enabled||this.disposed||this.voices.size>=40)return;
  const s=c.createBufferSource(),g=c.createGain(),filter=c.createBiquadFilter();s.buffer=buffer;s.playbackRate.value=rate;g.gain.value=level;filter.type='lowpass';const dist=pos?pos.distanceTo(this.position):0;filter.frequency.value=Math.max(220,cutoff/(1+dist/3500));s.connect(filter);filter.connect(g);
  let panner=null;if(pos){panner=c.createPanner();panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=ref;panner.maxDistance=60000;panner.rolloffFactor=0.65;panner.positionX.value=pos.x;panner.positionY.value=pos.y;panner.positionZ.value=pos.z;g.connect(panner);panner.connect(direct?this.master:this.outside);panner.connect(this.reverb);}else{g.connect(direct?this.master:this.outside);g.connect(this.reverb);}
  this.voices.add(s);s.onended=()=>{this.voices.delete(s);s.disconnect();g.disconnect();filter.disconnect();panner?.disconnect();};s.start();return s;
 }
 sample(key){const a=this.buffers[key];return a?.[Math.floor(Math.random()*a.length)];}
 launch(m){if(!m?.pos)return;const p=m.pos.clone();this.schedule(p,()=>{this.play(this.launchBuffer,p,{level:(m.kind==='granit'||m.kind==='bazalt')?0.85:0.48,rate:(m.kind==='granit'||m.kind==='bazalt')?0.8:1.2,ref:220});if(m.kind==='fort')this.play(this.sample('metal'),p,{level:0.14,rate:0.75,ref:150});});}
 explosion(pos,scale=1){if(!pos)return;const p=pos.clone();this.schedule(p,()=>{const d=p.distanceTo(this.position);this.play(this.sample(d>2500?'distant':'blast')||this.blastBuffer,p,{level:Math.min(1.4,0.45+scale*0.22),rate:0.85+Math.random()*0.2,ref:450,cutoff:9500});this.play(this.blastBuffer,p,{level:0.3*Math.min(2,scale),rate:0.65,ref:500,cutoff:420});});}
 hit(pos){if(this.clock-this.lastHit<0.6)return;this.lastHit=this.clock;this.play(this.sample('metal')||this.blastBuffer,null,{level:0.65,rate:0.65,direct:true});this.rumble(2.2,0.35);this.alarm(1);this.report('Damage reported.');}
 ciws(from){if(!from||this.clock-this.lastCIWS<0.16)return;this.lastCIWS=this.clock;const p=from.clone();this.schedule(p,()=>{this.play(this.sample('gun')||this.gunBuffer,p,{level:0.23,rate:1.25+Math.random()*0.12,ref:90,cutoff:8000});this.play(this.gunBuffer,p,{level:0.3,rate:0.95,ref:90});if(Math.random()<0.2)this.play(this.sample('rapid'),p,{level:0.08,rate:1.15,ref:80});},false);}
 chaff(pos){const p=pos?.clone();this.play(this.gunBuffer,p,{level:0.22,rate:0.45,ref:120});this.tone(700,0.09,0.025);}
 tone(freq=700,duration=0.12,volume=0.04){const c=this.ctx;if(!c||!this.enabled)return;const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(0,c.currentTime);g.gain.linearRampToValueAtTime(volume,c.currentTime+0.008);g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+duration);o.connect(g);g.connect(this.master);o.onended=()=>{o.disconnect();g.disconnect();};o.start();o.stop(c.currentTime+duration+0.02);}
 rumble(duration=1,volume=0.2){if(!this.ctx||!this.enabled)return;this.play(this.blastBuffer,null,{level:volume,rate:clamp(4/duration,0.5,4),cutoff:160,direct:true});}
 alarm(count=3){const c=this.ctx;if(!c||!this.enabled)return;for(let i=0;i<count;i++){const o=c.createOscillator(),g=c.createGain(),at=c.currentTime+i*0.55;o.type='triangle';o.frequency.setValueAtTime(620,at);o.frequency.linearRampToValueAtTime(470,at+0.32);g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(0.055,at+0.02);g.gain.exponentialRampToValueAtTime(0.0001,at+0.4);o.connect(g);g.connect(this.master);o.onended=()=>{o.disconnect();g.disconnect();};o.start(at);o.stop(at+0.42);}}
 report(text){if(!this.enabled||!this.speech||!globalThis.speechSynthesis||this.clock-this.lastReport<12)return;this.lastReport=this.clock;if(globalThis.speechSynthesis.speaking)return;try{const u=new SpeechSynthesisUtterance(String(text).slice(0,140));u.rate=0.95;u.volume=0.35;globalThis.speechSynthesis.speak(u);}catch{}}
 dispose(){this.disposed=true;this.queue=[];for(const s of this.voices){try{s.stop();}catch{}}for(const a of this.ambient){try{a.s.stop();}catch{}}for(const h of this.hum||[]){try{h.o.stop();}catch{}}this.ctx?.close().catch(()=>{});}
}
