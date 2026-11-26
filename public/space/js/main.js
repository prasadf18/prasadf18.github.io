import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { OrbitRig } from './controls.js';
import { Universe } from './universe.js';
import { StarSystem } from './system.js';
import { PLANETS, MOONS, SUN } from './solar.js';
import { AU_PC, PC_LY, AU_KM, R_EARTH_AU, R_SUN_AU, fmtDist, fmtAU, galToWorld } from './astro.js';
import { GC_DIST } from './milkyway.js';
import { initTextures } from './textures.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const ui = {
  loading: $('#loading'), loadBar: $('#loading .bar i'), loadText: $('#loading .msg'),
  intro: $('#intro'), begin: $('#begin'), tourBtn: $('#tour'), explore: $('#explore'),
  labels: $('#labels'), tooltip: $('#tooltip'), info: $('#info'), crumbs: $('#crumbs'), scale: $('#scale'),
  time: $('#time'), date: $('#date'), warp: $('#warp'), search: $('#search'), results: $('#results'),
  caption: $('#caption'), toggles: $('#toggles'), hint: $('#hint'),
};

// ---------- state ----------
const state = {
  mode: 'universe',
  system: null,
  hostIndex: -1,
  selected: null,
  hover: null,
  simMs: Date.now(),
  warpIndex: 4,
  paused: false,
  clock: 0,
  tour: null,
  opts: { labels: true, orbits: true, hosts: true, stars: true, milkyway: true, galaxies: true, rings: true, hz: true },
};
const WARPS = [
  [-31557600, '-1 year / s'], [-86400, '-1 day / s'], [1, 'Real time'], [3600, '1 hour / s'], [86400, '1 day / s'],
  [604800, '1 week / s'], [2629800, '1 month / s'], [31557600, '1 year / s'],
];

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
const PR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x000000, 1);

const uniCam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1e-8, 1e11);
const sysCam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1e-9, 1e8);

const uniRig = new OrbitRig(canvas, uniCam, { dist: 70000, minDist: 2e-4, maxDist: 6e7, pitch: 0.75 });
const sysRig = new OrbitRig(canvas, sysCam, { dist: 50, minDist: 1e-7, maxDist: 2e6 });
uniRig.active = true;

let universe, composer, uniPass, sysPass, bloom;
let hosts = [], solarSystem = null, land = null;

// ---------- loading ----------
async function load() {
  const step = (t, p) => { ui.loadText.textContent = t; ui.loadBar.style.width = `${p}%`; };
  step('Reading the NASA Exoplanet Archive', 10);
  const [exo, starsBuf, starNames, landData] = await Promise.all([
    fetch('data/exoplanets.json').then((r) => r.json()),
    fetch('data/stars.bin').then((r) => r.arrayBuffer()),
    fetch('data/starnames.json').then((r) => r.json()),
    fetch('data/land.json').then((r) => r.json()),
  ]);
  land = landData;
  initTextures(renderer, land);
  step('Placing 27,000 stars and 4,800 planetary systems', 45);
  await frame();

  const sunHost = { n: 'Sun', isSun: true, pos: new THREE.Vector3(0, 0, 0), t: 5772, r: 1, m: 1, lum: 1, d: 0, s: 'G2 V', pl: PLANETS.filter((p) => !p.dwarf).map((p) => ({ n: p.name })) };
  hosts = [sunHost];
  for (const h of exo.hosts) {
    if (!h.p) continue;
    h.pos = new THREE.Vector3(...h.p);
    h.lum = h.l != null ? Math.pow(10, h.l) : Math.pow(h.r ?? 0.8, 2) * Math.pow((h.t ?? 5000) / 5772, 4);
    hosts.push(h);
  }
  state.totalPlanets = exo.hosts.reduce((s, h) => s + h.pl.length, 0);
  state.totalHosts = exo.hosts.length;

  step('Building the Milky Way and its neighbours', 70);
  await frame();
  universe = new Universe({ hosts, starsBuf, starNames });

  composer = new EffectComposer(renderer);
  uniPass = new RenderPass(universe.scene, uniCam);
  sysPass = new RenderPass(new THREE.Scene(), sysCam);
  sysPass.clear = false;
  sysPass.clearDepth = true;
  sysPass.enabled = false;
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.6, 0.72);
  composer.addPass(uniPass);
  composer.addPass(sysPass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  buildSearchIndex(starNames);
  step('Ready', 100);
  document.querySelectorAll('[data-count=planets]').forEach((e) => (e.textContent = state.totalPlanets.toLocaleString()));
  document.querySelectorAll('[data-count=hosts]').forEach((e) => (e.textContent = state.totalHosts.toLocaleString()));
  document.querySelectorAll('[data-count=galaxies]').forEach((e) => (e.textContent = universe.galaxyList.length));
  // cinematic idle: the galaxy turning slowly from above
  uniRig.target.set(GC_DIST, 0, 0);
  uniRig.dist = 62000; uniRig.pitch = 0.95; uniRig.yaw = -2.2; uniRig.idleSpin = 0.025;
  window.knownWorlds = { state, hosts, uniRig, sysRig, enterSystem, exitSystem, focusBody, goToSolarBody, goToExoPlanet, flyToHost, flyToGalaxy, flyToMilkyWay, hideIntro };
  setTimeout(() => ui.loading.classList.add('done'), 200);
  ui.intro.classList.add('show');
  requestAnimationFrame(loop);
}
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

// ---------- helpers ----------
const pxWorld = (cam) => (2 * Math.tan((cam.fov * Math.PI) / 360)) / innerHeight;
function hostExtentAU(h) {
  if (h.isSun) return 50;
  let m = 0;
  for (const p of h.pl) { let a = p.a; if (!a && p.P) a = Math.cbrt((h.m ?? 1) * Math.pow(p.P / 365.25, 2)); if (a) m = Math.max(m, a * (1 + (p.e || 0))); }
  return Math.max(m, 0.05);
}
const enterDistAU = (h) => Math.max(400, hostExtentAU(h) * 12);
const project = (v, cam, out) => {
  out.copy(v).project(cam);
  return out.z < 1 && out.z > -1 ? [((out.x + 1) / 2) * innerWidth, ((1 - out.y) / 2) * innerHeight] : null;
};
const _p = new THREE.Vector3();
const _p2 = new THREE.Vector3();

