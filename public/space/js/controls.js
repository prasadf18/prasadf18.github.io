// A camera rig that orbits a target with logarithmic zoom, inertia,
// and cinematic fly-to moves across many orders of magnitude.

import * as THREE from 'three';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class OrbitRig {
  constructor(dom, camera, opts = {}) {
    this.dom = dom;
    this.camera = camera;
    this.active = false;
    this.target = new THREE.Vector3();
    this.dist = opts.dist ?? 10;
    this.minDist = opts.minDist ?? 1e-6;
    this.maxDist = opts.maxDist ?? 1e9;
    this.yaw = opts.yaw ?? 0;
    this.pitch = opts.pitch ?? 0.4;
    this.vYaw = 0; this.vPitch = 0; this.vZoom = 0;
    this.up = new THREE.Vector3(0, 1, 0);
    this.basis = new THREE.Quaternion();
    this.follow = null;       // () => Vector3 , keeps the target on a moving body
    this.flight = null;
    this.idleSpin = 0;        // radians / s of gentle drift
    this.onUserInput = null;
    this.zoomFloor = null;    // () => number, dynamic min distance (body radius)
    this._pointers = new Map();
    this._bind();
  }

  setUp(up) {
    this.up.copy(up).normalize();
    this.basis.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.up);
  }

  // Express the current camera direction in yaw / pitch about the current up axis.
  syncFromDirection(dirFromTarget) {
    _v.copy(dirFromTarget).normalize().applyQuaternion(_q.copy(this.basis).invert());
    this.pitch = Math.asin(THREE.MathUtils.clamp(_v.y, -1, 1));
    this.yaw = Math.atan2(_v.x, _v.z);
  }

  direction(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).applyQuaternion(this.basis);
  }

  flyTo({ target, follow = null, dist, yaw, pitch, duration = 2.5, arc = true, onDone }) {
    const from = this.target.clone();
    const getTo = follow || (() => target);
    const d0 = Math.log(this.dist), d1 = Math.log(dist ?? this.dist);
    const sep = from.distanceTo(getTo());
    const peak = arc ? Math.max(d0, d1, Math.log(Math.max(sep * 0.9, 1e-12))) : Math.max(d0, d1);
    let y0 = this.yaw, y1 = yaw ?? this.yaw;
    while (y1 - y0 > Math.PI) y1 -= 2 * Math.PI;
    while (y1 - y0 < -Math.PI) y1 += 2 * Math.PI;
    this.follow = null;
    this.flight = { t: 0, duration, from, getTo, d0, d1, peak, y0, y1, p0: this.pitch, p1: pitch ?? this.pitch, follow, onDone };
    this.vYaw = this.vPitch = this.vZoom = 0;
  }

  cancelFlight() { this.flight = null; }

  // user took the controls mid-flight: stop, but keep tracking the body we were heading to
  _abortFlight() {
    if (!this.flight) return;
    this.follow = this.flight.follow;
    this.flight = null;
  }

  update(dt) {
    const f = this.flight;
    if (f) {
      f.t = Math.min(1, f.t + dt / f.duration);
      const k = ease(f.t);
      // position travels mostly while we are zoomed out: bias the lateral motion
      const kp = ease(THREE.MathUtils.clamp((f.t - 0.08) / 0.84, 0, 1));
      this.target.lerpVectors(f.from, f.getTo(), kp);
      // quadratic bezier in log distance, through the peak
      const a = f.d0, b = 2 * f.peak - 0.5 * (f.d0 + f.d1), c = f.d1;
      const ld = (1 - k) * (1 - k) * a + 2 * (1 - k) * k * b + k * k * c;
      this.dist = Math.exp(ld);
      this.yaw = f.y0 + (f.y1 - f.y0) * k;
      this.pitch = f.p0 + (f.p1 - f.p0) * k;
      if (f.t >= 1) {
        this.flight = null;
        this.follow = f.follow;
        f.onDone && f.onDone();
      }
    } else {
      if (this.follow) this.target.copy(this.follow());
      const damp = Math.exp(-dt * 6);
      this.yaw += this.vYaw * dt + this.idleSpin * dt;
      this.pitch += this.vPitch * dt;
      this.dist *= Math.exp(this.vZoom * dt);
      this.vYaw *= damp; this.vPitch *= damp; this.vZoom *= Math.exp(-dt * 7);
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.53, 1.53);
      const floor = this.zoomFloor ? Math.max(this.minDist, this.zoomFloor()) : this.minDist;
      if (this.dist < floor) { this.dist += (floor - this.dist) * Math.min(1, dt * 10); this.vZoom = Math.max(0, this.vZoom); }
      this.dist = Math.min(this.dist, this.maxDist);
    }
    this.direction(_v);
    this.camera.position.copy(this.target).addScaledVector(_v, this.dist);
    this.camera.up.copy(this.up);
    this.camera.lookAt(this.target);
  }

  _bind() {
    const el = this.dom;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      el.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.active || !this._pointers.has(e.pointerId)) return;
      const p = this._pointers.get(e.pointerId);
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (this._pointers.size === 2) {
        const pts = [...this._pointers.values()];
        const before = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        p.x = e.clientX; p.y = e.clientY;
        const after = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (before > 0 && after > 0) { this.dist *= before / after; this._input(); }
        return;
      }
      p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 3) return;
      const s = 0.0055;
      this._abortFlight();
      this.yaw -= dx * s; this.pitch += dy * s;
      this.vYaw = -dx * s * 30; this.vPitch = dy * s * 30;
      this._input();
    });
    const end = (e) => this._pointers.delete(e.pointerId);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this._abortFlight();
      const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      this.vZoom += THREE.MathUtils.clamp(dy, -200, 200) * 0.012;
      this._input();
    }, { passive: false });
  }

  zoomBy(f) { this.vZoom += Math.log(f) * 6; this._input(); }

  _input() { this.idleSpin = 0; this.onUserInput && this.onUserInput(); }
}
