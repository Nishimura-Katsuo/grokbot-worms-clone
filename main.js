import * as THREE from 'three';
import {EffectComposer} from './addons/postprocessing/EffectComposer.js';
import {RenderPass} from './addons/postprocessing/RenderPass.js';
import {ShaderPass} from './addons/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from './addons/postprocessing/UnrealBloomPass.js';
import {Sound} from './audio.js';

const Q=new URLSearchParams(location.search);
const W=2560,H=1280,DT=1/60,G=520,MAXV=900;
const snd=new Sound();
let R=Math.random;
const rnd=(a,b)=>a+R()*(b-a), clamp=(v,a,b)=>v<a?a:v>b?b:v, lerp=(a,b,t)=>a+(b-a)*t;
const gauss=()=>{let u=0;for(let i=0;i<4;i++)u+=Math.random();return (u-2)/0.58;};
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
// value noise
let PERM=new Float32Array(512);
function seedNoise(){for(let i=0;i<512;i++)PERM[i]=R();}
const fade=t=>t*t*(3-2*t);
function n1(x){const i=Math.floor(x),f=fade(x-i);return lerp(PERM[i&511],PERM[(i+1)&511],f);}
function h2(i,j){return PERM[(i*57+j*131+(i*j&255))&511];}
function n2(x,y){const i=Math.floor(x),j=Math.floor(y),fx=fade(x-i),fy=fade(y-j);return lerp(lerp(h2(i,j),h2(i+1,j),fx),lerp(h2(i,j+1),h2(i+1,j+1),fx),fy);}
function fbm1(x,o=4){let s=0,a=0.5,f=1;for(let i=0;i<o;i++){s+=a*n1(x*f+i*17.3);a*=0.5;f*=2.03;}return s/(1-Math.pow(0.5,o));}
function fbm2(x,y,o=4){let s=0,a=0.5,f=1;for(let i=0;i<o;i++){s+=a*n2(x*f+i*7.1,y*f-i*3.7);a*=0.5;f*=2.01;}return s/(1-Math.pow(0.5,o));}

// ---------- themes ----------
const THEMES={
 meadow:{skyT:[.16,.36,.72],skyB:[.98,.78,.55],sun:[1,.85,.6],fog:[.75,.72,.78],m:[[.36,.42,.62],[.28,.38,.45],[.16,.26,.24]],
   soilA:[.42,.27,.16],soilB:[.30,.19,.12],soilC:[.55,.42,.30],grass:[.32,.66,.18],grass2:[.62,.86,.28],water:[.08,.32,.48],water2:[.02,.08,.2],amb:[.75,.95,.45],ambSize:3,ambKind:'leaf'},
 desert:{skyT:[.25,.45,.78],skyB:[1,.82,.5],sun:[1,.9,.65],fog:[.95,.8,.6],m:[[.85,.62,.45],[.75,.5,.33],[.58,.36,.22]],
   soilA:[.80,.55,.32],soilB:[.62,.38,.20],soilC:[.92,.74,.48],grass:[.86,.72,.42],grass2:[.98,.88,.6],water:[.05,.4,.45],water2:[.01,.12,.18],amb:[1,.9,.7],ambSize:2,ambKind:'dust'},
 winter:{skyT:[.12,.2,.42],skyB:[.75,.72,.9],sun:[.9,.85,1],fog:[.7,.75,.9],m:[[.55,.6,.78],[.42,.48,.66],[.3,.35,.5]],
   soilA:[.46,.44,.52],soilB:[.3,.29,.38],soilC:[.66,.66,.74],grass:[.88,.93,1],grass2:[1,1,1],water:[.1,.25,.42],water2:[.02,.05,.15],amb:[1,1,1],ambSize:4,ambKind:'snow'},
 alien:{skyT:[.06,.02,.18],skyB:[.55,.18,.45],sun:[.6,1,.85],fog:[.4,.2,.45],m:[[.35,.16,.42],[.24,.1,.32],[.12,.05,.2]],
   soilA:[.34,.22,.48],soilB:[.2,.13,.32],soilC:[.52,.38,.66],grass:[.2,.9,.6],grass2:[.6,1,.85],water:[.25,.6,.15],water2:[.04,.15,.04],amb:[.5,1,.8],ambSize:3,ambKind:'spore'},
};
let TH=THEMES.meadow;

// ---------- renderer ----------
const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance',preserveDrawingBuffer:Q.has('shot')});
renderer.domElement.id='c';renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
document.body.prepend(renderer.domElement);
const scene=new THREE.Scene();
const VIEWH=720;let zoom=1;
const cam=new THREE.OrthographicCamera(-1,1,1,-1,-100,100);cam.position.set(W/2,H/2,10);
function viewW(){return VIEWH/zoom*innerWidth/innerHeight;}
function resize(){renderer.setSize(innerWidth,innerHeight);composer&&composer.setSize(innerWidth,innerHeight);updCam();}
function updCam(){const vh=VIEWH/zoom,vw=viewW();cam.left=-vw/2;cam.right=vw/2;cam.top=vh/2;cam.bottom=-vh/2;cam.updateProjectionMatrix();}
const composer=new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,cam));
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),0.5,0.45,0.92);composer.addPass(bloom);
const grade=new ShaderPass({uniforms:{tDiffuse:{value:null},flash:{value:0},time:{value:0}},
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
 fragmentShader:`uniform sampler2D tDiffuse;uniform float flash,time;varying vec2 vUv;
 void main(){vec3 c=clamp(texture2D(tDiffuse,vUv).rgb,0.,1.);c=mix(c,c*c*(3.-2.*c),.25);float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,1.12);
 vec2 d=vUv-.5;c*=1.-dot(d,d)*.9;c+=flash*vec3(1.,.8,.5);
 c+=(fract(sin(dot(vUv*1000.+time,vec2(12.9898,78.233)))*43758.5453)-.5)*.02;gl_FragColor=vec4(c,1.);}`});
composer.addPass(grade);
addEventListener('resize',resize);

const GLSL_NOISE=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.03+17.1;a*=.5;}return s;}
float fbm3(vec2 p){float s=0.,a=.5;for(int i=0;i<3;i++){s+=a*vn(p);p=p*2.03+17.1;a*=.5;}return s;}`;
const v3=a=>new THREE.Vector3(...a);
function mat(o){return new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,...o});}

// ---------- sky + parallax mountains (one fullscreen pass) ----------
const skyMat=mat({uniforms:{cam:{value:new THREE.Vector2()},view:{value:new THREE.Vector2()},time:{value:0},wind:{value:0},
  skyT:{value:new THREE.Vector3()},skyB:{value:new THREE.Vector3()},sun:{value:new THREE.Vector3()},fog:{value:new THREE.Vector3()},
  m0:{value:new THREE.Vector3()},m1:{value:new THREE.Vector3()},m2:{value:new THREE.Vector3()},alien:{value:0}},
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy*2.,0.,1.);}`,
 fragmentShader:GLSL_NOISE+`uniform vec2 cam,view;uniform float time,wind,alien;uniform vec3 skyT,skyB,sun,fog,m0,m1,m2;varying vec2 vUv;
 float ridge(float x,float s){return fbm(vec2(x*s,s*3.1));}
 void main(){
  vec2 wp=cam+(vUv-.5)*view; // world pos
  float hy=clamp((wp.y*.3+cam.y*.0+120.)/900.,0.,1.);
  vec3 col=mix(skyB,skyT,pow(clamp(vUv.y*.6+hy*.6,0.,1.),.9));
  vec2 sp=vec2(.72,.78);vec2 d=(vUv-sp)*vec2(view.x/view.y,1.);float sd=length(d);
  col+=sun*(.45*exp(-sd*6.)+.18*exp(-sd*1.6));col=mix(col,vec3(1.,.98,.9),smoothstep(.045,.035,sd));
  // stars for alien/dark skies
  vec2 sg=floor(vUv*vec2(view.x/view.y,1.)*180.);float st=step(.997,hash(sg))*alien*(.5+.5*sin(time*3.+hash(sg+1.)*40.));col+=st;
  // clouds (two layers, drift with wind)
  for(int k=0;k<2;k++){float fk=float(k);vec2 cp=vec2(wp.x*.15+cam.x*(.12+fk*.1)*0.,0.)+vec2(cam.x*(.2+fk*.15)+(vUv.x-.5)*view.x*.5,(vUv.y)*view.y*.6);
   cp.x+=time*(8.+wind*40.)*(1.+fk);
   float c=fbm(cp*vec2(.004,.012)+fk*9.)*1.3-.45-(1.-vUv.y)*.35;c=smoothstep(.0,.35,c);
   vec3 cc=mix(fog*1.05,vec3(1.)*(.9+.1*sun),.5+.5*vUv.y);cc+=sun*.25*exp(-sd*2.);
   col=mix(col,cc,c*(.55-fk*.15));}
  // three parallax mountain layers
  float fs[3];fs[0]=.18;fs[1]=.32;fs[2]=.5;
  vec3 mc[3];mc[0]=m0;mc[1]=m1;mc[2]=m2;
  for(int i=0;i<3;i++){float f=fs[i];float lx=cam.x*f+(vUv.x-.5)*view.x;float ly=cam.y*f+(vUv.y-.5)*view.y;
   float h=-80.+float(i)*-40.+fbm(vec2(lx*.0025+float(i)*13.,float(i)))*(380.-float(i)*60.)+fbm(vec2(lx*.012,float(i)*5.))*40.;
   if(i==2) h+=sin(lx*.004)*30.;
   float e=h-ly;
   if(e>0.){vec3 c=mc[i];float lit=fbm(vec2(lx*.01,ly*.01));c*=.85+.3*lit;c=mix(c,c*1.3+sun*.15,smoothstep(8.,0.,e));
     // trees / spires silhouettes on nearest layer
     c=mix(c,fog,(.55-float(i)*.2)*smoothstep(-200.,200.,ly-(h-260.)));col=c;}
   else col=mix(col,fog,.1*exp(e*.02));}
  col=mix(col,fog,smoothstep(.45,0.,vUv.y)*.25);
  gl_FragColor=vec4(col,1.);}`});
const skyQuad=new THREE.Mesh(new THREE.PlaneGeometry(1,1),skyMat);skyQuad.frustumCulled=false;skyQuad.renderOrder=-100;scene.add(skyQuad);

// ---------- terrain ----------
const mask=new Uint8Array(W*H*4);
const terrTex=new THREE.DataTexture(mask,W,H,THREE.RGBAFormat,THREE.UnsignedByteType);
terrTex.minFilter=terrTex.magFilter=THREE.LinearFilter;terrTex.generateMipmaps=false;
const solid=(x,y)=>{x|=0;y|=0;return x>=0&&x<W&&y>=0&&y<H&&mask[(y*W+x)*4]>127;};
const MAXL=6;
const terrUni={map:{value:terrTex},res:{value:new THREE.Vector2(W,H)},time:{value:0},sunDir:{value:new THREE.Vector2(.5,.8).normalize()},
 soilA:{value:new THREE.Vector3()},soilB:{value:new THREE.Vector3()},soilC:{value:new THREE.Vector3()},grass:{value:new THREE.Vector3()},grass2:{value:new THREE.Vector3()},
 sun:{value:new THREE.Vector3()},lights:{value:Array.from({length:MAXL},()=>new THREE.Vector4())}};
