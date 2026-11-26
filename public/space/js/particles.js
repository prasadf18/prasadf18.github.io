// Shared GPU particle materials for galaxies, nebulae and dust.
// Each particle is a soft gaussian with a physical size (in world units).
// Sub-pixel particles keep their total light (alpha ~ area), and particles
// that would swamp the screen fade away, so the same cloud reads correctly
// from inside it and from a million light-years away.

import * as THREE from 'three';

export const scaleUniform = { value: 800 };   // drawingBufferHeight / (2 tan(fov/2)), set every frame
// Particles closer than this (pc) fade out: up close, the real star catalogue takes over.
export const nearFadeUniform = { value: 500 };

const vert = /* glsl */`
  attribute float size;
  attribute vec3 color;
  uniform float uScale;
  uniform float uOpacity;
  uniform float uMaxPx;
  uniform float uMinPx;
  uniform float uNear;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float d = -mv.z;
    float px = size * uScale / max(d, 1e-12);
    float a = uOpacity;
    if (px < uMinPx) { a *= (px * px) / (uMinPx * uMinPx); px = uMinPx; }
    // particles larger than uMaxPx are near the camera: fade them out
    a *= clamp((uMaxPx * 2.5 - px) / (uMaxPx * 1.5), 0.0, 1.0);
    px = min(px, uMaxPx * 2.5);
    a *= smoothstep(uNear * 0.4, uNear, length(mv.xyz));
    if (d <= 0.0) a = 0.0;
    vColor = color;
    vAlpha = a;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = px;
  }
`;

const fragGlow = /* glsl */`
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float g = exp(-r2 * 4.5);
    gl_FragColor = vec4(vColor * g * vAlpha, 1.0);
  }
`;

// Dust absorbs: dst *= (1 - extinction). Blue light is absorbed more (reddening).
const fragDust = /* glsl */`
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float g = exp(-r2 * 3.0) * (1.0 - r2);
    gl_FragColor = vec4(clamp(vColor * g * vAlpha, 0.0, 0.97), 1.0);
  }
`;

export function glowMaterial({ opacity = 1, maxPx = 64, minPx = 1.2 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: scaleUniform, uNear: nearFadeUniform, uOpacity: { value: opacity }, uMaxPx: { value: maxPx }, uMinPx: { value: minPx } },
    vertexShader: vert,
    fragmentShader: fragGlow,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquation: THREE.AddEquation,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
}

export function dustMaterial({ opacity = 1, maxPx = 90 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: scaleUniform, uNear: nearFadeUniform, uOpacity: { value: opacity }, uMaxPx: { value: maxPx }, uMinPx: { value: 1.5 } },
    vertexShader: vert,
    fragmentShader: fragDust,
    blending: THREE.CustomBlending,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.OneMinusSrcColorFactor,
    blendEquation: THREE.AddEquation,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
}

// Growable buffer for building particle clouds on the CPU.
export class Cloud {
  constructor(capacity) {
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.n = 0;
  }
  push(x, y, z, r, g, b, s) {
    if (this.n * 3 + 3 > this.pos.length) this._grow();
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.size[i] = s;
  }
  _grow() {
    const g = (a, k) => { const b = new Float32Array(a.length * 2); b.set(a); return b; };
    this.pos = g(this.pos); this.col = g(this.col); this.size = g(this.size);
  }
  points(material) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos.subarray(0, this.n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col.subarray(0, this.n * 3), 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size.subarray(0, this.n), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e12);
    const p = new THREE.Points(geo, material);
    p.frustumCulled = false;
    return p;
  }
}
