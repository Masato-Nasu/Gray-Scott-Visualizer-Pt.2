// app.js
import { runCPU } from './cpu.js';

const logEl = document.getElementById('log');
const statusEl = document.getElementById('status');
const canvas = document.getElementById('view');
const ctx2d = canvas.getContext('2d');

const ui = {
  res: document.getElementById('res'),
  speed: document.getElementById('speed'),
  feed: document.getElementById('feed'),
  kill: document.getElementById('kill'),
  du: document.getElementById('du'),
  dv: document.getElementById('dv'),
};

let stopCurrent = null;

function log(msg) {
  console.log(msg);
  logEl.textContent += msg + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(s) {
  statusEl.textContent = s;
}

function getParams() {
  return {
    N: parseInt(ui.res.value, 10),
    stepsPerFrame: parseInt(ui.speed.value, 10),
    F: parseFloat(ui.feed.value),
    k: parseFloat(ui.kill.value),
    Du: parseFloat(ui.du.value),
    Dv: parseFloat(ui.dv.value),
  };
}

// ===== GPU (WebGL2) Implementation =====
function createGL(N, mode="auto") {
  const gl = canvas.getContext('webgl2', {premultipliedAlpha:false, preserveDrawingBuffer:true});
  if (!gl) throw new Error("WebGL2未対応");
  canvas.width = N; canvas.height = N;

  // Utility
  const VERT = `#version 300 es
  precision mediump float;
  out vec2 v_uv;
  void main(){
    vec2 p = vec2( (gl_VertexID<<1) & 2, gl_VertexID & 2 );
    v_uv = p;
    gl_Position = vec4(p*2.0-1.0,0,1);
  }`;

  // IMPORTANT: avoid reserved words like 'sample'!
  const FRAG_ADVECT = `#version 300 es
  precision highp float;
  precision highp sampler2D;
  out vec2 outUV;
  in vec2 v_uv;
  uniform sampler2D stateTex;
  uniform vec2 px;
  uniform float F;
  uniform float k;
  uniform float Du;
  uniform float Dv;
  vec2 rd(vec2 uv){
    vec2 c = texture(stateTex, uv).rg;
    vec2 up = texture(stateTex, uv + vec2(0.0, px.y)).rg;
    vec2 dn = texture(stateTex, uv - vec2(0.0, px.y)).rg;
    vec2 lf = texture(stateTex, uv - vec2(px.x, 0.0)).rg;
    vec2 rt = texture(stateTex, uv + vec2(px.x, 0.0)).rg;
    vec2 lap = (up + dn + lf + rt - 4.0*c);
    float U = c.r;
    float V = c.g;
    float dU = Du * lap.r - U*V*V + F*(1.0-U);
    float dV = Dv * lap.g + U*V*V - (F + k)*V;
    return vec2(U + dU, V + dV);
  }
  void main(){
    outUV = clamp(rd(v_uv), 0.0, 1.0);
  }`;

  const FRAG_VIEW = `#version 300 es
  precision highp float;
  precision highp sampler2D;
  out vec4 outColor;
  in vec2 v_uv;
  uniform sampler2D stateTex;
  void main(){
    vec2 uv = texture(stateTex, v_uv).rg;
    float v = uv.g;
    outColor = vec4(vec3(v), 1.0);
  }`;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(sh);
      throw new Error("Shader compile error: " + info);
    }
    return sh;
  }
  function program(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("Program link error: " + gl.getProgramInfoLog(p));
    }
    return p;
  }

  const progAdv = program(VERT, FRAG_ADVECT);
  const progView = program(VERT, FRAG_VIEW);
  const u_adv = {
    stateTex: gl.getUniformLocation(progAdv, "stateTex"),
    px: gl.getUniformLocation(progAdv, "px"),
    F: gl.getUniformLocation(progAdv, "F"),
    k: gl.getUniformLocation(progAdv, "k"),
    Du: gl.getUniformLocation(progAdv, "Du"),
    Dv: gl.getUniformLocation(progAdv, "Dv"),
  };
  const u_view = {
    stateTex: gl.getUniformLocation(progView, "stateTex"),
  };

  // Texture format: try RG16F for quality, fallback to RG8
  let internalFormat = gl.RG16F, format = gl.RG, type = gl.HALF_FLOAT;
  if (mode === "safe") { internalFormat = gl.RG8; format = gl.RG; type = gl.UNSIGNED_BYTE; }
  // Some devices need this extension for rendering to float
  if (internalFormat === gl.RG16F) {
    const ok = gl.getExtension('EXT_color_buffer_float');
    if (!ok) { internalFormat = gl.RG8; type = gl.UNSIGNED_BYTE; }
  }

  function makeTex() {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, N, N, 0, format, type, null);
    return tex;
  }
  function makeFB(tex) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (!ok) throw new Error("FBO incomplete");
    return fb;
  }

  const texA = makeTex(), texB = makeTex();
  const fbA = makeFB(texA), fbB = makeFB(texB);

  // Seed initial state on CPU then upload
  const init = new Float32Array(N*N*2);
  for (let i=0;i<N*N;i++){ init[i*2] = 1.0; init[i*2+1] = 0.0; }
  function seedCircle(cx, cy, r) {
    for (let y=-r; y<=r; y++){
      for (let x=-r; x<=r; x++){
        if (x*x+y*y<=r*r){
          const ix = (cy+y)*N + (cx+x);
          init[ix*2] = 0.5 + Math.random()*0.1;
          init[ix*2+1] = 0.25 + Math.random()*0.1;
        }
      }
    }
  }
  seedCircle(N>>1, N>>1, Math.max(6, N>>5));
  gl.bindTexture(gl.TEXTURE_2D, texA);
  // For RG8 we must convert float to 8bit
  if (type === gl.UNSIGNED_BYTE) {
    const u8 = new Uint8Array(N*N*2);
    for (let i=0;i<init.length;i++){ u8[i] = Math.max(0, Math.min(255, Math.round(init[i]*255))); }
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,N,N,format,type,u8);
  } else {
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,N,N,format,type,init);
  }
  gl.bindTexture(gl.TEXTURE_2D, texB);
  if (type === gl.UNSIGNED_BYTE) {
    const u8 = new Uint8Array(N*N*2);
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,N,N,format,type,u8);
  } else {
    const zeros = new Float32Array(N*N*2);
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,N,N,format,type,zeros);
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  function step(F,k,Du,Dv, srcTex, dstFB) {
    gl.useProgram(progAdv);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFB);
    gl.viewport(0,0,N,N);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(u_adv.stateTex, 0);
    gl.uniform2f(u_adv.px, 1.0/N, 1.0/N);
    gl.uniform1f(u_adv.F, F);
    gl.uniform1f(u_adv.k, k);
    gl.uniform1f(u_adv.Du, Du);
    gl.uniform1f(u_adv.Dv, Dv);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function draw(srcTex) {
    gl.useProgram(progView);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0,0,N,N);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(u_view.stateTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  let frontTex = texA, backTex = texB, frontFB = fbA, backFB = fbB;
  function swap(){ [frontTex, backTex] = [backTex, frontTex]; [frontFB, backFB] = [backFB, frontFB]; }

  function injectAt(x,y) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, frontFB);
    const size = Math.max(2, N>>6);
    const buf = new Float32Array(size*size*2);
    for (let i=0;i<buf.length;i+=2){
      buf[i] = 0.5 + Math.random()*0.1;
      buf[i+1] = 0.5 + Math.random()*0.2;
    }
    gl.bindTexture(gl.TEXTURE_2D, frontTex);
    const sx = Math.max(0, Math.min(N-size, x-size/2|0));
    const sy = Math.max(0, Math.min(N-size, y-size/2|0));
    const f = (type === gl.UNSIGNED_BYTE) ? new Uint8Array(buf.map(v=>Math.max(0,Math.min(255,Math.round(v*255))))) : buf;
    gl.texSubImage2D(gl.TEXTURE_2D,0,sx,sy,size,size,format,type,f);
  }

  canvas.onpointerdown = (e)=>{
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left)/rect.width) * N;
    const y = ((e.clientY - rect.top)/rect.height) * N;
    injectAt(x|0,y|0);
  };

  return {
    gl, step, draw, swap, get frontTex(){return frontTex}, get backTex(){return backTex},
    cleanup(){
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  };
}