const terrMat=mat({uniforms:terrUni,
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:GLSL_NOISE+`uniform sampler2D map;uniform vec2 res,sunDir;uniform float time;uniform vec3 soilA,soilB,soilC,grass,grass2,sun;uniform vec4 lights[${MAXL}];varying vec2 vUv;
 float m(vec2 o){return texture2D(map,vUv+o/res).r;}
 void main(){vec4 c=texture2D(map,vUv);float a=smoothstep(.3,.7,c.r);if(a<.01)discard;
  vec2 p=vUv*res;
  vec2 g=vec2(m(vec2(6,0))-m(vec2(-6,0)),m(vec2(0,6))-m(vec2(0,-6)));
  vec2 g2=vec2(m(vec2(14,0))-m(vec2(-14,0)),m(vec2(0,14))-m(vec2(0,-14)));
  vec2 gg=g+g2*.6;vec2 n=length(gg)>.01?normalize(-gg):vec2(0.,1.);
  float e2=(m(vec2(2.5,0))+m(vec2(-2.5,0))+m(vec2(0,2.5))+m(vec2(0,-2.5)))*.25;
  float i1=(m(vec2(9,0))+m(vec2(-9,0))+m(vec2(0,9))+m(vec2(0,-9)))*.25;
  float i2=(m(vec2(20,20))+m(vec2(-20,20))+m(vec2(20,-20))+m(vec2(-20,-20))+m(vec2(0,30))+m(vec2(0,-30))+m(vec2(30,0))+m(vec2(-30,0)))*.125;
  float edge=1.-i1;
  // distance to air above
  float da=40.;for(int k=1;k<=9;k++){if(m(vec2(0,float(k)*3.5))<.5){da=float(k)*3.5;break;}}
  vec3 col;
  if(c.b>.5){ // steel girder
    float s=mod(p.x,24.);col=vec3(.78,.42,.16)*(.75+.25*vn(p*.3));col*=.75+.35*smoothstep(0.,3.,mod(p.y,10.));
    col=mix(col,vec3(.15,.08,.05),smoothstep(3.5,2.5,length(vec2(s-12.,mod(p.y,10.)-5.))));col+=vec3(.35,.3,.25)*smoothstep(.8,.2,edge)*0.;
    col*=.7+.5*clamp(dot(n,sunDir),0.,1.)*edge+.3;
  } else {
  float f=fbm(p*.008),f2=fbm(p*.045+7.),f3=vn(p*.15);
  float strata=sin(p.y*.05+f*7.+p.x*.002)*.5+.5;
  col=mix(soilA,soilB,smoothstep(.35,.7,f));col=mix(col,soilC,strata*strata*.45);
  vec2 cs=p/16.;vec2 ci=floor(cs),cf=fract(cs)-.5;vec2 off=vec2(hash(ci),hash(ci+3.1))-.5;float pd=length((cf-off*.45)*vec2(1.,1.3))/(.55+.9*hash(ci+5.));
  float peb=smoothstep(.24,.17,pd)*step(.82,hash(ci+9.));
  vec3 pc=soilC*(1.1+.3*hash(ci+2.))+.04;pc*=.8+.5*smoothstep(.2,-.1,(cf-off*.45).y-(cf-off*.45).x*.3);
  col=mix(col,pc,peb*.8);col=mix(col,col*.7,smoothstep(.17,.24,pd)*smoothstep(.3,.24,pd)*step(.82,hash(ci+9.))*.6);
  col*=.82+.34*f2;col*=.92+.12*f3;
  // roots / veins
  float vein=smoothstep(.03,0.,abs(fbm3(p*.02+3.)-.5));col=mix(col,soilB*.6,vein*.35);
  // depth shading: deeper = darker & cooler
  col*=mix(1.05,.55,i2);
  // grass cap
  float thr=7.+7.*vn(vec2(p.x*.35,0.))+4.*vn(vec2(p.x*1.7,1.));
  float gr=step(da,thr)*smoothstep(-.2,.5,n.y);
  vec3 gc=mix(grass,grass2,smoothstep(thr*.9,0.,da)*.8+.2*vn(p*.2));gc*=.8+.25*sin(p.x*1.3+vn(p*.1)*6.);
  col=mix(col,gc,gr);
  col=mix(col,col*.55,step(da,thr+3.)*(1.-gr)*smoothstep(-.2,.5,n.y)); // shadow under grass
  }
  // edge lighting
  float lit=dot(n,sunDir);
  col+=sun*max(lit,0.)*edge*.45;col*=1.-max(-lit,0.)*edge*.35;
  col*=mix(.35,1.,smoothstep(.55,.95,e2)); // dark outline
  // scorch
  col=mix(col,vec3(.07,.05,.045)*(.7+.6*vn(p*.2)),c.g*.85);
  col+=vec3(1.,.35,.05)*pow(c.g,3.)*.15*(.6+.4*sin(time*3.+p.x*.1));
  for(int i=0;i<${MAXL};i++){vec4 L=lights[i];if(L.w>0.){float d=distance(p,L.xy);col+=vec3(1.,.55,.2)*L.w*exp(-d/L.z)*(.5+edge*1.5);}}
  gl_FragColor=vec4(col,a);}`});
const terrain=new THREE.Mesh(new THREE.PlaneGeometry(W,H),terrMat);terrain.position.set(W/2,H/2,0);terrain.renderOrder=0;scene.add(terrain);
const shadowMat=mat({uniforms:{map:{value:terrTex}},vertexShader:terrMat.vertexShader,
 fragmentShader:`uniform sampler2D map;varying vec2 vUv;void main(){float a=texture2D(map,vUv).r;if(a<.3)discard;gl_FragColor=vec4(0.,0.,.05,a*.35);}`});
const tshadow=new THREE.Mesh(terrain.geometry,shadowMat);tshadow.position.set(W/2+10,H/2-10,0);tshadow.renderOrder=-4;scene.add(tshadow);

// ---------- water ----------
let waterLevel=70;
const waterUni=()=>({time:{value:0},level:{value:70},c1:{value:new THREE.Vector3()},c2:{value:new THREE.Vector3()},sun:{value:new THREE.Vector3()},phase:{value:0},front:{value:1}});
const waterFS=GLSL_NOISE+`uniform float time,level,phase,front;uniform vec3 c1,c2,sun;varying vec2 wp;
 float wave(float x){return level+6.*sin(x*.018+time*1.5+phase)+3.*sin(x*.047-time*2.2+phase*2.)+1.5*sin(x*.13+time*3.3);}
 void main(){float h=wave(wp.x);float d=h-wp.y;if(d<0.)discard;
  vec3 col=mix(c1,c2,clamp(d/260.,0.,1.));
  float caus=pow(vn(vec2(wp.x*.03+time*.4,wp.y*.05-time*.3))*vn(vec2(wp.x*.05-time*.5,wp.y*.03)),2.)*2.;
  col+=caus*c1*.35*exp(-d*.01);
  float rip=sin(wp.x*.3+time*4.+vn(wp*.05)*8.)*.5+.5;
  col+=sun*smoothstep(4.,0.,d)*(.6+.4*rip);
  float foam=smoothstep(12.,0.,d)*step(.55,vn(vec2(wp.x*.08+time*.8,wp.y*.2)));col=mix(col,vec3(.95,.98,1.),foam*.5);
  float glint=step(.985,vn(vec2(wp.x*.4,time*2.)))*smoothstep(25.,0.,d);col+=glint*sun;
  gl_FragColor=vec4(col,(front>.5?.72:.95)*smoothstep(0.,1.5,d)+smoothstep(4.,0.,d)*.2);}`;
const waterVS=`varying vec2 wp;void main(){vec4 w=modelMatrix*vec4(position,1.);wp=w.xy;gl_Position=projectionMatrix*viewMatrix*w;}`;
const waters=[];
for(const [ph,fr,ro,dy] of [[2.1,0,-5,14],[0,1,6,0],[4.2,1,7,-14]]){
  const u=waterUni();u.phase.value=ph;u.front.value=fr;const m=new THREE.Mesh(new THREE.PlaneGeometry(W+8000,1800),mat({uniforms:u,vertexShader:waterVS,fragmentShader:waterFS}));
  m.position.set(W/2,-900+900,0);m.renderOrder=ro;m.frustumCulled=false;m.userData.dy=dy;scene.add(m);waters.push(m);}
function waveY(x,t){return waterLevel+6*Math.sin(x*.018+t*1.5)+3*Math.sin(x*.047-t*2.2);}

// ---------- particles ----------
class Particles{
  constructor(n,additive,order){this.n=n;this.list=[];
    const g=new THREE.BufferGeometry();this.pos=new Float32Array(n*3);this.col=new Float32Array(n*3);this.sz=new Float32Array(n);this.al=new Float32Array(n);this.ty=new Float32Array(n);
    g.setAttribute('position',new THREE.BufferAttribute(this.pos,3));g.setAttribute('color',new THREE.BufferAttribute(this.col,3));
    g.setAttribute('aSize',new THREE.BufferAttribute(this.sz,1));g.setAttribute('aAlpha',new THREE.BufferAttribute(this.al,1));g.setAttribute('aType',new THREE.BufferAttribute(this.ty,1));
    this.geo=g;this.mat=mat({uniforms:{ppu:{value:1}},blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,vertexColors:true,
      vertexShader:`attribute float aSize,aAlpha,aType;uniform float ppu;varying vec3 vC;varying float vA,vT;void main(){vC=color;vA=aAlpha;vT=aType;gl_PointSize=aSize*ppu;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec3 vC;varying float vA,vT;void main(){vec2 d=gl_PointCoord-.5;float r=length(d)*2.;if(r>1.)discard;
        float a;if(vT>1.5)a=1.-smoothstep(.6,.9,r);else if(vT>.5)a=smoothstep(.55,.8,r)*smoothstep(1.,.85,r);else a=pow(1.-r,1.6);
        vec3 c=vC;if(vT>1.5)c*=.75+.4*smoothstep(.5,-.3,d.y-d.x);gl_FragColor=vec4(c,a*vA);}`});
    this.pts=new THREE.Points(g,this.mat);this.pts.frustumCulled=false;this.pts.renderOrder=order;scene.add(this.pts);}
  add(o){if(this.list.length>=this.n)this.list.shift();this.list.push({x:o.x,y:o.y,vx:o.vx||0,vy:o.vy||0,life:o.life||1,age:0,s0:o.s0||6,s1:o.s1??o.s0??6,
     c:o.c||[1,1,1],c1:o.c1,a0:o.a??1,g:o.g||0,drag:o.drag??0.98,t:o.t||0,wind:o.wind||0,collide:o.collide});}
  update(dt){const L=this.list;let j=0;
    for(let i=0;i<L.length;i++){const p=L[i];p.age+=dt;if(p.age>=p.life)continue;
      p.vy-=p.g*dt;p.vx+=p.wind*wind*60*dt;const dr=Math.pow(p.drag,dt*60);p.vx*=dr;p.vy*=dr;p.x+=p.vx*dt;p.y+=p.vy*dt;
      if(p.collide&&solid(p.x,p.y)){p.vy=Math.abs(p.vy)*.3;p.vx*=.5;p.y+=1;}
      L[j++]=p;}
    L.length=j;
    for(let i=0;i<this.n;i++){if(i<j){const p=L[i],k=p.age/p.life;this.pos[i*3]=p.x;this.pos[i*3+1]=p.y;this.pos[i*3+2]=0;
        const c=p.c1?[lerp(p.c[0],p.c1[0],k),lerp(p.c[1],p.c1[1],k),lerp(p.c[2],p.c1[2],k)]:p.c;this.col.set(c,i*3);
        this.sz[i]=lerp(p.s0,p.s1,k);this.al[i]=p.a0*(1-k)*(k<.1&&p.t===0?k*10:1);this.ty[i]=p.t;}
      else {this.al[i]=0;this.sz[i]=0;}}
    for(const k of ['position','color','aSize','aAlpha','aType'])this.geo.attributes[k].needsUpdate=true;}
}
const smoke=new Particles(2500,false,4),fire=new Particles(2500,true,5),amb=new Particles(220,false,6.5);

