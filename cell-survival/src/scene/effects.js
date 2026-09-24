import * as THREE from 'three';
import { softDot } from './textures.js';

// Эффекты разрушения: осколки, пыль/искры, вспышка света. Живут своим списком и сами удаляются.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.dot = softDot('#ffffff');
  }

  burst(pos, color, count = 160, speed = 4, size = 0.14, additive = true, gravity = -6, life = 1.6) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3), v = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = pos.x + (Math.random() - 0.5) * 0.8; p[i * 3 + 1] = pos.y + Math.random() * 0.2; p[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.8;
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
      v[i * 3] = Math.cos(a) * s * 0.6; v[i * 3 + 1] = Math.random() * s; v[i * 3 + 2] = Math.sin(a) * s * 0.6;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ map: this.dot, color, size, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: 1 });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.items.push({ obj: pts, life, age: 0, update: (dt, k) => {
      for (let i = 0; i < count; i++) {
        v[i * 3 + 1] += gravity * dt;
        v[i * 3] *= 0.985; v[i * 3 + 2] *= 0.985;
        p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 1 - k;
    } });
  }

  shards(pos, material, sideMaterial, size = 1, n = 4) {
    const s = size / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const geo = new THREE.BoxGeometry(s * 0.95, 0.3 * (0.6 + Math.random() * 0.6), s * 0.95);
      const m = new THREE.Mesh(geo, [sideMaterial, sideMaterial, material, sideMaterial, sideMaterial, sideMaterial]);
      m.position.set(pos.x - size / 2 + s * (i + 0.5), pos.y, pos.z - size / 2 + s * (j + 0.5));
      m.castShadow = true;
      this.scene.add(m);
      const vel = new THREE.Vector3((m.position.x - pos.x) * 2.5 + (Math.random() - 0.5), 1.5 + Math.random() * 2.5, (m.position.z - pos.z) * 2.5 + (Math.random() - 0.5));
      const spin = new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.items.push({ obj: m, life: 2.4, age: 0, update: (dt) => {
        vel.y -= 11 * dt;
        m.position.addScaledVector(vel, dt);
        m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt; m.rotation.z += spin.z * dt;
      }, keepMaterial: true });
    }
  }

  flash(pos, color, intensity = 60, life = 0.9) {
    const l = new THREE.PointLight(color, intensity, 12, 1.5);
    l.position.copy(pos).add(new THREE.Vector3(0, 1, 0));
    this.scene.add(l);
    this.items.push({ obj: l, life, age: 0, update: (dt, k) => { l.intensity = intensity * (1 - k) * (1 - k); } });
  }

  shockwave(pos, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 48), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos).add(new THREE.Vector3(0, 0.05, 0));
    this.scene.add(m);
    this.items.push({ obj: m, life: 0.9, age: 0, update: (dt, k) => { m.scale.setScalar(1 + k * 7); m.material.opacity = 1 - k; } });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      const k = Math.min(1, it.age / it.life);
      it.update(dt, k);
      if (k >= 1) {
        this.scene.remove(it.obj);
        it.obj.geometry?.dispose();
        if (!it.keepMaterial) it.obj.material?.dispose?.();
        this.items.splice(i, 1);
      }
    }
  }

  clear() { for (const it of this.items) this.scene.remove(it.obj); this.items = []; }
}