// ---------- entering and leaving systems ----------
function getSystem(h) {
  if (h.isSun) {
    if (!solarSystem) solarSystem = new StarSystem(h, { land, isSolar: true });
    return solarSystem;
  }
  return new StarSystem(h, { land, isSolar: false });
}

function enterSystem(index, { focus = null, keepMomentum = false } = {}) {
  const h = hosts[index];
  if (state.system && state.system !== solarSystem) state.system.dispose();
  showBusy(true);
  const sys = getSystem(h);
  showBusy(false);
  sys.advance(state.simMs);
  state.system = sys;
  state.hostIndex = index;
  state.mode = 'system';
  sysPass.scene = sys.scene;
  sysPass.enabled = true;
  uniRig.active = false; sysRig.active = true;
  uniRig.cancelFlight();
  sysRig.setUp(sys.orbitNormal);
  sysRig.target.set(0, 0, 0);
  sysRig.follow = null;
  sysRig.zoomFloor = null;
  _p.copy(uniCam.position).sub(h.pos);
  if (_p.lengthSq() < 1e-30) _p.set(0, 0.3, 1);
  sysRig.syncFromDirection(_p);
  sysRig.dist = Math.min(_p.length() / AU_PC, enterDistAU(h));
  if (keepMomentum) sysRig.vZoom = uniRig.vZoom;
  sysRig.update(0);
  state.focusBody = sys.star;
  if (focus) focusBody(focus);
  else if (!keepMomentum) sysRig.flyTo({ target: new THREE.Vector3(), dist: sys.extent * 2.6, pitch: Math.max(sysRig.pitch, 0.35), duration: 3.2 });
  select({ type: 'host', index });
  updateTimeUI();
}

function exitSystem({ keepMomentum = false } = {}) {
  if (state.mode !== 'system') return;
  const h = hosts[state.hostIndex];
  const index = state.hostIndex;
  state.mode = 'universe';
  sysPass.enabled = false;
  sysRig.active = false; uniRig.active = true;
  uniRig.target.copy(h.pos);
  _p.copy(sysCam.position).sub(sysRig.target);
  uniRig.setUp(new THREE.Vector3(0, 1, 0));
  uniRig.syncFromDirection(_p);
  uniRig.dist = Math.max(sysRig.dist * AU_PC, enterDistAU(h) * AU_PC * 1.25);
  uniRig.follow = () => h.pos;
  if (keepMomentum) uniRig.vZoom = Math.max(sysRig.vZoom, 0.5);
  state.cooldown = 1.0;
  if (state.system !== solarSystem) { state.system.dispose(); }
  state.system = null;
  state.hostIndex = -1;
  select({ type: 'host', index });
  updateTimeUI();
}

function focusBody(body, { duration = 3 } = {}) {
  const sys = state.system;
  state.focusBody = body;
  if (body.kind === 'star') {
    sysRig.zoomFloor = () => sys.starR * 1.6;
    sysRig.flyTo({ target: new THREE.Vector3(), dist: sys.extent * 2.6, duration });
  } else {
    sysRig.zoomFloor = () => body.R * 1.12;
    // approach from the day side, a little off the sun line, so the planet is lit
    const toSun = body.pos.clone().negate().normalize();
    const side = new THREE.Vector3().crossVectors(toSun, sysRig.up).normalize();
    const dir = toSun.multiplyScalar(0.8).addScaledVector(side, 0.55).addScaledVector(sysRig.up, 0.25).normalize();
    const tmp = new THREE.Vector3(); const basisInv = sysRig.basis.clone().invert();
    tmp.copy(dir).applyQuaternion(basisInv);
    const pitch = Math.asin(THREE.MathUtils.clamp(tmp.y, -1, 1)), yaw = Math.atan2(tmp.x, tmp.z);
    const close = body.R * (body.ringed ? 7 : 4.2);
    sysRig.flyTo({ follow: () => body.pos, dist: close, yaw, pitch, duration });
  }
  select({ type: 'body', body });
}

// ---------- navigation targets ----------
function flyToHost(index, { enter = false, then = null } = {}) {
  const h = hosts[index];
  const go = () => {
    const d = enter ? enterDistAU(h) * AU_PC * 0.7 : Math.max(0.35, Math.min(h.pos.length() * 0.08, 6));
    uniRig.flyTo({
      target: h.pos, follow: () => h.pos, dist: d, duration: flightTime(uniRig.target.distanceTo(h.pos), uniRig.dist, d),
      onDone: () => { if (enter) { enterSystem(index); then && then(); } },
    });
    select({ type: 'host', index });
  };
  if (state.mode === 'system') {
    if (state.hostIndex === index) { if (enter && then) then(); return; }
    exitSystem();
  }
  go();
}
function flightTime(sep, d0, d1) {
  const span = Math.log10(Math.max(sep, d0, d1) / Math.min(d0, d1) + 1);
  return THREE.MathUtils.clamp(2 + span * 0.55, 2.2, 6.5);
}
function flyToGalaxy(g) {
  if (state.mode === 'system') exitSystem();
  const d = g.diam * 1.6;
  uniRig.flyTo({ target: g.position, follow: () => g.position, dist: d, duration: flightTime(uniRig.target.distanceTo(g.position), uniRig.dist, d) });
  select({ type: 'galaxy', g });
}
function flyToMilkyWay() {
  if (state.mode === 'system') exitSystem();
  const t = new THREE.Vector3(GC_DIST, 0, 0);
  uniRig.flyTo({ target: t, follow: () => t, dist: 62000, pitch: 0.95, duration: flightTime(uniRig.target.distanceTo(t), uniRig.dist, 62000) });
  select({ type: 'milkyway' });
}
function flyToStar(s) {
  if (state.mode === 'system') exitSystem();
  const d = Math.max(0.5, s.dist * 0.05);
  uniRig.flyTo({ target: s.position, follow: () => s.position, dist: d, duration: flightTime(uniRig.target.distanceTo(s.position), uniRig.dist, d) });
  select({ type: 'star', s });
}
function goToSolarBody(key) {
  const run = () => { const b = state.system.bodies.find((x) => x.key === key || x.name === key); if (b) focusBody(b); };
  if (state.mode === 'system' && state.hostIndex === 0) return run();
  flyToHost(0, { enter: true, then: run });
}
function goToExoPlanet(hostIndex, planetName) {
  const run = () => { const b = state.system.bodies.find((x) => x.name === planetName); if (b) focusBody(b); };
  if (state.mode === 'system' && state.hostIndex === hostIndex) return run();
  flyToHost(hostIndex, { enter: true, then: run });
}

