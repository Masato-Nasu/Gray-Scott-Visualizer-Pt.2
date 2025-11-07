const $=(q)=>document.querySelector(q);
const canvas=document.getElementById('glcanvas');
let gl, progSim, progVis, vao;
let INT_FMT, PIX_FMT, PIX_TYPE;
let texA, texB, texRadius, fbA, fbB, width, height;
let paused=false, showRadius=false;

const params={du:0.16,dv:0.08,feed:0.035,kill:0.06,dt:1.0, alphaDP:0.75,lambdaR:1.0,betaHS:0.65,t0HS:0.35,t1HS:0.85,noiseAmt:0.002};

function log(msg){ console.log('[IMP]', msg); }

function probeRenderableFormat(){
  // Try candidates in order. Create a tiny test FBO for each and return first that completes.
  const candidates=[
    {ifmt:gl.RGBA32F, type:gl.FLOAT, label:'RGBA32F/FLOAT'},
    {ifmt:gl.RGBA16F, type:gl.HALF_FLOAT, label:'RGBA16F/HALF_FLOAT'},
    {ifmt:gl.RGBA8,   type:gl.UNSIGNED_BYTE, label:'RGBA8/UNSIGNED_BYTE'}
  ];
  for(const c of candidates){
    try{
      const tex=gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, c.ifmt, 8, 8, 0, gl.RGBA, c.type, null);
      const fb=gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      const status=gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
      if(status===gl.FRAMEBUFFER_COMPLETE){ log('FBO ok: '+c.label); return c; }
      else { log('FBO NG: '+c.label+' status='+status.toString(16)); }
    }catch(e){ log('Probe error '+c.label+': '+e.message); }
  }
  throw new Error('No renderable color format found');
}

function createGL(){
  gl=canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true});
  if(!gl){ alert('WebGL2 非対応'); throw new Error('no webgl2'); }
  PIX_FMT=gl.RGBA;
  const cand=probeRenderableFormat();
  INT_FMT=cand.ifmt; PIX_TYPE=cand.type;
}

async function loadText(url){ const r=await fetch(url); return await r.text(); }
function compile(type,src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){ throw new Error(gl.getShaderInfoLog(s)); } return s; }

async function createPrograms(){
  const vs=compile(gl.VERTEX_SHADER, await loadText('shaders/pass.vert'));
  const fsS=compile(gl.FRAGMENT_SHADER, await loadText('shaders/sim.frag'));
  const fsV=compile(gl.FRAGMENT_SHADER, await loadText('shaders/vis.frag'));
  progSim=gl.createProgram(); gl.attachShader(progSim,vs); gl.attachShader(progSim,fsS); gl.bindAttribLocation(progSim,0,'aPos'); gl.linkProgram(progSim);
  if(!gl.getProgramParameter(progSim,gl.Link_STATUS) && !gl.getProgramParameter(progSim,gl.LINK_STATUS)) throw new Error('link sim '+gl.getProgramInfoLog(progSim));
  progVis=gl.createProgram(); gl.attachShader(progVis,vs); gl.attachShader(progVis,fsV); gl.bindAttribLocation(progVis,0,'aPos'); gl.linkProgram(progVis);
  if(!gl.getProgramParameter(progVis,gl.LINK_STATUS)) throw new Error('link vis '+gl.getProgramInfoLog(progVis));
}

function createFullscreenQuad(){
  vao=gl.createVertexArray(); gl.bindVertexArray(vao);
  const vbo=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,vbo);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.bindVertexArray(null);
}

function createTexture(w,h,data=null){
  const tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, INT_FMT, w, h, 0, PIX_FMT, PIX_TYPE, data);
  gl.bindTexture(gl.TEXTURE_2D,null);
  return tex;
}

