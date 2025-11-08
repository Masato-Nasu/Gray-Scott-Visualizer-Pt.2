#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uState;
void main(){
  vec2 AB = texture(uState, vUv).xy;
  float v = AB.y - AB.x * 0.5;
  vec3 c = vec3(0.1 + 0.9*AB.x, 0.1 + 0.9*AB.y, 0.2 + 0.8*v);
  outColor = vec4(c, 1.0);
}
