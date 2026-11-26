// Other galaxies: positions (RA, Dec, distance) from published catalogues
// (Local Group: McConnachie 2012; others: NED / literature mean distances), rounded.
// Diameters are approximate optical sizes. Disk orientation uses measured
// inclination and position angle where well known; otherwise a fixed random one.
// The particle structure inside each galaxy is an artistic rendering of its type.

import * as THREE from 'three';
import { Cloud, glowMaterial, dustMaterial } from './particles.js';
import { raDecToWorld, eqVecToWorld, tempToColor, mulberry, gauss, seeded, DEG } from './astro.js';

// name, ra, dec, dist (kpc), morphology, kind, diameter (kpc), inclination, PA, note
export const GALAXIES = [
  ['Andromeda Galaxy (M31)', 10.6847, 41.2690, 765, 'SA(s)b', 'spiral', 46, 77, 38, 'The nearest large galaxy. About a trillion stars, on course to merge with the Milky Way in roughly 4.5 billion years.'],
  ['Triangulum Galaxy (M33)', 23.4621, 30.6599, 840, 'SA(s)cd', 'spiral', 18, 55, 23, 'Third largest member of the Local Group, rich in star forming regions.'],
  ['Large Magellanic Cloud', 80.894, -69.756, 50, 'SB(s)m', 'magellanic', 9.5, 35, 150, 'Satellite of the Milky Way, home of the Tarantula Nebula, the most active star forming region in the Local Group.'],
  ['Small Magellanic Cloud', 13.187, -72.829, 62, 'SB(s)m pec', 'irregular', 5.8, 60, 45, 'Dwarf irregular satellite of the Milky Way, visible to the naked eye from the southern hemisphere.'],
  ['Sagittarius Dwarf', 283.831, -30.545, 26, 'dSph', 'stream', 3, 80, 105, 'Being torn apart by the Milky Way; its stars trail around our galaxy in a long stream.'],
  ['M32', 10.6743, 40.8652, 765, 'cE2', 'elliptical', 2, 0, 0, 'Compact elliptical satellite of Andromeda.'],
  ['M110 (NGC 205)', 10.092, 41.6853, 824, 'dE5', 'elliptical', 5, 0, 170, 'Dwarf elliptical satellite of Andromeda.'],
  ['NGC 185', 9.7415, 48.3374, 617, 'dE3', 'elliptical', 3, 0, 35, 'Dwarf spheroidal satellite of Andromeda.'],
  ['NGC 147', 8.3005, 48.5087, 712, 'dE5', 'elliptical', 3, 0, 25, 'Dwarf spheroidal satellite of Andromeda.'],
  ['Andromeda II', 19.1242, 33.4192, 652, 'dSph', 'dwarf', 2.2],
  ['IC 10', 5.0721, 59.3039, 794, 'dIrr', 'irregular', 2, null, null, 'The only starburst galaxy in the Local Group.'],
  ['NGC 6822 (Barnard\'s Galaxy)', 296.2404, -14.8031, 459, 'IB(s)m', 'irregular', 2.2],
  ['IC 1613', 16.1992, 2.1178, 755, 'dIrr', 'irregular', 3.3],
  ['WLM', 0.4923, -15.4608, 933, 'dIrr', 'irregular', 3.4],
  ['Leo A', 149.8604, 30.7464, 798, 'dIrr', 'irregular', 1.5],
  ['Pegasus Dwarf Irregular', 352.1512, 14.7431, 920, 'dIrr', 'irregular', 1.5],
  ['Phoenix Dwarf', 27.7762, -44.4447, 415, 'dIrr/dSph', 'dwarf', 0.9],
  ['Tucana Dwarf', 340.4567, -64.4194, 887, 'dSph', 'dwarf', 0.8],
  ['Cetus Dwarf', 6.5458, -11.0444, 755, 'dSph', 'dwarf', 1.4],
  ['Aquarius Dwarf (DDO 210)', 311.7158, -12.8478, 1066, 'dIrr', 'irregular', 1],
  ['Draco Dwarf', 260.0517, 57.9153, 76, 'dSph', 'dwarf', 0.9],
  ['Ursa Minor Dwarf', 227.2854, 67.2225, 76, 'dSph', 'dwarf', 0.9],
  ['Sculptor Dwarf', 15.0392, -33.7092, 86, 'dSph', 'dwarf', 1.4],
  ['Sextans Dwarf', 153.2625, -1.6147, 86, 'dSph', 'dwarf', 1.5],
  ['Carina Dwarf', 100.4029, -50.9661, 105, 'dSph', 'dwarf', 0.8],
  ['Fornax Dwarf', 39.9971, -34.4492, 147, 'dSph', 'dwarf', 2],
  ['Leo I', 152.1171, 12.3065, 254, 'dSph', 'dwarf', 1],
  ['Leo II', 168.37, 22.1517, 233, 'dSph', 'dwarf', 0.6],
  ['NGC 3109', 150.7808, -26.1597, 1300, 'SB(s)m', 'irregular', 8, 75, 93],
  ['Sextans A', 152.7533, -4.6928, 1430, 'dIrr', 'irregular', 2.5],
  ['Sextans B', 150.0004, 5.3322, 1430, 'dIrr', 'irregular', 2.5],
  ['Bode\'s Galaxy (M81)', 148.8882, 69.0653, 3600, 'SA(s)ab', 'spiral', 28, 59, 157, 'Grand design spiral, the brightest galaxy of the M81 group.'],
  ['Cigar Galaxy (M82)', 148.9685, 69.6797, 3530, 'I0', 'starburst', 12, 80, 65, 'Starburst galaxy, its star formation stirred up by an encounter with M81.'],
  ['Sculptor Galaxy (NGC 253)', 11.888, -25.288, 3500, 'SAB(s)c', 'spiral', 27, 76, 52, 'Dusty starburst spiral, one of the brightest galaxies in the sky.'],
  ['Centaurus A', 201.365, -43.019, 3800, 'S0 pec', 'lenticular', 30, 60, 35, 'Giant galaxy crossed by a dark dust lane, with an active supermassive black hole.'],
  ['IC 342', 56.7021, 68.0961, 3300, 'SAB(rs)cd', 'spiral', 23, 31, 37, 'Large face-on spiral hidden behind the Milky Way\'s dust.'],
  ['Southern Pinwheel (M83)', 204.2538, -29.8658, 4900, 'SAB(s)c', 'barred', 17, 24, 45],
  ['Pinwheel Galaxy (M101)', 210.8023, 54.3489, 6900, 'SAB(rs)cd', 'spiral', 52, 18, 39, 'Face-on grand design spiral almost twice the size of the Milky Way.'],
  ['Whirlpool Galaxy (M51)', 202.4696, 47.1952, 8600, 'SA(s)bc pec', 'spiral', 23, 22, 163, 'Classic spiral interacting with its small companion NGC 5195.'],
  ['Sombrero Galaxy (M104)', 189.9976, -11.6231, 9550, 'SA(s)a', 'sombrero', 15, 84, 90, 'Seen almost edge-on, with a bright bulge and a striking dust lane.'],
  ['M87', 187.7059, 12.3911, 16400, 'E0', 'giant-elliptical', 40, 0, 0, 'Giant elliptical at the heart of the Virgo Cluster. Its black hole was the first ever imaged (2019).'],
].map(([name, ra, dec, dkpc, morph, kind, diam, inc, pa, note]) => ({ name, ra, dec, dist: dkpc * 1000, morph, kind, diam: diam * 1000, inc, pa, note }));