function createFBO(tex){
  const fb=gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  const status=gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if(status!==gl.FRAMEBUFFER_COMPLETE){
    // As a last resort, switch to RGBA8 and rebuild once
    if(INT_FMT!==gl.RGBA8){
      console.warn('FBO incomplete -> retrying with RGBA8');
      INT_FMT=gl.RGBA8; PIX_TYPE=gl.UNSIGNED_BYTE;
      return null; // caller will rebuild tex/fbo
    }
    throw new Error('FBO incomplete');
  }
  return fb;
}

function rebuildWithRGBA8IfNeeded(w,h){
  if(INT_FMT===gl.RGBA8) return false;
  const tA=createTexture(w,h,null);
  const fb=createFBO(tA);
  if(fb===null){ // switched to RGBA8; need full rebuild
    return true;
  }else{
    gl.deleteFramebuffer(fb); gl.deleteTexture(tA);
    return false;
  }
}

function resize(){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const W=canvas.clientWidth||canvas.parentElement.clientWidth;
  const H=canvas.clientHeight||canvas.parentElement.clientHeight;
  const w=Math.max(256, Math.floor(W*dpr));
  const h=Math.max(256, Math.floor(H*dpr));
  if(w===width && h===height) return;
  width=w; height=h; canvas.width=w; canvas.height=h;

  // Probe once more: if current INT_FMT fails, automatically fall back to RGBA8 and rebuild.
  if(rebuildWithRGBA8IfNeeded(w,h)){
    // rebuild after switching to RGBA8
    log('Rebuild textures with RGBA8');
  }

  const size=w*h*4; const init=new Float32Array(size);
  for(let i=0;i<size;i+=4){ init[i]=1.0; init[i+1]=0.0; init[i+2]=0.0; init[i+3]=1.0; }
  texA=createTexture(w,h,init);
  texB=createTexture(w,h,null);
  fbA=createFBO(texA); if(! fbA){ // if returned null, switch happened
    texA=createTexture(w,h,init); fbA=createFBO(texA);
  }
  fbB=createFBO(texB); if(! fbB){ texB=createTexture(w,h,null); fbB=createFBO(texB); }

  texRadius=makeRadiusTex(w,h,0.5,0.18);
  seedCenter();
}

function makeRadiusTex(w,h,mean=0.5,std=0.18){
  const data=new Float32Array(w*h*4);
  const r=new Float32Array(w*h);
  for(let i=0;i<w*h;i++){
    const u1=Math.random(), u2=Math.random();
    const g=Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
    let v=mean+std*g; v=Math.min(1,Math.max(0,v)); r[i]=v;
  }
  const out=new Float32Array(w*h);
  for(let y=0;y<h;y++){ for(let x=0;x<w;x++){
    let s=0,c=0; for(let j=-1;j<=1;j++){ for(let i=-1;i<=1;i++){
      const xx=(x+i+w)%w, yy=(y+j+h)%h; s+=r[yy*w+xx]; c++;
    }} out[y*w+x]=s/c;
  }}
  for(let i=0;i<w*h;i++){ const v=out[i]; data[i*4]=v; data[i*4+1]=v; data[i*4+2]=v; data[i*4+3]=1; }
  return createTexture(w,h,data);
}

