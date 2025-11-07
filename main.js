// WebGL2 Imperfect Turing Patterns
const $ = (q) => document.querySelector(q);

const canvas = document.getElementById('glcanvas');
let gl, progSim, progVis;
let vao;
let texA, texB, texRadius;
let fbA, fbB;
let width, height;
let paused = false;
let showRadius = false;

const params = {
  du: 0.16,
  dv: 0.08,
  feed: 0.035,
  kill: 0.06,
  dt: 1.0,

  alphaDP: 0.75,
  lambdaR: 1.0,
  betaHS: 0.65,
  t0HS: 0.35,
  t1HS: 0.85,
  noiseAmt: 0.002,
};

function updateLabels(){
  $('#labF').textContent = params.feed.toFixed(4);
  $('#labK').textContent = params.kill.toFixed(4);
  $('#labDU').textContent = params.du.toFixed(2);
  $('#labDV').textContent = params.dv.toFixed(2);
  $('#labDT').textContent = params.dt.toFixed(2);
  $('#labAlpha').textContent = params.alphaDP.toFixed(2);
  $('#labLambda').textContent = params.lambdaR.toFixed(2);
  $('#labBeta').textContent = params.betaHS.toFixed(2);
  $('#labT0').textContent = params.t0HS.toFixed(2);
  $('#labT1').textContent = params.t1HS.toFixed(2);
  $('#labNoise').textContent = params.noiseAmt.toFixed(4);
}

function syncUI(){
  $('#feed').value = params.feed;
  $('#kill').value = params.kill;
  $('#du').value = params.du;
  $('#dv').value = params.dv;
  $('#dt').value = params.dt;
  $('#alphaDP').value = params.alphaDP;
  $('#lambdaR').value = params.lambdaR;
  $('#betaHS').value = params.betaHS;
  $('#t0HS').value = params.t0HS;
  $('#t1HS').value = params.t1HS;
  $('#noiseAmt').value = params.noiseAmt;
  updateLabels();
}

function setPresetLeopard(){
  Object.assign(params, {feed:0.035, kill:0.060, alphaDP:0.40, lambdaR:0.80, betaHS:0.55, t0HS:0.30, t1HS:0.80});
  syncUI();
}
function setPresetPuffer(){
  Object.assign(params, {feed:0.025, kill:0.055, alphaDP:1.20, lambdaR:1.10, betaHS:0.35, t0HS:0.25, t1HS:0.70});
  syncUI();
}
function setPresetZebra(){
  Object.assign(params, {feed:0.037, kill:0.064, alphaDP:0.50, lambdaR:0.70, betaHS:0.45, t0HS:0.28, t1HS:0.80});
  syncUI();
}
function setPresetMosaic(){
  Object.assign(params, {feed:0.020, kill:0.050, alphaDP:1.40, lambdaR:1.30, betaHS:0.70, t0HS:0.35, t1HS:0.95});
  syncUI();
}

function createGL(){
  gl = canvas.getContext('webgl2', {antialias:false, preserveDrawingBuffer:true});
  if(!gl){ alert('WebGL2 非対応のブラウザです'); throw new Error('no webgl2'); }
}

async function loadText(url){
  const r = await fetch(url);
  return await r.text();
}

function compile(type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
    console.error(gl.getShaderInfoLog(s));
    throw new Error('shader compile error');
  }
  return s;
}

async function createPrograms(){
  const vsSrc = await loadText('shaders/pass.vert');
  const simSrc = await loadText('shaders/sim.frag');
  const visSrc = await loadText('shaders/vis.frag');

  const vs = compile(gl.VERTEX_SHADER, vsSrc);
  const fsSim = compile(gl.FRAGMENT_SHADER, simSrc);
  const fsVis = compile(gl.FRAGMENT_SHADER, visSrc);

  progSim = gl.createProgram();
  gl.attachShader(progSim, vs);
  gl.attachShader(progSim, fsSim);
  gl.bindAttribLocation(progSim, 0, 'aPos');
  gl.linkProgram(progSim);
  if(!gl.getProgramParameter(progSim, gl.LINK_STATUS)){
    console.error(gl.getProgramInfoLog(progSim)); throw new Error('link sim');
  }

  progVis = gl.createProgram();
  gl.attachShader(progVis, vs);
  gl.attachShader(progVis, fsVis);
  gl.bindAttribLocation(progVis, 0, 'aPos');
  gl.linkProgram(progVis);
  if(!gl.getProgramParameter(progVis, gl.LINK_STATUS)){
    console.error(gl.getProgramInfoLog(progVis)); throw new Error('link vis');
  }
}

