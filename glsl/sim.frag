#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uF;
uniform float uK;
uniform float uDt;

// Laplacian with 4-neighbor + diagonals
vec2 lap(vec2 uv){
  vec2 c = texture(uState, vUv).xy;
  vec2 s = vec2(0.0);
  s += texture(uState, vUv + vec2(-uTexel.x, 0.0)).xy;
  s += texture(uState, vUv + vec2(+uTexel.x, 0.0)).xy;
  s += texture(uState, vUv + vec2(0.0, -uTexel.y)).xy;
  s += texture(uState, vUv + vec2(0.0, +uTexel.y)).xy;
  vec2 d = vec2(0.0);
  d += texture(uState, vUv + vec2(-uTexel.x, -uTexel.y)).xy;
  d += texture(uState, vUv + vec2(-uTexel.x, +uTexel.y)).xy;
  d += texture(uState, vUv + vec2(+uTexel.x, -uTexel.y)).xy;
  d += texture(uState, vUv + vec2(+uTexel.x, +uTexel.y)).xy;
  vec2 l = (s * 0.2 + d * 0.05) - c * 1.0;
  return l;
}

void main(){
  vec2 AB = texture(uState, vUv).xy;
  float A = AB.x;
  float B = AB.y;

  vec2 L = lap(AB);
  float Da = 1.0;
  float Db = 0.5;

  float reaction = A * B * B;
  float dA = Da * L.x - reaction + uF * (1.0 - A);
  float dB = Db * L.y + reaction - (uK + uF) * B;

  A += dA * uDt;
  B += dB * uDt;

  outColor = vec4(clamp(A,0.0,1.0), clamp(B,0.0,1.0), 0.0, 1.0);
}
