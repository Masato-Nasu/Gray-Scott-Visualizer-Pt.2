#version 300 es
precision highp float; precision highp sampler2D;
out vec4 outColor; in vec2 vUv;
uniform sampler2D uState, uRadius; uniform vec2 px;
uniform float du,dv,feed,kill,dt, alphaDP,lambdaR,betaHS,t0HS,t1HS,noiseAmt;
vec2 RUV(vec2 p){ return texture(uState,p).rg; }
void main(){
  vec2 uv=vUv;
  vec2 c=RUV(uv); float U=c.r, V=c.g;
  vec2 L=RUV(uv-vec2(px.x,0.0)), R=RUV(uv+vec2(px.x,0.0));
  vec2 B=RUV(uv-vec2(0.0,px.y)), T=RUV(uv+vec2(0.0,px.y));
  float lapU=(L.r+R.r+B.r+T.r-4.0*U);
  float lapV=(L.g+R.g+B.g+T.g-4.0*V);
  float dUdx=(R.r-L.r)*0.5, dUdy=(T.r-B.r)*0.5;
  float dVdx=(R.g-L.g)*0.5, dVdy=(T.g-B.g)*0.5;
  float divUgradV=(dUdx*dVdx+dUdy*dVdy)+U*lapV;
  float Rval=texture(uRadius,uv).r;
  float DU=du/(1.0+lambdaR*Rval);
  float DV=dv/(1.0+lambdaR*Rval);
  float rho=clamp(U+V,0.0,2.0);
  float phi=smoothstep(t0HS,t1HS,Rval*rho);
  float att=(1.0-betaHS*phi);
  float UVV=U*V*V;
  float dU=DU*lapU - UVV*att + feed*(1.0-U)*att;
  float dV=DV*lapV + UVV*att - (feed+kill)*V*att;
  dU += -alphaDP*divUgradV;
  float n=fract(sin(dot(uv,vec2(12.9898,78.233)))*43758.5453);
  dU+=(n-0.5)*noiseAmt; dV+=(n-0.5)*noiseAmt*0.5;
  outColor=vec4(clamp(U+dt*dU,0.0,1.0), clamp(V+dt*dV,0.0,1.0), 0.0, 1.0);
}