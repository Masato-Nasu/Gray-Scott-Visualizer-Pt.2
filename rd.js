(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const logEl = $('#log');
  const statusEl = $('#status');
  const canvas = $('#view');
  const gl2 = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
  let mode = 'webgl2'; // 'webgl2' | 'safe' | 'cpu'
  let running = true;
  let scale = 1;
  let speed = 1;

  // UI bindings
  $('#speed').addEventListener('input', e => {
    speed = parseFloat(e.target.value);
    $('#speedVal').textContent = speed.toFixed(1) + '×';
  });
  $('#scale').addEventListener('input', e => {
    scale = parseFloat(e.target.value);
    $('#scaleVal').textContent = scale.toFixed(2);
    canvas.style.transform = `scale(${scale})`;
    canvas.style.transformOrigin = 'top left';
  });
  $('#seed').addEventListener('click', () => seed());
  $('#reset').addEventListener('click', () => init(mode));
  $('#safe').addEventListener('click', () => init('safe'));
  $('#cpu').addEventListener('click', () => init('cpu'));
  $('#res').addEventListener('change', (e) => {
    const [w,h] = e.target.value.split('x').map(Number);
    resize(w,h);
    init(mode);
  });

  const params = new URLSearchParams(location.search);
  if (params.has('safe')) mode = 'safe';
  if (params.has('cpu')) mode = 'cpu';

  function log(s) {
    console.log(s);
    if (!logEl) return;
    logEl.textContent += (typeof s === 'string' ? s : JSON.stringify(s)) + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setStatus(s) { statusEl.textContent = s; }

  function resize(w, h) {
    canvas.width = w; canvas.height = h;
  }

  // ---------------- CPU fallback (naive) ----------------
  let cpu = {
    u: null, v: null, tmpU: null, tmpV: null, w: 0, h: 0,
    Du: 0.16, Dv: 0.08, F: 0.037, k: 0.06
  };

  function cpuInit() {
    const w = canvas.width, h = canvas.height;
    cpu.w = w; cpu.h = h;
    cpu.u = new Float32Array(w*h).fill(1);
    cpu.v = new Float32Array(w*h).fill(0);
    cpu.tmpU = new Float32Array(w*h);
    cpu.tmpV = new Float32Array(w*h);
    seedCPU();
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
  }
  function seedCPU() {
    const w=cpu.w, h=cpu.h;
    for (let n=0;n<5;n++){
      const cx = Math.floor(w*(0.3+0.4*Math.random()));
      const cy = Math.floor(h*(0.3+0.4*Math.random()));
      const r = Math.floor(10+40*Math.random());
      for (let y=Math.max(0,cy-r); y<Math.min(h,cy+r); y++) {
        for (let x=Math.max(0,cx-r); x<Math.min(w,cx+r); x++) {
          const dx=x-cx, dy=y-cy;
          if (dx*dx+dy*dy<=r*r) {
            const i = y*w + x;
            cpu.v[i] = 1;
          }
        }
      }
    }
  }
  function cpuStep(dt) {
    const {w,h,Du,Dv,F,k} = cpu;
    const U=cpu.u, V=cpu.v, nU=cpu.tmpU, nV=cpu.tmpV;
    // 5-point laplacian
    for (let y=0;y<h;y++) {
      const y1=(y-1+h)%h, y2=(y+1)%h;
      for (let x=0;x<w;x++) {
        const x1=(x-1+w)%w, x2=(x+1)%w;
        const i = y*w+x;
        const c = i;
        const up = y1*w + x;
        const dn = y2*w + x;
        const lf = y*w + x1;
        const rt = y*w + x2;
        const Lu = -4*U[c] + U[up] + U[dn] + U[lf] + U[rt];
        const Lv = -4*V[c] + V[up] + V[dn] + V[lf] + V[rt];
        const uvv = U[c]*V[c]*V[c];
        nU[i] = U[c] + (Du*Lu - uvv + F*(1-U[c]))*dt;
        nV[i] = V[c] + (Dv*Lv + uvv - (F+k)*V[c])*dt;
      }
    }
    // swap
    cpu.u = nU.slice(0); cpu.v = nV.slice(0);
  }
  function cpuDraw() {
    const {w,h} = cpu;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w,h);
    const V=cpu.v;
    for (let i=0;i<w*h;i++){
      let v = V[i];
      if (v<0) v=0; if (v>1) v=1;
      const c = Math.floor(v*255);
      img.data[4*i+0] = c;
      img.data[4*i+1] = c;
      img.data[4*i+2] = c;
      img.data[4*i+3] = 255;
    }
    ctx.putImageData(img,0,0);
  }

  // ---------------- WebGL2 implementation ----------------
  const gl = gl2;
  let progStep, progDraw, vaoQuad;
  let texA, texB, fbA, fbB;
  let curSrc = 0;
  let w = canvas.width, h = canvas.height;

  const vertQuad = `#version 300 es
  precision highp float;
  const vec2 pos[4] = vec2[4](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(1,1));
  out vec2 vUV;
  void main(){
    vUV = (pos[gl_VertexID].xy*0.5+0.5);
    gl_Position = vec4(pos[gl_VertexID],0,1);
  }`;

  const fragStep = `#version 300 es
  precision highp float;
  precision highp sampler2D;
  in vec2 vUV; out vec2 outRG;
  uniform sampler2D src;
  uniform vec2 texel;
  uniform float Du, Dv, F, k, dt;
  vec2 sample(vec2 uv){ return texture(src, uv).rg; }
  void main(){
    vec2 c = sample(vUV);
    vec2 up = sample(vUV + vec2(0.0, -texel.y));
    vec2 dn = sample(vUV + vec2(0.0,  texel.y));
    vec2 lf = sample(vUV + vec2(-texel.x, 0.0));
    vec2 rt = sample(vUV + vec2( texel.x, 0.0));
    vec2 L = -4.0*c + up + dn + lf + rt;
    float U = c.r, V = c.g;
    float uvv = U*V*V;
    float nU = U + (Du*L.r - uvv + F*(1.0-U))*dt;
    float nV = V + (Dv*L.g + uvv - (F+k)*V)*dt;
    outRG = clamp(vec2(nU,nV), 0.0, 1.0);
  }`;

  const fragDraw = `#version 300 es
  precision highp float;
  precision highp sampler2D;
  in vec2 vUV; out vec4 frag;
  uniform sampler2D src;
  void main(){
    vec2 uv = texture(src, vUV).rg;
    float v = uv.g;
    frag = vec4(vec3(v), 1.0);
  }`;

  function createShader(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('Shader compile error: ' + info);
    }
    return sh;
  }
  function createProgram(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, createShader(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, createShader(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error('Program link error: ' + info);
    }
    return p;
  }

  function makeTex() {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    // Always use RG for U,V
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, w, h, 0, gl.RG, gl.UNSIGNED_BYTE, null);
    return tex;
  }
  function makeFB(tex) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('FBO incomplete: '+st.toString(16));
    return fb;
  }

  function seed() {
    if (mode === 'cpu') { seedCPU(); return; }
    gl.useProgram(progStep);
    gl.viewport(0,0,w,h);
    // draw a few circles of V=1 into texA via multiple steps:
    const seedFS = `#version 300 es
    precision highp float; out vec2 outRG; in vec2 vUV;
    uniform vec2 center; uniform float radius;
    void main(){
      float d = distance(vUV, center);
      float v = step(d, radius);
      float U = 1.0 - v*0.5;
      float V = v;
      outRG = vec2(U,V);
    }`;
    const progSeed = createProgram(gl, vertQuad, seedFS);
    gl.useProgram(progSeed);
    const locCenter = gl.getUniformLocation(progSeed, 'center');
    const locRadius = gl.getUniformLocation(progSeed, 'radius');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbA);
    if (!vaoQuad) vaoQuad = gl.createVertexArray();
    gl.bindVertexArray(vaoQuad);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // initialize to zero
    for (let i=0;i<5;i++){
      gl.uniform2f(locCenter, Math.random()*1.0, Math.random()*1.0);
      gl.uniform1f(locRadius, 0.03 + Math.random()*0.08);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.deleteProgram(progSeed);
  }

  function glInit(safe=false) {
    w = canvas.width; h = canvas.height;
    // Programs
    progStep = createProgram(gl, vertQuad, fragStep);
    progDraw = createProgram(gl, vertQuad, fragDraw);
    // Quad
    vaoQuad = gl.createVertexArray();
    gl.bindVertexArray(vaoQuad);
    // Textures / FBOs
    texA = makeTex(); texB = makeTex();
    fbA = makeFB(texA); fbB = makeFB(texB);
    // Clear
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbA);
    gl.clearColor(1,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbB);
    gl.clearColor(1,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    seed();
    setStatus(safe ? 'Safe(WebGL2 RG8) 実行中…' : 'WebGL2 実行中…');
  }

  function init(requested='webgl2') {
    try {
      running = true;
      mode = requested;
      if (mode === 'cpu') {
        setStatus('CPU フォールバック初期化中…');
        cpuInit();
        lastT = performance.now();
        requestAnimationFrame(loop);
        return;
      }
      if (!gl) {
        setStatus('WebGL2 が利用できません。CPU へフォールバックします。');
        mode = 'cpu';
        cpuInit();
        lastT = performance.now();
        requestAnimationFrame(loop);
        return;
      }
      // Safe mode: stick to RG8 (already implemented)
      setStatus(mode==='safe' ? 'Safe 初期化中…' : 'WebGL2 初期化中…');
      glInit(mode==='safe');
      lastT = performance.now();
      requestAnimationFrame(loop);
    } catch (e) {
      log('init error: '+e.message);
      setStatus('エラー: ' + e.message + ' → CPUへフォールバックします');
      mode = 'cpu';
      cpuInit();
      lastT = performance.now();
      requestAnimationFrame(loop);
    }
  }

  let lastT = performance.now();

  function stepGL(dt) {
    // Step
    gl.useProgram(progStep);
    gl.bindVertexArray(vaoQuad);
    gl.viewport(0,0,w,h);
    // uniforms
    const loc = (p,n)=>gl.getUniformLocation(p,n);
    gl.uniform1f(loc(progStep,'Du'), parseFloat($('#du').value));
    gl.uniform1f(loc(progStep,'Dv'), parseFloat($('#dv').value));
    gl.uniform1f(loc(progStep,'F'), parseFloat($('#feed').value));
    gl.uniform1f(loc(progStep,'k'), parseFloat($('#kill').value));
    gl.uniform1f(loc(progStep,'dt'), dt*1.0);
    gl.uniform2f(loc(progStep,'texel'), 1.0/w, 1.0/h);
    // bind src
    const srcTex = (curSrc===0)?texA:texB;
    const dstFB  = (curSrc===0)?fbB:fbA;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(gl.getUniformLocation(progStep,'src'), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFB);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // swap
    curSrc = 1-curSrc;

    // Draw to screen
    gl.useProgram(progDraw);
    const srcTex2 = (curSrc===0)?texA:texB;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex2);
    gl.uniform1i(gl.getUniformLocation(progDraw,'src'), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0,0,canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function loop(t) {
    if (!running) return;
    const dt = Math.min(1/30, (t - lastT)/1000) * speed;
    lastT = t;
    try {
      if (mode === 'cpu') {
        // Run several substeps for stability
        let steps = Math.max(1, Math.floor(4*speed));
        for (let i=0;i<steps;i++) cpuStep(0.8/steps);
        cpuDraw();
      } else {
        stepGL(1.0/60.0);
      }
    } catch (e) {
      log('runtime error: ' + e.message);
      setStatus('実行エラー → CPUへフォールバックします');
      mode = 'cpu';
      cpuInit();
    }
    requestAnimationFrame(loop);
  }

  // sync labels
  $('#speed').dispatchEvent(new Event('input'));
  $('#scale').dispatchEvent(new Event('input'));

  // initial size from select
  (function initialSize(){
    const val = $('#res').value;
    const [rw,rh] = val.split('x').map(Number);
    resize(rw, rh);
  })();

  // bind sliders to params for CPU as well
  for (const id of ['du','dv','feed','kill']) {
    $('#'+id).addEventListener('input', ()=>{});
  }

  // go!
  init(mode);

  // expose for debugging
  window.__rd = { init, seed, log };
})();