// ---------- canvas art: weapon icons & worm ----------
function cv(w,h=w){const c=document.createElement('canvas');c.width=w;c.height=h;return [c,c.getContext('2d')];}
function grad(x,a,b,y0,y1){const g=x.createLinearGradient(0,y0,0,y1);g.addColorStop(0,a);g.addColorStop(1,b);return g;}
const ICON={
  bazooka(x){x.rotate(-.5);x.fillStyle=grad(x,'#7c9b4a','#3c5220',-7,7);x.fillRect(-26,-7,46,14);x.fillStyle='#2a3416';x.fillRect(-10,6,6,10);x.fillStyle='#c33';x.beginPath();x.moveTo(20,-6);x.lineTo(28,0);x.lineTo(20,6);x.fill();x.fillStyle='#222';x.fillRect(-28,-8,4,16);},
  homing(x){x.rotate(-.5);x.fillStyle=grad(x,'#ddd','#888',-6,6);x.fillRect(-22,-6,40,12);x.fillStyle='#38f';x.beginPath();x.moveTo(18,-6);x.lineTo(28,0);x.lineTo(18,6);x.fill();x.fillStyle='#38f';x.beginPath();x.moveTo(-22,-6);x.lineTo(-28,-14);x.lineTo(-14,-6);x.moveTo(-22,6);x.lineTo(-28,14);x.lineTo(-14,6);x.fill();x.fillStyle='#f33';x.beginPath();x.arc(4,0,3,0,7);x.fill();},
  shell(x){x.fillStyle=grad(x,'#9cb860','#3c5220',-6,6);x.beginPath();x.moveTo(-20,-6);x.lineTo(12,-6);x.quadraticCurveTo(26,0,12,6);x.lineTo(-20,6);x.fill();x.fillStyle='#c33';x.fillRect(-22,-8,6,16);},
  grenade(x){x.fillStyle=grad(x,'#7fb040','#2e4a12',-16,18);x.beginPath();x.ellipse(0,4,15,17,0,0,7);x.fill();x.strokeStyle='rgba(0,0,0,.35)';x.lineWidth=2;for(let i=-1;i<=1;i++){x.beginPath();x.moveTo(-14,4+i*8);x.lineTo(14,4+i*8);x.stroke();}x.fillStyle='#555';x.fillRect(-5,-17,10,7);x.strokeStyle='#aaa';x.lineWidth=2;x.beginPath();x.arc(9,-15,6,0,7);x.stroke();x.fillStyle='rgba(255,255,255,.4)';x.beginPath();x.ellipse(-6,-3,4,6,-.5,0,7);x.fill();},
  cluster(x){x.fillStyle=grad(x,'#e04040','#701010',-16,18);x.beginPath();x.ellipse(0,4,15,17,0,0,7);x.fill();x.fillStyle='#fc3';x.fillRect(-15,0,30,5);x.fillStyle='#555';x.fillRect(-5,-17,10,7);x.fillStyle='rgba(255,255,255,.4)';x.beginPath();x.ellipse(-6,-3,4,6,-.5,0,7);x.fill();},
  banana(x){x.fillStyle=grad(x,'#fff36a','#d8a400',-18,18);x.beginPath();x.moveTo(-20,-14);x.quadraticCurveTo(-8,22,24,8);x.quadraticCurveTo(0,10,-14,-16);x.closePath();x.fill();x.strokeStyle='#6b4a00';x.lineWidth=2;x.stroke();x.fillStyle='#4a3000';x.fillRect(-22,-18,6,6);},
  bomblet(x){x.fillStyle=grad(x,'#666','#111',-12,12);x.beginPath();x.arc(0,0,11,0,7);x.fill();x.fillStyle='rgba(255,255,255,.5)';x.beginPath();x.arc(-4,-4,3,0,7);x.fill();},
  shotgun(x){x.rotate(-.4);x.fillStyle='#7a4a22';x.beginPath();x.moveTo(-28,2);x.lineTo(-10,-4);x.lineTo(-6,6);x.lineTo(-26,12);x.fill();x.fillStyle=grad(x,'#bbb','#555',-5,3);x.fillRect(-8,-5,36,4);x.fillRect(-8,-1,30,4);x.fillStyle='#5a3416';x.fillRect(4,2,12,5);},
  dynamite(x){x.rotate(-.3);x.fillStyle=grad(x,'#f04030','#901010',-8,8);x.fillRect(-20,-8,36,16);x.fillStyle='#ddd';x.fillRect(-8,-8,6,16);x.fillStyle='#000';x.font='bold 9px sans-serif';x.fillText('TNT',2,4);x.strokeStyle='#333';x.lineWidth=2;x.beginPath();x.moveTo(16,0);x.quadraticCurveTo(24,-10,22,-16);x.stroke();x.fillStyle='#ffd040';x.beginPath();x.arc(22,-17,4,0,7);x.fill();},
  airstrike(x){x.fillStyle=grad(x,'#cfd6e0','#6a7484',-6,8);x.beginPath();x.ellipse(0,0,26,6,0,0,7);x.fill();x.beginPath();x.moveTo(-4,0);x.lineTo(-14,18);x.lineTo(4,0);x.moveTo(-4,0);x.lineTo(-12,-16);x.lineTo(4,0);x.moveTo(-20,0);x.lineTo(-28,-10);x.lineTo(-22,0);x.fill();x.fillStyle='#36c';x.fillRect(12,-3,8,4);},
  plane(x){ICON.airstrike(x);},
  jetpack(x){x.fillStyle=grad(x,'#bbb','#555',-16,14);x.fillRect(-14,-16,12,30);x.fillRect(2,-16,12,30);x.fillStyle='#f80';x.beginPath();x.moveTo(-14,14);x.lineTo(-8,28);x.lineTo(-2,14);x.moveTo(2,14);x.lineTo(8,28);x.lineTo(14,14);x.fill();x.fillStyle='#c22';x.fillRect(-14,-10,28,4);},
  teleport(x){for(let i=0;i<3;i++){x.strokeStyle=['#c6f','#86f','#fff'][i];x.lineWidth=4-i;x.beginPath();for(let a=0;a<12;a+=.2){const r=a*2.2;x.lineTo(Math.cos(a+i*2)*r,Math.sin(a+i*2)*r);}x.stroke();}},
  girder(x){x.rotate(-.3);x.fillStyle=grad(x,'#e88a3a','#8a3c10',-7,7);x.fillRect(-28,-7,56,14);x.fillStyle='#3a1a08';for(let i=-20;i<=20;i+=10){x.beginPath();x.arc(i,0,3,0,7);x.fill();}},
  skip(x){x.fillStyle='#fff';x.font='bold 22px sans-serif';x.textAlign='center';x.fillText('Zzz',0,8);},
};
const iconCache={};
function icon(id,size=64){const k=id+size;if(iconCache[k])return iconCache[k];const [c,x]=cv(size);x.translate(size/2,size/2);x.scale(size/64,size/64);
  x.shadowColor='rgba(0,0,0,.5)';x.shadowBlur=3;x.shadowOffsetY=2;ICON[id](x);return iconCache[k]=c;}
const texCache={};
function tex(c,key){if(texCache[key])return texCache[key];const t=new THREE.CanvasTexture(c);t.minFilter=THREE.LinearFilter;return texCache[key]=t;}
function spriteMat(t){return new THREE.MeshBasicMaterial({map:t,transparent:true,depthTest:false,depthWrite:false});}
function wormCanvas(color,dead){const [c,x]=cv(96);x.translate(48,52);
  if(dead){ // gravestone
    x.fillStyle=grad(x,'#c8c8d0','#6a6a78',-30,30);x.beginPath();x.moveTo(-18,30);x.lineTo(-18,-12);x.arc(0,-12,18,Math.PI,0);x.lineTo(18,30);x.fill();
    x.strokeStyle='rgba(0,0,0,.35)';x.lineWidth=3;x.beginPath();x.moveTo(0,-20);x.lineTo(0,10);x.moveTo(-9,-10);x.lineTo(9,-10);x.stroke();x.fillStyle=color;x.fillRect(-18,24,36,6);return c;}
  const path=()=>{x.beginPath();x.moveTo(-22,30);x.quadraticCurveTo(10,34,8,0);x.lineTo(8,-14);};
  x.lineCap='round';x.lineJoin='round';
  path();x.strokeStyle='#5a1d2c';x.lineWidth=30;x.stroke();
  path();x.strokeStyle='#f39ab0';x.lineWidth=25;x.stroke();
  x.save();x.translate(-3,-3);path();x.strokeStyle='#ffc7d4';x.lineWidth=8;x.stroke();x.restore();
  x.strokeStyle='rgba(150,40,70,.35)';x.lineWidth=1.5;for(let i=0;i<4;i++){x.beginPath();x.arc(-4-i*7,26-i*0+ (i>1?2:0),11,-.6,.6);x.stroke();}
  // headband
  x.fillStyle=color;x.fillRect(-5,-24,26,7);x.beginPath();x.moveTo(-5,-22);x.lineTo(-17,-28);x.lineTo(-15,-17);x.fill();
  // eyes
  for(const ex of [6,17]){x.fillStyle='#fff';x.beginPath();x.ellipse(ex,-9,5.5,7,0,0,7);x.fill();x.strokeStyle='#5a1d2c';x.lineWidth=1.2;x.stroke();x.fillStyle='#111';x.beginPath();x.arc(ex+2.5,-8,2.6,0,7);x.fill();x.fillStyle='#fff';x.beginPath();x.arc(ex+3.3,-9,.9,0,7);x.fill();}
  x.strokeStyle='#5a1d2c';x.lineWidth=1.8;x.beginPath();x.arc(15,3,4,.2,2.4);x.stroke();
  return c;}

// ---------- terrain generation ----------
function genTerrain(){
  mask.fill(0);seedNoise();
  const style=Math.floor(R()*3); // 0 rolling, 1 islands, 2 caverns
  const hs=new Float32Array(W);
  for(let x=0;x<W;x++){
    let h=H*.30+(fbm1(x*.0024)-.5)*H*.55+(fbm1(x*.011+50)-.5)*90+(fbm1(x*.04+9)-.5)*14;
    if(style===1)h-=Math.max(0,Math.sin(x/W*Math.PI*3+R()*0)*-1)*220;
    const edge=Math.min(x,W-x);h-=Math.max(0,180-edge)*1.6;
    hs[x]=h;}
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    let s=y<hs[x];
    if(s&&y>waterLevel-30){const cn=fbm2(x*.0065,y*.009,4);if(cn>(style===2?.6:.66)&&y<hs[x]-25)s=false;}
    if(s)mask[(y*W+x)*4]=255;}
  // floating islands
  const nI=2+Math.floor(R()*4);
  for(let i=0;i<nI;i++){const cx=rnd(300,W-300),cy=rnd(H*.55,H*.82),rw=rnd(90,220),rh=rnd(35,70);
    for(let y=Math.floor(cy-rh*1.5);y<cy+rh;y++)for(let x=Math.floor(cx-rw);x<cx+rw;x++){if(x<0||x>=W||y<0||y>=H)continue;
      const dx=(x-cx)/rw,dy=(y-cy)/(y<cy?rh*1.6:rh*.6),nn=fbm2(x*.02,y*.02)*.6;
      if(dx*dx+dy*dy<.75+nn*.5&&!(y>cy+rh*.3*(1-dx*dx)))mask[(y*W+x)*4]=255;}}
  terrTex.needsUpdate=true;
}
function carve(cx,cy,r){
  const r2=r+10,x0=Math.max(0,Math.floor(cx-r2)),x1=Math.min(W-1,Math.ceil(cx+r2)),y0=Math.max(0,Math.floor(cy-r2)),y1=Math.min(H-1,Math.ceil(cy+r2));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const d=Math.hypot(x-cx,y-cy),i=(y*W+x)*4;
    if(d<r){mask[i]=0;mask[i+2]=0;mask[i+1]=0;}else if(d<r2&&mask[i]>0&&mask[i+2]<128){mask[i+1]=Math.min(255,mask[i+1]+(1-(d-r)/10)*200);}}
  terrTex.needsUpdate=true;}
function placeGirder(cx,cy,ang,len=130,th=11){let any=false;const c=Math.cos(ang),s=Math.sin(ang);
  for(let y=Math.floor(cy-len);y<cy+len;y++)for(let x=Math.floor(cx-len);x<cx+len;x++){if(x<0||x>=W||y<0||y>=H)continue;
    const dx=x-cx,dy=y-cy,u=dx*c+dy*s,v=-dx*s+dy*c;if(Math.abs(u)<len/2&&Math.abs(v)<th/2){const i=(y*W+x)*4;mask[i]=255;mask[i+1]=0;mask[i+2]=255;any=true;}}
  terrTex.needsUpdate=true;return any;}

