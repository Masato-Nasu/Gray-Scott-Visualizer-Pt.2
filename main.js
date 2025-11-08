/* Gray‑Scott + diffusiophoresis + hard-sphere crowding — Mobile build */
(() => {
  'use strict';
  const $ = (s)=>document.querySelector(s);
  const isMobile = matchMedia('(max-width: 768px)').matches;
  const SIM_SIZE = isMobile ? 384 : 512;

  const canvas = $('#canvas');
  const ctx = canvas.getContext('2d', { alpha:false });
  canvas.width = canvas.height = SIM_SIZE;
  const size = SIM_SIZE;
  const imageData = ctx.createImageData(size, size);

  // ===== Fields =====
  let U = new Float32Array(size*size).fill(1.0);
  let V = new Float32Array(size*size).fill(0.0);

  // Particle-size field R
  const R = new Float32Array(size*size);
  (function makeR(){
    function gauss(){ const u1=Math.random(),u2=Math.random(); return Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2); }
    const tmp = new Float32Array(size*size);
    for(let i=0;i<tmp.length;i++){ tmp[i] = Math.min(1, Math.max(0, 0.5 + 0.22*gauss())); }
    // 3x3 blur
    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      let acc=0,c=0;
      for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++){
        const xx=(x+i+size)%size, yy=(y+j+size)%size; acc += tmp[yy*size+xx]; c++;
      }
      R[y*size+x] = acc/c;
    }
  })();

  // ===== Fast seeding so the screen fills quickly =====
  (function seed(){
    for (let i=0;i<V.length;i++){
      const r = Math.random();
      if (r < 0.08) V[i] = 0.35 + 0.25*Math.random();
      else if (r < 0.28) V[i] = 0.05*Math.random();
    }
    const cx=size/2, cy=size/2, r0=size*0.28, w=size*0.03;
    for (let y=0;y<size;y++) for (let x=0;x<size;x++){
      const dx=x-cx, dy=y-cy, r=Math.hypot(dx,dy);
      if (Math.abs(r-r0)<w) V[y*size+x] += 0.25;
    }
    for (let i=0;i<U.length;i+=2){
      U[i] = Math.max(0, Math.min(1, U[i] - (Math.random()*0.06)));
    }
  })();

  // ===== Parameters =====
  let du=0.14, dv=0.07;
  let alphaDP=0.12, lambdaR=0.60, betaHS=0.12, noiseAmt=0.00020;
  const t0HS=0.35, t1HS=0.85;

  // Startup burst for fast fill
  const BURST_SEC = 2.5;

  // ===== Helpers =====
  const wrap=(x,m)=>(x+m)%m;
  function lap(F,x,y){return F[wrap(y-1,size)*size+x]+F[wrap(y+1,size)*size+x]+F[y*size+wrap(x-1,size)]+F[y*size+wrap(x+1,size)]-4*F[y*size+x];}
  function grad(F,x,y){const dx=F[y*size+wrap(x+1,size)]-F[y*size+wrap(x-1,size)]; const dy=F[wrap(y+1,size)*size+x]-F[wrap(y-1,size)*size+x]; return [0.5*dx, 0.5*dy];}
  const pink=Array(8).fill(0); function pinkNoise(){let t=0; for(let i=0;i<pink.length;i++){ if(Math.random()<1/(1<<i)) pink[i]=Math.random()*2-1; t+=pink[i]; } return t/pink.length;}

  // ===== Audio envelope (built‑in RMS) =====
  let audioCtx, analyser, source, floatBuf;
  let envRMS=0, envFast=0;
  function getRMS(){
    try{
      if (!analyser) return 0;
      if (!floatBuf) floatBuf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(floatBuf);
      let s=0;
      for(let i=0;i<floatBuf.length;i++){ const v=floatBuf[i]; s += v*v; }
      const rms = Math.sqrt(s/floatBuf.length);
      return rms;
    }catch{ return 0; }
  }
  function updateEnv(){
    const rms = getRMS();
    const aSlow=0.04, aFast=0.25;
    envRMS=(1-aSlow)*envRMS + aSlow*(rms||0);
    envFast=(1-aFast)*envFast + aFast*(rms||0);
    const transient=Math.max(0, envFast - 1.12*envRMS);
    return { env: envRMS, transient };
  }

  // ===== Core Step / Draw =====
  let t0 = performance.now()/1000;
  function step(){
    const U2=new Float32Array(U.length), V2=new Float32Array(V.length);
    const t=performance.now()/1000; const tRel=t-(t0||t);
    const {env, transient} = updateEnv();

    // baseline f,k + gentle modulation
    let f=0.0185 + pinkNoise()*0.00030 + 0.00020*Math.sin(t*0.21) + 0.010*env + 0.006*transient;
    let k=0.0505 + pinkNoise()*0.00030 + 0.00020*Math.cos(t*0.18) + 0.009*env + 0.006*transient;

    // burst: stronger reaction + diffusion + edges → fast coverage
    let duEff=du, dvEff=dv, alphaEff=alphaDP;
    if (tRel < BURST_SEC){
      f += 0.0060; k -= 0.0030;
      duEff = Math.max(du, 0.18); dvEff = Math.max(dv, 0.09);
      alphaEff = Math.max(alphaDP, 0.16);
    }

    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      const i=y*size+x; const u=U[i], v=V[i];
      const Lu=lap(U,x,y)*1.40, Lv=lap(V,x,y)*1.40;
      const gU=grad(U,x,y), gV=grad(V,x,y);
      const divUgradV=(gU[0]*gV[0]+gU[1]*gV[1]) + u*Lv;

      const r=R[i];
      const DU=duEff/(1.0+lambdaR*r), DV=dvEff/(1.0+lambdaR*r);
      const rho=Math.max(0,Math.min(2,u+v));
      const phi=Math.max(0,Math.min(1,(rho*r - t0HS)/(t1HS - t0HS)));
      const att=1.0 - betaHS*phi;

      const UVV=Math.min(0.85, u*v*v);
      let dU=DU*Lu - UVV*att + f*(1.0-u)*att;
      let dV=DV*Lv + UVV*att - (f+k)*v*att;
      dU += -alphaEff*divUgradV;

      const n=(Math.random()-0.5);
      dU += n*noiseAmt; dV += n*noiseAmt*0.5;

      U2[i]=Math.max(0,Math.min(1,u+dU));
      V2[i]=Math.max(0,Math.min(1,(v+dV)*0.992));
    }
    U=U2; V=V2;
  }

  function draw(){
    const d=imageData.data;
    let m=0,q=0,N=0;
    for(let i=0;i<U.length;i+=32){ const b=Math.max(0,Math.min(1,U[i]-V[i])); m+=b; q+=b*b; N++; }
    m/=Math.max(1,N); const varx=Math.max(1e-6, q/Math.max(1,N)-m*m);
    let gain=1.55 + (0.10 - varx)*2.9; gain=Math.max(1.1,Math.min(2.2,gain));

    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      const i=y*size+x;
      const base=Math.max(0,Math.min(1,U[i]-V[i]));
      let t = 0.5 + 0.5*Math.tanh(gain*(base - m));
      t = Math.pow(t, 0.90);
      t = Math.min(0.90, Math.max(0.33, t));
      const c=(t*255)|0; const p=(y*size+x)*4;
      d[p]=d[p+1]=d[p+2]=c; d[p+3]=255;
    }
    ctx.putImageData(imageData,0,0);
  }

  (function loop(){
    const t=performance.now()/1000;
    const steps = (t - t0 < 2.5) ? 6 : (isMobile ? 2 : 3);
    for(let i=0;i<steps;i++) step();
    draw();
    requestAnimationFrame(loop);
  })();

  // Draw once immediately so画面が真っ黒にならない
  try{ draw(); }catch{}

  // ===== Audio & UI =====
  const media = document.createElement('audio');
  media.id='player'; media.preload='metadata'; media.playsInline=true;
  document.body.appendChild(media);

  function ensureGraph(){
    if(audioCtx) return;
    audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    const sourceNode = audioCtx.createMediaElementSource(media);
    analyser=audioCtx.createAnalyser(); analyser.fftSize=1024;
    sourceNode.connect(analyser); analyser.connect(audioCtx.destination);
    source = sourceNode;
  }

  // LCD
  const lcd=(t)=>{ const s1=$('#song1'), s2=$('#song2'); if(s1) s1.textContent=t; if(s2) s2.textContent=t; };

  let playlist=[], urls=[], current=0;
  function sortNumeric(files){
    return files.sort((a,b)=>{
      const ra=a.name.match(/\\d+/), rb=b.name.match(/\\d+/);
      if(ra&&rb){ const na=+ra[0], nb=+rb[0]; if(na!==nb) return na-nb; }
      else if(ra&&!rb) return -1; else if(!ra&&rb) return 1;
      return a.name.localeCompare(b.name,'ja',{numeric:true,sensitivity:'base'});
    });
  }
  function revokeAll(){ urls.forEach(u=>URL.revokeObjectURL(u)); urls=[]; }
  const fileRe=/\\.(mp3|m4a|aac|wav|flac|ogg)$/i;

  async function replacePlaylist(files){
    try{ media.pause(); }catch{}
    revokeAll();
    playlist=sortNumeric(files.filter(f=>(f.type&&f.type.startsWith('audio/'))||fileRe.test(f.name)));
    urls=playlist.map(f=>URL.createObjectURL(f));
    current=0;
    if(playlist.length){
      media.src=urls[current]; media.load(); lcd(`READY — ${playlist[0].name}`);
      try{ ensureGraph(); await media.play(); lcd(`PLAYING — ${playlist[current].name}`); } catch(e){ lcd(`READY — ${playlist[current].name} (tap to start)`); }
    }else{ media.src=''; lcd('NO FILES LOADED'); }
    updateMediaSession();
  }

  async function play(i=current){
    if(!playlist.length) return;
    current=Math.max(0,Math.min(i,playlist.length-1));
    if(media.src!==urls[current]) media.src=urls[current];
    try{ ensureGraph(); await media.play(); lcd(`PLAYING — ${playlist[current].name}`); }catch{}
    updateMediaSession();
  }
  function pause(){ try{ media.pause(); }catch{} lcd(playlist.length?`PAUSED — ${playlist[current].name}`:'PAUSED'); }
  media.addEventListener('ended', ()=> play((current+1)%playlist.length));

  const pick=$('#pick'), file=$('#file');
  pick.addEventListener('click', e=>{ e.preventDefault(); file.click(); });
  pick.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); file.click(); } });
  file.addEventListener('change', async e=>{ await replacePlaylist([...(e.target.files||[])]); try{ e.target.value=''; }catch{} });

  $('#play').addEventListener('click', ()=> play(current));
  $('#pause').addEventListener('click', ()=> pause());
  $('#prev').addEventListener('click', ()=> play((current-1+playlist.length)%playlist.length));
  $('#next').addEventListener('click', ()=> play((current+1)%playlist.length));

  // iOS/Android のオーディオ解放
  function resumeAudioOnce(){
    try{
      if(!audioCtx) ensureGraph();
      if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      if(media.src) media.play().catch(()=>{});
    }catch(e){}
    document.removeEventListener('touchend', resumeAudioOnce);
    document.removeEventListener('click', resumeAudioOnce);
  }
  document.addEventListener('touchend', resumeAudioOnce, { once:true });
  document.addEventListener('click', resumeAudioOnce, { once:true });

  function updateMediaSession(){
    if(!('mediaSession' in navigator)) return;
    const name=playlist[current]?.name||'—';
    navigator.mediaSession.metadata=new MediaMetadata({title:name, artist:'GSV', album:'Imperfect Mobile'});
    navigator.mediaSession.setActionHandler('previoustrack',()=>play((current-1+playlist.length)%playlist.length));
    navigator.mediaSession.setActionHandler('nexttrack',()=>play((current+1)%playlist.length));
    navigator.mediaSession.setActionHandler('play',()=>play(current));
    navigator.mediaSession.setActionHandler('pause',()=>pause());
  }
})();