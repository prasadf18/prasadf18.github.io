// A single star system, rendered in AU in the shared galactic-aligned frame.
// Bodies are drawn at true size, but never smaller than a few pixels, so that
// you can fly from a view of the whole system right down to a planet's clouds.

import * as THREE from 'three';
import {
  AU_KM, R_EARTH_AU, R_SUN_AU, DEG, raDecToWorld, eqVecToWorld, eclToWorld, elementsToEcliptic,
  orbitalPlanePos, tempToColor, seeded, julianDate,
} from './astro.js';
import { PLANETS, MOONS, SUN } from './solar.js';
import { solarTexture, exoTexture, classifyExoplanet, saturnRingTexture, uranusRingTexture, CLASS_INFO } from './textures.js';

// ---------- shaders ----------

const NOISE_GLSL = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

function starSurfaceMaterial(color, seed) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uTime: { value: 0 }, uSeed: { value: seed } },
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vObj; varying vec3 vN; varying vec3 vV;
      void main(){
        vObj = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor; uniform float uTime; uniform float uSeed;
      varying vec3 vObj; varying vec3 vN; varying vec3 vV;
      ${NOISE_GLSL}
      void main(){
        #include <logdepthbuf_fragment>
        vec3 p = normalize(vObj);
        float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
        // limb darkening (Eddington-like)
        float limb = 0.35 + 0.65 * pow(mu, 0.55);
        float t = uTime * 0.02;
        float gran = snoise(p * 55.0 + vec3(t, uSeed, -t)) * 0.5 + snoise(p * 140.0 - vec3(t * 2.0)) * 0.25;
        float big = snoise(p * 6.0 + vec3(uSeed, t * 0.3, 0.0));
        float spots = smoothstep(0.62, 0.72, snoise(p * 9.0 + vec3(uSeed * 3.0, 0.0, t * 0.1))) * smoothstep(0.65, 0.2, abs(p.y));
        float faculae = smoothstep(0.35, 0.6, big) * (1.0 - mu) * 0.5;
        vec3 col = uColor * (1.0 + gran * 0.16 + faculae);
        col *= 1.0 - spots * 0.75;
        // hotter, whiter core
        col = mix(col, vec3(1.0) * dot(col, vec3(0.33)), 0.25 * mu);
        gl_FragColor = vec4(col * limb * 3.2, 1.0);
      }`,
  });
}

function coronaMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uTime: { value: 0 }, uRatio: { value: 0.125 } },
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor; uniform float uTime; uniform float uRatio;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main(){
        #include <logdepthbuf_fragment>
        float r = length(vUv);
        float rr = r / uRatio;                 // in stellar radii
        if (rr < 0.98) discard;
        float ang = atan(vUv.y, vUv.x);
        float rays = 0.6 + 0.4 * snoise(vec3(cos(ang) * 3.0, sin(ang) * 3.0, uTime * 0.03 + rr * 0.15));
        float glow = exp(-(rr - 1.0) * 2.2) * 0.9 + exp(-(rr - 1.0) * 0.35) * 0.22 * rays + 0.05 / (rr * rr);
        glow *= smoothstep(1.0, 0.75, r);
        gl_FragColor = vec4(uColor * glow * 1.6, 1.0);
      }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
}

function atmosphereMaterial(color, k) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(...color) }, uK: { value: k }, uStar: { value: new THREE.Vector3() } },
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vNW; varying vec3 vPW;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0); vPW = w.xyz;
        vNW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor; uniform float uK; uniform vec3 uStar;
      varying vec3 vNW; varying vec3 vPW;
      void main(){
        #include <logdepthbuf_fragment>
        vec3 N = normalize(vNW); vec3 V = normalize(cameraPosition - vPW); vec3 L = normalize(uStar - vPW);
        float ndv = max(dot(N, V), 0.0);
        float rim = pow(1.0 - ndv, 2.6);
        float day = smoothstep(-0.3, 0.35, dot(N, L));
        // forward scattering when looking toward the star through the limb
        float fwd = pow(max(dot(-V, L), 0.0), 8.0) * smoothstep(-0.2, 0.1, dot(N, L)) * 2.0;
        float a = (rim * day + rim * fwd) * uK;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.FrontSide,
  });
}

function ringMaterial(tex, inner, outer) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: tex }, uInner: { value: inner }, uOuter: { value: outer },
      uPlanet: { value: new THREE.Vector3() }, uPlanetR: { value: 1 }, uStar: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vL; varying vec3 vPW;
      void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vPW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uTex; uniform float uInner; uniform float uOuter;
      uniform vec3 uPlanet; uniform float uPlanetR; uniform vec3 uStar;
      varying vec3 vL; varying vec3 vPW;
      void main(){
        #include <logdepthbuf_fragment>
        float r = length(vL.xy);
        float t = (r - uInner) / (uOuter - uInner);
        if (t < 0.0 || t > 1.0) discard;
        vec4 c = texture2D(uTex, vec2(t, 0.5));
        // the planet's shadow on the rings
        vec3 D = normalize(uStar - vPW); vec3 oc = uPlanet - vPW; float b = dot(oc, D);
        float d2 = dot(oc, oc) - b * b;
        float sh = (b > 0.0) ? smoothstep(uPlanetR * uPlanetR * 0.92, uPlanetR * uPlanetR * 1.02, d2) : 1.0;
        float light = 0.08 + 0.92 * sh;
        gl_FragColor = vec4(c.rgb * light * 0.8, c.a);
      }`,
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
  });
}

function orbitMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPhase: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float phase; varying float vPhase;
      void main(){ vPhase = phase; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor; uniform float uPhase; uniform float uOpacity; varying float vPhase;
      void main(){
        #include <logdepthbuf_fragment>
        float behind = fract(uPhase - vPhase);
        float a = mix(0.85, 0.12, pow(behind, 0.45));
        gl_FragColor = vec4(uColor, a * uOpacity);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// ---------- helpers ----------

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);
const sphereGeo = new THREE.SphereGeometry(1, 96, 64);
const sphereGeoLow = new THREE.SphereGeometry(1, 48, 32);

function anyPerp(n) {
  const a = Math.abs(n.y) < 0.9 ? Y : new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3().crossVectors(a, n).normalize();
}

function starLuminosity(host) {
  if (host.l != null) return Math.pow(10, host.l);
  const R = host.r ?? 1, T = host.t ?? 5772;
  return R * R * Math.pow(T / 5772, 4);
}

// ---------- system ----------

export class StarSystem {
  constructor(host, { land, isSolar }) {
    this.host = host;
    this.isSolar = isSolar;
    this.scene = new THREE.Scene();
    this.bodies = [];
    this.orbits = [];
    this.timeOrigin = 0;
    this.land = land;

    const teff = isSolar ? SUN.teff : (host.t ?? 5200);
    const starColor = tempToColor(teff);
    const starR = isSolar ? R_SUN_AU : (host.r ?? 1) * R_SUN_AU;
    this.starR = starR;
    this.lum = isSolar ? 1 : starLuminosity(host);

    // star
    const star = new THREE.Group();
    const surf = new THREE.Mesh(sphereGeo, starSurfaceMaterial(starColor.clone(), (host.n?.length ?? 3) * 1.37));
    const coronaMat = coronaMaterial(starColor.clone());
    const corona = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), coronaMat);
    corona.scale.setScalar(8);
    star.add(surf, corona);
    this.scene.add(star);
    this.star = { kind: 'star', name: isSolar ? 'Sun' : host.n, group: star, surf, corona, coronaMat, R: starR, pos: new THREE.Vector3(), color: starColor, host };
    this.bodies.push(this.star);

    // light: the star, no falloff (exposure handles the scale), plus a whisper of fill
    const light = new THREE.PointLight(0xffffff, 2.6, 0, 0);
    light.color.copy(starColor).lerp(new THREE.Color(1, 1, 1), 0.5);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.012));

    if (isSolar) this._buildSolar(); else this._buildExo();
    this._buildHabitableZone();

    // the outermost orbit sets the scale of the system
    this.extent = Math.max(...this.bodies.filter((b) => b.kind === 'planet').map((b) => b.a * (1 + (b.e || 0))), starR * 40);
  }

  // ----- the Solar System -----
  _buildSolar() {
    const T0 = 0;
    for (const p of PLANETS) {
      const R = p.radius / AU_KM;
      const body = this._makeBody({
        name: p.name, key: p.key, R, flat: p.flat, tex: solarTexture(p.key, this.land), atmo: p.atmo, rings: p.rings,
        info: p, color: p.color,
      });
      body.kind = 'planet';
      body.solar = p;
      body.pole = raDecToWorld(p.pole[0], p.pole[1], 1);
      body.rotHours = p.rot;
      body.a = p.el[0]; body.e = p.el[1];
      body.isEarth = p.key === 'earth';
      if (body.isEarth) {
        const clouds = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({
          map: solarTexture('earthClouds').map, transparent: true, depthWrite: false, roughness: 1, metalness: 0,
        }));
        clouds.scale.setScalar(1.008);
        body.spin.add(clouds);
        body.clouds = clouds;
      }
      this.bodies.push(body);
      this._solarOrbit(body, T0);
    }
    for (const m of MOONS) {
      const parent = this.bodies.find((b) => b.key === m.parent);
      const body = this._makeBody({ name: m.name, key: m.key, R: m.radius / AU_KM, tex: solarTexture(m.key), atmo: m.atmo, info: m, color: '#cfc8bd', low: true });
      body.kind = 'moon';
      body.parent = parent;
      body.moon = m;
      body.a = m.a / AU_KM;
      body.pole = parent.pole;
      body.rotHours = Math.abs(m.P) * 24 * Math.sign(m.P);
      body.phase0 = seeded(m.name)() * Math.PI * 2;
      this.bodies.push(body);
    }
  }

  _solarOrbit(body, T) {
    const p = body.solar;
    const el = p.el.map((v, i) => v + p.rt[i] * T);
    const [a, e, I, L, wbar, Om] = el;
    const pts = [], ph = [];
    const N = 720;
    for (let i = 0; i <= N; i++) {
      const M = (i / N) * Math.PI * 2;
      const [x, y, z] = elementsToEcliptic(a, e, I * DEG, Om * DEG, (wbar - Om) * DEG, M);
      eclToWorld(x, y, z, _v);
      pts.push(_v.x, _v.y, _v.z);
      ph.push(i / N);
    }
    this._addOrbitLine(body, pts, ph);
  }

  // ----- an exoplanet system from the NASA archive -----
  _buildExo() {
    const host = this.host;
    const rnd = seeded(host.n);
    const los = new THREE.Vector3(...host.p).negate().normalize();   // star -> Sun
    const q = anyPerp(los).applyAxisAngle(los, rnd() * Math.PI * 2);
    const starMass = host.m ?? 1;
    for (const pl of host.pl) {
      let a = pl.a, P = pl.P;
      if (!a && P) a = Math.cbrt(starMass * Math.pow(P / 365.25, 2));
      if (!a) continue;
      if (!P) P = Math.sqrt(Math.pow(a, 3) / starMass) * 365.25;
      const e = Math.min(pl.e ?? 0, 0.97);
      const transit = (pl.dm || '').startsWith('Transit');
      const inc = (pl.i ?? (transit ? 89.5 : 25 + rnd() * 60)) * DEG;
      const n = los.clone().multiplyScalar(Math.cos(inc)).addScaledVector(q, Math.sin(inc)).normalize();
      let u = new THREE.Vector3().crossVectors(los, n);
      if (u.lengthSq() < 1e-8) u = anyPerp(n); else u.normalize();
      const prnd = seeded(pl.n);
      const w = prnd() * Math.PI * 2;
      const Pd = u.clone().multiplyScalar(Math.cos(w)).addScaledVector(new THREE.Vector3().crossVectors(n, u), Math.sin(w));
      const Qd = new THREE.Vector3().crossVectors(n, Pd);
      const Rearth = pl.R ?? 1;
      let Teq = pl.T;
      if (!Teq && host.t) Teq = host.t * Math.sqrt(((host.r ?? 1) * R_SUN_AU) / (2 * a)) * Math.pow(0.7, 0.25);
      const kind = classifyExoplanet(Rearth, Teq);
      const tex = exoTexture(kind, pl.n);
      const gas = kind.startsWith('gas') || kind.includes('neptune') || kind === 'ice-giant';
      const atmoCol = {
        'lava': null, 'scorched': [1.0, 0.7, 0.5], 'temperate-rock': [0.5, 0.7, 1.0], 'ice-rock': null,
        'hot-subneptune': [1.0, 0.8, 0.6], 'subneptune': [0.55, 0.8, 1.0], 'warm-neptune': [0.7, 0.85, 0.8], 'ice-giant': [0.45, 0.65, 1.0],
        'gas-ammonia': [0.95, 0.85, 0.7], 'gas-water': [0.9, 0.95, 1.0], 'gas-clear': [0.4, 0.6, 1.0], 'gas-alkali': [0.6, 0.35, 0.3], 'gas-hot': [1.0, 0.45, 0.2],
      }[kind];
      const body = this._makeBody({
        name: pl.n, key: pl.n, R: Rearth * R_EARTH_AU, flat: gas ? 0.03 : 0, tex,
        atmo: atmoCol ? { color: atmoCol, k: gas ? 0.6 : 0.9 } : null, info: pl, color: '#9fd3ff',
      });
      body.kind = 'planet';
      body.exo = pl;
      body.cls = kind;
      body.clsInfo = CLASS_INFO[kind];
      body.Teq = Teq;
      body.a = a; body.e = e; body.P = P;
      body.basisP = Pd; body.basisQ = Qd; body.normal = n;
      body.M0 = prnd() * Math.PI * 2;
      body.pole = n;
      body.locked = a < 0.1;
      body.rotHours = body.locked ? P * 24 : 10 + prnd() * 20;
      this.bodies.push(body);
      const pts = [], ph = [];
      const N = 720;
      for (let i = 0; i <= N; i++) {
        const M = (i / N) * Math.PI * 2;
        const [x, y] = orbitalPlanePos(a, e, M);
        _v.copy(Pd).multiplyScalar(x).addScaledVector(Qd, y);
        pts.push(_v.x, _v.y, _v.z);
        ph.push(i / N);
      }
      this._addOrbitLine(body, pts, ph);
    }
    this.systemNormal = this.bodies.find((b) => b.normal)?.normal ?? los;
  }

  _buildHabitableZone() {
    // conservative habitable zone (Kopparapu et al. 2013), simple luminosity scaling
    const inner = Math.sqrt(this.lum / 1.1), outer = Math.sqrt(this.lum / 0.53);
    const geo = new THREE.RingGeometry(inner, outer, 256, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uIn: { value: inner }, uOut: { value: outer }, uOpacity: { value: 1 } },
      vertexShader: `#include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec3 vL; void main(){ vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `#include <common>
        #include <logdepthbuf_pars_fragment>
        uniform float uIn; uniform float uOut; uniform float uOpacity; varying vec3 vL;
        void main(){
          #include <logdepthbuf_fragment>
          float t = (length(vL.xy) - uIn) / (uOut - uIn);
          float a = smoothstep(0.0, 0.25, t) * smoothstep(1.0, 0.75, t) * 0.028 + (smoothstep(0.03, 0.0, t) + smoothstep(0.97, 1.0, t)) * 0.07;
          gl_FragColor = vec4(vec3(0.35, 0.95, 0.6) * a * uOpacity, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    let n;
    if (this.isSolar) n = eclToWorld(0, 0, 1);
    else n = this.systemNormal.clone();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    this.hz = { mesh, mat, inner, outer };
    this.scene.add(mesh);
    this.orbitNormal = n;
  }

  _addOrbitLine(body, pts, ph) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('phase', new THREE.Float32BufferAttribute(ph, 1));
    const mat = orbitMaterial(body.kind === 'planet' && body.solar?.dwarf ? '#8a7f74' : body.color);
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    this.scene.add(line);
    body.orbit = { line, mat };
    this.orbits.push(body.orbit);
  }

  _makeBody({ name, key, R, flat = 0, tex, atmo, rings, info, color, low }) {
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    const spin = new THREE.Group();
    group.add(tilt); tilt.add(spin);
    const matOpts = { map: tex.map, roughness: 0.92, metalness: 0 };
    if (tex.bump) { matOpts.bumpMap = tex.bump; matOpts.bumpScale = 1.2; }
    if (tex.rough) { matOpts.roughnessMap = tex.rough; matOpts.roughness = 1; }
    if (tex.emissive) { matOpts.emissiveMap = tex.emissive; matOpts.emissive = new THREE.Color(1, 1, 1); matOpts.emissiveIntensity = 1.6; }
    const mat = new THREE.MeshStandardMaterial(matOpts);
    const surf = new THREE.Mesh(low ? sphereGeoLow : sphereGeo, mat);
    surf.scale.set(1, 1 - flat, 1);
    spin.add(surf);
    const body = { name, key, R, group, tilt, spin, surf, info, color: color || '#ffffff', pos: new THREE.Vector3(), vis: R, ringed: !!rings };
    if (atmo) {
      const am = atmosphereMaterial(atmo.color, atmo.k);
      const shell = new THREE.Mesh(sphereGeoLow, am);
      shell.scale.set(1.035, 1.035 * (1 - flat), 1.035);
      tilt.add(shell);
      body.atmo = am;
    }
    if (rings) {
      const rt = rings === 'saturn' ? saturnRingTexture() : uranusRingTexture();
      const geo = new THREE.RingGeometry(rt.inner, rt.outer, 256, 1);
      const rm = ringMaterial(rt.tex, rt.inner, rt.outer);
      const ring = new THREE.Mesh(geo, rm);
      ring.rotation.x = -Math.PI / 2;
      tilt.add(ring);
      body.ring = rm;
    }
    this.scene.add(group);
    return body;
  }

  // ----- per frame -----
  // simMs: simulation time (ms since 1970), camera: system camera, pxWorld: world size of one pixel at unit distance
  // Move every body to its place at simMs (call before the camera follows a body).
  advance(simMs) {
    const jd = julianDate(simMs);
    const d = jd - 2451545.0;
    const T = d / 36525;

    for (const b of this.bodies) {
      if (b.kind === 'star') continue;
      if (b.kind === 'planet') {
        if (b.solar) {
          const p = b.solar;
          const el = p.el.map((v, i) => v + p.rt[i] * T);
          const [a, e, I, L, wbar, Om] = el;
          let M = (L - wbar) % 360;
          const [x, y, z] = elementsToEcliptic(a, e, I * DEG, Om * DEG, (wbar - Om) * DEG, M * DEG);
          eclToWorld(x, y, z, b.pos);
          b.meanPhase = (((M / 360) % 1) + 1) % 1;
        } else {
          const M = b.M0 + (2 * Math.PI * d) / b.P;
          const [x, y] = orbitalPlanePos(b.a, b.e, ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
          b.pos.copy(b.basisP).multiplyScalar(x).addScaledVector(b.basisQ, y);
          b.meanPhase = (((M / (2 * Math.PI)) % 1) + 1) % 1;
        }
      }
    }
    for (const b of this.bodies) {
      if (b.kind !== 'moon') continue;
      const par = b.parent;
      if (b.key === 'moon') {
        // low precision lunar theory (Astronomical Almanac): good to a fraction of a degree
        const L = (218.316 + 13.176396 * d) * DEG, Mm = (134.963 + 13.064993 * d) * DEG, F = (93.272 + 13.22935 * d) * DEG;
        const lon = L + 6.289 * DEG * Math.sin(Mm), lat = 5.128 * DEG * Math.sin(F);
        const dist = (385001 - 20905 * Math.cos(Mm)) / AU_KM;
        eclToWorld(Math.cos(lat) * Math.cos(lon) * dist, Math.cos(lat) * Math.sin(lon) * dist, Math.sin(lat) * dist, _v);
        b.pos.copy(par.pos).add(_v);
      } else {
        const ang = b.phase0 + (2 * Math.PI * d) / b.moon.P;
        // circular orbit in the parent's equatorial plane
        _v.set(Math.cos(ang) * b.a, 0, -Math.sin(ang) * b.a).applyQuaternion(par.tilt.quaternion);
        b.pos.copy(par.pos).add(_v);
      }
    }

    // orientation and spin
    for (const b of this.bodies) {
      if (b.kind === 'star') continue;
      if (b.isEarth) {
        const gmst = ((280.46061837 + 360.98564736629 * d) % 360) * DEG;
        const X = eqVecToWorld(Math.cos(gmst), Math.sin(gmst), 0);
        const Yp = eqVecToWorld(0, 0, 1);
        const Z = new THREE.Vector3().crossVectors(X, Yp);
        b.tilt.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Yp, Z));
        b.spin.rotation.y = 0;
        if (b.clouds) b.clouds.rotation.y = d * 2 * Math.PI * 0.03;
      } else if (b.kind === 'moon' && b.key === 'moon') {
        // tidally locked: local +x (near side) faces Earth
        const toEarth = _v.copy(b.parent.pos).sub(b.pos).normalize();
        const up = eclToWorld(0, 0, 1);
        const Z = new THREE.Vector3().crossVectors(toEarth, up).normalize();
        const Yp = new THREE.Vector3().crossVectors(Z, toEarth);
        b.tilt.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(toEarth.clone(), Yp, Z));
        b.spin.rotation.y = 0;
      } else if (b.locked) {
        const toStar = _v.copy(b.pos).negate().normalize();
        const Z = new THREE.Vector3().crossVectors(toStar, b.pole).normalize();
        const Yp = new THREE.Vector3().crossVectors(Z, toStar);
        b.tilt.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(toStar.clone(), Yp, Z));
        b.spin.rotation.y = 0;
      } else {
        b.tilt.quaternion.setFromUnitVectors(Y, b.pole);
        b.spin.rotation.y = ((d * 24) / b.rotHours) * 2 * Math.PI % (2 * Math.PI);
      }
    }

  }

  // Camera-dependent work: apparent size floor, visibility, billboards.
  update(simMs, camera, pxWorld, opts) {
    const camPos = camera.position;
    const secs = opts.clock;
    // apparent size floor and visibility
    for (const b of this.bodies) {
      const dist = Math.max(camPos.distanceTo(b.pos), 1e-12);
      const minPx = b.kind === 'star' ? 2.5 : b.kind === 'moon' ? 1.6 : 2.6;
      b.vis = Math.max(b.R, dist * pxWorld * minPx);
      b.screenR = b.R / (dist * pxWorld);
      b.group.position.copy(b.pos);
      b.group.scale.setScalar(b.vis);
      b.camDist = dist;
      if (b.atmo) b.atmo.uniforms.uStar.value.set(0, 0, 0);
      if (b.ring) { b.ring.uniforms.uPlanet.value.copy(b.pos); b.ring.uniforms.uPlanetR.value = b.vis; }
      if (b.orbit) { b.orbit.mat.uniforms.uPhase.value = b.meanPhase ?? 0; b.orbit.line.visible = opts.orbits; }
    }
    for (const b of this.bodies) {
      if (b.kind !== 'moon') continue;
      const sepPx = b.pos.distanceTo(b.parent.pos) / (b.camDist * pxWorld);
      const parPx = b.parent.vis / (b.parent.camDist * pxWorld);
      b.hidden = sepPx < parPx + 5 && b.screenR < 1.2;
      b.group.visible = !b.hidden;
    }
    // star corona is a camera-facing billboard
    const s = this.star;
    s.group.position.set(0, 0, 0);
    s.group.scale.setScalar(s.vis);
    s.corona.quaternion.copy(camera.quaternion);
    const coronaScale = Math.max(8, Math.min(60, 8 * Math.sqrt(s.R / s.vis) * 4));
    s.corona.scale.setScalar(coronaScale);
    s.coronaMat.uniforms.uRatio.value = 1 / coronaScale;
    s.coronaMat.uniforms.uTime.value = secs;
    s.surf.material.uniforms.uTime.value = secs;
    this.hz.mesh.visible = opts.hz;
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry && o.geometry !== sphereGeo && o.geometry !== sphereGeoLow) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