function createFullscreenQuad(){
  vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const verts = new Float32Array([
    -1,-1,  1,-1,  -1,1,
    -1, 1,  1,-1,   1,1,
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
}

function createTexture(w,h, data=null){
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

function createFBO(tex){
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if(!ok) throw new Error('FBO incomplete');
  return fb;
}

function resize(){
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth || canvas.parentElement.clientWidth;
  const H = canvas.clientHeight || canvas.parentElement.clientHeight;
  const w = Math.max(256, Math.floor(W * dpr));
  const h = Math.max(256, Math.floor(H * dpr));
  if(w===width && h===height) return;
  width = w; height = h;
  canvas.width = w; canvas.height = h;

  // allocate state textures
  const size = w*h*4;
  const init = new Float32Array(size);
  for(let i=0;i<size;i+=4){ init[i]=1.0; init[i+1]=0.0; init[i+2]=0.0; init[i+3]=1.0; }
  texA = createTexture(w,h, init);
  texB = createTexture(w,h, null);
  fbA = createFBO(texA);
  fbB = createFBO(texB);

  texRadius = makeRadiusTex(w,h, 0.5, 0.18);

  seedCenter();
}

function makeRadiusTex(w,h, mean=0.5, std=0.18){
  const data = new Float32Array(w*h*4);
  // Box–Muller + mild blur pass (single box blur)
  const rarr = new Float32Array(w*h);
  for(let i=0;i<w*h;i++){
    const u1 = Math.random(); const u2 = Math.random();
    const g = Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
    let r = mean + std*g;
    r = Math.min(1, Math.max(0, r));
    rarr[i] = r;
  }
  // simple 3x3 blur
  const out = new Float32Array(w*h);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      let s=0, c=0;
      for(let j=-1;j<=1;j++){
        for(let i=-1;i<=1;i++){
          const xx=(x+i+w)%w, yy=(y+j+h)%h;
          s += rarr[yy*w+xx]; c++;
        }
      }
      out[y*w+x]=s/c;
    }
  }
  for(let i=0;i<w*h;i++){
    const r = out[i];
    data[i*4+0]=r; data[i*4+1]=r; data[i*4+2]=r; data[i*4+3]=1;
  }
  const tex = createTexture(w,h, data);
  return tex;
}

function seedCenter(){
  // put a small V droplet in center
  const s = 32;
  const tmp = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbA);
  gl.viewport(0,0,width,height);

  // Draw a pass that injects V in center by reading back, but simpler approach:
  // We'll run a small JS-level update by rendering a quad with a shader that paints V in a rect.
  // For brevity here, we just run a few simulation steps with temporarily increased feed near center by CPU?
  // Simpler: call reset then a few steps; then in sim we don't have a hook. So alternative: copy current texture to CPU -> paint -> upload.
  // We'll just re-upload initial with center seed.
  const size = width*height*4;
  const init = new Float32Array(size);
  for(let i=0;i<size;i+=4){ init[i]=1.0; init[i+1]=0.0; init[i+2]=0.0; init[i+3]=1.0; }
  for(let y=-s;y<=s;y++){
    for(let x=-s;x<=s;x++){
      const cx = Math.floor(width/2)+x;
      const cy = Math.floor(height/2)+y;
      if(cx<0||cy<0||cx>=width||cy>=height) continue;
      const idx = (cy*width+cx)*4;
      init[idx+0]=0.50; // U
      init[idx+1]=0.25; // V
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, texA);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, init);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function resetAll(){
  const size = width*height*4;
  const init = new Float32Array(size);
  for(let i=0;i<size;i+=4){ init[i]=1.0; init[i+1]=0.0; init[i+2]=0.0; init[i+3]=1.0; }
  gl.bindTexture(gl.TEXTURE_2D, texA);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, init);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function simStep(srcTex, dstFb){
  gl.useProgram(progSim);
  gl.bindVertexArray(vao);

  gl.uniform2f(gl.getUniformLocation(progSim, 'px'), 1.0/width, 1.0/height);
  gl.uniform1f(gl.getUniformLocation(progSim, 'du'), params.du);
  gl.uniform1f(gl.getUniformLocation(progSim, 'dv'), params.dv);
  gl.uniform1f(gl.getUniformLocation(progSim, 'feed'), params.feed);
  gl.uniform1f(gl.getUniformLocation(progSim, 'kill'), params.kill);
  gl.uniform1f(gl.getUniformLocation(progSim, 'dt'), params.dt);

  gl.uniform1f(gl.getUniformLocation(progSim, 'alphaDP'), params.alphaDP);
  gl.uniform1f(gl.getUniformLocation(progSim, 'lambdaR'), params.lambdaR);
  gl.uniform1f(gl.getUniformLocation(progSim, 'betaHS'), params.betaHS);
  gl.uniform1f(gl.getUniformLocation(progSim, 't0HS'), params.t0HS);
  gl.uniform1f(gl.getUniformLocation(progSim, 't1HS'), params.t1HS);
  gl.uniform1f(gl.getUniformLocation(progSim, 'noiseAmt'), params.noiseAmt);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.uniform1i(gl.getUniformLocation(progSim, 'uState'), 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texRadius);
  gl.uniform1i(gl.getUniformLocation(progSim, 'uRadius'), 1);

  gl.bindFramebuffer(gl.FRAMEBUFFER, dstFb);
  gl.viewport(0,0,width,height);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindVertexArray(null);
}

function drawVis(srcTex){
  gl.useProgram(progVis);
  gl.bindVertexArray(vao);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.uniform1i(gl.getUniformLocation(progVis, 'uState'), 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texRadius);
  gl.uniform1i(gl.getUniformLocation(progVis, 'uRadius'), 1);

  gl.uniform1i(gl.getUniformLocation(progVis, 'showRadius'), showRadius?1:0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0,0,canvas.width, canvas.height);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.bindVertexArray(null);
}

function loop(){
  if(!paused){
    // a few steps per frame for speed
    for(let i=0;i<2;i++){
      simStep(texA, fbB);
      // swap
      let t = texA; texA = texB; texB = t;
      let f = fbA; fbA = fbB; fbB = f;
    }
  }
  drawVis(texA);
  requestAnimationFrame(loop);
}

function bindUI(){
  const fields = ['feed','kill','du','dv','dt','alphaDP','lambdaR','betaHS','t0HS','t1HS','noiseAmt'];
  fields.forEach(id=>{
    $(`#${id}`).addEventListener('input', (e)=>{
      const v = parseFloat(e.target.value);
      params[id] = v;
      updateLabels();
    });
  });
  $('#btnReset').addEventListener('click', resetAll);
  $('#btnSeed').addEventListener('click', seedCenter);
  $('#btnRegenR').addEventListener('click', ()=>{
    gl.deleteTexture(texRadius);
    texRadius = makeRadiusTex(width, height, 0.5, 0.18);
  });
  $('#btnShowR').addEventListener('click', ()=>{ showRadius = !showRadius; });
  $('#presetLeopard').addEventListener('click', setPresetLeopard);
  $('#presetPuffer').addEventListener('click', setPresetPuffer);
  $('#presetZebra').addEventListener('click', setPresetZebra);
  $('#presetMosaic').addEventListener('click', setPresetMosaic);
  $('#btnPause').addEventListener('click', ()=> paused = true);
  $('#btnResume').addEventListener('click', ()=> paused = false);
  $('#btnScreenshot').addEventListener('click', ()=>{
    const a = document.createElement('a');
    a.download = 'imperfect_turing.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  });

  $('#btnClearSW').addEventListener('click', async ()=>{
    if('serviceWorker' in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      for(const r of regs){ await r.unregister(); }
    }
    if('caches' in window){
      const keys = await caches.keys();
      for(const k of keys){ await caches.delete(k); }
    }
    alert('ServiceWorkerとキャッシュを削除しました。再読み込みで更新が反映されます。');
  });
}

async function start(){
  createGL();
  await createPrograms();
  createFullscreenQuad();

  const ro = new ResizeObserver(()=>resize());
  ro.observe($('#canvasWrap'));

  resize();
  syncUI();
  bindUI();
  requestAnimationFrame(loop);
}

// PWA
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js');
  });
}

start();
