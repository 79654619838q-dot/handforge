// Жизнь поверх нарисованных миров: один полноэкранный слой-шейдер (туман, лучи, сияние, тревожный свет,
// пролетающие корабли) + до 90 частиц. Всё в пространстве камеры — картинка мира не двигается.
// Один проход рисования на слой — нагрузки почти нет. На «Низком» качестве не создаётся.
import * as THREE from 'three';

const COMMON = /* glsl */`
  uniform float uT; uniform float uAspect; varying vec2 vUv;
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
`;

// каждый мир: фрагмент, возвращающий vec4 (цвет, прозрачность)
const LAYERS = {
  desert: `
    vec2 p = vec2(vUv.x * uAspect, vUv.y);
    float band = smoothstep(0.55, 0.0, vUv.y);                                  // пыль стелется понизу
    float dust = fbm(p * 3.0 + vec2(uT * 0.25, 0.0)) * band;
    float glare = pow(max(0.0, 1.0 - distance(vUv, vec2(0.86, 0.95)) * 1.6), 3.0) * (0.75 + 0.25 * sin(uT * 0.7)); // солнце
    vec3 c = vec3(1.0, 0.72, 0.4) * dust * 0.55 + vec3(1.0, 0.85, 0.55) * glare * 0.5;
    gl_FragColor = vec4(c, clamp(dust * 0.35 + glare * 0.4, 0.0, 0.6));`,
  space: `
    vec3 c = vec3(0.0); float a = 0.0;
    // корабли: три огонька с короткими следами пересекают верх кадра, у каждого свой темп
    for (int i = 0; i < 3; i++) {
      float fi = float(i), sp = 0.035 + fi * 0.018, y = 0.78 + fi * 0.06;
      float x = fract(uT * sp + fi * 0.37) * 1.4 - 0.2;
      vec2 d = (vUv - vec2(x, y + sin(uT * 0.3 + fi) * 0.01)) * vec2(uAspect, 1.0);
      float body = exp(-dot(d, d) * 9000.0);
      float trail = exp(-d.y * d.y * 60000.0) * smoothstep(0.0, -0.12, d.x) * smoothstep(-0.12, 0.0, d.x);
      float blink = step(0.5, fract(uT * 1.3 + fi * 0.4));
      c += vec3(0.7, 0.85, 1.0) * (body * 1.6 + trail * 0.45) + vec3(1.0, 0.3, 0.2) * body * blink;
      a += body + trail * 0.4;
    }
    // падающая звезда раз в несколько секунд
    float cyc = floor(uT / 7.0), ph = fract(uT / 7.0);
    vec2 s0 = vec2(h21(vec2(cyc, 1.0)) * 0.8 + 0.1, 0.98), dir = normalize(vec2(-0.6, -0.35));
    vec2 sp = s0 + dir * ph * 0.9, q = (vUv - sp) * vec2(uAspect, 1.0);
    float along = dot(q, dir), across = length(q - dir * along);
    float star = exp(-across * across * 40000.0) * smoothstep(-0.18, 0.0, along) * step(along, 0.0) * smoothstep(0.35, 0.0, ph) * step(0.0, ph);
    c += vec3(0.9, 0.95, 1.0) * star * 1.5; a += star;
    gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));`,
  bunker: `
    // тревога: два красных луча вращаются из верхних углов, края кадра вспыхивают
    vec2 p = vec2(vUv.x * uAspect, vUv.y); float a = 0.0;
    for (int i = 0; i < 2; i++) {
      vec2 o = vec2(i == 0 ? 0.05 * uAspect : 0.95 * uAspect, 1.02);
      vec2 d = p - o; float ang = atan(d.x, -d.y);
      float rot = sin(uT * 1.1 + float(i) * 2.1) * 0.9;
      a += exp(-pow((ang - rot) * 3.2, 2.0)) * smoothstep(1.1, 0.1, length(d)) * 0.35;
    }
    float edge = pow(max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0, 4.0);
    float pulse = 0.5 + 0.5 * sin(uT * 2.7);
    a += edge * pulse * 0.35;
    gl_FragColor = vec4(vec3(1.0, 0.12, 0.08), clamp(a, 0.0, 0.55));`,
  jungle: `
    vec2 p = vec2(vUv.x * uAspect, vUv.y);
    float band = smoothstep(0.45, 0.0, vUv.y);                                  // туман понизу, ползёт
    float fog = fbm(p * 2.2 + vec2(uT * 0.06, uT * 0.02)) * band;
    // лучи сквозь листву из левого верхнего угла
    float ray = 0.0; vec2 d = vUv - vec2(0.15, 1.1);
    float ang = atan(d.x, -d.y);
    ray = pow(max(0.0, sin(ang * 22.0 + fbm(vec2(ang * 3.0, uT * 0.1)) * 3.0)), 6.0) * smoothstep(1.2, 0.2, length(d)) * smoothstep(-0.2, 0.6, ang);
    vec3 c = vec3(0.75, 0.95, 0.75) * fog * 0.8 + vec3(1.0, 0.9, 0.6) * ray * 0.45;
    gl_FragColor = vec4(c, clamp(fog * 0.4 + ray * 0.25, 0.0, 0.55));`,
  iceberg: `
    // северное сияние: волнистые ленты у верха кадра
    float y = vUv.y, a = 0.0; vec3 c = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float wave = 0.84 + fi * 0.04 + sin(vUv.x * (4.0 + fi) + uT * (0.25 + fi * 0.07)) * 0.035 + fbm(vec2(vUv.x * 3.0 + fi, uT * 0.08)) * 0.05;
      float band = exp(-pow((y - wave) * 38.0, 2.0)) * (0.6 + 0.4 * fbm(vec2(vUv.x * 8.0, uT * 0.2 + fi)));
      c += mix(vec3(0.2, 1.0, 0.6), vec3(0.4, 0.6, 1.0), fi / 2.0) * band; a += band * 0.5;
    }
    float frost = smoothstep(0.35, 0.0, vUv.y) * fbm(vec2(vUv.x * uAspect * 3.0 + uT * 0.05, vUv.y * 3.0)) * 0.3;
    c += vec3(0.8, 0.9, 1.0) * frost; a += frost * 0.5;
    gl_FragColor = vec4(c, clamp(a, 0.0, 0.5));`,
};

