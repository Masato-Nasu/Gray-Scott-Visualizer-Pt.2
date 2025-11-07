#version 300 es
precision highp float;
precision highp sampler2D;

out vec4 outColor;

in vec2 vUv;

uniform sampler2D uState;     // RG: U,V
uniform sampler2D uRadius;    // R channel: radius field

uniform vec2 px;              // 1.0 / resolution
uniform float du, dv, feed, kill, dt;

uniform float alphaDP;  // diffusiophoresis strength
uniform float lambdaR;  // diffusion reduction by radius
uniform float betaHS;   // hard-sphere crowding strength
uniform float t0HS;     // crowding threshold lower
uniform float t1HS;     // crowding threshold upper
uniform float noiseAmt; // tiny noise

// 5-point Laplacian
vec2 readUV(vec2 p) { return texture(uState, p).rg; }

void main() {
  vec2 uv  = vUv;
  vec2 UVc = readUV(uv);
  float Uc = UVc.r;
  float Vc = UVc.g;

  vec2 UVL = readUV(uv - vec2(px.x, 0.0));
  vec2 UVR = readUV(uv + vec2(px.x, 0.0));
  vec2 UVB = readUV(uv - vec2(0.0, px.y));
  vec2 UVT = readUV(uv + vec2(0.0, px.y));

  float lapU = (UVL.r + UVR.r + UVB.r + UVT.r - 4.0 * Uc);
  float lapV = (UVL.g + UVR.g + UVB.g + UVT.g - 4.0 * Vc);

  // gradients
  float dUdx = (UVR.r - UVL.r) * 0.5;
  float dUdy = (UVT.r - UVB.r) * 0.5;
  float dVdx = (UVR.g - UVL.g) * 0.5;
  float dVdy = (UVT.g - UVB.g) * 0.5;

  float div_U_gradV = (dUdx * dVdx + dUdy * dVdy) + Uc * lapV;

  float R = texture(uRadius, uv).r;
  float DUeff = du / (1.0 + lambdaR * R);
  float DVeff = dv / (1.0 + lambdaR * R);

  float rho = clamp(Uc + Vc, 0.0, 2.0);
  float phi = smoothstep(t0HS, t1HS, R * rho);
  float reactAtten = (1.0 - betaHS * phi);

  float UVV = Uc * Vc * Vc;
  float dU = DUeff * lapU - UVV * reactAtten + feed * (1.0 - Uc) * reactAtten;
  float dV = DVeff * lapV + UVV * reactAtten - (feed + kill) * Vc * reactAtten;

  dU += -alphaDP * div_U_gradV;

  // hash-less pseudo noise from uv
  float n = fract(sin(dot(uv, vec2(12.9898,78.233))) * 43758.5453);
  dU += (n - 0.5) * noiseAmt;
  dV += (n - 0.5) * noiseAmt * 0.5;

  float Un = clamp(Uc + dt * dU, 0.0, 1.0);
  float Vn = clamp(Vc + dt * dV, 0.0, 1.0);

  outColor = vec4(Un, Vn, 0.0, 1.0);
}
