// cpu.js - very simple Gray-Scott on Canvas2D
export function runCPU(canvas, getParams, setStatus, log){
  const ctx = canvas.getContext('2d');
  const {N, stepsPerFrame, F, k, Du, Dv} = getParams();
  canvas.width = N; canvas.height = N;
  setStatus("CPU 実行中…");

  const U = new Float32Array(N*N).fill(1.0);
  const V = new Float32Array(N*N).fill(0.0);
  function idx(x,y){ return (y*N + x)|0; }

  function seedCircle(cx, cy, r){
    for (let y=-r; y<=r; y++){
      for (let x=-r; x<=r; x++){
        if (x*x+y*y<=r*r){
          const i = idx(Math.min(N-1,Math.max(0,cx+x)), Math.min(N-1,Math.max(0,cy+y)));
          U[i] = 0.5 + Math.random()*0.1;
          V[i] = 0.25 + Math.random()*0.1;
        }
      }
    }
  }
  seedCircle(N>>1, N>>1, Math.max(6, N>>5));

  const img = ctx.createImageData(N,N);
  const nextU = new Float32Array(N*N);
  const nextV = new Float32Array(N*N);

  function lap(arr,x,y){
    let c = arr[idx(x,y)];
    let up = arr[idx(x, Math.max(0,y-1))];
    let dn = arr[idx(x, Math.min(N-1,y+1))];
    let lf = arr[idx(Math.max(0,x-1), y)];
    let rt = arr[idx(Math.min(N-1,x+1), y)];
    return (up+dn+lf+rt - 4*c);
  }

  let raf=0;
  function step(){
    const p = getParams();
    for (let s=0;s<p.stepsPerFrame;s++){
      for (let y=0;y<N;y++){
        for (let x=0;x<N;x++){
          const i = idx(x,y);
          const Uv = U[i], Vv = V[i];
          const dU = p.Du * lap(U,x,y) - Uv*Vv*Vv + p.F*(1.0-Uv);
          const dV = p.Dv * lap(V,x,y) + Uv*Vv*Vv - (p.F + p.k)*Vv;
          nextU[i] = Uv + dU;
          nextV[i] = Vv + dV;
        }
      }
      U.set(nextU); V.set(nextV);
    }
    // draw
    const data = img.data;
    for (let i=0;i<N*N;i++){
      const v = Math.max(0, Math.min(1, V[i]));
      const c = (v*255)|0;
      const o = i*4;
      data[o]=data[o+1]=data[o+2]=c;
      data[o+3]=255;
    }
    ctx.putImageData(img,0,0);
    raf = requestAnimationFrame(step);
  }
  step();

  function inject(e){
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left)/rect.width * N);
    const y = Math.floor((e.clientY - rect.top)/rect.height * N);
    seedCircle(x,y, Math.max(2,N>>6));
  }
  canvas.onpointerdown = inject;

  return ()=>{ cancelAnimationFrame(raf); };
}
