// Procedural planet surfaces, painted on the GPU into equirectangular textures.
// Solar System bodies follow their real colours and large-scale features
// (Jupiter's belts, zones and Great Red Spot, Mars' polar caps, the Moon's
// near-side maria, Pluto's heart, Earth's real coastlines from Natural Earth).
// Exoplanets get an artist's impression from their measured radius and
// temperature, since no one has seen their surfaces.

import * as THREE from 'three';

let renderer = null;
const cache = new Map();
const quadScene = new THREE.Scene();
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quadScene.add(quad);
let landTex = null, landSoftTex = null;

export function initTextures(r, land) {
  renderer = r;
  // rasterise the Natural Earth coastlines once, sharp and blurred (for shallow seas)
  const W = 2048, H = 1024;
  const draw = (blur) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.filter = blur ? `blur(${blur}px)` : 'none';
    ctx.fillStyle = '#fff';
    for (const poly of land) {
      ctx.beginPath();
      poly.forEach(([lo, la], i) => { const x = (lo + 180) / 360 * W, y = (90 - la) / 180 * H; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath(); ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  landTex = draw(0);
  landSoftTex = draw(12);
}

const NOISE = /* glsl */`
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
}
float fbm(vec3 p, int oct){ float a=0.5, s=0.0, n=0.0; for(int i=0;i<9;i++){ if(i>=oct) break; s+=a*snoise(p); n+=a; p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s/n; }
float ridged(vec3 p, int oct){ float a=0.5, s=0.0, n=0.0; for(int i=0;i<8;i++){ if(i>=oct) break; float r=1.0-abs(snoise(p)); s+=a*r*r; n+=a; p=p*2.1+vec3(3.3,1.1,7.7); a*=0.5; } return s/n; }
vec3 hash33(vec3 p){ p=fract(p*vec3(443.897,441.423,437.195)); p+=dot(p,p.yxz+19.19); return fract((p.xxy+p.yxx)*p.zyx); }
// impact craters on a 3D cell grid: returns (height change, fresh ejecta brightness)
vec2 craterLayer(vec3 p, float freq, float density){
  vec3 q = p*freq; vec3 c = floor(q); vec2 acc = vec2(0.0);
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++){
    vec3 cell = c+vec3(x,y,z); vec3 h = hash33(cell+uSeed);
    if (h.z > density) continue;
    vec3 ctr = cell + 0.15 + 0.7*hash33(cell*1.7+uSeed*3.1);
    float r = 0.12 + 0.3*h.x;
    float d = length(q-ctr)/r;
    if (d < 1.0) acc.x += (d*d-1.0)*0.6 + 0.25*pow(d,8.0);
    else acc.x += 0.25*exp(-(d-1.0)*4.0)*step(d,2.6);
    if (h.y > 0.88) acc.y += max(0.0, 1.0-d/3.0)*0.6;
  }
  return acc;
}
vec2 craters(vec3 p, float amount){
  if (amount <= 0.0) return vec2(0.0);
  vec2 a = craterLayer(p, 3.0, 0.35*amount)*1.0 + craterLayer(p, 7.0, 0.5*amount)*0.6
         + craterLayer(p, 17.0, 0.6*amount)*0.35 + craterLayer(p, 40.0, 0.7*amount)*0.2;
  return a;
}
vec3 srgb(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
`;

// Each painter sets: col (sRGB 0..1), hgt (0..1), emi (sRGB), rough (0..1), alpha
const HEADER = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform int uOut;
uniform float uSeed;
uniform float uHue;
uniform int uKind;
uniform sampler2D uLand;
uniform sampler2D uLandSoft;
uniform vec3 uBase;
uniform vec3 uDark;
uniform float uCraters;
#define PI 3.141592653589793
${NOISE}
`;

const MAIN = /* glsl */`
void main(){
  float lon = vUv.x*2.0*PI - PI;
  float lat = (vUv.y - 0.5)*PI;
  vec3 p = vec3(cos(lat)*cos(lon), sin(lat), -cos(lat)*sin(lon));
  vec3 col = vec3(0.5); float hgt = 0.5; vec3 emi = vec3(0.0); float rough = 1.0; float alpha = 1.0;
  paint(p, lat, lon, col, hgt, emi, rough, alpha);
  if (uOut == 0) gl_FragColor = vec4(srgb(col), alpha);
  else if (uOut == 1) gl_FragColor = vec4(vec3(hgt), 1.0);
  else if (uOut == 2) gl_FragColor = vec4(srgb(emi), 1.0);
  else gl_FragColor = vec4(vec3(rough), 1.0);
}`;

// ---------- painters ----------
const ROCKY = /* glsl */`
uniform float uMaria; uniform int uExtra;
void paint(vec3 p, float lat, float lon, inout vec3 col, inout float hgt, inout vec3 emi, inout float rough, inout float alpha){
  vec3 s = p + uSeed;
  float n = fbm(s*3.0, 6);
  float fine = fbm(s*18.0, 3);
  vec2 cr = craters(p, uCraters);
  float m = 0.0;
  if (uMaria > 0.0) {
    float mm = fbm(s*1.3 + 7.0, 4) + p.x*0.22 - 0.09 + (p.y > 0.0 ? 0.03 : 0.0);
    m = smoothstep(0.06, 0.18, mm) * uMaria;
  }
  col = mix(uBase, uDark, clamp(0.5 + n*0.9, 0.0, 1.0));
  col = mix(col, uDark*0.62, m);
  float shade = 1.0 + fine*0.18 + cr.x*0.22 + cr.y*0.5;
  col = clamp(col*shade, 0.0, 1.0);
  hgt = clamp(0.5 + n*0.3 + cr.x*0.35 - m*0.1, 0.0, 1.0);
  float la = degrees(lat), lo = degrees(lon);
  if (uExtra == 1) { // Mars: polar caps
    float al = abs(la) + fbm(p*8.0, 3)*6.0;
    col = mix(col, vec3(0.95,0.93,0.9), smoothstep(lat > 0.0 ? 78.0 : 80.0, lat > 0.0 ? 84.0 : 86.0, al));
  } else if (uExtra == 2) { // Io: sulfur plains, dark volcanic spots, white frost
    float v = fbm(p*9.0+uSeed, 4); col = mix(col, vec3(0.15,0.1,0.06), smoothstep(0.32, 0.4, v));
    float w = fbm(p*5.0+uSeed+3.0, 3); col = mix(col, vec3(0.95,0.93,0.85), smoothstep(0.2, 0.35, w)*0.8);
  } else if (uExtra == 3) { // Europa: brown lineae
    float r = ridged(p*4.0+uSeed, 5); col = mix(col, vec3(0.55,0.38,0.26), smoothstep(0.62, 0.8, r)*0.8);
  } else if (uExtra == 4) { // Pluto: Tombaugh Regio (the heart) and Cthulhu Macula
    float dl = mod(lo - 175.0 + 540.0, 360.0) - 180.0;
    float heart = length(vec2(dl/30.0, (la-20.0)/28.0)) + fbm(p*6.0, 3)*0.4;
    col = mix(col, vec3(0.96,0.94,0.9), smoothstep(1.0, 0.75, heart));
    float ct = length(vec2((mod(lo - 100.0 + 540.0, 360.0) - 180.0)/55.0, (la+8.0)/14.0)) + fbm(p*5.0, 3)*0.5;
    col = mix(col, vec3(0.32,0.17,0.11), smoothstep(1.0, 0.7, ct));
  } else if (uExtra == 5) { // Charon: Mordor Macula
    col = mix(col, vec3(0.45,0.25,0.18), smoothstep(62.0, 78.0, la)*0.8);
  } else if (uExtra == 6) { // icy exoplanet: darker cracks
    col = mix(col, vec3(0.45,0.38,0.33), smoothstep(0.7, 0.82, ridged(p*3.0+uSeed, 4))*0.6);
  }
}`;

const EARTH = /* glsl */`
float box(float la, float lo, float a0, float a1, float o0, float o1, float f){ return smoothstep(0.0, f, min(min(la-a0, a1-la), min(lo-o0, o1-lo))); }
void paint(vec3 p, float lat, float lon, inout vec3 col, inout float hgt, inout vec3 emi, inout float rough, inout float alpha){
  float la = degrees(lat), lo = degrees(lon);
  float n = fbm(p*4.0, 5);
  float fine = fbm(p*22.0, 3);
  float land = texture2D(uLand, vUv).r;
  if (la < -85.0) land = 1.0;
  float coast = texture2D(uLandSoft, vUv).r;
  float al = abs(la);
  if (land < 0.5) {
    float shallow = smoothstep(0.12, 0.85, coast);
    col = mix(vec3(0.012,0.045,0.13), vec3(0.03,0.15,0.25), shallow*0.85 + n*0.08);
    col = mix(col, vec3(0.85,0.9,0.95), smoothstep(72.0, 80.0, al + n*4.0)*0.85);
    hgt = 0.2; rough = al > 72.0 ? 0.8 : 0.55;
    return;
  }
  vec3 c = mix(vec3(0.10,0.22,0.06), vec3(0.24,0.32,0.12), clamp(0.5+n, 0.0, 1.0));
  c = mix(c, vec3(0.36,0.38,0.18), smoothstep(25.0, 40.0, al)*0.6);
  float desert = max(max(max(box(la,lo,14.0,33.0,-17.0,34.0,4.0), box(la,lo,14.0,32.0,34.0,60.0,4.0)), max(box(la,lo,24.0,38.0,52.0,72.0,4.0), box(la,lo,-32.0,-18.0,118.0,146.0,5.0))),
                 max(max(box(la,lo,37.0,47.0,82.0,115.0,4.0), box(la,lo,-29.0,-17.0,12.0,25.0,3.0)), max(max(box(la,lo,26.0,38.0,-118.0,-103.0,3.0), box(la,lo,-27.0,-15.0,-71.0,-68.0,1.5)), box(la,lo,23.0,42.0,70.0,95.0,4.0)*0.8)));
  c = mix(c, mix(vec3(0.76,0.6,0.4), vec3(0.62,0.45,0.3), clamp(0.5+n*1.5, 0.0, 1.0)), clamp(desert*(1.0+n*0.25), 0.0, 1.0));
  c = mix(c, vec3(0.12,0.18,0.1), smoothstep(48.0, 58.0, la)*(1.0-smoothstep(64.0, 70.0, la)));
  c = mix(c, vec3(0.42,0.4,0.33), smoothstep(62.0, 70.0, al));
  float ice = max(max(smoothstep(-60.0, -66.0, la), box(la,lo,60.0,84.0,-73.0,-12.0,3.0)*smoothstep(0.0, 0.4, coast-0.2+n*0.3)), smoothstep(80.0, 84.0, la));
  c = mix(c, vec3(0.93,0.95,0.98), clamp(ice, 0.0, 1.0));
  col = clamp(c*(1.0+fine*0.25), 0.0, 1.0);
  hgt = clamp(0.55 + ridged(p*5.0, 5)*0.45*(1.0-ice), 0.0, 1.0);
  rough = ice > 0.5 ? 0.6 : 0.95;
}`;

const CLOUDS = /* glsl */`
void paint(vec3 p, float lat, float lon, inout vec3 col, inout float hgt, inout vec3 emi, inout float rough, inout float alpha){
  float la = degrees(lat);
  float belt = 0.55*exp(-pow((la-5.0)/8.0, 2.0)) - 0.25*exp(-pow((abs(la)-24.0)/8.0, 2.0)) + 0.35*exp(-pow((abs(la)-55.0)/12.0, 2.0));
  // domain-warped turbulence, stretched east-west like real weather systems
  vec3 w = vec3(fbm(p*2.5, 4), fbm(p*2.5 + 5.2, 4), fbm(p*2.5 + 9.7, 4));
  vec3 q = vec3(p.x*5.0, p.y*9.0, p.z*5.0) + w*1.6;
  float v = fbm(q, 8);
  float streak = fbm(vec3(p.x*14.0, p.y*40.0, p.z*14.0) + w*3.0, 5);
  float a = smoothstep(0.02, 0.5, v + belt*0.3 + streak*0.12);
  col = vec3(1.0); alpha = a*0.92;
}`;

// banded giants: palette chosen by uKind
const BANDS = /* glsl */`
uniform float uTurb; uniform float uStreak;
vec3 stops(float l){
  // Jupiter's belts and zones (planetographic latitude, degrees)
  vec3 zone=vec3(0.93,0.88,0.78), belt=vec3(0.71,0.5,0.34), belt2=vec3(0.62,0.42,0.3), polar=vec3(0.56,0.52,0.48), eq=vec3(0.9,0.8,0.66);
  float L[19]; vec3 C[19];
  L[0]=-90.;C[0]=polar; L[1]=-50.;C[1]=polar; L[2]=-40.;C[2]=vec3(0.68,0.6,0.52); L[3]=-33.;C[3]=belt2; L[4]=-28.;C[4]=zone; L[5]=-24.;C[5]=zone;
  L[6]=-19.;C[6]=belt; L[7]=-9.;C[7]=belt; L[8]=-6.;C[8]=eq; L[9]=6.;C[9]=eq; L[10]=9.;C[10]=belt2; L[11]=17.;C[11]=belt; L[12]=20.;C[12]=zone;
  L[13]=25.;C[13]=zone; L[14]=28.;C[14]=belt2; L[15]=32.;C[15]=vec3(0.8,0.72,0.62); L[16]=42.;C[16]=vec3(0.66,0.6,0.53); L[17]=52.;C[17]=polar; L[18]=90.;C[18]=polar;
  vec3 c = C[0];
  for (int i=1;i<19;i++){ if (l <= L[i]) { float t = (l-L[i-1])/(L[i]-L[i-1]); return mix(C[i-1], C[i], smoothstep(0.0,1.0,t)); } }
  return C[18];
}
vec3 palette(float l){
  float h = uHue;
  if (uKind == 0) return stops(l);                                                                 // Jupiter
  if (uKind == 1) { vec3 c = mix(vec3(0.89,0.79,0.58), vec3(0.78,0.66,0.46), (0.5+0.5*sin(l/3.3)*cos(l/11.0))*0.45);
                    return mix(c, vec3(0.62,0.66,0.68), smoothstep(60.0,80.0,abs(l))*0.6); }      // Saturn
  if (uKind == 2) return mix(vec3(0.66,0.85,0.88), vec3(0.78,0.9,0.92), smoothstep(30.0,80.0,abs(l))); // Uranus
  if (uKind == 3) { vec3 c = mix(vec3(0.24,0.42,0.86), vec3(0.18,0.32,0.72), 0.5+0.5*sin(l/7.0));
                    return mix(c, vec3(0.85,0.9,1.0), smoothstep(3.0,0.0,abs(l+24.0))*0.35); }   // Neptune
  if (uKind == 4) return mix(vec3(0.95,0.86,0.62), vec3(0.86,0.74,0.5), 0.5+0.5*sin(l/9.0));        // Venus
  if (uKind == 5) return mix(vec3(0.86,0.6,0.28), vec3(0.72,0.48,0.22), smoothstep(20.0,70.0,abs(l))); // Titan
  // exoplanets
  if (uKind == 10) return mix(vec3(0.8,0.68,0.52), vec3(0.66,0.52,0.42), 0.5+0.5*sin(l/8.0+h*6.0));              // hot sub-Neptune
  if (uKind == 11) return mix(mix(vec3(0.55,0.72,0.78), vec3(0.62,0.7,0.62), h), vec3(0.48,0.6,0.68), 0.5+0.5*sin(l/10.0+h*6.0)); // sub-Neptune
  if (uKind == 12) return mix(vec3(0.62,0.7,0.66), vec3(0.72,0.66,0.55), 0.5+0.5*sin(l/7.0+h*6.0));              // warm Neptune
  if (uKind == 13) return mix(mix(vec3(0.3,0.48,0.85), vec3(0.55,0.8,0.85), h), vec3(0.25,0.4,0.78), 0.5+0.5*sin(l/9.0)); // ice giant
  if (uKind == 14) return mix(vec3(0.9,0.84,0.72), mix(vec3(0.7,0.52,0.36), vec3(0.62,0.5,0.42), h), 0.5+0.5*sin(l/(4.0+h*3.0))); // cold gas giant
  if (uKind == 15) return mix(vec3(0.93,0.92,0.9), vec3(0.75,0.74,0.72), 0.5+0.5*sin(l/5.0));                    // water clouds
  if (uKind == 16) return mix(vec3(0.3,0.45,0.75), vec3(0.22,0.35,0.62), 0.5+0.5*sin(l/6.0));                    // clear (class III)
  if (uKind == 17) return mix(vec3(0.22,0.16,0.16), vec3(0.32,0.22,0.2), 0.5+0.5*sin(l/6.0));                    // alkali (class IV)
  return mix(vec3(0.3,0.12,0.08), vec3(0.45,0.22,0.12), 0.5+0.5*sin(l/6.0));                                     // class V
}
void paint(vec3 p, float lat, float lon, inout vec3 col, inout float hgt, inout vec3 emi, inout float rough, inout float alpha){
  vec3 s = p + uSeed;
  float warp = fbm(s*2.2, 4)*uTurb;
  float l = degrees(lat + warp);
  vec3 c = palette(l);
  // fine zonal streaks: stretched along longitude, with eddies
  float eddy = fbm(vec3(s.x*3.0, l/180.0*uStreak, s.z*3.0) + fbm(s*6.0, 3)*0.35, 5);
  c *= 1.0 + eddy*0.22;
  float la = degrees(lat), lo = degrees(lon);
  if (uKind == 0) {
    // Great Red Spot near 22 deg S, and the white ovals of the south temperate belt
    vec2 d2 = vec2((mod(lo - 60.0 + 540.0, 360.0) - 180.0)/11.0, (la + 22.5)/5.5);
    float d = length(d2);
    float sw = fbm(vec3(d2*2.0 + atan(d2.y, d2.x)*0.4, d*2.0), 3)*0.3;
    c = mix(c, vec3(0.78,0.4,0.26), smoothstep(1.15, 0.6, d + sw));
    c = mix(c, vec3(0.97,0.9,0.82), smoothstep(0.15, 0.0, abs(d - 1.2))*0.4);
    for (int k=0;k<6;k++){ float dd = length(vec2((mod(lo - float(k)*57.0 + 540.0, 360.0) - 180.0)/3.4, (la + 40.5)/2.2)); c = mix(c, vec3(0.96,0.94,0.9), smoothstep(1.0, 0.4, dd)); }
  }
  col = clamp(c, 0.0, 1.0);
  if (uKind == 18) emi = mix(vec3(0.5,0.12,0.03), vec3(0.85,0.3,0.08), 0.5+0.5*sin(l/6.0));
}`;

const LAVA = /* glsl */`
void paint(vec3 p, float lat, float lon, inout vec3 col, inout float hgt, inout vec3 emi, inout float rough, inout float alpha){
  vec3 s = p + uSeed;
  float r = ridged(s*3.0, 6);
  float crust = fbm(s*6.0, 4);
  float molten = smoothstep(0.72, 0.9, r);
  col = mix(vec3(0.12,0.1,0.09), vec3(0.25,0.2,0.17), clamp(0.5+crust, 0.0, 1.0));
  emi = mix(vec3(0.0), vec3(1.0,0.38,0.08), molten);
  hgt = clamp(0.6 - molten*0.5 + crust*0.3, 0.0, 1.0);
}`;

const vertexShader = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const programs = new Map();
function program(name, body) {
  if (!programs.has(name)) {
    programs.set(name, new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: HEADER + body + MAIN,
      uniforms: {
        uOut: { value: 0 }, uSeed: { value: 0 }, uHue: { value: 0 }, uKind: { value: 0 },
        uLand: { value: null }, uLandSoft: { value: null }, uBase: { value: new THREE.Color() }, uDark: { value: new THREE.Color() },
        uCraters: { value: 0 }, uMaria: { value: 0 }, uExtra: { value: 0 }, uTurb: { value: 0.05 }, uStreak: { value: 30 },
      },
      depthTest: false, depthWrite: false,
    }));
  }
  return programs.get(name);
}

function bake(mat, w, h, out, { srgb = false } = {}) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.UnsignedByteType, colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false,
  });
  rt.texture.anisotropy = 8;
  mat.uniforms.uOut.value = out;
  quad.material = mat;
  const prev = renderer.getRenderTarget();
  const prevTM = renderer.toneMapping;
  renderer.setRenderTarget(rt);
  renderer.render(quadScene, quadCam);
  renderer.setRenderTarget(prev);
  renderer.toneMapping = prevTM;
  return rt.texture;
}

function make(name, body, uniforms, { w = 1024, h = 512, bump = false, rough = false, emissive = false } = {}) {
  const mat = program(name, body);
  for (const [k, v] of Object.entries(uniforms)) {
    if (mat.uniforms[k].value?.isColor) mat.uniforms[k].value.setRGB(...v); else mat.uniforms[k].value = v;
  }
  mat.uniforms.uLand.value = landTex;
  mat.uniforms.uLandSoft.value = landSoftTex;
  return {
    map: bake(mat, w, h, 0, { srgb: true }),
    bump: bump ? bake(mat, Math.min(w, 2048), Math.min(h, 1024), 1) : null,
    emissive: emissive ? bake(mat, Math.min(w, 2048), Math.min(h, 1024), 2, { srgb: true }) : null,
    rough: rough ? bake(mat, Math.min(w, 2048), Math.min(h, 1024), 3) : null,
  };
}

const rocky = (seed, base, dark, crat, extra = 0, maria = 0, size = 1024) =>
  make('rocky', ROCKY, { uSeed: seed, uBase: base, uDark: dark, uCraters: crat, uExtra: extra, uMaria: maria }, { w: size, h: size / 2, bump: true });
const banded = (seed, kind, turb, streak, size = 1024, hue = 0, emissive = false) =>
  make('bands', BANDS, { uSeed: seed, uKind: kind, uTurb: turb, uStreak: streak, uHue: hue }, { w: size, h: size / 2, emissive });

const HI = matchMedia('(max-width: 760px)').matches ? 2048 : 4096;
const SOLAR = {
  mercury: () => rocky(1.01, [0.62, 0.58, 0.55], [0.38, 0.36, 0.34], 1.0),
  venus: () => banded(1.02, 4, 0.35, 6, 512),
  earth: () => make('earth', EARTH, { uSeed: 0 }, { w: HI, h: HI / 2, bump: true, rough: true }),
  earthClouds: () => make('clouds', CLOUDS, { uSeed: 0 }, { w: 2048, h: 1024 }),
  mars: () => rocky(1.04, [0.78, 0.45, 0.26], [0.45, 0.25, 0.16], 0.55, 1, 0, 2048),
  moon: () => rocky(1.05, [0.66, 0.64, 0.61], [0.5, 0.49, 0.47], 1.0, 0, 1, 2048),
  io: () => rocky(1.06, [0.92, 0.84, 0.42], [0.8, 0.55, 0.25], 0, 2),
  europa: () => rocky(1.07, [0.9, 0.87, 0.82], [0.78, 0.7, 0.6], 0.08, 3),
  ganymede: () => rocky(1.08, [0.68, 0.64, 0.58], [0.38, 0.34, 0.3], 0.7),
  callisto: () => rocky(1.09, [0.44, 0.39, 0.33], [0.27, 0.24, 0.21], 1.0),
  titan: () => banded(1.1, 5, 0.1, 4, 512),
  triton: () => rocky(1.11, [0.88, 0.8, 0.74], [0.66, 0.55, 0.5], 0.25),
  pluto: () => rocky(1.12, [0.82, 0.7, 0.56], [0.55, 0.42, 0.32], 0.4, 4),
  charon: () => rocky(1.13, [0.66, 0.64, 0.62], [0.45, 0.43, 0.42], 0.6, 5),
  jupiter: () => banded(1.14, 0, 0.035, 60, HI),
  saturn: () => banded(1.15, 1, 0.02, 40, 2048),
  uranus: () => banded(1.16, 2, 0.01, 8, 1024),
  neptune: () => banded(1.17, 3, 0.04, 20, 1024),
};

export function solarTexture(key) {
  if (!cache.has(key)) cache.set(key, SOLAR[key]());
  return cache.get(key);
}

// ---------- exoplanets ----------

export function classifyExoplanet(R, T) {
  if (R == null) R = 1;
  if (T == null) T = 300;
  if (R < 1.7) {
    if (T > 1000) return 'lava';
    if (T > 500) return 'scorched';
    if (T > 180) return 'temperate-rock';
    return 'ice-rock';
  }
  if (R < 4) return T > 700 ? 'hot-subneptune' : 'subneptune';
  if (R < 8) return T > 500 ? 'warm-neptune' : 'ice-giant';
  if (T < 150) return 'gas-ammonia';
  if (T < 350) return 'gas-water';
  if (T < 900) return 'gas-clear';
  if (T < 1400) return 'gas-alkali';
  return 'gas-hot';
}

export const CLASS_INFO = {
  'lava': 'Lava world: hot enough to melt rock on the day side',
  'scorched': 'Scorched rocky world',
  'temperate-rock': 'Rocky world at moderate temperature',
  'ice-rock': 'Cold rocky or icy world',
  'hot-subneptune': 'Hot sub-Neptune',
  'subneptune': 'Sub-Neptune: the most common kind of planet found so far, with no example in our solar system',
  'warm-neptune': 'Warm Neptune-sized planet',
  'ice-giant': 'Neptune-like ice giant',
  'gas-ammonia': 'Cold gas giant (Jupiter-like ammonia clouds)',
  'gas-water': 'Gas giant with water clouds',
  'gas-clear': 'Warm gas giant, too hot for clouds (Sudarsky class III)',
  'gas-alkali': 'Hot Jupiter: dark, alkali metal absorbers (class IV)',
  'gas-hot': 'Ultra-hot Jupiter: silicate clouds, glowing night side (class V)',
};

const EXO_KIND = { 'hot-subneptune': 10, 'subneptune': 11, 'warm-neptune': 12, 'ice-giant': 13, 'gas-ammonia': 14, 'gas-water': 15, 'gas-clear': 16, 'gas-alkali': 17, 'gas-hot': 18 };

export function exoTexture(kind, seedStr) {
  const key = kind + '|' + seedStr;
  if (cache.has(key)) return cache.get(key);
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  const seed = (h % 10000) / 97.3;
  const hue = ((h >>> 8) % 1000) / 1000;
  let t;
  const mixc = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  if (kind === 'lava') t = make('lava', LAVA, { uSeed: seed }, { w: 1024, h: 512, bump: true, emissive: true });
  else if (kind === 'scorched') t = rocky(seed, mixc([0.62, 0.5, 0.4], [0.58, 0.48, 0.44], hue), [0.32, 0.25, 0.2], 0.6);
  else if (kind === 'temperate-rock') t = rocky(seed, mixc([0.6, 0.52, 0.42], [0.5, 0.48, 0.44], hue), [0.3, 0.28, 0.26], 0.3);
  else if (kind === 'ice-rock') t = rocky(seed, [0.82, 0.86, 0.9], [0.5, 0.55, 0.62], 0.4, 6);
  else {
    const k = EXO_KIND[kind] ?? 18;
    const turb = { 10: 0.08, 11: 0.06, 12: 0.05, 13: 0.04, 14: 0.04, 15: 0.05, 16: 0.03, 17: 0.05, 18: 0.06 }[k];
    const streak = { 10: 10, 11: 12, 12: 20, 13: 20, 14: 50, 15: 40, 16: 30, 17: 25, 18: 20 }[k];
    t = banded(seed, k, turb, streak, 1024, hue, k === 18);
  }
  cache.set(key, t);
  return t;
}

// ---------- rings (1D radial profiles, cheap on the CPU) ----------

function ringTex(W, fill) {
  const data = new Uint8ClampedArray(W * 4);
  for (let i = 0; i < W; i++) { const [r, g, b, a] = fill(i / (W - 1)); data.set([r * 255, g * 255, b * 255, a * 255], i * 4); }
  const c = document.createElement('canvas');
  c.width = W; c.height = 1;
  c.getContext('2d').putImageData(new ImageData(data, W, 1), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash1 = (x) => { const s = Math.sin(x * 127.1) * 43758.5453; return s - Math.floor(s); };

// Saturn's rings, radial profile in units of Saturn's equatorial radius (60,268 km).
export function saturnRingTexture() {
  if (cache.has('saturnRings')) return cache.get('saturnRings');
  const r0 = 1.11, r1 = 2.35;
  const tex = ringTex(4096, (u) => {
    const r = r0 + u * (r1 - r0);
    let a = 0, c = [0.8, 0.72, 0.6];
    if (r < 1.236) a = 0.03;                                                                  // D ring
    else if (r < 1.527) { a = 0.12 + 0.1 * sm(1.3, 1.5, r); c = [0.55, 0.5, 0.45]; }          // C ring
    else if (r < 1.951) { a = 0.78 + 0.16 * sm(1.6, 1.75, r) + 0.04 * Math.sin(r * 90); c = [0.92, 0.84, 0.7]; } // B ring
    else if (r < 2.027) { a = 0.06; c = [0.5, 0.45, 0.4]; }                                 // Cassini Division
    else if (r < 2.269) { a = 0.55 - 0.15 * sm(2.1, 2.26, r); c = [0.84, 0.77, 0.66]; }       // A ring
    else if (Math.abs(r - 2.326) < 0.006) a = 0.4;                                           // F ring
    if (Math.abs(r - 2.214) < 0.0035) a *= 0.1;                                               // Encke gap
    if (Math.abs(r - 2.265) < 0.0015) a *= 0.2;                                               // Keeler gap
    a *= 0.82 + 0.36 * hash1(Math.floor(r * 900));                                            // ringlets
    return [...c, Math.min(1, a)];
  });
  const out = { tex, inner: r0, outer: r1 };
  cache.set('saturnRings', out);
  return out;
}

export function uranusRingTexture() {
  if (cache.has('uranusRings')) return cache.get('uranusRings');
  const r0 = 1.6, r1 = 2.05;
  const rings = [1.637, 1.652, 1.666, 1.75, 1.786, 1.834, 1.863, 1.9, 2.0];
  const tex = ringTex(1024, (u) => {
    const r = r0 + u * (r1 - r0);
    let a = 0;
    for (const rr of rings) a = Math.max(a, Math.exp(-Math.pow((r - rr) / (rr === 2.0 ? 0.006 : 0.0025), 2)));
    return [0.59, 0.59, 0.61, a * 0.47];
  });
  const out = { tex, inner: r0, outer: r1 };
  cache.set('uranusRings', out);
  return out;
}