// ---------- game state ----------
const WEAPONS=[
 {id:'bazooka',name:'Bazooka',ammo:-1,charge:1,r:44,dmg:50},
 {id:'homing',name:'Homing Missile',ammo:2,charge:1,target:1,r:44,dmg:50},
 {id:'grenade',name:'Grenade',ammo:-1,charge:1,fuse:1,r:42,dmg:50},
 {id:'cluster',name:'Cluster Bomb',ammo:3,charge:1,fuse:1,r:32,dmg:30},
 {id:'banana',name:'Banana Bomb',ammo:1,charge:1,fuse:1,r:62,dmg:70},
 {id:'shotgun',name:'Shotgun',ammo:-1,r:16,dmg:25},
 {id:'dynamite',name:'Dynamite',ammo:2,r:80,dmg:75},
 {id:'airstrike',name:'Air Strike',ammo:1,target:1,r:34,dmg:30},
 {id:'jetpack',name:'Jet Pack',ammo:2},
 {id:'teleport',name:'Teleport',ammo:2,target:1},
 {id:'girder',name:'Girder',ammo:3,target:1},
 {id:'skip',name:'Skip Go',ammo:-1},
];
const WBY=Object.fromEntries(WEAPONS.map(w=>[w.id,w]));
const NAMES=['Boggy','Spadge','Clagnut','Nobby','Wormy','Squiggles','Dirk','Grub','Slick','Noodle','Fuzz','Jelly','Tank','Mungo','Pip','Sprocket','Gonzo','Twitch','Bart','Wiggly','Dobbin','Cheddar','Blip','Zippy'];
const TEAMDEF=[{name:'Red Rascals',color:'#ff4a4a'},{name:'Blue Bombers',color:'#4aa8ff'},{name:'Green Goblins',color:'#5cf06a'},{name:'Gold Grubs',color:'#ffd23a'}];
const G_={teams:[],worms:[],projs:[],planes:[],state:'menu',cur:null,timer:0,retreat:0,turnN:0,settle:0,deathQ:[],speed:1,paused:false,spectator:false,events:{turns:0,shots:0,explosions:0}};
window.__G=G_;
let wind=0,shake=0,flash=0,simT=0,lights=[];
let cfg={nTeams:2,teams:TEAMDEF.map((t,i)=>({...t,cpu:i>0,diff:'normal'})),nWorms:4,turnTime:45,theme:'random',sd:true};
try{const s=JSON.parse(localStorage.getItem('worms_cfg'));if(s&&s.teams)cfg={...cfg,...s};}catch(e){}

const wormGeo=new THREE.PlaneGeometry(54,54),gunGeo=new THREE.PlaneGeometry(26,26);
function makeWorm(team,name,x,y){
  const g=new THREE.Group();const body=new THREE.Mesh(wormGeo,spriteMat(tex(wormCanvas(team.color),'w'+team.color)));body.position.y=27;g.add(body);
  const gun=new THREE.Group();gun.position.y=14;const gm=new THREE.Mesh(gunGeo,spriteMat(null));gm.position.x=12;gun.add(gm);g.add(gun);gm.visible=false;
  g.renderOrder=2;body.renderOrder=2;gm.renderOrder=3;scene.add(g);
  const lab=document.createElement('div');lab.className='lab';lab.style.color=team.color;lab.innerHTML=`<div class="nm">${name}</div><span class="hp">100</span>`;document.getElementById('labels').appendChild(lab);
  return {team,name,x,y,vx:0,vy:0,hp:100,shownHp:100,air:true,facing:R()<.5?1:-1,aim:.3,dead:false,drowned:false,g,body,gun,gm,lab,hpEl:lab.querySelector('.hp'),walkAcc:0,squash:0,jet:0};
}
const C=w=>({x:w.x,y:w.y+12});
const bodyFree=(x,y)=>!solid(x,y+4)&&!solid(x,y+11)&&!solid(x,y+18)&&!solid(x-5,y+9)&&!solid(x+5,y+9);
const onGround=w=>solid(w.x,w.y-1)||solid(w.x-3,w.y-1)||solid(w.x+3,w.y-1);
function findSpawn(others){
  for(let tries=0;tries<2000;tries++){const x=Math.floor(rnd(60,W-60));
    const ys=[];for(let y=H-30;y>waterLevel+30;y--){if(solid(x,y)&&!solid(x,y+1)&&bodyFree(x,y+1))ys.push(y+1);}
    if(!ys.length)continue;const y=ys[Math.floor(R()*ys.length)];
    if(others.every(o=>Math.hypot(o.x-x,o.y-y)>(tries<1500?110:40)))return {x,y};}
  return {x:W/2,y:H-50};}

// ---------- physics ----------
const WINDA=240;
function wormPhysics(w){
  if(w.dead)return;
  if(w.jet>0&&w===G_.cur){return;} // handled in jetpack control
  if(!w.air){if(!onGround(w)){w.air=true;w.vy=0;w.vx=0;}return;}
  w.vy-=G*DT;const n=Math.ceil(Math.max(Math.abs(w.vx),Math.abs(w.vy))*DT)+1;
  for(let i=0;i<n;i++){
    const nx=w.x+w.vx*DT/n;if(bodyFree(nx,w.y))w.x=nx;else{w.vx*=-.35;}
    const ny=w.y+w.vy*DT/n;
    if(w.vy<0&&(solid(w.x,ny)||solid(w.x-3,ny)||solid(w.x+3,ny))){land(w);break;}
    if(w.vy>0&&!bodyFree(w.x,ny)){w.vy=0;}else w.y=ny;}
}
function land(w){const v=Math.hypot(w.vx,w.vy*1.0);
  if(-w.vy>420&&!w.nofall){const d=Math.min(40,Math.round((-w.vy-420)/9)+2);hurt(w,d,null);snd.voice(1.2,'ow');}
  else if(-w.vy>120)snd.bounce(.6);
  w.air=false;w.vx=0;w.vy=0;w.squash=.35;w.nofall=false;
  // nudge out of ground
  for(let k=0;k<6&&solid(w.x,w.y);k++)w.y++;
  if(w===G_.cur&&w.jumped){w.jumped=false;}
}
function tryWalk(w,dir){
  w.facing=dir;w.walkAcc+=55*DT;
  while(w.walkAcc>=1){w.walkAcc-=1;const nx=w.x+dir;let moved=false;
    for(let up=0;up<=7;up++){if(!solid(nx,w.y+up)&&bodyFree(nx,w.y+up)){w.x=nx;w.y+=up;moved=true;break;}}
    if(!moved){w.walkAcc=0;return false;}
    let d=0;while(d<5&&!onGround(w)){w.y--;d++;}
    if(!onGround(w)){w.air=true;w.vx=dir*25;w.vy=0;return true;}
  }
  w.step=(w.step||0)+DT;return true;}
function gradN(x,y){let nx=0,ny=0;for(let a=0;a<8;a++){const ca=Math.cos(a*Math.PI/4),sa=Math.sin(a*Math.PI/4);if(solid(x+ca*4,y+sa*4)){nx-=ca;ny-=sa;}}
  const l=Math.hypot(nx,ny);return l>0?[nx/l,ny/l]:null;}
function projStep(p,worms){
  p.t+=DT;
  if(p.rest){if(solid(p.x,p.y-2)){if(p.fuse!=null&&p.t>=p.fuse)return 'fuse';return null;}p.rest=false;}
  if(p.homing&&p.t>.5&&p.target){const dx=p.target.x-p.x,dy=p.target.y-p.y,a=Math.atan2(dy,dx),sp=Math.max(420,Math.hypot(p.vx,p.vy));
    let cur=Math.atan2(p.vy,p.vx),da=((a-cur+Math.PI*3)%(Math.PI*2))-Math.PI;cur+=clamp(da,-4*DT,4*DT);p.vx=Math.cos(cur)*Math.min(sp+10,650);p.vy=Math.sin(cur)*Math.min(sp+10,650);}
  else{p.vy-=G*DT;if(p.wind)p.vx+=wind*WINDA*DT;}
  const sp=Math.hypot(p.vx,p.vy),n=Math.max(1,Math.ceil(sp*DT/2));
  for(let i=0;i<n;i++){const nx=p.x+p.vx*DT/n,ny=p.y+p.vy*DT/n;
    if(solid(nx,ny)){
      if(p.bounce!=null){const N=gradN(p.x,p.y)||[-p.vx/(sp||1),-p.vy/(sp||1)];const dot=p.vx*N[0]+p.vy*N[1];
        if(dot<0){p.vx-=(1+p.bounce)*dot*N[0];p.vy-=(1+p.bounce)*dot*N[1];p.vx*=.85;p.vy*=.85;}
        p.bounces=(p.bounces||0)+1;p.lastBounce=-dot;
        if(Math.hypot(p.vx,p.vy)<35&&N[1]>.3){p.vx=0;p.vy=0;p.rest=true;}
        let k=0;while(solid(p.x,p.y)&&k<6){p.x+=N[0];p.y+=N[1];k++;}
        break;}
      p.x=nx;p.y=ny;return 'hit';}
    p.x=nx;p.y=ny;
    if(p.hitWorms&&p.t>.05)for(const w of worms){if(w.dead||(w===p.owner&&p.t<.35))continue;const c=C(w);if(Math.abs(c.x-p.x)<10&&Math.abs(c.y-p.y)<14)return 'hit';}
  }
  if(p.fuse!=null&&p.t>=p.fuse)return 'fuse';
  if(p.y<waterLevel)return 'water';
  if(p.x<-400||p.x>W+400||p.t>25)return 'off';
  return null;}

// ---------- damage / explosions ----------
function dmgText(x,y,txt,color){const e=document.createElement('div');e.className='dmg';e.textContent=txt;e.style.color=color;document.getElementById('labels').appendChild(e);
  floaters.push({e,x,y,t:0});}
const floaters=[];
function hurt(w,d,src){if(w.dead||d<=0)return;w.hp=Math.max(0,w.hp-d);dmgText(w.x,w.y+40,'-'+d,w.team.color);
  if(w===G_.cur&&(G_.state==='turn'||G_.state==='retreat'))endTurnSoon();
  w.hurt=1;}
function explode(x,y,r,dmg,o={}){
  G_.events.explosions++;
  carve(x,y,r);
  shake=Math.min(30,shake+r*.35);flash=Math.min(.5,flash+r/250);
  lights.push({x,y,r:r*2.2,i:2.2,t:0});
  snd.boom(r/50);
  // fireball
  for(let i=0;i<r*1.2;i++){const a=R()*Math.PI*2,s=rnd(.2,1)*r*4;fire.add({x:x+Math.cos(a)*r*.2,y:y+Math.sin(a)*r*.2,vx:Math.cos(a)*s,vy:Math.sin(a)*s+40,life:rnd(.35,.95),s0:r*rnd(.8,1.3),s1:r*.3,c:[1,.85,.45],c1:[.9,.2,.02],drag:.9});}
  fire.add({x,y,life:.18,s0:r*4,s1:r*5,c:[1,.95,.8],a:.9});
  fire.add({x,y,life:.45,s0:r*.6,s1:r*4.5,c:[1,.7,.4],c1:[.6,.2,.05],t:1,a:.8});
  for(let i=0;i<r*.8;i++){const a=R()*Math.PI*2,s=rnd(.2,1)*r*2;smoke.add({x:x+rnd(-r,r)*.4,y:y+rnd(-r,r)*.4,vx:Math.cos(a)*s,vy:Math.sin(a)*s+30,life:rnd(1.2,3),s0:r*rnd(.4,.8),s1:r*rnd(1.2,2),c:[.16,.14,.13],c1:[.5,.48,.47],a:.75,drag:.93,wind:.6});}
  // sparks + dirt chunks
  for(let i=0;i<r*.9;i++){const a=R()*Math.PI*2,s=rnd(150,500);fire.add({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s+100,life:rnd(.4,1.2),s0:rnd(2,4),s1:1,c:[1,.8,.3],g:500,drag:.985});}
  const dc=TH.soilA;for(let i=0;i<r*.7;i++){const a=rnd(.2,Math.PI-.2),s=rnd(120,420);smoke.add({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rnd(.8,1.8),s0:rnd(3,7),s1:2,c:dc.map(v=>v*rnd(.6,1.1)),g:700,drag:.99,t:2,collide:true});}
  for(const w of G_.worms){if(w.dead)continue;const c=C(w),dx=c.x-x,dy=c.y-y,d=Math.hypot(dx,dy),R2=r+14;
    if(d<R2){const f=1-d/R2,dd=Math.max(1,Math.round(dmg*(.35+.65*f)));hurt(w,dd,o.owner);
      const nx=d>.1?dx/d:0,ny=d>.1?dy/d:1,sp=(150+330*f)*Math.sqrt(dmg/50);w.vx=nx*sp;w.vy=Math.max(ny*sp+120*f,80);w.air=true;w.nofall=false;
      if(R()<.6)setTimeout(()=>snd.voice(1+R()*.4,'ow'),80);}}
  for(const p of G_.projs){if(p.bounce==null)continue;const dx=p.x-x,dy=p.y-y,d=Math.hypot(dx,dy);if(d<r*1.5&&d>.1){p.rest=false;p.vx+=dx/d*300;p.vy+=dy/d*300+100;}}
}

