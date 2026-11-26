// The universe scene, in parsecs: real stars (HYG catalogue), every exoplanet
// host star from the NASA Exoplanet Archive, the Milky Way, and nearby galaxies.

import * as THREE from 'three';
import { buildMilkyWay, GC_DIST } from './milkyway.js';
import { buildGalaxies, buildDeepField, GALAXIES } from './galaxies.js';
import { bvToTemp, tempToColor, PC_LY } from './astro.js';
import { scaleUniform } from './particles.js';

// Real stars: brightness from absolute magnitude and the true distance to the camera.
function realStarMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uLimit: { value: 6.5 }, uPR: { value: 1 }, uHide: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float absmag; attribute vec3 color;
      uniform float uLimit; uniform float uPR; uniform float uHide;
      varying vec3 vC; varying float vA;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float d = max(length(mv.xyz), 1e-7);
        float m = absmag + 5.0 * (log(d) / 2.302585 - 1.0);
        float b = pow(10.0, -0.4 * (m - uLimit));
        float a = clamp(b, 0.0, 1.0);
        float px = 1.5 + 2.2 * max(0.0, log(b) / 2.302585);
        if (d < uHide) a = 0.0;
        vC = color * (1.0 + 0.5 * max(0.0, log(b) / 2.302585 - 1.0));
        vA = a;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(px, 22.0) * uPR;
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      varying vec3 vC; varying float vA;
      void main(){
        vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p, p);
        float core = exp(-r2 * 9.0); float halo = exp(-r2 * 2.5) * 0.25;
        gl_FragColor = vec4(vC * (core + halo) * vA * uOpacity, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
  });
}

