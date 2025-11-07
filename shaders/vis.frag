#version 300 es
precision highp float;
precision highp sampler2D;

out vec4 outColor;
in vec2 vUv;

uniform sampler2D uState;
uniform sampler2D uRadius;
uniform bool showRadius;

vec3 turbo(float x){ // simple palette
  x = clamp(x, 0.0, 1.0);
  return mix(vec3(0.1,0.12,0.2), vec3(0.9,0.95,1.0), x);
}

void main(){
  if(showRadius){
    float r = texture(uRadius, vUv).r;
    outColor = vec4(vec3(r), 1.0);
    return;
  }
  vec2 uv = texture(uState, vUv).rg;
  float U = uv.r;
  float V = uv.g;
  float m = clamp((U - V*0.5), 0.0, 1.0);
  vec3 col = turbo(m);
  outColor = vec4(col, 1.0);
}
