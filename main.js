// WebGL2 Reaction–Diffusion with robust fallbacks.
// If query ?safe=1 or checkbox 'safe' enabled, we bypass FBO sim and render a trivial shader.

const $ = (sel)=>document.querySelector(sel);
const statusEl = $('#status');
const canvas = $('#c');
const ui = {
  feed: $('#feed'),
  kill: $('#kill'),
  dt: $('#dt'),
  safe: $('#safe'),
  reset: $('#reset'),
};

const url = new URL(location.href);
if (url.searchParams.get('safe') === '1') ui.safe.checked = true;

let gl;
let extColorFloat = null;
let useHalfFloat = false;
let stateA = null, stateB = null, fbA = null, fbB = null;
let w = 0, h = 0, texel = [0,0];

function log(...args){
  console.log(...args);
  statusEl.textContent = args.join(' ');
}

function requireWebGL2(){
  const attribs = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false };
  const ctx = canvas.getContext('webgl2', attribs);
  if (!ctx) throw new Error('WebGL2 not supported');
  return ctx;
}

function createShader(gl, type, src){
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)){
    const info = gl.getShaderInfoLog(sh);
    console.error(info, '\n----\n', src);
    throw new Error('Shader compile failed');
  }
  return sh;
}

function createProg(gl, vsSrc, fsSrc){
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const pr = gl.createProgram();
  gl.attachShader(pr, vs);
  gl.attachShader(pr, fs);
  gl.bindAttribLocation(pr, 0, 'aPos'); // location=0 in vert
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)){
    const info = gl.getProgramInfoLog(pr);
    throw new Error('Program link failed: ' + info);
  }
  return pr;
}

// Fullscreen quad
const quad = (()=>{
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const verts = new Float32Array([ -1,-1,  1,-1,  -1,1,   -1,1,  1,-1,  1,1 ]);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, vbo, vertexCount: 6 };
})();

let progSim, progDraw;
let loc = {};

async function loadText(path){
  const r = await fetch(path);
  if (!r.ok) throw new Error('Failed to fetch ' + path);
  return await r.text();
}

async function buildPrograms(){
  const vs = await loadText('glsl/vert.glsl');
  const fsSim = await loadText('glsl/sim.frag');
  const fsDraw = await loadText('glsl/render.frag');
  progSim = createProg(gl, vs, fsSim);
  progDraw = createProg(gl, vs, fsDraw);

  // cache uniforms
  gl.useProgram(progSim);
  loc.sim = {
    uState: gl.getUniformLocation(progSim, 'uState'),
    uTexel: gl.getUniformLocation(progSim, 'uTexel'),
    uF: gl.getUniformLocation(progSim, 'uF'),
    uK: gl.getUniformLocation(progSim, 'uK'),
    uDt: gl.getUniformLocation(progSim, 'uDt'),
  };
  gl.useProgram(progDraw);
  loc.draw = { uState: gl.getUniformLocation(progDraw, 'uState') };
  gl.useProgram(null);
}

function createTexture(width, height, internal, format, type, filter){
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // allocate with null data to avoid type mismatch (no ArrayBufferView)
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, type, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return t;
}

function createFBO(texture){
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  // Only single attachment; drawBuffers not required. But safe to set in WebGL2:
  if (gl.drawBuffers) gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE){
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    throw new Error('FBO incomplete: 0x' + status.toString(16));
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fb;
}

function pickRenderFormat(){
  // Prefer RGBA16F + HALF_FLOAT if EXT_color_buffer_float present; else RGBA8 + UNSIGNED_BYTE
  extColorFloat = gl.getExtension('EXT_color_buffer_float');
  const hasLinear = gl.getExtension('OES_texture_float_linear') || gl.getExtension('OES_texture_half_float_linear') || true;
  useHalfFloat = !!extColorFloat; // conservative
  if (useHalfFloat){
    return { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR };
  }
  return { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR };
}