// ---------- selection and the info card ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtNum = (v, d = 2) => {
  if (v == null) return '—';
  if (d < 0) { const p = Math.pow(10, -d); return (Math.round(v / p) * p).toLocaleString(); }
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: d });
};
function fmtPeriod(days) {
  if (days == null) return '—';
  if (days < 2) return `${(days * 24).toFixed(1)} hours`;
  if (days < 800) return `${fmtNum(days, days < 10 ? 2 : 1)} days`;
  return `${fmtNum(days / 365.25, 1)} years`;
}
const lyStr = (pc) => `${fmtNum(pc * PC_LY, pc * PC_LY < 100 ? 2 : 0)} light-years`;

function select(sel) {
  state.selected = sel;
  renderInfo();
  universe.hostMat.uniforms.uSel.value = sel && sel.type === 'host' ? sel.index : -1;
}

function factGrid(obj) {
  return `<dl>${Object.entries(obj).filter(([, v]) => v != null && v !== '').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

function renderInfo() {
  const sel = state.selected;
  if (!sel) { ui.info.classList.remove('show'); return; }
  let html = '';
  if (sel.type === 'host') {
    const h = hosts[sel.index];
    const inside = state.mode === 'system' && state.hostIndex === sel.index;
    if (h.isSun) {
      html = `<div class="kicker">Our star</div><h2>The Sun</h2>
        <p>${SUN.note}</p>${factGrid(SUN.facts)}`;
    } else {
      html = `<div class="kicker">Star with ${h.pl.length} known planet${h.pl.length > 1 ? 's' : ''}${h.sn > 1 ? ` · ${h.sn}-star system` : ''}</div>
        <h2>${esc(h.n)}</h2>
        ${factGrid({
          'Distance': lyStr(h.d),
          'Spectral type': esc(h.s ?? '—'),
          'Temperature': h.t ? `${fmtNum(h.t, 0)} K` : '—',
          'Radius': h.r ? `${fmtNum(h.r)} x Sun` : '—',
          'Mass': h.m ? `${fmtNum(h.m)} x Sun` : '—',
          'Age': h.age ? `${fmtNum(h.age, 1)} billion years` : null,
        })}`;
    }
    const list = inside ? state.system.bodies.filter((b) => b.kind !== 'star') : null;
    if (list) {
      html += `<div class="list">${list.map((b, i) => `<button class="pl ${b.kind}" data-body="${i}"><span class="dot" style="background:${b.color}"></span>${esc(b.name)}${b.kind === 'moon' ? '' : `<em>${b.solar ? fmtAU(b.a) : b.a ? fmtAU(b.a) : ''}</em>`}</button>`).join('')}</div>`;
    } else if (!h.isSun) {
      html += `<div class="list">${h.pl.map((p) => `<button class="pl" data-planet="${esc(p.n)}"><span class="dot"></span>${esc(p.n)}<em>${p.R ? `${fmtNum(p.R, 1)} R⊕` : ''}</em></button>`).join('')}</div>`;
    }
    html += `<div class="actions">${inside
      ? `<button data-act="earthview" title="Look at this system from the direction of Earth">View from Earth</button><button data-act="exit">Back to the stars</button>`
      : `<button class="primary" data-act="enter">${h.isSun ? 'Enter the Solar System' : 'Visit this system'}</button>`}</div>`;
    if (!h.isSun) html += `<p class="src">Data: NASA Exoplanet Archive</p>`;
  } else if (sel.type === 'body') {
    const b = sel.body;
    if (b.kind === 'star') { select({ type: 'host', index: state.hostIndex }); return; }
    if (b.solar || b.moon) {
      const info = b.solar || b.moon;
      const distSun = b.pos.length();
      const extra = b.solar ? {
        'Radius': `${fmtNum(info.radius, 0)} km`, ...info.facts,
        'From the Sun now': `${fmtAU(distSun)} · light takes ${fmtLightTime(distSun)}`,
      } : {
        'Radius': `${fmtNum(info.radius, 0)} km`, 'Orbits': esc(b.parent.name), 'Distance': `${fmtNum(info.a, 0)} km`, 'Period': fmtPeriod(Math.abs(info.P)),
      };
      if (b.isEarth) delete extra['From the Sun now'];
      html = `<div class="kicker">${b.kind === 'moon' ? 'Moon' : info.dwarf ? 'Dwarf planet' : 'Planet'}</div><h2>${esc(b.name)}</h2><p>${esc(info.note)}</p>${factGrid(extra)}`;
      if (b.kind === 'moon' && b.key !== 'moon') html += `<p class="src">Moon orbits are to scale; their positions along the orbit are illustrative.</p>`;
    } else {
      const p = b.exo;
      const T = b.Teq;
      html = `<div class="kicker">Exoplanet · ${esc(b.clsInfo)}</div><h2>${esc(b.name)}</h2>
        ${factGrid({
          'Radius': p.R ? `${fmtNum(p.R)} x Earth${p.Re ? ' (estimated from mass)' : ''}` : 'unknown',
          'Mass': p.M ? `${fmtNum(p.M)} x Earth${p.M > 300 ? ` (${fmtNum(p.M / 317.8)} Jupiters)` : ''}` : 'unknown',
          'Orbit': `${fmtAU(b.a)}${p.ae ? ' (from period)' : ''}`,
          'Year': fmtPeriod(b.P),
          'Eccentricity': p.e != null ? fmtNum(p.e, 3) : null,
          'Temperature': T ? `about ${fmtNum(T, 0)} K (${fmtNum(T - 273, 0)} C)${p.T ? '' : ', estimated'}` : 'unknown',
          'Discovered': `${p.y || '—'} · ${esc(p.dm || '')}`,
          'By': esc(p.fac || '—'),
        })}
        <p class="src">The planet's look is an artist's impression from its size and temperature. Orbit sizes, periods and eccentricities are NASA data; orientation and current position along the orbit are estimated.</p>`;
    }
    html += `<div class="actions"><button data-act="star">Back to the star</button></div>`;
  } else if (sel.type === 'galaxy') {
    const g = sel.g;
    html = `<div class="kicker">Galaxy · ${esc(g.morph)}</div><h2>${esc(g.name)}</h2>
      ${g.note ? `<p>${esc(g.note)}</p>` : ''}
      ${factGrid({ 'Distance': fmtDist(g.dist), 'Diameter': `about ${fmtNum(g.diam * PC_LY, -3)} light-years`, 'Known planets': 'None confirmed yet' })}
      <p class="src">Every confirmed exoplanet is in our own galaxy. Position from published catalogues; the structure shown is an artistic rendering of its type.</p>`;
  } else if (sel.type === 'milkyway') {
    html = `<div class="kicker">Our galaxy</div><h2>The Milky Way</h2>
      <p>A barred spiral about 100,000 light-years across with a few hundred billion stars. Every planet we have ever confirmed is in here, nearly all within a few thousand light-years of the Sun.</p>
      ${factGrid({ 'Sun to centre': `${fmtNum(GC_DIST * PC_LY, -2)} light-years`, 'Central black hole': 'Sagittarius A*, 4 million Suns', 'Our orbit': 'about 230 million years' })}
      <p class="src">Arm layout follows published models of the Galaxy's structure; individual particles are illustrative.</p>`;
  } else if (sel.type === 'star') {
    const s = sel.s;
    html = `<div class="kicker">Star${s.con ? ` in ${esc(s.con)}` : ''}</div><h2>${esc(s.name)}</h2>
      ${factGrid({ 'Distance': lyStr(s.dist), 'Brightness from Earth': `magnitude ${fmtNum(s.mag)}`, 'Spectral type': esc(s.spect || '—') })}
      <p class="src">Star data: HYG catalogue (Hipparcos, Yale Bright Star, Gliese).</p>`;
  }
  ui.info.innerHTML = `<button class="close" data-act="close" aria-label="Close">×</button>${html}`;
  ui.info.classList.add('show');
}
const fmtLightTime = (au) => { const s = (au * AU_KM) / 299792.458; return s < 120 ? `${s.toFixed(0)} seconds` : s < 7200 ? `${(s / 60).toFixed(1)} minutes` : `${(s / 3600).toFixed(1)} hours`; };