function seedCenter(){
  const s=32; const size=width*height*4; const init=new Float32Array(size);
  for(let i=0;i<size;i+=4){ init[i]=1.0; init[i+1]=0.0; init[i+2]=0.0; init[i+3]=1.0; }
  for(let y=-s;y<=s;y++){ for(let x=-s;x<=s;x++){
    const cx=(width>>1)+x, cy=(height>>1)+y; if(cx<0||cy<0||cx>=width||cy>=height) continue;
    const idx=(cy*width+cx)*4; init[idx]=0.50; init[idx+1]=0.25;
  }}
  gl.bindTexture(gl.TEXTURE_2D, texA);
  gl.texImage2D(gl.TEXTURE_2D, 0, INT_FMT, width, height, 0, PIX_FMT, PIX_TYPE, init);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function resetAll(){
  const size=width*height*4; const init=new Float32Array(size);
  for(let i=0;i<size;i+=4){ init[i]=1.0; init[i+1]=0.0; init[i+2]=0.0; init[i+3]=1.0; }
  gl.bindTexture(gl.TEXTURE_2D, texA);
  gl.texImage2D(gl.TEXTURE_2D, 0, INT_FMT, width, height, 0, PIX_FMT, PIX_TYPE, init);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

async function loadShaderProgram(){
  await createPrograms();
  // draw buffers default is COLOR_ATTACHMENT0, but set once to be safe
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
}

function simStep(srcTex,dstFb){
  gl.useProgram(progSim);
  gl.bindVertexArray(vao);
  gl.uniform2f(gl.getUniformLocation(progSim,'px'),1.0/width,1.0/height);
  gl.uniform1f(gl.getUniformLocation(progSim,'du'),params.du);
  gl.uniform1f(gl.getUniformLocation(progSim,'dv'),params.dv);
  gl.uniform1f(gl.getUniformLocation(progSim,'feed'),params.feed);
  gl.uniform1f(gl.getUniformLocation(progSim,'kill'),params.kill);
  gl.uniform1f(gl.getUniformLocation(progSim,'dt'),params.dt);
  gl.uniform1f(gl.getUniformLocation(progSim,'alphaDP'),params.alphaDP);
  gl.uniform1f(gl.getUniformLocation(progSim,'lambdaR'),params.lambdaR);
  gl.uniform1f(gl.getUniformLocation(progSim,'betaHS'),params.betaHS);
  gl.uniform1f(gl.getUniformLocation(progSim,'t0HS'),params.t0HS);
  gl.uniform1f(gl.getUniformLocation(progSim,'t1HS'),params.t1HS);
  gl.uniform1f(gl.getUniformLocation(progSim,'noiseAmt'),params.noiseAmt);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,srcTex);
  gl.uniform1i(gl.getUniformLocation(progSim,'uState'),0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,texRadius);
  gl.uniform1i(gl.getUniformLocation(progSim,'uRadius'),1);
  gl.bindFramebuffer(gl.FRAMEBUFFER,dstFb);
  gl.viewport(0,0,width,height);
  gl.drawArrays(gl.TRIANGLES,0,6);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.bindVertexArray(null);
}

function drawVis(srcTex){
  gl.useProgram(progVis);
  gl.bindVertexArray(vao);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,srcTex);
  gl.uniform1i(gl.getUniformLocation(progVis,'uState'),0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,texRadius);
  gl.uniform1i(gl.getUniformLocation(progVis,'uRadius'),1);
  gl.uniform1i(gl.getUniformLocation(progVis,'showRadius'),showRadius?1:0);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.drawArrays(gl.TRIANGLES,0,6);
  gl.bindVertexArray(null);
}

function loop(){
  if(!paused){
    for(let i=0;i<2;i++){ simStep(texA,fbB); let t=texA; texA=texB; texB=t; let f=fbA; fbA=fbB; fbB=f; }
  }
  drawVis(texA);
  requestAnimationFrame(loop);
}