// Exoplanet host markers: a star core plus a faint ring that says "this star has known planets".
function hostMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPR: { value: 1 }, uHover: { value: -1 }, uSel: { value: -1 }, uHide: { value: -1 },
      uRing: { value: 1 }, uOpacity: { value: 1 }, uSize: { value: 1 },
    },
    vertexShader: /* glsl */`
      attribute vec3 color; attribute float lum; attribute float idx;
      uniform float uPR; uniform float uHover; uniform float uSel; uniform float uHide; uniform float uSize;
      varying vec3 vC; varying float vA; varying float vHi; varying float vPx;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float d = max(length(mv.xyz), 1e-7);
        float b = lum / (d * d);                        // relative apparent brightness
        float px = clamp(2.6 + 1.6 * log(1.0 + b * 40.0), 2.6, 14.0) * uSize;
        float a = clamp(0.35 + b * 60.0, 0.35, 1.0);
        float hi = (abs(idx - uHover) < 0.5 || abs(idx - uSel) < 0.5) ? 1.0 : 0.0;
        if (hi > 0.5) { px = max(px, 9.0) * 1.6; a = 1.0; }
        if (abs(idx - uHide) < 0.5) a = 0.0;
        vC = color; vA = a; vHi = hi; vPx = px;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = px * 2.2 * uPR;
      }`,
    fragmentShader: /* glsl */`
      uniform float uRing; uniform float uOpacity;
      varying vec3 vC; varying float vA; varying float vHi; varying float vPx;
      void main(){
        vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length(p);
        if (r > 1.0) discard;
        float core = exp(-r * r * 60.0) * 1.6 + exp(-r * r * 14.0) * 0.4;
        float ringR = 0.78; float w = 1.2 / (vPx * 2.2);
        float ring = smoothstep(w * 2.0, 0.0, abs(r - ringR)) * (0.28 + vHi * 0.7) * uRing;
        vec3 ringCol = mix(vec3(0.45, 0.85, 1.0), vec3(1.0, 0.85, 0.45), vHi);
        vec3 c = vC * core + ringCol * ring;
        gl_FragColor = vec4(c * vA * uOpacity, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
  });
}

function sunMarkerMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uPR: { value: 1 }, uOpacity: { value: 1 } },
    vertexShader: `uniform float uPR; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_PointSize = 26.0 * uPR; }`,
    fragmentShader: `uniform float uOpacity; void main(){ vec2 p = gl_PointCoord*2.-1.; float r = length(p); if (r>1.) discard;
      float core = exp(-r*r*40.)*2.0 + exp(-r*r*8.)*0.35; float ring = smoothstep(0.06,0.0,abs(r-0.8))*0.6;
      gl_FragColor = vec4((vec3(1.0,0.93,0.8)*core + vec3(1.0,0.82,0.45)*ring)*uOpacity, 1.); }`,
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
  });
}

function distanceRings() {
  const group = new THREE.Group();
  const rings = [];
  for (const ly of [10, 100, 1000, 10000, 100000, 1000000]) {
    const r = ly / PC_LY;
    const pts = [];
    for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; pts.push(r * Math.cos(a), 0, r * Math.sin(a)); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x8fb8ff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
    const line = new THREE.LineLoop(geo, mat);
    line.frustumCulled = false;
    group.add(line);
    rings.push({ ly, r, line, mat });
  }
  return { group, rings };
}

export class Universe {
  constructor({ hosts, starsBuf, starNames }) {
    this.scene = new THREE.Scene();
    this.hosts = hosts;

    this.deep = buildDeepField();
    this.scene.add(this.deep);

    this.milkyWay = buildMilkyWay();
    this.scene.add(this.milkyWay);

    this.galaxies = buildGalaxies();
    this.scene.add(this.galaxies);
    this.galaxyList = GALAXIES;

    // HYG real stars
    const f = new Float32Array(starsBuf);
    const n = f.length / 5;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), mag = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      pos[i * 3] = f[i * 5]; pos[i * 3 + 1] = f[i * 5 + 1]; pos[i * 3 + 2] = f[i * 5 + 2];
      mag[i] = f[i * 5 + 3];
      tempToColor(bvToTemp(f[i * 5 + 4]), c);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('absmag', new THREE.BufferAttribute(mag, 1));
    this.realStarMat = realStarMaterial();
    this.realStars = new THREE.Points(g, this.realStarMat);
    this.realStars.frustumCulled = false;
    this.realStars.renderOrder = 5;
    this.scene.add(this.realStars);
    this.starPositions = pos;
    this.starNames = starNames.map(([idx, name, con, mag, dist, spect]) => ({
      name, con, mag, dist, spect, position: new THREE.Vector3(pos[idx * 3], pos[idx * 3 + 1], pos[idx * 3 + 2]),
    }));

    // exoplanet hosts
    const hp = new Float32Array(hosts.length * 3), hc = new Float32Array(hosts.length * 3), hl = new Float32Array(hosts.length), hi = new Float32Array(hosts.length);
    hosts.forEach((h, i) => {
      hp.set(h.pos.toArray(), i * 3);
      tempToColor(h.t ?? 5200, c);
      hc.set([c.r, c.g, c.b], i * 3);
      hl[i] = h.lum;
      hi[i] = i;
    });
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    hg.setAttribute('color', new THREE.BufferAttribute(hc, 3));
    hg.setAttribute('lum', new THREE.BufferAttribute(hl, 1));
    hg.setAttribute('idx', new THREE.BufferAttribute(hi, 1));
    this.hostMat = hostMaterial();
    this.hostPoints = new THREE.Points(hg, this.hostMat);
    this.hostPoints.frustumCulled = false;
    this.hostPoints.renderOrder = 6;
    this.scene.add(this.hostPoints);

    // the Sun
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    this.sunMat = sunMarkerMaterial();
    this.sunPoint = new THREE.Points(sg, this.sunMat);
    this.sunPoint.frustumCulled = false;
    this.sunPoint.renderOrder = 7;
    this.scene.add(this.sunPoint);

    const dr = distanceRings();
    this.rings = dr.rings;
    this.scene.add(dr.group);

    this.gcPosition = new THREE.Vector3(GC_DIST, 0, 0);
  }

  // per frame: fade layers by scale. camDist = distance from the camera to its target (pc), camPos = camera position
  update(camera, { pixelRatio, height, opts, inSystem, hostIndex }) {
    const fovR = (camera.fov * Math.PI) / 180;
    scaleUniform.value = (height * pixelRatio) / (2 * Math.tan(fovR / 2));
    const fromSun = camera.position.length();
    const fromGC = camera.position.distanceTo(this.gcPosition);

    // deep field appears once you are well outside the Milky Way
    this.deep.material.uniforms.uOpacity.value = THREE.MathUtils.smoothstep(fromGC, 30000, 120000) * 0.9;
    this.deep.material.uniforms.uPR.value = pixelRatio;

    // real stars: naked-eye limit near the Sun, gently deeper as you pull back so the neighbourhood stays legible
    const limit = 6.5 + THREE.MathUtils.clamp(2.2 * Math.log10(Math.max(fromSun, 1) / 3), 0, 6);
    this.realStarMat.uniforms.uLimit.value = limit;
    this.realStarMat.uniforms.uPR.value = pixelRatio;
    this.realStarMat.uniforms.uHide.value = inSystem ? 0.02 : 0;
    this.realStarMat.uniforms.uOpacity.value = 1 - THREE.MathUtils.smoothstep(fromSun, 1500, 12000);
    this.realStars.visible = opts.stars;

    this.hostMat.uniforms.uPR.value = pixelRatio;
    this.hostMat.uniforms.uHide.value = inSystem ? hostIndex : -1;
    this.hostMat.uniforms.uRing.value = inSystem ? 0.35 : 1;
    // fade the host markers out when the whole galaxy is in view, they all sit near the Sun
    this.hostMat.uniforms.uOpacity.value = inSystem ? 0.8 : 1 - THREE.MathUtils.smoothstep(fromSun, 2500, 25000);
    this.hostMat.uniforms.uSize.value = THREE.MathUtils.clamp(1.15 - Math.log10(Math.max(fromSun, 1)) * 0.06, 0.75, 1.1);
    this.hostPoints.visible = opts.hosts;

    this.sunPoint.visible = !(inSystem && hostIndex === 0);
    this.sunMat.uniforms.uPR.value = pixelRatio;
    this.sunMat.uniforms.uOpacity.value = inSystem ? 0.5 : 1;

    this.milkyWay.visible = opts.milkyway;
    this.galaxies.visible = opts.galaxies;

    // distance rings fade in when they are a readable size on screen
    const camD = camera.userData.targetDist ?? fromSun;
    for (const r of this.rings) {
      const ratio = r.r / camD;
      const a = THREE.MathUtils.smoothstep(ratio, 0.06, 0.25) * (1 - THREE.MathUtils.smoothstep(ratio, 1.5, 6));
      r.mat.opacity = opts.rings && !inSystem ? a * 0.2 : 0;
      r.line.visible = r.mat.opacity > 0.002;
      r.visibleAlpha = r.mat.opacity;
    }
  }
}