ui.info.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  stopTour();
  const sel = state.selected;
  const act = t.dataset.act;
  if (act === 'close') { select(null); return; }
  if (act === 'enter' && sel?.type === 'host') { flyToHost(sel.index, { enter: true }); return; }
  if (act === 'exit') { exitSystem(); uniRig.flyTo({ target: uniRig.target.clone(), follow: uniRig.follow, dist: 2, duration: 2.5 }); return; }
  if (act === 'star') { focusBody(state.system.star); return; }
  if (act === 'earthview') { earthView(); return; }
  if (t.dataset.body != null) { const list = state.system.bodies.filter((b) => b.kind !== 'star'); focusBody(list[+t.dataset.body]); return; }
  if (t.dataset.planet) { goToExoPlanet(sel.index, t.dataset.planet); }
});

function earthView() {
  const sys = state.system;
  const h = hosts[state.hostIndex];
  if (h.isSun) { goToSolarBody('earth'); return; }
  const dir = h.pos.clone().negate().normalize();
  const tmp = dir.clone().applyQuaternion(sysRig.basis.clone().invert());
  sysRig.zoomFloor = () => sys.starR * 1.6;
  state.focusBody = sys.star;
  sysRig.flyTo({ target: new THREE.Vector3(), dist: sys.extent * 3, yaw: Math.atan2(tmp.x, tmp.z), pitch: Math.asin(THREE.MathUtils.clamp(tmp.y, -1, 1)), duration: 3 });
  caption('Looking from the direction of Earth. Transiting planets pass in front of their star along this line of sight, which is how most of them were found.', 7000);
}

// ---------- picking ----------
function pick(mx, my) {
  let best = null, bestD = 14;
  if (state.mode === 'system') {
    const cam = sysCam, pw = pxWorld(cam);
    for (const b of state.system.bodies) {
      if (b.hidden) continue;
      const s = project(b.pos, cam, _p); if (!s) continue;
      const rpx = b.vis / (b.camDist * pw);
      const d = Math.hypot(s[0] - mx, s[1] - my) - Math.max(rpx, 0);
      const bias = b.kind === 'star' ? 4 : 0;
      if (d + bias < bestD) { bestD = d + bias; best = { type: 'body', body: b }; }
    }
    if (best) return best;
    bestD = 10;
  }
  const cam = uniCam;
  if (state.opts.hosts) {
    const pos = universe.hostPoints.geometry.attributes.position.array;
    for (let i = 0; i < hosts.length; i++) {
      if (state.mode === 'system' && i === state.hostIndex) continue;
      _p2.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      const s = project(_p2, cam, _p); if (!s) continue;
      const d = Math.hypot(s[0] - mx, s[1] - my);
      if (d < bestD) { bestD = d; best = { type: 'host', index: i }; }
    }
  }
  {
    const s = project(_p2.set(0, 0, 0), cam, _p);
    if (s && !(state.mode === 'system' && state.hostIndex === 0)) { const d = Math.hypot(s[0] - mx, s[1] - my); if (d < bestD) { bestD = d; best = { type: 'host', index: 0 }; } }
  }
  if (state.mode === 'universe') {
    const pw = pxWorld(cam);
    for (const g of universe.galaxyList) {
      if (!state.opts.galaxies) break;
      const s = project(g.position, cam, _p); if (!s) continue;
      const rpx = (g.diam / 2) / (cam.position.distanceTo(g.position) * pw);
      const d = Math.hypot(s[0] - mx, s[1] - my) - Math.min(rpx * 0.6, 200);
      if (d < bestD) { bestD = d; best = { type: 'galaxy', g }; }
    }
    if (!best && state.opts.stars) {
      for (const s of universe.starNames) {
        if (s.labelAlpha == null || s.labelAlpha < 0.05) continue;
        const p = project(s.position, cam, _p); if (!p) continue;
        const d = Math.hypot(p[0] - mx, p[1] - my);
        if (d < bestD) { bestD = d; best = { type: 'star', s }; }
      }
    }
    if (!best) {
      const s = project(universe.gcPosition, cam, _p);
      if (s && Math.hypot(s[0] - mx, s[1] - my) < 18 && uniCam.position.length() > 3000) best = { type: 'milkyway' };
    }
  }
  return best;
}