function bindUI(){
  ['feed','kill','du','dv','dt','alphaDP','lambdaR','betaHS','t0HS','t1HS','noiseAmt'].forEach(id=>{
    $('#'+id).addEventListener('input',e=>{ params[id]=parseFloat(e.target.value); 
      if(id==='dt' && params.dt>1.2){ /*安全サイド*/ params.dt=1.2; $('#dt').value=1.2; }
      updateLabels(); });
  });
  $('#btnReset').addEventListener('click',resetAll);
  $('#btnSeed').addEventListener('click',seedCenter);
  $('#btnRegenR').addEventListener('click',()=>{ gl.deleteTexture(texRadius); texRadius=makeRadiusTex(width,height,0.5,0.18); });
  $('#btnShowR').addEventListener('click',()=>{ showRadius=!showRadius; });
  $('#presetLeopard').addEventListener('click',()=>Object.assign(params,{feed:0.035,kill:0.060,alphaDP:0.40,lambdaR:0.80,betaHS:0.55,t0HS:0.30,t1HS:0.80})&&updateLabels()&&syncUI());
  $('#presetPuffer').addEventListener('click',()=>Object.assign(params,{feed:0.025,kill:0.055,alphaDP:1.20,lambdaR:1.10,betaHS:0.35,t0HS:0.25,t1HS:0.70})&&updateLabels()&&syncUI());
  $('#presetZebra').addEventListener('click',()=>Object.assign(params,{feed:0.037,kill:0.064,alphaDP:0.50,lambdaR:0.70,betaHS:0.45,t0HS:0.28,t1HS:0.80})&&updateLabels()&&syncUI());
  $('#presetMosaic').addEventListener('click',()=>Object.assign(params,{feed:0.020,kill:0.050,alphaDP:1.40,lambdaR:1.30,betaHS:0.70,t0HS:0.35,t1HS:0.95})&&updateLabels()&&syncUI());
  $('#btnPause').addEventListener('click',()=>paused=true);
  $('#btnResume').addEventListener('click',()=>paused=false);
  $('#btnScreenshot').addEventListener('click',()=>{ const a=document.createElement('a'); a.download='imperfect_turing.png'; a.href=canvas.toDataURL('image/png'); a.click(); });
  $('#btnClearSW').addEventListener('click', async ()=>{
    if('serviceWorker' in navigator){ const regs=await navigator.serviceWorker.getRegistrations(); for(const r of regs){ await r.unregister(); } }
    if('caches' in window){ const keys=await caches.keys(); for(const k of keys){ await caches.delete(k); } }
    alert('SWとキャッシュを削除しました。再読み込みしてください。');
  });
}

function updateLabels(){
  $('#labF').textContent=params.feed.toFixed(4);
  $('#labK').textContent=params.kill.toFixed(4);
  $('#labDU').textContent=params.du.toFixed(2);
  $('#labDV').textContent=params.dv.toFixed(2);
  $('#labDT').textContent=params.dt.toFixed(2);
  $('#labAlpha').textContent=params.alphaDP.toFixed(2);
  $('#labLambda').textContent=params.lambdaR.toFixed(2);
  $('#labBeta').textContent=params.betaHS.toFixed(2);
  $('#labT0').textContent=params.t0HS.toFixed(2);
  $('#labT1').textContent=params.t1HS.toFixed(2);
  $('#labNoise').textContent=params.noiseAmt.toFixed(4);
}

async function start(){
  gl=canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true});
  if(!gl){ alert('WebGL2 非対応'); return; }
  PIX_FMT=gl.RGBA;
  // Active probe for a guaranteed renderable format
  const cands=[{ifmt:gl.RGBA32F,type:gl.FLOAT},{ifmt:gl.RGBA16F,type:gl.HALF_FLOAT},{ifmt:gl.RGBA8,type:gl.UNSIGNED_BYTE}];
  let ok=false;
  for(const c of cands){
    try{
      INT_FMT=c.ifmt; PIX_TYPE=c.type;
      const tex=createTexture(8,8,null);
      const fb=createFBO(tex);
      if(fb){ gl.deleteFramebuffer(fb); gl.deleteTexture(tex); ok=true; break; }
    }catch(e){}
  }
  if(!ok){ INT_FMT=gl.RGBA8; PIX_TYPE=gl.UNSIGNED_BYTE; }

  // build shaders
  await loadShaderProgram();
  // vao
  const vao_ = gl.createVertexArray(); gl.bindVertexArray(vao_);
  const vbo=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.bindVertexArray(null);
  vao=vao_;

  const ro=new ResizeObserver(()=>resize()); ro.observe($('#canvasWrap'));
  resize(); syncUI(); bindUI(); requestAnimationFrame(loop);
}

if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js')); }
start();