function runGPU(mode="auto") {
  const {N, stepsPerFrame, F, k, Du, Dv} = getParams();
  let renderer;
  try {
    renderer = createGL(N, mode);
    setStatus(mode==="safe" ? "WebGL2 Safe 実行中…" : "WebGL2 実行中…");
  } catch (e) {
    log("GPU初期化失敗: " + e.message);
    throw e;
  }
  let raf = 0;
  const loop = ()=>{
    for (let i=0;i<stepsPerFrame;i++){
      renderer.step(F,k,Du,Dv, renderer.frontTex, renderer.backTex);
      renderer.swap();
    }
    renderer.draw(renderer.frontTex);
    raf = requestAnimationFrame(loop);
  };
  loop();
  return ()=>{ cancelAnimationFrame(raf); renderer.cleanup(); };
}

// ===== Setup buttons =====
function start(which){
  if (stopCurrent) { try{stopCurrent()}catch{}; stopCurrent=null; }
  try{
    if (which==="gpu") stopCurrent = runGPU("auto");
    else if (which==="safe") stopCurrent = runGPU("safe");
    else stopCurrent = runCPU(canvas, getParams, setStatus, log);
  } catch(e){
    log("エラー: " + e.message + "  → CPUへフォールバックします");
    stopCurrent = runCPU(canvas, getParams, setStatus, log);
  }
}

document.getElementById('btn-gpu').onclick = ()=> start("gpu");
document.getElementById('btn-safe').onclick = ()=> start("safe");
document.getElementById('btn-cpu').onclick = ()=> start("cpu");
document.getElementById('btn-reset').onclick = ()=> start("gpu");

setStatus("Initializing…");
start("gpu");