function nameOf(p) {
  if (!p) return '';
  if (p.type === 'host') return hosts[p.index].isSun ? 'Sun' : `${hosts[p.index].n} · ${hosts[p.index].pl.length} planet${hosts[p.index].pl.length > 1 ? 's' : ''}`;
  if (p.type === 'body') return p.body.name;
  if (p.type === 'galaxy') return p.g.name;
  if (p.type === 'star') return p.s.name;
  if (p.type === 'milkyway') return 'Sagittarius A* · centre of the Milky Way';
  return '';
}

function activate(p) {
  if (!p) return;
  stopTour();
  if (p.type === 'host') {
    if (state.mode === 'system' && state.hostIndex === p.index) { focusBody(state.system.star); return; }
    if (state.mode === 'system') { select(p); return; }
    flyToHost(p.index);
  } else if (p.type === 'body') focusBody(p.body);
  else if (p.type === 'galaxy') flyToGalaxy(p.g);
  else if (p.type === 'star') flyToStar(p.s);
  else if (p.type === 'milkyway') flyToMilkyWay();
}

let down = null;
const mouse = { x: -1, y: -1, moved: false };
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; stopTourOnInput(); });
canvas.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; });
canvas.addEventListener('pointerleave', () => { mouse.x = -1; state.hover = null; ui.tooltip.classList.remove('show'); });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  if (moved < 5 && performance.now() - down.t < 500) activate(pick(e.clientX, e.clientY));
  down = null;
});
canvas.addEventListener('wheel', stopTourOnInput, { passive: true });
canvas.addEventListener('dblclick', (e) => {
  const p = pick(e.clientX, e.clientY);
  if (p?.type === 'host' && state.mode === 'universe') flyToHost(p.index, { enter: true });
});

// ---------- labels ----------
const labelPool = [];
function label(i) {
  if (!labelPool[i]) { const el = document.createElement('div'); el.className = 'lbl'; ui.labels.appendChild(el); labelPool[i] = el; }
  return labelPool[i];
}
const NOTABLE = ['Proxima Cen', 'TRAPPIST-1', 'Kepler-90', '51 Peg', 'HD 209458', 'Kepler-452', 'TOI-700', 'K2-18', '55 Cnc', 'HR 8799', 'GJ 581', 'tau Cet', 'eps Eri', 'Kepler-186', 'LHS 1140', 'Barnard\'s star', 'Ross 128', 'WASP-12', 'KELT-9', 'Kepler-16', 'HD 189733', 'PSR B1257+12', 'Teegarden\'s Star', 'LTT 1445 A', 'GJ 1214', 'Wolf 359'];
let notableIdx = [];