function orientation(g) {
  const pos = raDecToWorld(g.ra, g.dec, 1);
  const a = g.ra * DEG, d = g.dec * DEG;
  const east = eqVecToWorld(-Math.sin(a), Math.cos(a), 0);
  const north = eqVecToWorld(-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d));
  const rnd = seeded(g.name);
  const inc = (g.inc ?? rnd() * 80) * DEG, pa = (g.pa ?? rnd() * 180) * DEG;
  const major = north.clone().multiplyScalar(Math.cos(pa)).addScaledVector(east, Math.sin(pa));
  const minor = north.clone().multiplyScalar(-Math.sin(pa)).addScaledVector(east, Math.cos(pa));
  const normal = pos.clone().multiplyScalar(-Math.cos(inc)).addScaledVector(minor, Math.sin(inc)).normalize();
  const third = new THREE.Vector3().crossVectors(major, normal).normalize();
  return new THREE.Matrix4().makeBasis(major, normal, third);
}

// Build one galaxy in its own frame: disk in the XZ plane, normal along +Y, units pc.
function buildOne(g, rand) {
  const R = g.diam / 2;
  const stars = new Cloud(1000), glow = new Cloud(200), dust = new Cloud(200);
  const c = new THREE.Color();
  const T = (t, k) => tempToColor(t, c).multiplyScalar(k);
  const big = g.diam > 10000;
  const n = Math.round(THREE.MathUtils.clamp(g.diam * 1.3, 1500, 60000));
  const pSize = R * 0.05;

  const spiral = (arms, pitchDeg, barLen, armFrac, bulgeFrac) => {
    const k = Math.tan(pitchDeg * DEG);
    const phase0 = rand() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const u = rand();
      if (u < bulgeFrac) {
        const s = R * 0.12;
        T(3800 + rand() * 1600, 0.10 + rand() * 0.08);
        stars.push(gauss(rand) * s, gauss(rand) * s * 0.65, gauss(rand) * s, c.r, c.g, c.b, pSize * 0.9);
        continue;
      }
      let r = -R * 0.3 * Math.log(rand() * rand());
      if (r > R * 1.1) { i--; continue; }
      let phi;
      const young = rand() < armFrac;
      if (barLen && r < barLen && rand() < 0.6) {
        phi = phase0 + (rand() < 0.5 ? 0 : Math.PI) + gauss(rand) * 0.12;
        r = rand() * barLen;
      } else if (young || rand() < 0.4) {
        const arm = Math.floor(rand() * arms);
        const r0 = Math.max(r, barLen || R * 0.08);
        phi = phase0 + arm * 2 * Math.PI / arms - Math.log(r0 / (barLen || R * 0.08)) / k + gauss(rand) * (0.07 + 0.06 * R / Math.max(r, 1)) * 0.6;
      } else phi = rand() * Math.PI * 2;
      const h = gauss(rand) * R * (young ? 0.008 : 0.025);
      if (young) T(8000 + rand() * 16000, 0.16 + rand() * 0.14); else T(3800 + rand() * 2600, 0.07 + rand() * 0.05);
      stars.push(r * Math.cos(phi), h, r * Math.sin(phi), c.r, c.g, c.b, pSize * (young ? 0.8 : 1.1));
      if (young && rand() < 0.08) {
        const kk = 0.4 + rand() * 0.6;
        glow.push(r * Math.cos(phi), h, r * Math.sin(phi), 1.0 * kk, 0.25 * kk, 0.4 * kk, pSize * (0.8 + rand()));
      }
      if (rand() < 0.22) {
        const off = -0.04 * R / Math.max(r, R * 0.1);
        const kk = 0.15 + rand() * 0.2;
        dust.push(r * Math.cos(phi + off), h * 0.5, r * Math.sin(phi + off), 0.55 * kk, 0.75 * kk, kk, pSize * 2.6);
      }
    }
  };

  const blob = (count, sx, sy, sz, tMin, tMax, kMin, kMax, size, sersic = 2.5) => {
    for (let i = 0; i < count; i++) {
      // de Vaucouleurs-like concentration: many stars near the centre, long faint wings
      const rr = Math.pow(rand(), sersic);
      const x = gauss(rand) * sx * rr * 2, y = gauss(rand) * sy * rr * 2, z = gauss(rand) * sz * rr * 2;
      T(tMin + rand() * (tMax - tMin), kMin + rand() * (kMax - kMin));
      stars.push(x, y, z, c.r, c.g, c.b, size);
    }
  };

  switch (g.kind) {
    case 'spiral': spiral(2 + (rand() < 0.4 ? 2 : 0), 14 + rand() * 8, 0, 0.45, 0.16); break;
    case 'barred': spiral(2, 16, R * 0.25, 0.45, 0.10); break;
    case 'magellanic': {
      // off-centre bar plus a lopsided disk and the Tarantula nebula
      blob(n * 0.35, R * 0.25, R * 0.06, R * 0.08, 4000, 7000, 0.08, 0.16, pSize, 1.2);
      for (let i = 0; i < n * 0.65; i++) {
        const r = R * 0.55 * Math.sqrt(-Math.log(rand()));
        const phi = rand() * Math.PI * 2;
        const young = rand() < 0.4;
        if (young) T(9000 + rand() * 14000, 0.14 + rand() * 0.1); else T(4200 + rand() * 2000, 0.06 + rand() * 0.04);
        stars.push(r * Math.cos(phi) + R * 0.12, gauss(rand) * R * 0.03, r * Math.sin(phi) * 0.85 - R * 0.05, c.r, c.g, c.b, pSize);
      }
      for (let i = 0; i < 120; i++) {
        const kk = 0.6 + rand() * 1.4;
        glow.push(R * 0.35 + gauss(rand) * R * 0.03, gauss(rand) * R * 0.01, -R * 0.12 + gauss(rand) * R * 0.03, 1.0 * kk, 0.22 * kk, 0.4 * kk, pSize * 1.4);
      }
      break;
    }
    case 'irregular': case 'starburst': {
      const clumps = 5 + Math.floor(rand() * 6);
      const cs = [];
      for (let j = 0; j < clumps; j++) cs.push([gauss(rand) * R * 0.35, gauss(rand) * R * 0.12, gauss(rand) * R * (g.kind === 'starburst' ? 0.1 : 0.3)]);
      for (let i = 0; i < n; i++) {
        const cc = cs[Math.floor(rand() * clumps)];
        const s = R * (0.12 + rand() * 0.25);
        const young = rand() < 0.45;
        if (young) T(8000 + rand() * 16000, 0.13 + rand() * 0.1); else T(4000 + rand() * 2500, 0.06 + rand() * 0.04);
        stars.push(cc[0] + gauss(rand) * s, cc[1] + gauss(rand) * s * 0.5, cc[2] + gauss(rand) * s, c.r, c.g, c.b, pSize);
        if (young && rand() < (g.kind === 'starburst' ? 0.25 : 0.07)) {
          const kk = 0.4 + rand() * 0.7;
          glow.push(cc[0] + gauss(rand) * s * 0.6, cc[1] + gauss(rand) * s * (g.kind === 'starburst' ? 2.5 : 0.4), cc[2] + gauss(rand) * s * 0.6, kk, 0.22 * kk, 0.38 * kk, pSize * 1.5);
        }
      }
      break;
    }
    case 'elliptical': blob(n, R * 0.3, R * 0.2, R * 0.25, 3800, 5200, 0.07, 0.12, pSize); break;
    case 'giant-elliptical': blob(n, R * 0.3, R * 0.28, R * 0.3, 3700, 5000, 0.08, 0.13, pSize); break;
    case 'dwarf': blob(n * 0.6, R * 0.3, R * 0.22, R * 0.26, 3800, 5600, 0.035, 0.06, pSize * 1.2, 1.4); break;
    case 'stream': {
      blob(n * 0.4, R * 0.4, R * 0.15, R * 0.15, 3800, 5600, 0.04, 0.07, pSize, 1.3);
      break;
    }
    case 'lenticular': case 'sombrero': {
      blob(n * 0.55, R * 0.22, R * (g.kind === 'sombrero' ? 0.14 : 0.2), R * 0.22, 3800, 5200, 0.08, 0.13, pSize);
      for (let i = 0; i < n * 0.45; i++) {
        const r = R * 0.35 * -Math.log(rand() * rand() + 1e-6) * 0.6;
        if (r > R) { i--; continue; }
        const phi = rand() * Math.PI * 2;
        T(4200 + rand() * 1800, 0.07 + rand() * 0.04);
        stars.push(r * Math.cos(phi), gauss(rand) * R * 0.015, r * Math.sin(phi), c.r, c.g, c.b, pSize);
      }
      // the famous dust ring
      for (let i = 0; i < n * 0.3; i++) {
        const r = R * (g.kind === 'sombrero' ? 0.62 : 0.3) + gauss(rand) * R * 0.05;
        const phi = rand() * Math.PI * 2;
        const kk = 0.25 + rand() * 0.25;
        dust.push(r * Math.cos(phi), gauss(rand) * R * (g.kind === 'sombrero' ? 0.006 : 0.05), r * Math.sin(phi), 0.55 * kk, 0.75 * kk, kk, pSize * 2.2);
      }
      break;
    }
  }
  // Normalise surface brightness: particle count grows with size, so dim each particle to match
  // the Milky Way's disk, and make the dwarfs fainter as they really are.
  const typeK = { dwarf: 0.35, stream: 0.3, elliptical: 0.8, 'giant-elliptical': 0.9, irregular: 0.75, magellanic: 0.8, starburst: 0.9 }[g.kind] ?? 1;
  const f = Math.min(1.2, 3600 / n) * typeK;
  for (let i = 0; i < stars.n * 3; i++) stars.col[i] *= f;
  for (let i = 0; i < glow.n * 3; i++) glow.col[i] *= Math.min(1, f * 2.5);
  const fd = Math.min(1, f * 2.2);
  for (let i = 0; i < dust.n * 3; i++) dust.col[i] *= fd;
  return { stars, glow, dust };
}

