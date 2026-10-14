// Procedural music + synthesized SFX, all generated with the Web Audio API.
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
const SCALES={maj:[0,2,4,5,7,9,11],min:[0,2,3,5,7,8,10],mix:[0,2,4,5,7,9,10],dor:[0,2,3,5,7,9,10]};
const mtof=m=>440*Math.pow(2,(m-69)/12);
const PRESETS={
  menu:{seed:11,bpm:96,scale:'maj',root:57,prog:[0,5,3,4],style:'dream'},
  battle1:{seed:3,bpm:128,scale:'maj',root:60,prog:[0,4,5,3],style:'bounce'},
  battle2:{seed:77,bpm:138,scale:'min',root:57,prog:[0,5,6,4],style:'march'},
  battle3:{seed:21,bpm:116,scale:'mix',root:62,prog:[0,6,3,0],style:'swing'},
  battle4:{seed:42,bpm:124,scale:'dor',root:55,prog:[0,3,0,4],style:'bounce'},
  victory:{seed:5,bpm:132,scale:'maj',root:60,prog:[0,3,4,0],style:'fanfare'},
};
function makeSong(name){
  const P=PRESETS[name],r=mulberry(P.seed),sc=SCALES[P.scale];
  const note=d=>P.root+12*Math.floor(d/7)+sc[((d%7)+7)%7];
  // a motif is 32 sixteenth steps (2 bars) of notes relative to the chord root degree
  const motif=(density)=>{const m=[];let prev=4;for(let s=0;s<32;s++){
      const strong=s%4===0,p=strong?density:density*0.45;
      if(r()<p){const opts=[0,2,4,7,4,2,1,3,5,6];let d=opts[Math.floor(r()*opts.length)];
        if(Math.abs(d-prev)>4&&r()<0.6)d=prev+(d>prev?2:-2);prev=d;
        let len=1+(r()<0.5?1:0)+(strong&&r()<0.4?2:0);m.push({s,d,len});}}
    return m;};
  const dens=P.style==='dream'?0.55:P.style==='fanfare'?0.8:0.7;
  const m1=motif(dens),m2=motif(dens*0.9);
  const m1b=m1.map(n=>({...n})); if(m1b.length){const l=m1b[m1b.length-1];l.d=0;l.len=4;}
  return {P,note,spb:60/P.bpm/4,mel:[m1,m1,m2,m1b],bars:P.style==='fanfare'?4:16,r};
}
export class Sound{
  constructor(){this.ctx=null;this.muted=localStorage.getItem('worms_muted')==='1';this.track=null;}
  init(){
    if(this.ctx){if(this.ctx.state==='suspended')this.ctx.resume();return;}
    const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
    const c=this.ctx=new C();
    this.master=c.createGain();this.master.gain.value=this.muted?0:0.9;
    const comp=c.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;
    this.master.connect(comp);comp.connect(c.destination);
    this.music=c.createGain();this.music.gain.value=0.32;this.music.connect(this.master);
    this.sfx=c.createGain();this.sfx.gain.value=0.85;this.sfx.connect(this.master);
    // reverb
    const len=c.sampleRate*2.2,ir=c.createBuffer(2,len,c.sampleRate);
    for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3);}
    this.rev=c.createConvolver();this.rev.buffer=ir;const rg=c.createGain();rg.gain.value=0.35;this.rev.connect(rg);rg.connect(this.master);
    // echo for lead
    this.delay=c.createDelay(1);this.delay.delayTime.value=0.33;const fb=c.createGain();fb.gain.value=0.3;
    this.delay.connect(fb);fb.connect(this.delay);this.delay.connect(this.music);
    const nb=this.noiseBuf=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const nd=nb.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;
    this.timer=setInterval(()=>this.sched(),25);
    if(this.pending){const p=this.pending;this.pending=null;this.play(p);}
  }
  setMuted(m){this.muted=m;localStorage.setItem('worms_muted',m?'1':'0');if(this.master)this.master.gain.setTargetAtTime(m?0:0.9,this.ctx.currentTime,0.05);}
  play(name){
    if(!this.ctx){this.pending=name;return;}
    if(this.track&&this.track.name===name)return;
    const s=makeSong(name);s.name=name;s.step=0;s.next=this.ctx.currentTime+0.15;this.track=s;
  }
  stop(){this.track=null;}
  sched(){const s=this.track;if(!s||!this.ctx)return;
    while(s.next<this.ctx.currentTime+0.15){this.step(s,s.step,s.next);s.next+=s.spb*(s.P.style==='swing'&&s.step%2===0?1.18:s.P.style==='swing'?0.82:1);s.step++;
      if(s.P.style==='fanfare'&&s.step>=s.bars*16){this.track=null;return;}}}
  // ---------- instruments ----------
  osc(type,f,t,dur,vol,dest,o={}){const c=this.ctx,g=c.createGain(),os=c.createOscillator();os.type=type;os.frequency.setValueAtTime(f,t);
    if(o.slide)os.frequency.exponentialRampToValueAtTime(o.slide,t+dur);
    if(o.vib){const l=c.createOscillator(),lg=c.createGain();l.frequency.value=5.5;lg.gain.value=f*0.012;l.connect(lg);lg.connect(os.frequency);l.start(t);l.stop(t+dur+0.3);}
    const a=o.a||0.005,rel=o.r||0.08;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+a);g.gain.setTargetAtTime(o.sus!=null?vol*o.sus:vol*0.6,t+a,dur*0.4);g.gain.setTargetAtTime(0,t+dur,rel);
    let n=os;if(o.lp){const f2=c.createBiquadFilter();f2.type='lowpass';f2.frequency.value=o.lp;f2.Q.value=o.q||1;os.connect(f2);n=f2;}
    n.connect(g);g.connect(dest);if(o.send)g.connect(o.send);os.start(t);os.stop(t+dur+rel*6);return os;}
  noise(t,dur,vol,dest,type,freq,o={}){const c=this.ctx,src=c.createBufferSource();src.buffer=this.noiseBuf;src.playbackRate.value=o.rate||1;
    const f=c.createBiquadFilter();f.type=type;f.frequency.setValueAtTime(freq,t);if(o.to)f.frequency.exponentialRampToValueAtTime(o.to,t+dur);f.Q.value=o.q||0.7;
    const g=c.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    src.connect(f);f.connect(g);g.connect(dest);if(o.send)g.connect(o.send);src.start(t,Math.random()*1.5);src.stop(t+dur+0.05);}
  kick(t,v=1){this.osc('sine',150,t,0.18,0.9*v,this.music,{slide:42,r:0.08,sus:0.3});}
  snare(t,v=1){this.noise(t,0.16,0.45*v,this.music,'bandpass',1900,{q:0.6,send:this.rev});this.osc('triangle',190,t,0.06,0.3*v,this.music,{slide:120});}
  hat(t,v=1,open){this.noise(t,open?0.18:0.04,0.16*v,this.music,'highpass',7500);}
  step(s,i,t){const P=s.P,bar=Math.floor(i/16)%s.bars,st=i%16,chordDeg=P.prog[bar%4],ph=Math.floor(bar/2)%4;
    const style=P.style,n=s.note,M=this.music;
    // melody
    const mot=s.mel[ph],ms=(bar%2)*16+st;
    for(const nn of mot)if(nn.s===ms){const f=mtof(n(chordDeg+nn.d)+12);
      if(style==='dream')this.osc('triangle',f,t,nn.len*s.spb,0.2,M,{a:0.02,vib:1,send:this.delay});
      else{this.osc('square',f,t,nn.len*s.spb*0.9,0.075,M,{lp:3200,vib:nn.len>2,send:this.delay});this.osc('triangle',f*2,t,nn.len*s.spb*0.6,0.05,M,{});}}
    // bass
    const root=n(chordDeg)-24;
    if(style==='bounce'){if(st%4===0)this.osc('triangle',mtof(root),t,s.spb*1.5,0.5,M,{});if(st%4===2)this.osc('triangle',mtof(root+12),t,s.spb,0.35,M,{});}
    else if(style==='march'){if(st%2===0)this.osc('sawtooth',mtof(root),t,s.spb*0.9,0.18,M,{lp:500+300*(st%4===0),q:4});}
    else if(style==='swing'){if(st%4===0)this.osc('triangle',mtof(st%8===0?root:root+7),t,s.spb*3,0.5,M,{});}
    else if(style==='dream'){if(st===0)this.osc('sine',mtof(root),t,s.spb*14,0.45,M,{a:0.05});}
    else if(style==='fanfare'){if(st%4===0)this.osc('sawtooth',mtof(root+12),t,s.spb*3,0.15,M,{lp:1200});}
    // harmony
    const ch=[0,2,4].map(d=>mtof(n(chordDeg+d)));
    if(style==='dream'){const a=ch[[0,1,2,1][st%4]]*2;this.osc('sine',a,t,s.spb*1.5,0.08,M,{send:this.rev});if(st===0)ch.forEach(f=>this.osc('sawtooth',f,t,s.spb*15,0.025,M,{a:0.6,lp:900,send:this.rev}));}
    else if(style==='bounce'||style==='swing'){if(st%4===2||(style==='bounce'&&st===14))ch.forEach(f=>this.osc('square',f,t,s.spb*0.6,0.03,M,{lp:2200,send:this.rev}));}
    else if(style==='march'){if(st===0)ch.forEach(f=>this.osc('sawtooth',f,t,s.spb*15,0.03,M,{a:0.1,lp:1400,send:this.rev}));if(st%2===1)this.osc('square',ch[(st>>1)%3]*2,t,s.spb*0.5,0.03,M,{lp:2500});}
    else if(style==='fanfare'){if(st%2===0)ch.forEach(f=>this.osc('sawtooth',f*2,t,s.spb*1.5,0.04,M,{lp:3000,send:this.rev}));}
    // drums
    if(style==='dream'){if(st===0||st===10)this.kick(t,0.5);if(st%4===2)this.hat(t,0.5);}
    else if(style==='bounce'){if(st%4===0)this.kick(t);if(st===4||st===12)this.snare(t);if(st%2===1)this.hat(t,0.8,st===15);}
    else if(style==='march'){if(st%4===0)this.kick(t);if(st===4||st===12)this.snare(t);if(st===14||st===15)this.snare(t,0.4);this.hat(t,st%2?0.4:0.8);}
    else if(style==='swing'){if(st===0||st===6||st===8)this.kick(t);if(st===4||st===12)this.snare(t);if(st%2===0)this.hat(t,0.7);}
    else if(style==='fanfare'){if(st%4===0)this.kick(t);if(st%8===4)this.snare(t);}
  }
  // ---------- SFX ----------
  get ok(){return !!this.ctx;}
  boom(size=1){if(!this.ok)return;const t=this.ctx.currentTime,S=this.sfx;
    this.noise(t,0.6+size*0.9,0.9,S,'lowpass',2600,{to:90,send:this.rev,rate:0.7});
    this.osc('sine',95,t,0.5+size*0.4,0.9,S,{slide:28,r:0.2});this.noise(t,0.12,0.5,S,'highpass',3000);}
  shot(){if(!this.ok)return;const t=this.ctx.currentTime;this.noise(t,0.25,0.9,this.sfx,'lowpass',4000,{to:300});this.osc('square',180,t,0.05,0.3,this.sfx,{slide:60});}
  launch(){if(!this.ok)return;const t=this.ctx.currentTime;this.noise(t,0.5,0.6,this.sfx,'bandpass',600,{to:3000,q:2});this.osc('sawtooth',90,t,0.25,0.2,this.sfx,{slide:300,lp:1200});}
  throwS(){if(!this.ok)return;const t=this.ctx.currentTime;this.noise(t,0.25,0.4,this.sfx,'bandpass',900,{to:400,q:3});}
  jump(back){if(!this.ok)return;const t=this.ctx.currentTime;this.osc('sine',back?500:280,t,0.15,0.35,this.sfx,{slide:back?1100:640,r:0.05});}
  bounce(v=1){if(!this.ok)return;const t=this.ctx.currentTime;this.osc('triangle',220+Math.random()*60,t,0.06,0.25*v,this.sfx,{slide:120});}
  splash(){if(!this.ok)return;const t=this.ctx.currentTime;this.noise(t,0.8,0.7,this.sfx,'bandpass',1200,{to:300,q:1,send:this.rev});this.osc('sine',600,t,0.15,0.15,this.sfx,{slide:150});}
  teleport(){if(!this.ok)return;const t=this.ctx.currentTime;for(let i=0;i<3;i++)this.osc('sine',300*(i+1),t+i*0.05,0.4,0.12,this.sfx,{slide:2400*(i+1),send:this.rev,vib:1});}
  ui(){if(!this.ok)return;const t=this.ctx.currentTime;this.osc('square',880,t,0.04,0.08,this.sfx,{lp:3000});this.osc('square',1320,t+0.04,0.05,0.06,this.sfx,{lp:3000});}
  tick(){if(!this.ok)return;const t=this.ctx.currentTime;this.osc('square',1500,t,0.02,0.07,this.sfx,{lp:4000});}
  fuse(){if(!this.ok)return;const t=this.ctx.currentTime;this.noise(t,0.12,0.15,this.sfx,'highpass',5000);}
  jet(){if(!this.ok)return;const t=this.ctx.currentTime;this.noise(t,0.1,0.25,this.sfx,'lowpass',900);}
  plane(){if(!this.ok)return;const t=this.ctx.currentTime;this.osc('sawtooth',70,t,2.6,0.12,this.sfx,{slide:55,lp:500,a:0.4,vib:1});this.noise(t,2.8,0.3,this.sfx,'bandpass',400,{to:200});}
  build(){if(!this.ok)return;const t=this.ctx.currentTime;this.osc('square',160,t,0.08,0.3,this.sfx,{lp:800});this.osc('square',120,t+0.08,0.1,0.3,this.sfx,{lp:800});}
  // little worm "voice": formant-y chirps
  voice(pitch=1,mood='talk'){if(!this.ok)return;const t=this.ctx.currentTime,n=mood==='ow'?1:3+Math.floor(Math.random()*3);
    for(let i=0;i<n;i++){const f=(mood==='ow'?700:420+Math.random()*380)*pitch,tt=t+i*0.085;
      const o=this.osc('square',f,tt,mood==='ow'?0.35:0.06,0.07,this.sfx,{slide:mood==='ow'?f*0.45:f*(0.8+Math.random()*0.5),lp:1800,q:6,vib:mood==='ow'});}}
}