// ---------- projectiles ----------
const PSIZE={shell:36,homing:36,grenade:24,cluster:24,banana:32,bomblet:14,dynamite:30,bomb:28,bananalet:22};
function addProj(o){const ic=o.icon||o.kind;const m=new THREE.Mesh(new THREE.PlaneGeometry(PSIZE[ic]||18,PSIZE[ic]||18),spriteMat(tex(icon(ic==='bomb'?'shell':ic==='bananalet'?'banana':ic),'p'+ic)));
  m.renderOrder=3;scene.add(m);const p={t:0,spin:0,...o,mesh:m};G_.projs.push(p);return p;}
function removeProj(p){scene.remove(p.mesh);p.mesh.geometry.dispose();p.dead=true;}
function projHit(p,ev){
  if(ev==='water'){splash(p.x);return;}
  if(ev==='off')return;
  const k=p.kind;
  if(k==='cluster'||k==='banana'){const big=k==='banana';explode(p.x,p.y,big?62:30,big?70:25,{owner:p.owner});
    for(let i=0;i<5;i++)addProj({kind:big?'bananalet':'bomblet',x:p.x,y:p.y+4,vx:rnd(-180,180),vy:rnd(260,450),hitWorms:false,owner:p.owner,r:big?48:22,dmg:big?45:20,bounce:null,spinR:rnd(-10,10)});
    return;}
  explode(p.x,p.y,p.r,p.dmg,{owner:p.owner});}
function splash(x){snd.splash();for(let i=0;i<40;i++)smoke.add({x:x+rnd(-8,8),y:waterLevel+4,vx:rnd(-90,90),vy:rnd(150,420),life:rnd(.6,1.3),s0:rnd(3,7),s1:2,c:[.75,.9,1],g:700,drag:.99,a:.9});}
function projUpdate(){
  for(const p of G_.projs){if(p.dead)continue;
    const ev=projStep(p,G_.worms);
    if(p.kind==='shell'||p.kind==='homing'||p.kind==='bomb'){p.mesh.rotation.z=Math.atan2(p.vy,p.vx);
      if((p.t*60|0)%2===0){smoke.add({x:p.x,y:p.y,vx:rnd(-10,10),vy:rnd(-10,10),life:rnd(.8,1.6),s0:6,s1:22,c:[.85,.85,.85],c1:[.5,.5,.55],a:.45,drag:.95,wind:.5});
        fire.add({x:p.x-p.vx*.012,y:p.y-p.vy*.012,life:.12,s0:14,s1:4,c:[1,.7,.3],a:.9});}
      if(p.homing&&p.t>.5&&p.t<.56)snd.launch();}
    else{p.spin+=(p.rest?0:(p.vx*.0015+(p.spinR||0)*.016));p.mesh.rotation.z=-p.spin*3;
      if(p.fuse!=null&&!p.rest&&p.lastBounce>60){snd.bounce(Math.min(1,p.lastBounce/400));p.lastBounce=0;}
      if(p.kind==='dynamite'&&(p.t*60|0)%3===0)fire.add({x:p.x+6,y:p.y+12,vx:rnd(-40,40),vy:rnd(20,90),life:.3,s0:4,s1:1,c:[1,.85,.3],g:200});}
    p.mesh.position.set(p.x,p.y,0);
    if(ev){removeProj(p);projHit(p,ev);}}
  G_.projs=G_.projs.filter(p=>!p.dead);
  for(const pl of G_.planes){pl.x+=pl.vx*DT;pl.mesh.position.set(pl.x,pl.y,0);
    while(pl.drops.length&&(pl.vx>0?pl.x>=pl.drops[0]:pl.x<=pl.drops[0])){const dx=pl.drops.shift();addProj({kind:'bomb',x:dx,y:pl.y-10,vx:0,vy:-60,hitWorms:true,owner:pl.owner,r:34,dmg:30});}
    if(pl.x<-600||pl.x>W+600){scene.remove(pl.mesh);pl.dead=true;}}
  G_.planes=G_.planes.filter(p=>!p.dead);
}
const dirOf=w=>{const a=w.facing>0?w.aim:Math.PI-w.aim;return [Math.cos(a),Math.sin(a)];};
function useWeapon(w,wid,power,target){
  const T=w.team,wd=WBY[wid];if(T.ammo[wid]===0)return false;
  const c=C(w),[dx,dy]=dirOf(w),sx=c.x+dx*16,sy=c.y+dy*16;let ends=true;
  G_.events.shots++;
  switch(wid){
    case 'bazooka':addProj({kind:'shell',x:sx,y:sy,vx:dx*power*MAXV,vy:dy*power*MAXV,wind:true,hitWorms:true,owner:w,r:44,dmg:50});snd.launch();break;
    case 'homing':if(!target)return false;addProj({kind:'homing',x:sx,y:sy,vx:dx*power*MAXV,vy:dy*power*MAXV,homing:true,target,hitWorms:true,owner:w,r:44,dmg:50});snd.launch();break;
    case 'grenade':case 'cluster':case 'banana':addProj({kind:wid,x:sx,y:sy,vx:dx*power*MAXV,vy:dy*power*MAXV,fuse:G_.fuse,bounce:wid==='banana'?.35:.45,owner:w,r:wd.r,dmg:wd.dmg});snd.throwS();break;
    case 'shotgun':{snd.shot();let x=sx,y=sy,hit=null;for(let i=0;i<300;i++){x+=dx*2;y+=dy*2;if(solid(x,y)){hit=1;break;}
        const ww=G_.worms.find(o=>!o.dead&&o!==w&&Math.abs(C(o).x-x)<9&&Math.abs(C(o).y-y)<13);if(ww){hit=1;break;}}
      for(let i=0;i<14;i++)fire.add({x:sx+dx*8,y:sy+dy*8,vx:dx*rnd(100,400)+rnd(-60,60),vy:dy*rnd(100,400)+rnd(-60,60),life:.15,s0:8,s1:2,c:[1,.85,.4]});
      tracers.push({x0:sx,y0:sy,x1:x,y1:y,t:0});
      if(hit)explode(x,y,16,25,{owner:w});
      G_.shots=(G_.shots||0)+1;if(G_.shots<2){ends=false;}break;}
    case 'dynamite':addProj({kind:'dynamite',x:w.x+w.facing*6,y:w.y+10,vx:w.facing*40,vy:60,fuse:5,bounce:.1,owner:w,r:80,dmg:75});snd.throwS();break;
    case 'airstrike':{if(!target)return false;const dir=target.x>W/2?-1:1,drops=[];for(let i=0;i<5;i++)drops.push(target.x+(i-2)*35*dir);
      const m=new THREE.Mesh(new THREE.PlaneGeometry(70,70),spriteMat(tex(icon('plane'),'plane')));m.scale.x=dir;m.renderOrder=3;scene.add(m);
      G_.planes.push({x:target.x-dir*1300,y:H-60,vx:dir*620,drops,mesh:m,owner:w});snd.plane();break;}
    case 'jetpack':w.jet=7;w.air=true;ends=false;snd.jet();break;
    case 'teleport':{if(!target)return false;let tx=target.x,ty=target.y-12;if(!bodyFree(tx,ty)||ty<waterLevel)return false;
      sparkle(w.x,w.y+12);w.x=tx;w.y=ty;w.air=true;w.vx=w.vy=0;w.nofall=true;sparkle(tx,ty+12);snd.teleport();break;}
    case 'girder':{if(!target)return false;if(G_.worms.some(o=>!o.dead&&Math.hypot(C(o).x-target.x,C(o).y-target.y)<40))return false;
      const a=clamp(w.aim,-.8,.8)*(w.facing);placeGirder(target.x,target.y,a);snd.build();ends=false;break;}
    case 'skip':endTurnSoon();break;
  }
  if(T.ammo[wid]>0)T.ammo[wid]--;
  if(ends&&wid!=='skip'){G_.state='retreat';G_.retreat=wid==='dynamite'?5:3;G_.shots=0;}
  return true;}
function sparkle(x,y){for(let i=0;i<40;i++){const a=R()*7;fire.add({x,y,vx:Math.cos(a)*rnd(20,160),vy:Math.sin(a)*rnd(20,160),life:rnd(.4,1),s0:rnd(3,8),s1:0,c:[.8,.5,1],c1:[.3,.6,1]});}}
const tracers=[];

// ---------- turn flow ----------
function banner(t,col='#fff'){const b=document.getElementById('banner');b.textContent=t;b.style.color=col;b.style.opacity=1;clearTimeout(banner.t);banner.t=setTimeout(()=>b.style.opacity=0,2200);}
function endTurnSoon(){if(G_.state==='turn'||G_.state==='retreat'){G_.state='settle';G_.settle=0;G_.charging=false;}}
const aliveTeams=()=>G_.teams.filter(t=>t.worms.some(w=>!w.dead));
function killWorm(w,drown){w.dead=true;w.hp=0;w.lab.style.display='none';w.gm.visible=false;
  if(drown){w.drowned=true;w.sink=0;}else{w.body.material.map=tex(wormCanvas(w.team.color,true),'g'+w.team.color);w.body.material.needsUpdate=true;w.body.scale.set(.8,.8,1);w.body.position.y=21;}}
function startTurn(){
  const at=aliveTeams();if(at.length<=1||G_.turnN>400)return gameOver(at[0]);
  G_.turnN++;G_.events.turns++;
  let ti=G_.teamIdx;do{ti=(ti+1)%G_.teams.length;}while(!G_.teams[ti].worms.some(w=>!w.dead));G_.teamIdx=ti;
  const T=G_.teams[ti];let wi=T.wi;do{wi=(wi+1)%T.worms.length;}while(T.worms[wi].dead);T.wi=wi;
  const w=G_.cur=T.worms[wi];
  wind=clamp(gauss()*.4,-1,1);
  if(cfg.sd&&G_.turnN>G_.teams.length*8){if(!G_.sudden){G_.sudden=true;banner('SUDDEN DEATH! The water is rising!','#6cf');}G_.waterTarget=Math.min(H*.6,G_.waterTarget+14);}
  G_.state='turn';G_.timer=cfg.turnTime;G_.retreat=0;G_.shots=0;G_.charging=false;G_.power=0;G_.target=null;G_.fuse=3;G_.wid=T.last||'bazooka';
  if(T.ammo[G_.wid]===0)G_.wid='bazooka';
  w.jet=0;
  if(!G_.sudden||G_.turnN%3)banner(`${w.name}'s turn — ${T.name}`,T.color);
  snd.voice(.9+ti*.12);
  G_.ai=T.cpu?{phase:'think',t:0,gen:aiPlan(w,T.diff),tries:0}:null;
  updHUD(true);}
function gameOver(team){G_.state='over';$('banner').style.opacity=0;clearTimeout(banner.t);updHUD();$('timer').textContent='';$('timer').classList.remove('warn');snd.play('victory');
  const win=document.getElementById('win');win.classList.remove('hidden');
  document.getElementById('wintitle').textContent=team?team.name.toUpperCase()+' WIN!':'DRAW!';document.getElementById('wintitle').style.filter=`drop-shadow(0 0 20px ${team?team.color:'#fff'})`;
  document.getElementById('winsub').textContent=`${G_.turnN} turns · ${G_.events.explosions} explosions`;
  document.getElementById('winstats').innerHTML=G_.teams.map(t=>`<div style="color:${t.color}"><b>${t.name}</b> — ${t.worms.filter(w=>!w.dead).length} worm(s) left, ${t.worms.reduce((s,w)=>s+(w.dead?0:w.hp),0)} HP</div>`).join('');
  if(team){const tw=team.worms.find(w=>!w.dead);if(tw)G_.focus={x:tw.x,y:tw.y};}
  G_.confetti=team?team.color:'#fff';window.__over=true;}
