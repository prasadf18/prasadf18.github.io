// The Milky Way, built from its measured structure:
//  - Sun 8.18 kpc from Sagittarius A* (GRAVITY Collaboration 2019)
//  - central bar ~5 kpc long, near end at positive longitude, ~27 deg to the Sun line
//  - four main logarithmic spiral arms, pitch ~12 deg; the Sun sits between the
//    Sagittarius-Carina arm (inside) and the Perseus arm (outside), on the Orion spur
//  - exponential thin disk (scale length ~2.6 kpc, height ~300 pc), dust in a ~100 pc layer
// Individual particles are illustrative; the large-scale structure follows these numbers.

import * as THREE from 'three';
import { Cloud, glowMaterial, dustMaterial } from './particles.js';
import { tempToColor, mulberry, gauss } from './astro.js';

export const GC_DIST = 8178;          // pc
const PITCH = Math.tan(12 * Math.PI / 180);
const ARM_PHASE = 14.02;              // puts an arm at 10.1 kpc (Perseus) on the Sun's side
// Perseus and Scutum-Centaurus are the two major (stellar) arms; Sagittarius-Carina and Norma are gas-rich minor arms.
const ARMS = [
  { phase: ARM_PHASE,                 w: 1.0, name: 'Perseus Arm' },
  { phase: ARM_PHASE - Math.PI / 2,   w: 0.5, name: 'Sagittarius-Carina Arm' },
  { phase: ARM_PHASE - Math.PI,       w: 0.45, name: 'Norma Arm' },
  { phase: ARM_PHASE - 1.5 * Math.PI, w: 1.0, name: 'Scutum-Centaurus Arm' },
];
const ARM_W = ARMS.reduce((s, a) => s + a.w, 0);
function pickArm(rand) {
  let u = rand() * ARM_W;
  for (const a of ARMS) { if ((u -= a.w) <= 0) return a; }
  return ARMS[0];
}
const SPUR_PHASE = 13.096;            // Orion-Cygnus spur through r ~ 8.3 kpc at the Sun
const BAR_ANGLE = 27 * Math.PI / 180;

// angle about the galactic centre (atan2(z, x) in GC-centred coordinates) at radius r on an arm
const armAngle = (phase, r) => phase - Math.log(r / 1000) / PITCH;

function pushPolar(c, r, phi, h, col, s) {
  c.push(r * Math.cos(phi), h, r * Math.sin(phi), col.r, col.g, col.b, s);
}

