(() => {
  'use strict';

  const canvas = document.getElementById('view');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // UI
  const el = id => document.getElementById(id);
  const resSel = el('res');
  const speed = el('speed');
  const resetBtn = el('reset');
  const seedBtn = el('seed');
  const saveBtn = el('save');
  const F = el('F'), k = el('k'), Du = el('Du'), Dv = el('Dv'), dt = el('dt');
  const Fv = el('Fv'), kv = el('kv'), Duv = el('Duv'), Dvv = el('Dvv'), dtv = el('dtv');
  const contrast = el('contrast'), brightness = el('brightness'), invert = el('invert');

  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let W = 512, H = 512;
  let U, V, U2, V2;       // ping-pong fields
  let imgData, data8;
  let running = true;
  let frameId = 0;

  function alloc(w, h) {
    W = w; H = h;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    U = new Float32Array(W * H);
    V = new Float32Array(W * H);
    U2 = new Float32Array(W * H);
    V2 = new Float32Array(W * H);

    imgData = ctx.createImageData(W, H);
    data8 = imgData.data;

    // Initialize
    for (let i = 0; i < W * H; i++) {
      U[i] = 1.0;
      V[i] = 0.0;
    }
    // Global micro-noise for fast start
    randomSprinkle(0.02, 0.02, 20000);
    // Strong central seed
    seedCircle(W>>1, H>>1, Math.max(8, Math.floor(Math.min(W,H)*0.04)), 0.5);
    render();
  }

  function idx(x, y) { return y * W + x; }

  function seedCircle(cx, cy, r, vVal=0.8) {
    const r2 = r*r;
    for (let y = Math.max(0, cy-r); y < Math.min(H, cy+r); y++) {
      const dy = y - cy;
      for (let x = Math.max(0, cx-r); x < Math.min(W, cx+r); x++) {
        const dx = x - cx;
        if (dx*dx + dy*dy <= r2) {
          const i = idx(x,y);
          V[i] = vVal;
          U[i] = 1.0 - vVal;
        }
      }
    }
  }

  function randomSprinkle(vAmt = 0.03, uDrop = 0.0, count = 5000) {
    // Sprinkle random pixels to kick patterns quickly
    for (let n = 0; n < count; n++) {
      const x = (Math.random() * W) | 0;
      const y = (Math.random() * H) | 0;
      const i = idx(x,y);
      V[i] = Math.min(1.0, V[i] + vAmt * (0.5 + Math.random()));
      U[i] = Math.max(0.0, U[i] - uDrop);
    }
  }

  // 5-point Laplacian with toroidal wrap
  function laplacian(A, x, y) {
    const xm = (x === 0 ? W-1 : x-1);
    const xp = (x === W-1 ? 0 : x+1);
    const ym = (y === 0 ? H-1 : y-1);
    const yp = (y === H-1 ? 0 : y+1);
    return (
      A[idx(xm,y)] + A[idx(xp,y)] + A[idx(x,ym)] + A[idx(x,yp)] - 4.0 * A[idx(x,y)]
    );
  }

  function step() {
    const Fv = parseFloat(F.value);
    const kv = parseFloat(k.value);
    const Duvv = parseFloat(Du.value);
    const Dvvv = parseFloat(Dv.value);
    const dtt = parseFloat(dt.value) * 1.0;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = idx(x,y);
        const u = U[i], v = V[i];
        const uvv = u * v * v;
        const du = Duvv * laplacian(U, x, y) - uvv + Fv * (1.0 - u);
        const dv = Dvvv * laplacian(V, x, y) + uvv - (Fv + kv) * v;
        let un = u + du * dtt;
        let vn = v + dv * dtt;
        // clamp
        if (un < 0) un = 0; else if (un > 1) un = 1;
        if (vn < 0) vn = 0; else if (vn > 1) vn = 1;
        U2[i] = un;
        V2[i] = vn;
      }
    }
    // swap
    [U, U2] = [U2, U];
    [V, V2] = [V2, V];
  }

  function draw() {
    // Map V field to grayscale with contrast/brightness & optional invert
    const c = parseFloat(contrast.value);
    const b = parseFloat(brightness.value);
    const inv = invert.checked ? -1 : 1;
    const off = invert.checked ? 255 : 0;
    let p = 0;
    for (let i = 0; i < W*H; i++) {
      let val = V[i];
      // simple tone map
      val = ((val - 0.5) * c + 0.5) + b;
      if (val < 0) val = 0; else if (val > 1) val = 1;
      const g = (inv * (val*255) + off) | 0;
      data8[p++] = g;   // R
      data8[p++] = g;   // G
      data8[p++] = g;   // B
      data8[p++] = 255; // A
    }
    ctx.putImageData(imgData, 0, 0);
  }

  function render() {
    const sp = parseInt(speed.value,10);
    for (let i = 0; i < sp; i++) step();
    draw();
    frameId = requestAnimationFrame(render);
  }

  function updateLabels() {
    Fv.textContent = F.value;
    kv.textContent = k.value;
    Duv.textContent = Du.value;
    Dvv.textContent = Dv.value;
    dtv.textContent = dt.value;
  }

  // Interaction
  let isDown = false;
  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(W-1, Math.floor((e.clientX - rect.left) * W / rect.width)));
    const y = Math.max(0, Math.min(H-1, Math.floor((e.clientY - rect.top) * H / rect.height)));
    return {x,y};
  }
  function injectAt(x, y, r=6, strength=0.9) {
    seedCircle(x,y,r,strength);
  }

  canvas.addEventListener('pointerdown', (e) => {
    isDown = true;
    const {x,y} = pointerPos(e);
    injectAt(x,y,8,0.85);
  }, {passive:true});
  canvas.addEventListener('pointermove', (e) => {
    if (!isDown) return;
    const {x,y} = pointerPos(e);
    injectAt(x,y,5,0.7);
  }, {passive:true});
  window.addEventListener('pointerup', ()=>{ isDown = false; }, {passive:true});
  window.addEventListener('pointercancel', ()=>{ isDown = false; }, {passive:true});

  resetBtn.addEventListener('click', () => {
    cancelAnimationFrame(frameId);
    alloc(parseInt(resSel.value,10), parseInt(resSel.value,10));
  });
  seedBtn.addEventListener('click', () => {
    randomSprinkle(0.03, 0.0, 40000);
    seedCircle((Math.random()*W)|0, (Math.random()*H)|0, Math.max(6,(Math.random()*20)|0), 0.9);
  });
  saveBtn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'rd_snapshot.png';
    a.click();
  });

  [F,k,Du,Dv,dt].forEach(x => x.addEventListener('input', updateLabels));
  resSel.addEventListener('change', () => {
    cancelAnimationFrame(frameId);
    alloc(parseInt(resSel.value,10), parseInt(resSel.value,10));
  });
  speed.addEventListener('input', ()=>{});

  updateLabels();
  alloc(parseInt(resSel.value,10), parseInt(resSel.value,10));
})();