function stateStep(){
  const w=G_.cur;
  if(G_.state==='turn'||G_.state==='retreat'){
    if(G_.state==='turn'){const pt=Math.ceil(G_.timer);G_.timer-=DT;if(Math.ceil(G_.timer)!==pt&&pt<=5&&pt>0)snd.tick();if(G_.timer<=0)endTurnSoon();}
    else{G_.retreat-=DT;if(G_.retreat<=0)endTurnSoon();}
    if(w.dead)endTurnSoon();
    if(w.jet>0)jetStep(w);
    if(G_.ai)aiStep(w);else humanStep(w);
  }else if(G_.state==='settle'){G_.settle+=DT;
    const busy=G_.projs.length||G_.planes.length||G_.worms.some(o=>!o.dead&&o.air)||Math.abs(waterLevel-G_.waterTarget)>1;
    if(!busy&&G_.settle>.7||G_.settle>14){const dq=G_.worms.filter(o=>!o.dead&&o.hp<=0);
      if(dq.length){G_.state='deaths';G_.deathQ=dq;G_.dt=0;}else startTurn();}
  }else if(G_.state==='deaths'){G_.dt-=DT;if(G_.dt<=0){const d=G_.deathQ.shift();if(d){G_.focus={x:d.x,y:d.y+20};snd.voice(1.4);killWorm(d);explode(d.x,d.y+8,24,12,{});G_.dt=.9;}else{G_.state='settle';G_.settle=0;}}}
}
function jetStep(w){w.jet-=DT;const K=keys,ai=G_.ai;
  let ux=0,uy=0;if(ai){ux=ai.jx||0;uy=ai.jy||0;}else{ux=(K.ArrowRight?1:0)-(K.ArrowLeft?1:0);uy=K.ArrowUp?1:0;}
  if(ux)w.facing=ux;w.vx=clamp(w.vx+ux*400*DT,-160,160);w.vy=clamp(w.vy+(uy*900-G*0.7)*DT,-300,220);
  if(uy||ux){fire.add({x:w.x-w.facing*6,y:w.y+4,vx:rnd(-20,20),vy:-rnd(100,200),life:.25,s0:9,s1:2,c:[1,.75,.3],c1:[1,.3,.05]});if((simT*60|0)%6===0)snd.jet();}
  const n=4;for(let i=0;i<n;i++){const nx=w.x+w.vx*DT/n;if(bodyFree(nx,w.y))w.x=nx;else w.vx=0;const ny=w.y+w.vy*DT/n;if(bodyFree(nx,ny)&&!(w.vy<0&&solid(w.x,ny)))w.y=ny;else{if(w.vy<0){w.jet=0;w.air=false;w.vx=w.vy=0;}else w.vy=0;}}
  if(w.jet<=0){w.jet=0;w.air=!onGround(w);w.nofall=true;}}

// ---------- AI ----------
const DIFF={easy:{da:.12,dp:.1,an:.09,pn:.09,top:.4,wpn:false},normal:{da:.07,dp:.06,an:.03,pn:.035,top:.12,wpn:true},hard:{da:.045,dp:.045,an:.006,pn:.01,top:0,wpn:true}};
function* aiPlan(w,diff){
  const D=DIFF[diff]||DIFF.normal,T=w.team,res=[],c=C(w);
  const score=(x,y,r,dmg)=>{let s=0;for(const o of G_.worms){if(o.dead)continue;const oc=C(o),d=Math.hypot(oc.x-x,oc.y-y),R2=r+14;
    if(d<R2){const f=1-d/R2;let dd=Math.min(dmg*(.35+.65*f),o.hp);let v=dd+(dd>=o.hp?30:0)+(o.y<waterLevel+50?10:0);s+=o.team===T?-v*(o===w?1.8:1.4):v;}}return s;};
  const kinds=[{wid:'bazooka',wind:true,hit:true},{wid:'grenade',bounce:.45,fuse:3}];
  for(const k of kinds)for(const dir of [1,-1])for(let a=-1.1;a<=1.45;a+=D.da){
    for(let pw=.3;pw<=1.001;pw+=D.dp){const ang=dir>0?a:Math.PI-a,cx=Math.cos(ang),cy=Math.sin(ang);
      const p={x:c.x+cx*16,y:c.y+cy*16,vx:cx*pw*MAXV,vy:cy*pw*MAXV,t:0,wind:k.wind,hitWorms:k.hit,bounce:k.bounce,fuse:k.fuse,owner:w};
      let ev=null;for(let s=0;s<900&&!ev;s++)ev=projStep(p,G_.worms);
      if(ev==='hit'||ev==='fuse'){const base={dir,aim:a,power:pw};
        if(k.wid==='bazooka')res.push({...base,wid:'bazooka',score:score(p.x,p.y,44,50)});
        else{res.push({...base,wid:'grenade',score:score(p.x,p.y,42,50)});
          if(D.wpn&&T.ammo.cluster)res.push({...base,wid:'cluster',score:score(p.x,p.y,55,55)*.85});
          if(D.wpn&&T.ammo.banana)res.push({...base,wid:'banana',score:score(p.x,p.y,85,95)*.85});}}}
    yield;}
  const enemies=G_.worms.filter(o=>!o.dead&&o.team!==T);
  for(const e of enemies){const ec=C(e),dx=ec.x-c.x,dy=ec.y-c.y,dist=Math.hypot(dx,dy);
    if(dist<500&&dist>20){let x=c.x,y=c.y,ok=false;const ux=dx/dist,uy=dy/dist;for(let i=16;i<dist+10;i+=2){x=c.x+ux*i;y=c.y+uy*i;if(solid(x,y))break;
        const hw=G_.worms.find(o=>!o.dead&&o!==w&&Math.abs(C(o).x-x)<9&&Math.abs(C(o).y-y)<13);if(hw){ok=hw===e;break;}}
      if(ok){const dir=dx>=0?1:-1,ang=Math.atan2(uy,ux),a=dir>0?ang:Math.PI-ang;const na=((a+Math.PI)%(2*Math.PI))-Math.PI;
        if(Math.abs(na)<1.5)res.push({wid:'shotgun',dir,aim:na,power:1,score:Math.min(50,e.hp)+(e.hp<=50?30:0)+5});}}
    if(D.wpn&&T.ammo.airstrike){const dir=ec.x>W/2?-1:1;let s=0;for(let i=0;i<5;i++){const bx=ec.x+(i-2)*35*dir;let by=-1;for(let y=H-80;y>0;y--){if(solid(bx,y)){by=y;break;}
        const hw=G_.worms.find(o=>!o.dead&&Math.abs(C(o).x-bx)<10&&Math.abs(C(o).y-y)<14);if(hw){by=y;break;}}if(by>0)s+=score(bx,by,34,30)*.55;}
      res.push({wid:'airstrike',target:{x:ec.x,y:ec.y},dir:w.facing,aim:w.aim,power:1,score:s});}
    if(D.wpn&&T.ammo.homing){const dir=dx>=0?1:-1;res.push({wid:'homing',target:{x:ec.x,y:ec.y+8},dir,aim:.9,power:.55,score:score(ec.x,ec.y,44,50)*.6});}
  }
  res.sort((a,b)=>b.score-a.score);
  let pick=res[0];
  if(pick&&D.top>0){const n=Math.max(1,Math.ceil(res.length*D.top*.02));const good=res.slice(0,n).filter(r=>r.score>=pick.score*.5);pick=good[Math.floor(Math.random()*good.length)]||pick;}
  return pick||null;}
function aiStep(w){const ai=G_.ai;ai.t+=DT;
  if(ai.phase==='think')return; // planning happens in frame loop (time-budgeted)
  if(ai.phase==='move'){ai.mt-=DT;const ok=w.air?true:tryWalk(w,ai.mdir);
    if(!ok&&!w.air){if(ai.jumps++<2){doJump(w,false);}else ai.mt=0;}
    if(ai.mt<=0&&!w.air){ai.phase='think';ai.t=0;ai.gen=aiPlan(w,w.team.diff);}return;}
  if(G_.state==='retreat'){if(ai.flee&&!w.air&&G_.retreat>.3){if(!tryWalk(w,ai.flee)&&!w.air&&ai.jumps++<3)doJump(w,false);}return;}
  const p=ai.plan;
  if(ai.phase==='aim'){
    if(G_.wid!==p.wid){G_.wid=p.wid;snd.ui();ai.t=0;}
    w.facing=p.dir;const da=ai.aimGoal-w.aim;w.aim+=clamp(da,-1.6*DT,1.6*DT);
    if(Math.abs(da)<.01&&ai.t>.6){if(['bazooka','grenade','cluster','banana','homing'].includes(p.wid)){ai.phase='charge';G_.charging=true;G_.power=0;G_.target=p.target||null;}else{fireNow(w,p.target);if(G_.wid==='shotgun'&&G_.state==='turn'){ai.t=0;}}}
  }else if(ai.phase==='charge'){G_.power+=DT/1.3;if(G_.power>=ai.pGoal){G_.power=ai.pGoal;fireNow(w,p.target);}}
}
function aiFrame(budget){const ai=G_.ai;if(!ai||ai.phase!=='think'||G_.state!=='turn'||G_.paused)return;
  const t0=performance.now();
  while(!ai.done&&performance.now()-t0<budget){const r=ai.gen.next();if(r.done){ai.done=true;ai.result=r.value;}}
  if(!ai.done||(ai.t<.5&&!Q.has("turbo")))return;
  ai.done=false;const w=G_.cur,plan=ai.result,D=DIFF[w.team.diff]||DIFF.normal;
  if((!plan||plan.score<6)&&ai.tries<2&&G_.timer>12){ai.tries++;ai.phase='move';ai.jumps=0;ai.mt=rnd(1.5,3);
    const en=G_.worms.filter(o=>!o.dead&&o.team!==w.team).sort((a,b)=>Math.abs(a.x-w.x)-Math.abs(b.x-w.x))[0];ai.mdir=en&&en.x<w.x?-1:1;if(ai.tries===2)ai.mdir*=-1;return;}
  if(!plan){ai.plan={wid:'skip',dir:w.facing,aim:w.aim};ai.aimGoal=w.aim;ai.phase='aim';return;}
  ai.plan=plan;ai.aimGoal=clamp(plan.aim+gauss()*D.an,-1.5,1.5);ai.pGoal=clamp(plan.power+gauss()*D.pn,.1,1);ai.phase='aim';ai.t=0;
  const tgt=plan.target||{x:w.x+Math.cos(plan.aim)*plan.dir*200,y:w.y};ai.flee=Math.abs(tgt.x-w.x)<150?(tgt.x<w.x?1:-1):0;}
function fireNow(w,target){const ok=useWeapon(w,G_.wid,G_.power||1,target||G_.target);G_.charging=false;G_.power=0;w.team.last=G_.wid;if(!ok&&G_.ai){G_.wid='skip';useWeapon(w,'skip');}updHUD();}
function doJump(w,back){if(w.air)return;w.air=true;w.jumped=true;if(back){w.vx=-w.facing*40;w.vy=430;}else{w.vx=w.facing*140;w.vy=260;}w.y+=2;snd.jump(back);}

// ---------- human input ----------
const keys={};let mouse={x:0,y:0,wx:0,wy:0};
addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;snd.init();
  if(e.code==='Tab'){e.preventDefault();toggleWM();return;}
  if(e.code==='KeyM'){toggleMute();return;}
  if(e.code==='KeyP'||e.code==='Escape'){if(G_.state!=='menu'&&G_.state!=='over')togglePause();return;}
  if(G_.spectator&&/^Digit[1-4]$/.test(e.code)){setSpeed([1,2,4,8][+e.code[5]-1]);return;}
  if(e.code==='Equal'||e.code==='NumpadAdd'){setSpeed(G_.speed>=8?1:G_.speed*2);return;}
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Backspace','Enter'].includes(e.code))e.preventDefault();
  if(e.repeat){keys[e.code]=true;return;}
  keys[e.code]=true;const w=G_.cur;
  if(!w||G_.ai||G_.paused)return;
  if(G_.state==='turn'||G_.state==='retreat'){
    if(e.code==='Enter')doJump(w,false);if(e.code==='Backspace')doJump(w,true);
    if(G_.state==='turn'&&/^Digit[1-5]$/.test(e.code)){G_.fuse=+e.code[5];updHUD();snd.ui();}
    if(G_.state==='turn'&&e.code==='Space'){const wd=WBY[G_.wid];
      if(w.jet>0){w.jet=0;return;}
      if(wd.charge){if(wd.target&&!G_.target){banner('Click to pick a target first');return;}G_.charging=true;G_.power=0;}
      else if(!wd.target)fireNow(w);}}});