export function buildMilkyWay() {
  const rand = mulberry(8178);
  const stars = new Cloud(400000);
  const glow = new Cloud(30000);
  const dust = new Cloud(90000);
  const knots = new Cloud(8000);   // compact bright things: H II regions, young clusters, globulars
  const col = new THREE.Color();
  const tint = (T, k) => tempToColor(T, col).multiplyScalar(k);

  // --- thin disk, arm stars and inter-arm field ---
  for (let i = 0; i < 230000; i++) {
    // exponential disk radius (gamma(2) for surface density), with a central hole the bar fills
    let r = -2600 * Math.log(rand() * rand());
    if (r > 17000 || r < 1800 * rand()) { i--; continue; }
    const inArm = rand() < 0.62 && r > 3000;
    let phi, young;
    if (inArm) {
      const pick = rand();
      const arm = pick < 0.07 ? null : pickArm(rand);
      if (!arm) {
        // Orion spur: short segment around the Sun
        r = 7600 + rand() * 1600;
        phi = armAngle(SPUR_PHASE, r);
      } else {
        phi = armAngle(arm.phase, r);
      }
      const spread = (380 + r * 0.05) / r;
      phi += gauss(rand) * spread;
      young = rand() < 0.55;
    } else {
      phi = rand() * Math.PI * 2;
      young = rand() < 0.08;
    }
    const hScale = young ? 90 : 300 * (0.7 + r / 16000);
    const h = gauss(rand) * hScale * 0.6;
    const T = young ? 7000 + rand() * 16000 : 3600 + rand() * 2800;
    const k = young ? 0.10 + rand() * 0.10 : 0.045 + rand() * 0.035;
    pushPolar(stars, r, phi, h, tint(T, k), young ? 55 + rand() * 50 : 70 + rand() * 60);
  }

  // --- the bar and boxy/peanut bulge ---
  const cb = Math.cos(BAR_ANGLE), sb = Math.sin(BAR_ANGLE);
  for (let i = 0; i < 70000; i++) {
    const u = gauss(rand) * 1500, v = gauss(rand) * 520, w = gauss(rand) * 420 * (1 + Math.abs(u) / 3000);
    // bar axis points from the centre toward the near end (towards the Sun, at positive longitude)
    const x = -u * cb, z = -u * sb;
    const xx = x + v * -sb * -1, zz = z + v * cb * -1;
    const T = 3500 + rand() * 1800;
    const k = 0.06 + rand() * 0.05;
    tint(T, k);
    stars.push(xx, w, zz, col.r, col.g, col.b, 70 + rand() * 60);
  }
  // nuclear star cluster / central glow
  for (let i = 0; i < 9000; i++) {
    const s = 60 + 350 * Math.pow(rand(), 2.5);
    const x = gauss(rand) * s, y = gauss(rand) * s * 0.7, z = gauss(rand) * s;
    tint(4200 + rand() * 1500, 0.05 + rand() * 0.05);
    stars.push(x, y, z, col.r, col.g, col.b, 40 + rand() * 40);
  }

  // --- unresolved starlight: large soft particles give the disk and bulge a continuous glow ---
  for (let i = 0; i < 9000; i++) {
    const r = -2700 * Math.log(rand() * rand());
    if (r > 16500) { i--; continue; }
    const onArm = r > 3000 && rand() < 0.55;
    const phi = onArm ? armAngle(pickArm(rand).phase, r) + gauss(rand) * (650 + r * 0.06) / r : rand() * Math.PI * 2;
    const T = r < 3500 ? 4200 + rand() * 600 : onArm ? 6500 + rand() * 5000 : 4800 + rand() * 1200;
    tint(T, (onArm ? 0.016 : 0.011) * (0.6 + rand() * 0.8));
    pushPolar(glow, r, phi, gauss(rand) * 180, col, 650 + rand() * 900);
  }
  for (let i = 0; i < 3000; i++) {
    const u = gauss(rand) * 1300, v = gauss(rand) * 600, w = gauss(rand) * 480;
    tint(4100 + rand() * 500, 0.017 + rand() * 0.012);
    glow.push(-u * cb + v * sb, w, -u * sb - v * cb, col.r, col.g, col.b, 550 + rand() * 600);
  }

  // --- stellar halo and globular clusters ---
  for (let i = 0; i < 16000; i++) {
    const r = 1500 + 30000 * Math.pow(rand(), 2.2);
    const th = Math.acos(2 * rand() - 1), ph = rand() * Math.PI * 2;
    tint(4000 + rand() * 1500, 0.02);
    stars.push(r * Math.sin(th) * Math.cos(ph), r * Math.cos(th) * 0.7, r * Math.sin(th) * Math.sin(ph), col.r, col.g, col.b, 60);
  }
  for (let i = 0; i < 160; i++) {
    const r = 500 + 18000 * Math.pow(rand(), 1.8);
    const th = Math.acos(2 * rand() - 1), ph = rand() * Math.PI * 2;
    tint(5200, 0.9);
    knots.push(r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), r * Math.sin(th) * Math.sin(ph), col.r, col.g, col.b, 18);
  }

  // --- star forming regions (H II glow: hydrogen alpha pink) and young blue clusters along the arms ---
  const ha = new THREE.Color(1.0, 0.22, 0.38);
  for (let i = 0; i < 5200; i++) {
    const arm = rand() < 0.1 ? null : pickArm(rand);
    const r = arm ? 3200 + 10500 * Math.pow(rand(), 1.5) : 7600 + rand() * 1600;
    let phi = armAngle(arm ? arm.phase : SPUR_PHASE, r) + gauss(rand) * 130 / r - 90 / r;
    const k = 0.15 + rand() * 0.38;
    const h = gauss(rand) * 50;
    if (rand() < 0.55) {
      knots.push(r * Math.cos(phi), h, r * Math.sin(phi), ha.r * k, ha.g * k, ha.b * k, 70 + rand() * 160);
    } else {
      tint(14000 + rand() * 15000, 0.5 + rand() * 0.8);
      knots.push(r * Math.cos(phi), h, r * Math.sin(phi), col.r, col.g, col.b, 30 + rand() * 40);
    }
  }

  // --- dust: dark lanes on the inner (concave) edge of each arm, and a thin general layer ---
  for (let i = 0; i < 80000; i++) {
    let r, phi;
    if (rand() < 0.7) {
      const arm = rand() < 0.08 ? null : pickArm(rand);
      r = arm ? 2600 + 13000 * Math.pow(rand(), 1.1) : 7600 + rand() * 1600;
      phi = armAngle(arm ? arm.phase : SPUR_PHASE, r) + (gauss(rand) * 170 - 170) / r;
    } else {
      r = -3200 * Math.log(rand() * rand());
      if (r > 15000) { i--; continue; }
      phi = rand() * Math.PI * 2;
    }
    const k = 0.10 + rand() * 0.18;
    const h = gauss(rand) * 55;
    dust.push(r * Math.cos(phi), h, r * Math.sin(phi), 0.55 * k, 0.75 * k, 1.0 * k, 160 + rand() * 260);
  }
  // dust lanes along the leading edges of the bar
  for (let i = 0; i < 2500; i++) {
    const u = (600 + rand() * 2600) * (rand() < 0.5 ? 1 : -1);
    const v = Math.sign(u) * (300 + gauss(rand) * 140);
    const x = -u * cb + v * sb, z = -u * sb - v * cb;
    const k = 0.05 + rand() * 0.07;
    dust.push(x, gauss(rand) * 40, z, 0.55 * k, 0.75 * k, k, 200 + rand() * 200);
  }

  const group = new THREE.Group();
  group.name = 'Milky Way';
  const starMat = glowMaterial({ opacity: 1, maxPx: 16 });
  const glowMat = glowMaterial({ opacity: 1, maxPx: 40 });
  const dustMat = dustMaterial({ opacity: 1, maxPx: 120 });
  const knotMat = glowMaterial({ opacity: 1, maxPx: 10 });
  const pStars = stars.points(starMat);
  const pDust = dust.points(dustMat);
  const pGlow = glow.points(glowMat);
  const pKnots = knots.points(knotMat);
  pStars.renderOrder = 1; pDust.renderOrder = 2; pGlow.renderOrder = 3; pKnots.renderOrder = 4;
  group.add(pStars, pDust, pGlow, pKnots);
  group.position.set(GC_DIST, 0, 0);
  group.userData.materials = [starMat, glowMat, dustMat, knotMat];
  return group;
}

export const ARM_LABELS = ARMS.map((a) => a.name);