function placeLabels() {
  const items = [];
  const W = innerWidth, H = innerHeight;
  const add = (pos, text, cls, prio, cam, offset = 10, extra = null) => {
    const s = project(pos, cam, _p);
    if (!s || s[0] < -50 || s[0] > W + 50 || s[1] < -20 || s[1] > H + 20) return;
    items.push({ x: s[0], y: s[1], text, cls, prio, offset, extra });
  };
  if (state.opts.labels) {
    if (state.mode === 'system') {
      const sys = state.system;
      const pw = pxWorld(sysCam);
      const sp = project(sys.star.pos, sysCam, _p2) || [-1e4, -1e4];
      const sx = sp[0], sy = sp[1];
      add(sys.star.pos, sys.star.name, 'lbl-host', 90, sysCam, 14);
      for (const b of sys.bodies) {
        if (b.kind === 'star' || b.hidden) continue;
        const s = project(b.pos, sysCam, _p); if (!s) continue;
        const sep = Math.hypot(s[0] - sx, s[1] - sy);
        const rpx = b.vis / (b.camDist * pw);
        if (sep < 18 && b !== state.focusBody) continue;
        if (b.kind === 'moon') {
          const ps = project(b.parent.pos, sysCam, _p2);
          if (ps && Math.hypot(s[0] - ps[0], s[1] - ps[1]) < 26) continue;
        }
        const prio = b === state.focusBody ? 100 : b.kind === 'planet' ? (b.solar?.dwarf ? 55 : 70) : 40;
        add(b.pos, b.name, b.kind === 'moon' ? 'lbl-moon' : 'lbl-planet', prio, sysCam, Math.max(10, rpx + 6));
      }
      // the Sun as seen from another star
      if (state.hostIndex !== 0) add(new THREE.Vector3(0, 0, 0), 'Sun', 'lbl-sun', 60, uniCam, 12);
    } else {
      const fromSun = uniCam.position.length();
      add(new THREE.Vector3(0, 0, 0), fromSun > 30 ? 'Sun · you are here' : 'Sun', 'lbl-sun', 95, uniCam, 14);
      if (fromSun > 2500) add(universe.gcPosition, 'Sagittarius A*', 'lbl-place', 50, uniCam, 10);
      if (state.opts.galaxies) {
        const pw = pxWorld(uniCam);
        for (const g of universe.galaxyList) {
          const d = uniCam.position.distanceTo(g.position);
          const rpx = (g.diam / 2) / (d * pw);
          if (rpx < 2 && !['Andromeda Galaxy (M31)', 'Large Magellanic Cloud', 'Small Magellanic Cloud', 'Triangulum Galaxy (M33)'].includes(g.name) && d > g.dist * 0.2) continue;
          add(g.position, g.name, 'lbl-galaxy', 30 + Math.min(40, rpx), uniCam, Math.min(rpx * 0.5, 120) + 8);
        }
      }
      if (state.opts.hosts && fromSun < 3000) {
        for (const i of notableIdx) {
          const h = hosts[i];
          const d = uniCam.position.distanceTo(h.pos);
          if (d > uniRig.dist * 6 + 2) continue;
          add(h.pos, h.n, 'lbl-host', 45, uniCam, 10);
        }
      }
      if (state.opts.stars && fromSun < 400) {
        // the brightest named stars as seen from where the camera is
        const cand = [];
        for (const s of universe.starNames) {
          const d = Math.max(uniCam.position.distanceTo(s.position), 1e-3);
          const absm = s.mag - 5 * (Math.log10(Math.max(s.dist, 1e-3)) - 1);
          const m = absm + 5 * (Math.log10(d) - 1);
          s.app = m; s.labelAlpha = 0;
          cand.push(s);
        }
        cand.sort((a, b) => a.app - b.app);
        for (let k = 0; k < 14; k++) { const s = cand[k]; s.labelAlpha = 1; add(s.position, s.name, 'lbl-star', 20 - k * 0.5, uniCam, 8); }
      } else universe.starNames.forEach((s) => (s.labelAlpha = 0));
      for (const r of universe.rings) {
        if (!r.visibleAlpha || r.visibleAlpha < 0.05) continue;
        const a = Math.atan2(uniCam.position.z, uniCam.position.x) + 0.35;
        const text = r.ly >= 1000000 ? '1 million light-years' : `${r.ly.toLocaleString()} light-years`;
        add(new THREE.Vector3(r.r * Math.cos(a), 0, r.r * Math.sin(a)), text, 'lbl-ring', 10, uniCam, 0);
      }
    }
  }
  // selection and hover always labelled
  const sel = state.selected;
  if (sel?.type === 'host' && !(state.mode === 'system' && state.hostIndex === sel.index)) add(hosts[sel.index].pos, hosts[sel.index].isSun ? 'Sun' : hosts[sel.index].n, 'lbl-sel', 200, uniCam, 16);
  if (sel?.type === 'galaxy') add(sel.g.position, sel.g.name, 'lbl-sel', 200, uniCam, 16);
  if (sel?.type === 'star') add(sel.s.position, sel.s.name, 'lbl-sel', 200, uniCam, 16);

  items.sort((a, b) => b.prio - a.prio);
  const placed = [];
  let n = 0;
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.text)) continue;
    const w = it.text.length * 6.6 + 10, h = 16;
    const x = it.x + it.offset * 0.7, y = it.y - it.offset * 0.7 - h;
    if (placed.some((p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y)) continue;
    placed.push({ x, y, w, h });
    seen.add(it.text);
    const el = label(n++);
    el.className = `lbl ${it.cls}`;
    if (el.textContent !== it.text) el.textContent = it.text;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    el.style.display = 'block';
    if (n > 60) break;
  }
  for (let i = n; i < labelPool.length; i++) labelPool[i].style.display = 'none';
}

// ---------- HUD ----------
function updateHUD() {
  let crumbs;
  if (state.mode === 'system') {
    const h = hosts[state.hostIndex];
    crumbs = [['Local Group', 'lg'], ['Milky Way', 'mw'], ['Solar neighbourhood', 'nb'], [h.isSun ? 'Solar System' : h.n, 'sys']];
    if (state.focusBody && state.focusBody.kind !== 'star') crumbs.push([state.focusBody.name, 'body']);
    ui.scale.textContent = `${fmtAU(sysRig.dist)} from ${state.focusBody?.kind === 'star' ? (h.isSun ? 'the Sun' : h.n) : state.focusBody?.name}`;
  } else {
    const fromSun = uniCam.position.length();
    const fromGC = uniCam.position.distanceTo(universe.gcPosition);
    crumbs = [['Local Group', 'lg']];
    if (fromGC < 400000) crumbs.push(['Milky Way', 'mw']);
    if (fromSun < 4000) crumbs.push(['Orion Arm', 'arm']);
    if (fromSun < 300) crumbs.push(['Solar neighbourhood', 'nb']);
    ui.scale.textContent = `${fmtDist(uniRig.dist)} from ${state.selected?.type === 'galaxy' ? state.selected.g.name : state.selected?.type === 'host' ? (hosts[state.selected.index].isSun ? 'the Sun' : hosts[state.selected.index].n) : 'target'}`;
  }
  const html = crumbs.map(([t, k], i) => `<button data-crumb="${k}" ${i === crumbs.length - 1 ? 'class="cur"' : ''}>${esc(t)}</button>`).join('<span>›</span>');
  if (ui.crumbs.innerHTML !== html) ui.crumbs.innerHTML = html;
}
ui.crumbs.addEventListener('click', (e) => {
  const k = e.target.closest('button')?.dataset.crumb;
  if (!k) return;
  stopTour();
  if (k === 'lg') { if (state.mode === 'system') exitSystem(); const t = new THREE.Vector3(150000, 0, 120000); uniRig.flyTo({ target: t, follow: () => t, dist: 2.6e6, pitch: 0.5, duration: 5 }); select(null); }
  if (k === 'mw') flyToMilkyWay();
  if (k === 'arm') { if (state.mode === 'system') exitSystem(); const t = new THREE.Vector3(0, 0, 0); uniRig.flyTo({ target: t, follow: () => t, dist: 2500, pitch: 0.6, duration: 4 }); }
  if (k === 'nb') { if (state.mode === 'system') exitSystem(); const t = new THREE.Vector3(0, 0, 0); uniRig.flyTo({ target: t, follow: () => t, dist: 60, duration: 4 }); select({ type: 'host', index: 0 }); }
  if (k === 'sys' && state.mode === 'system') focusBody(state.system.star);
});