addEventListener('keyup',e=>{keys[e.code]=false;if(e.code==='Space'&&G_.charging&&!G_.ai&&G_.state==='turn')fireNow(G_.cur);});
function humanStep(w){if(G_.paused)return;
  if(w.jet>0)return;
  if(!w.air&&!G_.charging){if(keys.ArrowLeft)tryWalk(w,-1);else if(keys.ArrowRight)tryWalk(w,1);}
  if(keys.ArrowUp)w.aim=Math.min(1.55,w.aim+1.4*DT);if(keys.ArrowDown)w.aim=Math.max(-1.55,w.aim-1.4*DT);
  if(G_.charging){G_.power+=DT/1.3;if(G_.power>=1){G_.power=1;fireNow(w);}}}
const cvs=renderer.domElement;
cvs.addEventListener('contextmenu',e=>{e.preventDefault();if(G_.state!=='menu')toggleWM();});
let drag=null;
cvs.addEventListener('mousedown',e=>{snd.init();if(e.button!==0)return;const w=G_.cur;
  if(w&&!G_.ai&&G_.state==='turn'&&WBY[G_.wid].target){const t={x:mouse.wx,y:mouse.wy};
    if(G_.wid==='homing'){G_.target=t;snd.ui();return;}
    G_.target=t;fireNow(w,t);return;}
  drag={x:e.clientX,y:e.clientY,cx:camX,cy:camY};});
addEventListener('mouseup',()=>drag=null);
addEventListener('mousemove',e=>{mouse.x=e.clientX;mouse.y=e.clientY;const vw=viewW(),vh=VIEWH/zoom;mouse.wx=camX+(e.clientX/innerWidth-.5)*vw;mouse.wy=camY-(e.clientY/innerHeight-.5)*vh;
  if(drag){const s=vh/innerHeight;camX=drag.cx-(e.clientX-drag.x)*s;camY=drag.cy+(e.clientY-drag.y)*s;manualT=3;}});
addEventListener('wheel',e=>{if(G_.state==='menu')return;zoom=clamp(zoom*(e.deltaY>0?.9:1.1),.55,1.8);updCam();},{passive:true});

// ---------- HUD / menus ----------
const $=id=>document.getElementById(id);
function toggleMute(){snd.init();snd.setMuted(!snd.muted);$('bmute').textContent=snd.muted?'🔇':'♪';$('bmute').style.opacity=snd.muted?.5:1;}
function togglePause(){G_.paused=!G_.paused;$('paused').classList.toggle('hidden',!G_.paused);$('bpause').textContent=G_.paused?'▶':'❚❚';}
function setSpeed(s){G_.speed=s;$('bspeed').textContent=s+'×';}
$('bmute').onclick=toggleMute;$('bpause').onclick=togglePause;$('bspeed').onclick=()=>setSpeed(G_.speed>=8?1:G_.speed*2);$('bweap').onclick=()=>toggleWM();
function toggleWM(force){const m=$('wmenu');const show=force??m.classList.contains('hidden');if(show&&(!G_.cur||G_.ai||G_.state!=='turn'))return m.classList.add('hidden');
  m.classList.toggle('hidden',!show);if(!show)return;const T=G_.cur.team;m.innerHTML='';
  for(const wd of WEAPONS){const a=T.ammo[wd.id];const b=document.createElement('div');b.className='wb'+(G_.wid===wd.id?' sel':'')+(a===0?' empty':'');
    b.innerHTML=`<i>${a<0?'∞':a}</i>`;const img=new Image();img.src=icon(wd.id).toDataURL();b.appendChild(img);b.append(wd.name);
    b.onclick=()=>{G_.wid=wd.id;G_.target=null;snd.ui();toggleWM(false);updHUD();};m.appendChild(b);}}
let lastIcon='';
function updHUD(teams){const wd=WBY[G_.wid]||WEAPONS[0];$('wname').textContent=wd.name;
  const T=G_.cur&&G_.cur.team;const a=T?T.ammo[wd.id]:-1;
  $('wextra').textContent=(a>=0?`Ammo ${a}`:'')+(wd.fuse?` · Fuse ${G_.fuse}s (1-5)`:'')+(wd.target?' · click target':'')+(G_.wid==='girder'?' · ↑↓ tilt':'');
  if(lastIcon!==wd.id){lastIcon=wd.id;const x=$('wicon').getContext('2d');x.clearRect(0,0,64,64);x.drawImage(icon(wd.id),0,0);}
  const maxHp=Math.max(...G_.teams.map(t=>t.worms.length*100));
  $('teams').innerHTML=G_.teams.map(t=>{const hp=t.worms.reduce((s,w)=>s+(w.dead?0:w.hp),0);return `<div class="tb${G_.cur&&G_.cur.team===t?' cur':''}" style="color:${t.color}"><span>${t.name}${t.cpu?' <small>(CPU)</small>':''}</span><div style="width:${Math.max(2,hp/maxHp*180)}px;background:${t.color}"></div></div>`;}).join('');}
// setup menu
function seg(id,opts,get,set){const el=$(id);el.innerHTML='';for(const [v,l] of opts){const b=document.createElement('button');b.textContent=l;if(get()===v)b.className='on';b.onclick=()=>{set(v);snd.init();snd.ui();buildMenu();};el.appendChild(b);}}
function buildMenu(){
  seg('nteams',[[2,'2'],[3,'3'],[4,'4']],()=>cfg.nTeams,v=>cfg.nTeams=v);
  seg('nworms',[[2,'2'],[3,'3'],[4,'4'],[5,'5']],()=>cfg.nWorms,v=>cfg.nWorms=v);
  seg('ttime',[[30,'30s'],[45,'45s'],[60,'60s']],()=>cfg.turnTime,v=>cfg.turnTime=v);
  seg('theme',[['random','Random'],['meadow','Meadow'],['desert','Desert'],['winter','Winter'],['alien','Alien']],()=>cfg.theme,v=>cfg.theme=v);
  seg('sdeath',[[true,'On'],[false,'Off']],()=>cfg.sd,v=>cfg.sd=v);
  const tr=$('teamrows');tr.innerHTML='';
  for(let i=0;i<cfg.nTeams;i++){const t=cfg.teams[i];const r=document.createElement('div');r.className='trow';r.style.color=t.color;
    r.innerHTML=`<div class="sw"></div><input value="${t.name}" maxlength="18"><div class="seg"></div><div class="seg"></div>`;
    r.querySelector('input').oninput=e=>t.name=e.target.value||TEAMDEF[i].name;
    const [s1,s2]=r.querySelectorAll('.seg');
    for(const [v,l] of [[false,'Human'],[true,'CPU']]){const b=document.createElement('button');b.textContent=l;if(t.cpu===v)b.className='on';b.onclick=()=>{t.cpu=v;snd.ui();buildMenu();};s1.appendChild(b);}
    for(const d of ['easy','normal','hard']){const b=document.createElement('button');b.textContent=d[0].toUpperCase()+d.slice(1);if(t.diff===d)b.className='on';if(!t.cpu)b.style.opacity=.35;b.onclick=()=>{t.diff=d;snd.ui();buildMenu();};s2.appendChild(b);}
    tr.appendChild(r);}
  localStorage.setItem('worms_cfg',JSON.stringify(cfg));}
$('start').onclick=()=>{snd.init();newGame();};
$('demo').onclick=()=>{snd.init();for(const t of cfg.teams)t.cpu=true;if(cfg.nTeams<3)cfg.nTeams=4;buildMenu();newGame();};
$('again').onclick=()=>{newGame();};
$('tomenu').onclick=()=>{toMenu();};

// ---------- game setup ----------
function clearWorld(){for(const w of G_.worms){scene.remove(w.g);w.lab.remove();}for(const p of G_.projs)scene.remove(p.mesh);for(const p of G_.planes)scene.remove(p.mesh);
  for(const f of floaters)f.e.remove();floaters.length=0;G_.worms=[];G_.projs=[];G_.planes=[];smoke.list.length=0;fire.list.length=0;lights=[];}
function applyTheme(name){TH=THEMES[name];
  const U=skyMat.uniforms;U.skyT.value.set(...TH.skyT);U.skyB.value.set(...TH.skyB);U.sun.value.set(...TH.sun);U.fog.value.set(...TH.fog);U.m0.value.set(...TH.m[0]);U.m1.value.set(...TH.m[1]);U.m2.value.set(...TH.m[2]);U.alien.value=name==='alien'?1:name==='winter'?.4:0;
  for(const k of ['soilA','soilB','soilC','grass','grass2','sun'])terrUni[k].value.set(...TH[k]);
  for(const m of waters){m.material.uniforms.c1.value.set(...TH.water);m.material.uniforms.c2.value.set(...TH.water2);m.material.uniforms.sun.value.set(...TH.sun);}}
function newGame(opts={}){
  $('menu').classList.add('hidden');$('win').classList.add('hidden');$('hud').classList.remove('hidden');window.__over=false;
  clearWorld();const seed=Q.get('seed')?+Q.get('seed'):Math.floor(Math.random()*1e9);R=mulberry(seed);G_.seed=seed;
  const th=cfg.theme==='random'?Object.keys(THEMES)[Math.floor(R()*4)]:cfg.theme;applyTheme(th);G_.theme=th;
  waterLevel=70;G_.waterTarget=70;genTerrain();
  G_.teams=[];const used=[];let ni=Math.floor(R()*NAMES.length);
  for(let i=0;i<cfg.nTeams;i++){const c=cfg.teams[i];const T={...c,worms:[],wi:-1,ammo:Object.fromEntries(WEAPONS.map(w=>[w.id,w.ammo]))};G_.teams.push(T);}
  for(let k=0;k<cfg.nWorms;k++)for(const T of G_.teams){const p=findSpawn(used);used.push(p);const w=makeWorm(T,NAMES[(ni++)%NAMES.length],p.x,p.y);T.worms.push(w);G_.worms.push(w);}
  G_.teamIdx=Math.floor(R()*G_.teams.length)-1;if(G_.teamIdx<0)G_.teamIdx=G_.teams.length-1;
  G_.turnN=0;G_.sudden=false;G_.paused=false;$('paused').classList.add('hidden');G_.events={turns:0,shots:0,explosions:0};G_.confetti=null;G_.focus=null;
  G_.spectator=G_.teams.every(t=>t.cpu);$('spec').classList.toggle('hidden',!G_.spectator);$('help').classList.toggle('hidden',G_.spectator);
  setSpeed(G_.spectator?(+Q.get('speed')||1):1);
  snd.play(['battle1','battle2','battle3','battle4'][Math.floor(Math.random()*4)]);
  startTurn();camX=G_.cur.x;camY=G_.cur.y;}
function toMenu(){clearWorld();G_.state='menu';$('hud').classList.add('hidden');$('win').classList.add('hidden');$('menu').classList.remove('hidden');snd.play('menu');menuWorld();}
function menuWorld(){R=mulberry(7);const th=['meadow','desert','winter','alien'][Math.floor(Math.random()*4)];applyTheme(Q.get('theme')||th);waterLevel=70;G_.waterTarget=70;genTerrain();camX=W*.3;camY=H*.4;}

// ---------- camera, visuals, loop ----------
let camX=W/2,camY=H/2,manualT=0;
function camTarget(){
  if(G_.state==='over'&&G_.focus)return G_.focus;
  const p=G_.projs[G_.projs.length-1];if(p)return {x:p.x,y:p.y,fast:1};
  const pl=G_.planes[0];if(pl)return {x:clamp(pl.x,pl.drops[0]??pl.x,pl.x),y:pl.y-250};
  if(G_.state==='deaths'&&G_.focus)return G_.focus;
  const mv=G_.worms.filter(w=>!w.dead&&w.air&&w!==G_.cur).sort((a,b)=>Math.hypot(b.vx,b.vy)-Math.hypot(a.vx,a.vy))[0];
  if(G_.state==='settle'&&mv)return {x:mv.x,y:mv.y};
  if(G_.cur){const w=G_.cur;if(G_.ai&&G_.ai.plan&&G_.ai.phase!=='move'&&G_.spectator){const t=G_.ai.plan.target;if(t)return {x:(w.x*2+t.x)/3,y:(w.y*2+t.y)/3};}
    return {x:w.x+(G_.charging?dirOf(w)[0]*120:0),y:w.y+60};}
  return {x:camX,y:camY};}