// частицы в пространстве камеры: [цвет, число, размер, режим]
const MOTES = {
  desert: ['#f5d19a', 70, 0.018, 'wind'],
  bunker: ['#ffa040', 35, 0.014, 'sparks'],
  jungle: ['#d8ff7a', 40, 0.022, 'fireflies'],
  iceberg: ['#ffffff', 90, 0.02, 'snow'],
};

let dot = null;
function dotTex() {
  if (dot) return dot;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return (dot = new THREE.CanvasTexture(c));
}

export class Ambience {
  constructor(themeId, camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    camera.add(this.group);
    const D = 1.2; // расстояние слоя от камеры
    this.D = D;
    const frag = LAYERS[themeId];
    if (frag) {
      this.u = { uT: { value: 0 }, uAspect: { value: 1 } };
      this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
        uniforms: this.u, transparent: true, depthTest: false, depthWrite: false,
        blending: themeId === 'space' || themeId === 'iceberg' || themeId === 'bunker' ? THREE.AdditiveBlending : THREE.NormalBlending,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: COMMON + 'void main(){' + frag + '}',
      }));
      this.plane.position.z = -D; this.plane.renderOrder = 50; this.plane.frustumCulled = false;
      this.group.add(this.plane);
    }
    const m = MOTES[themeId];
    if (m) {
      const [col, n, size, mode] = m;
      this.mode = mode; this.n = n;
      this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.seed = new Float32Array(n);
      for (let i = 0; i < n; i++) this.reset(i, true);
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      this.pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTex(), color: col, size, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
      this.pts.renderOrder = 51; this.pts.frustumCulled = false;
      this.group.add(this.pts);
    }
    this.resize();
  }
  // размеры видимой области на расстоянии слоя
  resize() {
    const c = this.camera, h = 2 * this.D * Math.tan((c.fov * Math.PI) / 360), w = h * c.aspect;
    this.w = w; this.h = h;
    if (this.plane) { this.plane.scale.set(w, h, 1); this.u.uAspect.value = c.aspect; }
  }
  reset(i, anywhere) {
    const w = this.w || 2, h = this.h || 1.2, k = i * 3, r = Math.random;
    this.seed[i] = r();
    let x = (r() - 0.5) * w, y = (r() - 0.5) * h;
    switch (this.mode) {
      case 'wind': if (!anywhere) x = -w / 2 - 0.05; this.vel[k] = 0.35 + r() * 0.4; this.vel[k + 1] = (r() - 0.5) * 0.05; y = -h / 2 + r() * h * 0.6; break;
      case 'snow': if (!anywhere) y = h / 2 + 0.05; this.vel[k] = -0.06 - r() * 0.06; this.vel[k + 1] = -0.12 - r() * 0.12; break;
      case 'sparks': if (!anywhere) { y = h / 2; x = (r() < 0.5 ? -1 : 1) * (0.25 + r() * 0.2) * w; } this.vel[k] = (r() - 0.5) * 0.12; this.vel[k + 1] = -0.25 - r() * 0.3; break;
      default: this.vel[k] = (r() - 0.5) * 0.03; this.vel[k + 1] = (r() - 0.5) * 0.03; y = -h / 2 + r() * h * 0.7; // светлячки
    }
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = -this.D * (0.98 - r() * 0.02);
  }
  update(dt, t) {
    if (this.u) this.u.uT.value = t;
    if (!this.pts) return;
    if (this.camera.aspect * this.h !== this.w) this.resize();
    const w = this.w, h = this.h;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      if (this.mode === 'fireflies') { this.vel[k] += (Math.random() - 0.5) * dt * 0.05; this.vel[k + 1] += (Math.random() - 0.5) * dt * 0.05; }
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt;
      if (Math.abs(this.pos[k]) > w / 2 + 0.1 || Math.abs(this.pos[k + 1]) > h / 2 + 0.1) this.reset(i, false);
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
    if (this.mode === 'fireflies') this.pts.material.opacity = 0.6 + 0.3 * Math.sin(t * 2.3);
  }
  dispose() { this.camera.remove(this.group); this.plane?.geometry.dispose(); this.plane?.material.dispose(); this.pts?.geometry.dispose(); this.pts?.material.dispose(); }
}