function initStateTex(t){
  // Fill with A=1, B=0 and a small seeded square of B
  const tmp = new Float32Array(w * h * 4);
  for (let i=0;i<w*h;i++){
    tmp[i*4+0] = 1.0; // A
    tmp[i*4+1] = 0.0; // B
    tmp[i*4+2] = 0.0;
    tmp[i*4+3] = 1.0;
  }
  // seed
  const sx = Math.floor(w*0.45), sy = Math.floor(h*0.45);
  const ex = Math.floor(w*0.55), ey = Math.floor(h*0.55);
  for (let y=sy;y<ey;y++){
    for (let x=sx;x<ex;x++){
      const idx = (y*w + x)*4;
      tmp[idx+0] = 0.5;
      tmp[idx+1] = 0.25;
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, t);
  // Convert to correct array type depending on texture type
  const fmt = currentFmt.type === gl.UNSIGNED_BYTE ? new Uint8Array(tmp.map(v=>Math.max(0,Math.min(255, Math.round(v*255))))) : tmp;
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, currentFmt.format, currentFmt.type, fmt);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

let currentFmt = null;

function resize(){
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const cw = Math.floor(canvas.clientWidth * dpr) || canvas.width;
  const ch = Math.floor(canvas.clientHeight * dpr) || canvas.height;
  if (cw === w && ch === h) return;
  w = cw; h = ch;
  canvas.width = w; canvas.height = h;
  texel = [1/w, 1/h];

  if (ui.safe.checked){
    log('Safe mode on. Rendering without FBO.');
    return;
  }

  // Recreate textures/FBOs
  currentFmt = pickRenderFormat();
  log(`Creating render targets: ${w}x${h} type=${currentFmt.type===gl.HALF_FLOAT?'HALF_FLOAT':'U8'}`);

  [stateA, stateB].forEach(t=>{ if (t) gl.deleteTexture(t); });
  [fbA, fbB].forEach(f=>{ if (f) gl.deleteFramebuffer(f); });

  stateA = createTexture(w, h, currentFmt.internal, currentFmt.format, currentFmt.type, currentFmt.filter);
  stateB = createTexture(w, h, currentFmt.internal, currentFmt.format, currentFmt.type, currentFmt.filter);
  initStateTex(stateA);
  initStateTex(stateB);

  fbA = createFBO(stateA);
  fbB = createFBO(stateB);
}

function blit(toFB, prg, uniforms){
  gl.bindFramebuffer(gl.FRAMEBUFFER, toFB);
  gl.useProgram(prg);
  gl.bindVertexArray(quad.vao);
  if (uniforms) uniforms();
  gl.drawArrays(gl.TRIANGLES, 0, quad.vertexCount);
  gl.bindVertexArray(null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

let rafId = 0;
function frame(){
  rafId = requestAnimationFrame(frame);

  if (!ui.safe.checked){
    // simulate a few steps per frame
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    for (let i=0;i<8;i++){
      // stateA -> fbB
      gl.bindTexture(gl.TEXTURE_2D, stateA);
      blit(fbB, progSim, ()=>{
        gl.uniform1i(loc.sim.uState, 0);
        gl.uniform2f(loc.sim.uTexel, texel[0], texel[1]);
        gl.uniform1f(loc.sim.uF, parseFloat(ui.feed.value));
        gl.uniform1f(loc.sim.uK, parseFloat(ui.kill.value));
        gl.uniform1f(loc.sim.uDt, parseFloat(ui.dt.value) * 0.8);
      });
      // swap
      let tmpT = stateA; stateA = stateB; stateB = tmpT;
      let tmpF = fbA; fbA = fbB; fbB = tmpF;
    }
  }

  // draw to screen
  gl.viewport(0, 0, w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(progDraw);
  gl.activeTexture(gl.TEXTURE0);
  if (ui.safe.checked){
    // In safe mode just display seeded pattern texture (stateA)
    gl.bindTexture(gl.TEXTURE_2D, stateA);
  }else{
    gl.bindTexture(gl.TEXTURE_2D, stateA);
  }
  gl.uniform1i(loc.draw.uState, 0);
  gl.bindVertexArray(quad.vao);
  gl.drawArrays(gl.TRIANGLES, 0, quad.vertexCount);
  gl.bindVertexArray(null);
}

function resetState(){
  if (!stateA || !stateB){
    resize();
  }
  initStateTex(stateA);
  initStateTex(stateB);
  log('State reset.');
}

async function start(){
  try {
    gl = requireWebGL2();
  } catch (e){
    statusEl.textContent = 'WebGL2 が使えません。Safe mode を有効化してください。';
    console.error(e);
    return;
  }

  await buildPrograms();

  window.addEventListener('resize', ()=>{
    try{ resize(); }catch(e){ console.error(e); }
  });

  ui.reset.addEventListener('click', resetState);
  ui.safe.addEventListener('change', ()=>{
    resize();
  });

  resize();
  resetState();
  frame();
}

start().catch(err=>{
  console.error(err);
  statusEl.textContent = '初期化エラー: ' + err.message;
});
