// Astronomy helpers: units, coordinate frames, Kepler orbits, star colours.
//
// World frame (shared by every scene) is aligned with galactic coordinates:
//   +X  toward the Galactic Centre (l = 0, b = 0)
//   +Y  toward the North Galactic Pole
//   +Z  toward l = 270 deg   (so that the frame is right handed)
// The universe scene uses parsecs, a star-system scene uses AU, same axes.

import * as THREE from 'three';

export const AU_PC = 4.84813681109536e-6;
export const PC_LY = 3.26156;
export const AU_KM = 149597870.7;
export const R_EARTH_AU = 6371 / AU_KM;
export const R_SUN_AU = 695700 / AU_KM;
export const R_JUP_AU = 69911 / AU_KM;
export const DEG = Math.PI / 180;

const EQ2GAL = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [ 0.4941094279, -0.4448296300,  0.7469822445],
  [-0.8676661490, -0.1980763734,  0.4559837762],
];
const OBLIQUITY = 23.43928 * DEG;

// equatorial unit vector (x to RA 0, z to north celestial pole) -> world frame
export function eqVecToWorld(x, y, z, out = new THREE.Vector3()) {
  const gx = EQ2GAL[0][0] * x + EQ2GAL[0][1] * y + EQ2GAL[0][2] * z;
  const gy = EQ2GAL[1][0] * x + EQ2GAL[1][1] * y + EQ2GAL[1][2] * z;
  const gz = EQ2GAL[2][0] * x + EQ2GAL[2][1] * y + EQ2GAL[2][2] * z;
  return out.set(gx, gz, -gy);
}

export function raDecToWorld(raDeg, decDeg, dist = 1, out = new THREE.Vector3()) {
  const a = raDeg * DEG, b = decDeg * DEG;
  eqVecToWorld(Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b), out);
  return out.multiplyScalar(dist);
}

// ecliptic J2000 (x to vernal equinox, z to ecliptic north) -> world frame
export function eclToWorld(x, y, z, out = new THREE.Vector3()) {
  const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY);
  return eqVecToWorld(x, y * c - z * s, y * s + z * c, out);
}

// galactic longitude / latitude -> world
export function galToWorld(lDeg, bDeg, dist = 1, out = new THREE.Vector3()) {
  const l = lDeg * DEG, b = bDeg * DEG;
  return out.set(Math.cos(b) * Math.cos(l) * dist, Math.sin(b) * dist, -Math.cos(b) * Math.sin(l) * dist);
}

export function julianDate(ms) { return ms / 86400000 + 2440587.5; }

export function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 30; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-10) break;
  }
  return E;
}

// Position in the orbital plane (periapsis along +x) for mean anomaly M.
export function orbitalPlanePos(a, e, M) {
  const E = solveKepler(M, e);
  return [a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E)];
}

// Classical elements (degrees) -> ecliptic xyz
export function elementsToEcliptic(a, e, I, Om, w, M) {
  const [xp, yp] = orbitalPlanePos(a, e, M);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    (sw * sI) * xp + (cw * sI) * yp,
  ];
}

// Black body colour (linear RGB, roughly normalised) for an effective temperature.
export function tempToColor(T, out = new THREE.Color()) {
  T = Math.min(40000, Math.max(1200, T || 5772)) / 100;
  let r, g, b;
  if (T <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(T) - 161.1195681661;
    b = T <= 19 ? 0 : 138.5177312231 * Math.log(T - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(T - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(T - 60, -0.0755148492);
    b = 255;
  }
  const c = (v) => Math.min(255, Math.max(0, v)) / 255;
  out.setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace);
  return out;
}

// B-V colour index -> temperature (Ballesteros 2012)
export function bvToTemp(bv) {
  bv = Math.min(2.0, Math.max(-0.4, bv));
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

// Deterministic pseudo random numbers seeded from a string (for unknown orbital angles).
export function seeded(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function fmtDist(pc) {
  const ly = pc * PC_LY;
  if (pc < 0.01) {
    const au = pc / AU_PC;
    return au < 1000 ? `${au.toPrecision(3)} AU` : `${Math.round(au).toLocaleString()} AU`;
  }
  if (ly < 1e4) return `${ly < 100 ? ly.toFixed(ly < 10 ? 2 : 1) : Math.round(ly).toLocaleString()} light-years`;
  if (ly < 1e6) return `${(ly / 1e3).toFixed(ly < 1e5 ? 1 : 0)} thousand light-years`;
  if (ly < 1e9) return `${(ly / 1e6).toFixed(ly < 1e7 ? 2 : 1)} million light-years`;
  return `${(ly / 1e9).toFixed(2)} billion light-years`;
}

export function fmtAU(au) {
  if (au < 0.01) return `${Math.round(au * AU_KM).toLocaleString()} km`;
  if (au < 1000) return `${au.toPrecision(3)} AU`;
  return fmtDist(au * AU_PC);
}
