#version 300 es
precision highp float; precision highp sampler2D;
out vec4 outColor; in vec2 vUv;
uniform sampler2D uState; uniform sampler2D uRadius; uniform bool showRadius;
vec3 pal(float x){ x=clamp(x,0.0,1.0); return mix(vec3(0.08,0.10,0.18),vec3(0.92,0.97,1.0),x); }
void main(){
  if(showRadius){ float r=texture(uRadius,vUv).r; outColor=vec4(vec3(r),1.0); return; }
  vec2 uv=texture(uState,vUv).rg;
  float m=clamp((uv.r - uv.g*0.5),0.0,1.0);
  outColor=vec4(pal(m),1.0);
}