function updateTimeUI() {
  ui.time.classList.toggle('show', state.mode === 'system');
  ui.warp.textContent = state.paused ? 'Paused' : WARPS[state.warpIndex][1];
}
ui.time.addEventListener('click', (e) => {
  const a = e.target.closest('button')?.dataset.t;
  if (!a) return;
  if (a === 'slower') state.warpIndex = Math.max(0, state.warpIndex - 1);
  if (a === 'faster') state.warpIndex = Math.min(WARPS.length - 1, state.warpIndex + 1);
  if (a === 'pause') state.paused = !state.paused;
  if (a === 'now') { state.simMs = Date.now(); state.warpIndex = 2; state.paused = false; }
  ui.time.querySelector('[data-t=pause]').textContent = state.paused ? '▶' : '❚❚';
  updateTimeUI();
});

ui.toggles.addEventListener('change', (e) => {
  const k = e.target.dataset.opt;
  if (k) state.opts[k] = e.target.checked;
});

// ---------- search ----------
let searchIndex = [];
function buildSearchIndex() {
  searchIndex = [];
  searchIndex.push({ label: 'Sun', sub: 'Our star', go: () => { if (state.mode === 'system' && state.hostIndex === 0) focusBody(state.system.star); else flyToHost(0, { enter: true }); } });
  for (const p of PLANETS) searchIndex.push({ label: p.name, sub: p.dwarf ? 'Dwarf planet' : 'Planet · Solar System', go: () => goToSolarBody(p.key) });
  for (const m of MOONS) searchIndex.push({ label: m.name, sub: `Moon of ${PLANETS.find((p) => p.key === m.parent).name}`, go: () => goToSolarBody(m.key) });
  searchIndex.push({ label: 'Milky Way', sub: 'Our galaxy', go: flyToMilkyWay });
  for (const g of universe.galaxyList) searchIndex.push({ label: g.name, sub: `Galaxy · ${fmtDist(g.dist)}`, go: () => flyToGalaxy(g) });
  hosts.forEach((h, i) => {
    if (h.isSun) return;
    searchIndex.push({ label: h.n, sub: `Star · ${h.pl.length} planet${h.pl.length > 1 ? 's' : ''} · ${lyStr(h.d)}`, go: () => flyToHost(i) });
    for (const p of h.pl) searchIndex.push({ label: p.n, sub: `Exoplanet · ${lyStr(h.d)}`, go: () => goToExoPlanet(i, p.n) });
  });
  for (const s of universe.starNames) searchIndex.push({ label: s.name, sub: `Star · ${lyStr(s.dist)}`, go: () => flyToStar(s) });
  searchIndex.forEach((e) => (e.key = e.label.toLowerCase()));
  notableIdx = NOTABLE.map((n) => hosts.findIndex((h) => h.n === n)).filter((i) => i > 0);
}
let resultSel = 0;
function runSearch() {
  const q = ui.search.value.trim().toLowerCase();
  if (!q) { ui.results.innerHTML = ''; ui.results.classList.remove('show'); return; }
  const starts = [], has = [];
  for (const e of searchIndex) {
    if (e.key.startsWith(q)) starts.push(e); else if (e.key.includes(q)) has.push(e);
    if (starts.length > 40) break;
  }
  const res = [...starts.sort((a, b) => a.key.length - b.key.length), ...has].slice(0, 10);
  resultSel = 0;
  ui.results.innerHTML = res.length ? res.map((e, i) => `<button data-i="${i}" class="${i === 0 ? 'on' : ''}"><b>${esc(e.label)}</b><small>${esc(e.sub)}</small></button>`).join('') : '<div class="none">Nothing found</div>';
  ui.results._res = res;
  ui.results.classList.add('show');
}
ui.search.addEventListener('input', runSearch);
ui.search.addEventListener('keydown', (e) => {
  const res = ui.results._res || [];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    resultSel = (resultSel + (e.key === 'ArrowDown' ? 1 : -1) + res.length) % Math.max(res.length, 1);
    ui.results.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === resultSel));
  }
  if (e.key === 'Enter' && res[resultSel]) { choose(res[resultSel]); }
  if (e.key === 'Escape') { ui.search.value = ''; runSearch(); ui.search.blur(); }
});
ui.results.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) choose(ui.results._res[+b.dataset.i]); });
function choose(entry) { stopTour(); hideIntro(); ui.search.value = ''; runSearch(); ui.search.blur(); entry.go(); }

window.addEventListener('keydown', (e) => {
  if (e.target === ui.search) return;
  if (e.key === '/') { e.preventDefault(); ui.search.focus(); }
  if (e.key === 'Escape') {
    stopTour();
    if (state.mode === 'system') {
      if (state.focusBody && state.focusBody.kind !== 'star') focusBody(state.system.star);
      else { exitSystem(); uniRig.flyTo({ target: uniRig.target.clone(), follow: uniRig.follow, dist: 3, duration: 2.5 }); }
    } else if (state.selected) select(null);
    else uniRig.zoomBy(8);
  }
  if (e.key === ' ' && state.mode === 'system') { state.paused = !state.paused; updateTimeUI(); }
});

// ---------- intro and tour ----------
function hideIntro() { ui.intro.classList.remove('show'); uniRig.idleSpin = 0; document.body.classList.add('live'); }
ui.begin.addEventListener('click', () => {
  hideIntro();
  flyToHost(0, { enter: true, then: () => setTimeout(() => goToSolarBody('earth'), 400) });
  caption('The Sun, the planets and the Moon are where they really are right now.', 6000);
});
ui.explore.addEventListener('click', () => { hideIntro(); flyToMilkyWay(); });
ui.tourBtn.addEventListener('click', () => { hideIntro(); startTour(); });

let captionTimer = null;
function caption(text, ms = 6000) {
  ui.caption.textContent = text;
  ui.caption.classList.add('show');
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => ui.caption.classList.remove('show'), ms);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const flightDone = (rig) => new Promise((r) => { const check = () => (rig.flight ? requestAnimationFrame(check) : r()); check(); });

