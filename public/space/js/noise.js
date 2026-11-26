// Seeded 3D value noise and fractal helpers, sampled on the unit sphere
// so that planet textures have no seams and no pinching at the poles.

import { mulberry } from './astro.js';

export function makeNoise(seed = 1) {
  const rand = mulberry(seed);
  const perm = new Uint16Array(512);
  const vals = new Float32Array(256);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) vals[i] = rand() * 2 - 1;
  const ox = rand() * 100, oy = rand() * 100, oz = rand() * 100;

  const s = (t) => t * t * (3 - 2 * t);
  function noise(x, y, z) {
    x += ox; y += oy; z += oz;
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const X = xi & 255, Y = yi & 255, Z = zi & 255;
    const u = s(xf), v = s(yf), w = s(zf);
    const h = (a, b, c) => vals[perm[perm[perm[a] + b] + c]];
    const X1 = (X + 1) & 255, Y1 = (Y + 1) & 255, Z1 = (Z + 1) & 255;
    const x00 = h(X, Y, Z) + u * (h(X1, Y, Z) - h(X, Y, Z));
    const x10 = h(X, Y1, Z) + u * (h(X1, Y1, Z) - h(X, Y1, Z));
    const x01 = h(X, Y, Z1) + u * (h(X1, Y, Z1) - h(X, Y, Z1));
    const x11 = h(X, Y1, Z1) + u * (h(X1, Y1, Z1) - h(X, Y1, Z1));
    const y0 = x00 + v * (x10 - x00), y1 = x01 + v * (x11 - x01);
    return y0 + w * (y1 - y0);
  }
  function fbm(x, y, z, oct = 5, lac = 2.03, gain = 0.5) {
    let a = 0.5, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += a * noise(x * f, y * f, z * f); norm += a; a *= gain; f *= lac; }
    return sum / norm;
  }
  function ridged(x, y, z, oct = 5) {
    let a = 0.5, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(noise(x * f, y * f, z * f)); sum += a * n * n; norm += a; a *= 0.5; f *= 2.1; }
    return sum / norm;
  }
  return { noise, fbm, ridged, rand };
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
export function mixc(c1, c2, t) { return [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)]; }