export function buildGalaxies() {
  const root = new THREE.Group();
  root.name = 'galaxies';
  const starMat = glowMaterial({ opacity: 1, maxPx: 40 });
  const glowMat = glowMaterial({ opacity: 1, maxPx: 60 });
  const dustMat = dustMaterial({ opacity: 1, maxPx: 90 });
  GALAXIES.forEach((g, idx) => {
    const rand = mulberry(1000 + idx * 7919);
    const { stars, glow, dust } = buildOne(g, rand);
    const grp = new THREE.Group();
    if (stars.n) { const p = stars.points(starMat); p.renderOrder = 1; grp.add(p); }
    if (dust.n) { const p = dust.points(dustMat); p.renderOrder = 2; grp.add(p); }
    if (glow.n) { const p = glow.points(glowMat); p.renderOrder = 3; grp.add(p); }
    const m = orientation(g);
    grp.quaternion.setFromRotationMatrix(m);
    if (g.kind === 'stream') grp.scale.set(3, 1, 1);
    g.position = raDecToWorld(g.ra, g.dec, g.dist);
    grp.position.copy(g.position);
    grp.userData.galaxy = g;
    root.add(grp);
  });
  return root;
}

// A faint backdrop of distant galaxies, visible once you leave the Milky Way.
// Directions are random and only illustrative of the deep sky.
export function buildDeepField() {
  const rand = mulberry(42);
  const N = 9000;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const z = 2 * rand() - 1, t = rand() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    pos.set([s * Math.cos(t), z, s * Math.sin(t)], i * 3);
    tempToColor(rand() < 0.6 ? 4300 + rand() * 1500 : 7000 + rand() * 6000, c).multiplyScalar(0.25 + Math.pow(rand(), 5) * 1.5);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = 1.2 + Math.pow(rand(), 6) * 3.5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uPR: { value: 1 } },
    vertexShader: `attribute vec3 color; attribute float size; uniform float uPR; varying vec3 vC;
      void main(){ vC = color; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position = p.xyww; gl_PointSize = size * uPR; }`,
    fragmentShader: `uniform float uOpacity; varying vec3 vC;
      void main(){ vec2 p = gl_PointCoord*2.-1.; float g = exp(-dot(p,p)*3.5); gl_FragColor = vec4(vC*g*uOpacity, 1.); }`,
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -10;
  return pts;
}