const cross=new THREE.Mesh(new THREE.PlaneGeometry(22,22),spriteMat(tex((()=>{const [c,x]=cv(64);x.strokeStyle='#ff3b3b';x.lineWidth=6;x.shadowColor='#000';x.shadowBlur=4;x.beginPath();x.arc(32,32,20,0,7);x.moveTo(32,4);x.lineTo(32,20);x.moveTo(32,44);x.lineTo(32,60);x.moveTo(4,32);x.lineTo(20,32);x.moveTo(44,32);x.lineTo(60,32);x.stroke();return c;})(),'cross')));
cross.renderOrder=9;scene.add(cross);
const tgtMark=new THREE.Mesh(new THREE.PlaneGeometry(30,30),spriteMat(tex((()=>{const [c,x]=cv(64);x.strokeStyle='#ffd23a';x.lineWidth=7;x.shadowColor='#000';x.shadowBlur=4;x.beginPath();x.moveTo(12,12);x.lineTo(52,52);x.moveTo(52,12);x.lineTo(12,52);x.stroke();return c;})(),'tgt')));
tgtMark.renderOrder=9;scene.add(tgtMark);
const powerBar=new THREE.Mesh(new THREE.PlaneGeometry(1,8),mat({uniforms:{p:{value:0}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec2 vUv;uniform float p;void main(){float x=vUv.x*p;vec3 c=mix(vec3(1.,.9,.2),vec3(1.,.15,.05),x);float a=smoothstep(.0,.25,vUv.y)*smoothstep(1.,.75,vUv.y)*(.6+.4*vUv.x);gl_FragColor=vec4(c*1.6,a);}`}));
powerBar.geometry.translate(.5,0,0);powerBar.renderOrder=9;scene.add(powerBar);
const arrowEl=document.createElement('div');arrowEl.className='arrow';arrowEl.textContent='▼';$('labels').appendChild(arrowEl);
function w2s(x,y){return [((x-cam.position.x)/(cam.right-cam.left)+.5)*innerWidth,(.5-(y-cam.position.y)/(cam.top-cam.bottom))*innerHeight];}
function visuals(dt){
  const t=simT;
  for(const w of G_.worms){
    if(w.drowned){w.sink+=dt;w.g.position.set(w.x,w.y-w.sink*30,0);w.body.material.opacity=Math.max(0,1-w.sink/2);continue;}
    w.g.position.set(w.x,w.y,0);w.body.scale.x=(w.dead?.8:1)*(w.facing);
    if(!w.dead){w.squash=Math.max(0,w.squash-dt*2);const walk=w.step&&t-w.lastStepT<.1;
      const breathe=Math.sin(t*3+w.x)*.03,wk=w.walking?Math.sin(t*18)*.08:0;w.body.scale.y=1+breathe+wk-w.squash*.4;w.body.scale.x*=1-breathe*.5+w.squash*.3;
      w.body.rotation.z=w.air?clamp(-w.vx*.002*w.facing,-.5,.5)+(w.jumped&&w.vy>0&&Math.abs(w.vx)<60?(w.vy-430)*-.012*w.facing:0):0;
      if(w.jet>0)w.body.rotation.z=-w.vx*.002;
      const isCur=w===G_.cur&&(G_.state==='turn'||G_.state==='retreat')&&!w.air&&G_.state==='turn';
      w.gm.visible=!!isCur&&!['skip','jetpack','teleport','airstrike'].includes(G_.wid);
      if(w.gm.visible){const k=G_.wid;w.gm.material.map=tex(icon(k),'i'+k);w.gun.scale.x=w.facing;w.gm.rotation.z=w.aim+(['bazooka','homing','shotgun','girder','dynamite'].includes(k)?.45:0);}
      if(w.shownHp!==w.hp){w.shownHp+=Math.sign(w.hp-w.shownHp)*Math.max(1,Math.abs(w.hp-w.shownHp)*dt*3|0);if(Math.abs(w.shownHp-w.hp)<1)w.shownHp=w.hp;w.hpEl.textContent=Math.round(w.shownHp);}
      const [sx,sy]=w2s(w.x,w.y+58);w.lab.style.left=sx+'px';w.lab.style.top=sy+'px';w.lab.classList.toggle('cur',w===G_.cur);}
    w.walking=false;}
  const cw=G_.cur;
  const showAim=cw&&!cw.dead&&G_.state==='turn'&&!cw.air&&!['skip','jetpack','teleport','airstrike','dynamite'].includes(G_.wid)&&(!G_.ai||G_.ai.phase==='aim'||G_.ai.phase==='charge');
  cross.visible=showAim;powerBar.visible=showAim&&G_.charging;
  if(showAim){const c=C(cw),[dx,dy]=dirOf(cw);cross.position.set(c.x+dx*70,c.y+dy*70,0);cross.rotation.z=t*2;powerBar.position.set(c.x+dx*14,c.y+dy*14,0);powerBar.rotation.z=Math.atan2(dy,dx);powerBar.scale.x=G_.power*80+1;powerBar.material.uniforms.p.value=1;}
  const tg=G_.target||(G_.ai&&G_.ai.plan&&G_.ai.phase!=='think'&&G_.ai.plan.target);tgtMark.visible=!!tg&&G_.state==='turn';if(tg){tgtMark.position.set(tg.x,tg.y,0);tgtMark.rotation.z=t;}
  if(cw&&!cw.dead&&G_.state==='turn'){const [sx,sy]=w2s(cw.x,cw.y+90);arrowEl.style.display='block';arrowEl.style.left=sx+'px';arrowEl.style.top=sy+'px';arrowEl.style.color=cw.team.color;}else arrowEl.style.display='none';
  for(const f of floaters){f.t+=dt;const [sx,sy]=w2s(f.x,f.y+f.t*40);f.e.style.left=sx+'px';f.e.style.top=sy+'px';f.e.style.opacity=Math.min(1,2.5-f.t);if(f.t>2.5){f.e.remove();f.dead=1;}}
  for(let i=floaters.length-1;i>=0;i--)if(floaters[i].dead)floaters.splice(i,1);
  for(const tr of tracers){for(let i=0;i<=20;i++)fire.add({x:lerp(tr.x0,tr.x1,i/20),y:lerp(tr.y0,tr.y1,i/20),life:.2,s0:5,s1:1,c:[1,.9,.5],a:.8});}tracers.length=0;
  // ambient wind particles
  const vw=viewW(),vh=VIEWH/zoom;
  if(amb.list.length<180&&R()<.9){const k=TH.ambKind;amb.add({x:camX+rnd(-vw*.7,vw*.7),y:camY+rnd(-vh*.6,vh*.6),vx:rnd(-10,10),vy:k==='snow'?-rnd(20,50):k==='spore'?rnd(-5,15):-rnd(5,20),life:rnd(4,8),s0:TH.ambSize*rnd(.6,1.4),s1:TH.ambSize*.5,c:TH.amb.map(v=>v*rnd(.8,1)),a:k==='dust'?.35:.75,drag:.995,wind:1,t:k==='leaf'?2:0});}
  // lights
  lights=lights.filter(l=>(l.t+=dt)<.6);
  for(let i=0;i<MAXL;i++){const l=lights[lights.length-1-i],v=terrUni.lights.value[i];if(l)v.set(l.x,l.y,l.r,l.i*(1-l.t/.6)**2);else v.w=0;}
  // confetti on win
  if(G_.confetti&&R()<.8){fire.add({x:camX+rnd(-vw/2,vw/2),y:camY+vh/2,vx:rnd(-50,50),vy:-rnd(30,120),life:4,s0:6,s1:5,c:[R(),R(),R()].map(v=>v*.8+.2),g:20,drag:.99,t:2,a:.9});}
}
// wind HUD
function windHUD(){const p=Math.abs(wind)*50;$('windL').style.width=(wind<0?p:0)+'%';$('windR').style.width=(wind>0?p:0)+'%';}
let last=performance.now(),acc=0,frames=0,hudT=0;window.__f=0;
function frame(now){requestAnimationFrame(frame);let dt=Math.min(.1,(now-last)/1000);last=now;frames++;window.__f=frames;
  const playing=G_.state!=='menu';
  if(playing&&!G_.paused){
    aiFrame(G_.speed>1?14:8);
    acc+=dt*G_.speed;let n=0;const maxN=Q.has('turbo')?400:Math.ceil(G_.speed*8);
    while(acc>=DT&&n<maxN){acc-=DT;n++;simT+=DT;projUpdate();for(const w of G_.worms){wormPhysics(w);if(!w.dead&&w.y<waterLevel-6&&!w.drowned){killWorm(w,true);splash(w.x);snd.voice(.7,'ow');if(w===G_.cur)endTurnSoon();}}
      if(G_.state!=='over')stateStep();
      if(Math.abs(waterLevel-G_.waterTarget)>.1)waterLevel+=Math.sign(G_.waterTarget-waterLevel)*Math.min(.6,Math.abs(G_.waterTarget-waterLevel));
      if(Q.has('turbo')&&G_.ai&&G_.ai.phase==='think')break;}
    if(acc>1)acc=0;
    for(const w of G_.worms)if(keys.ArrowLeft||keys.ArrowRight)w.walking=(w===G_.cur&&!G_.ai&&!w.air);
    if(G_.ai&&G_.ai.phase==='move'&&G_.cur)G_.cur.walking=!G_.cur.air;
  } else if(!playing){simT+=dt;camX=W*.5+Math.sin(simT*.05)*W*.3;camY=H*.38;}
  const sdt=G_.paused?0:dt*(playing?G_.speed:1);
  smoke.update(sdt);fire.update(sdt);amb.update(sdt);if(!G_.paused)visuals(sdt);
  // camera
  if(playing){manualT-=dt;if(manualT<=0){const ct=camTarget();const k=1-Math.exp(-dt*(ct.fast?5:2.6)*Math.min(G_.speed,3));camX=lerp(camX,ct.x,k);camY=lerp(camY,ct.y,k);}}
  const vw=viewW(),vh=VIEWH/zoom;camX=clamp(camX,-200+vw/2,W+200-vw/2);camY=clamp(camY,-120+vh/2,Math.max(-120+vh/2,H+150-vh/2));
  shake*=Math.pow(.02,dt);flash*=Math.pow(.001,dt);
  cam.position.set(camX+(R()-.5)*shake,camY+(R()-.5)*shake,10);
  const tt=simT;skyMat.uniforms.cam.value.set(cam.position.x,cam.position.y);skyMat.uniforms.view.value.set(vw,vh);skyMat.uniforms.time.value=tt;skyMat.uniforms.wind.value=wind;
  terrUni.time.value=tt;for(const m of waters){m.material.uniforms.time.value=tt;m.material.uniforms.level.value=waterLevel+m.userData.dy;}
  const ppu=innerHeight/vh*renderer.getPixelRatio();smoke.mat.uniforms.ppu.value=fire.mat.uniforms.ppu.value=amb.mat.uniforms.ppu.value=ppu;
  grade.uniforms.flash.value=flash;grade.uniforms.time.value=tt%10;
  if(playing&&G_.state!=='over'){hudT-=dt;if(hudT<=0){hudT=.25;updHUD();windHUD();}const tm=$('timer');const v=G_.state==='retreat'?Math.ceil(G_.retreat):G_.state==='turn'?Math.ceil(G_.timer):'';tm.textContent=v;tm.classList.toggle('warn',G_.state==='turn'&&G_.timer<=5);}
  composer.render();
}
updCam();buildMenu();
if(Q.has('auto')){const n=+Q.get('teams')||4;cfg.nTeams=n;cfg.nWorms=+Q.get('worms')||4;cfg.teams.forEach((t,i)=>{t.cpu=!(Q.has('human')&&i===0);t.diff=['hard','normal','easy','normal'][i];});if(Q.get('theme'))cfg.theme=Q.get('theme');newGame();}
else menuWorld();
requestAnimationFrame(frame);
addEventListener('pointerdown',()=>{snd.init();if(G_.state==='menu')snd.play('menu');},{once:false});

window.__wm=()=>toggleWM(true);