async function startTour() {
  const token = {};
  state.tour = token;
  const alive = () => state.tour === token;
  const idx = (n) => hosts.findIndex((h) => h.n === n);
  const steps = [
    async () => { goToSolarBody('earth'); caption('Earth, right now. Day and night fall where they really are at this moment.', 9000); await wait(1200); await flightDone(sysRig); await wait(5500); },
    async () => { state.warpIndex = 5; updateTimeUI(); focusBody(state.system.star, { duration: 4 }); caption('The Solar System on today\'s date, running at one week per second.', 8000); await flightDone(sysRig); await wait(6000); },
    async () => { goToSolarBody('saturn'); caption('Saturn. The rings are built from their real structure, gaps and all, and the planet casts its shadow across them.', 9000); await wait(800); await flightDone(sysRig); await wait(6500); },
    async () => { state.warpIndex = 4; updateTimeUI(); flyToHost(idx('Proxima Cen'), { enter: true }); caption('Leaving home. Proxima Centauri, 4.2 light-years away, the nearest star to the Sun. It has planets.', 9000); await wait(500); await flightDone(uniRig); await wait(500); await flightDone(sysRig); await wait(5000); },
    async () => { flyToHost(idx('TRAPPIST-1'), { enter: true }); caption('TRAPPIST-1, 40 light-years away: seven Earth-sized planets packed closer to their star than Mercury is to ours.', 10000); await wait(500); await flightDone(uniRig); await wait(500); await flightDone(sysRig); await wait(7000); },
    async () => { exitSystem(); const t = new THREE.Vector3(0, 0, 0); uniRig.flyTo({ target: t, follow: () => t, dist: 900, pitch: 0.45, duration: 6 }); caption(`Every ringed point is a star with confirmed planets: ${state.totalPlanets.toLocaleString()} worlds around ${state.totalHosts.toLocaleString()} stars, in the NASA Exoplanet Archive.`, 10000); await wait(300); await flightDone(uniRig); await wait(6000); },
    async () => { flyToMilkyWay(); caption('The whole Milky Way. Almost all known planets sit inside a bubble a few thousand light-years wide around the Sun.', 10000); await wait(300); await flightDone(uniRig); await wait(7000); },
    async () => { flyToGalaxy(universe.galaxyList[0]); caption('Andromeda, 2.5 million light-years away. A trillion stars, and not one confirmed planet yet: they are too far to detect.', 10000); await wait(300); await flightDone(uniRig); await wait(7000); },
    async () => { const t = new THREE.Vector3(150000, 0, 120000); uniRig.flyTo({ target: t, follow: () => t, dist: 3.2e6, pitch: 0.4, duration: 7 }); select(null); caption('The Local Group, and beyond it more galaxies than there are stars in our own.', 10000); await flightDone(uniRig); await wait(3000); },
  ];
  for (const s of steps) { if (!alive()) return; await s(); }
  if (alive()) { state.tour = null; caption('Your turn. Drag to look around, scroll to zoom, click anything, or press / to search.', 8000); }
}
function stopTour() { if (state.tour) { state.tour = null; caption('Tour stopped. Explore freely.', 3000); } }
function stopTourOnInput() { if (state.tour) stopTour(); hideIntro(); }

function showBusy(on) { document.body.classList.toggle('busy', on); }

// ---------- resize ----------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  composer?.setSize(w, h);
  for (const c of [uniCam, sysCam]) { c.aspect = w / h; c.updateProjectionMatrix(); }
}
addEventListener('resize', resize);

// ---------- main loop ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  state.clock += dt;
  if (state.cooldown) state.cooldown = Math.max(0, state.cooldown - dt);

  if (state.mode === 'system' && !state.paused) {
    state.simMs += dt * 1000 * WARPS[state.warpIndex][0];
  }

  if (state.mode === 'universe') {
    uniRig.update(dt);
    // zooming far into a selected star with planets: drop into its system
    const sel = state.selected;
    if (!uniRig.flight && !state.cooldown && sel?.type === 'host' && uniRig.follow && uniRig.target.distanceTo(hosts[sel.index].pos) < 1e-6) {
      if (uniRig.dist < enterDistAU(hosts[sel.index]) * AU_PC && uniRig.vZoom < 0.05) enterSystem(sel.index, { keepMomentum: true });
    }
    uniCam.userData.targetDist = uniRig.dist;
  } else {
    const sys = state.system;
    sys.advance(state.simMs);
    sysRig.update(dt);
    // pulling far out of a system returns to the stars
    if (!sysRig.flight && state.focusBody === sys.star && sysRig.dist > enterDistAU(hosts[state.hostIndex]) * 1.3 && sysRig.vZoom > 0) exitSystem({ keepMomentum: true });
  }

  if (state.mode === 'system') {
    const h = hosts[state.hostIndex];
    uniCam.position.copy(h.pos).addScaledVector(sysCam.position, AU_PC);
    uniCam.quaternion.copy(sysCam.quaternion);
    uniCam.fov = sysCam.fov;
    state.system.update(state.simMs, sysCam, pxWorld(sysCam), { orbits: state.opts.orbits, hz: state.opts.hz, clock: state.clock });
    ui.date.textContent = new Date(state.simMs).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  }
  uniCam.updateMatrixWorld();
  universe.update(uniCam, { pixelRatio: PR, height: innerHeight, opts: state.opts, inSystem: state.mode === 'system', hostIndex: state.hostIndex });

  // hover
  if (mouse.x >= 0 && !down) {
    const p = pick(mouse.x, mouse.y);
    state.hover = p;
    universe.hostMat.uniforms.uHover.value = p?.type === 'host' ? p.index : -1;
    if (p) {
      ui.tooltip.textContent = nameOf(p);
      ui.tooltip.style.transform = `translate(${mouse.x + 14}px, ${mouse.y + 12}px)`;
      ui.tooltip.classList.add('show');
      canvas.style.cursor = 'pointer';
    } else { ui.tooltip.classList.remove('show'); canvas.style.cursor = ''; }
  }

  placeLabels();
  updateHUD();
  composer.render(dt);
  requestAnimationFrame(loop);
}

load().catch((err) => {
  console.error(err);
  ui.loadText.textContent = 'Something went wrong while loading. Please reload the page.';
});
