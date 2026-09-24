import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { updateTweens } from './tween.js';

// Один WebGL-холст на всю игру. Экран подменяет «мир» (scene + camera + update).
export class Stage {
  constructor(container, settings) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true; // срез фигуры при уходе «под землю» (cinematics.js)
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.world = null;
    this.clock = new THREE.Clock();
    this.composer = null;
    this.applySettings(settings);
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  applySettings(s) {
    this.quality = s.quality;
    this.renderScale = s.renderScale;
    this.renderer.shadowMap.enabled = s.quality === 'high';
    this.resize();
    if (this.world) this._buildComposer();
  }

  setWorld(world) {
    if (this.world && this.world !== world) this.world.dispose?.();
    this.world = world;
    world.scene.environment = world.scene.environment ?? this.envMap;
    world.scene.environmentIntensity = world.envIntensity ?? 0.45;
    this._buildComposer();
    this.resize();
  }

  _buildComposer() {
    const { scene, camera, bloom = 0.7 } = this.world;
    // Старые цели рендера надо освобождать: иначе каждая смена экрана съедает видеопамять
    // и через несколько игр браузер теряет WebGL-контекст (белый экран).
    if (this.composer) {
      this.composer.passes.forEach((p) => p.dispose?.());
      this.composer.dispose();
    }
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    if (this.quality === 'high') {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), bloom, 0.55, 0.95);
      this.composer.addPass(this.bloomPass);
    }
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio, 2) * (this.renderScale || 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
    if (this.world) {
      this.world.camera.aspect = w / h;
      this.world.camera.updateProjectionMatrix();
      this.world.onResize?.(w, h);
    }
  }

  // Отладка: прокрутить логику и анимации вперёд без отрисовки (из консоли).
  async advance(sec, step = 1 / 30) {
    for (let t = 0; t < sec; t += step) {
      updateTweens(step);
      this.world?.update?.(step, this.clock.elapsedTime + t);
      for (let i = 0; i < 8; i++) await Promise.resolve();
    }
  }

  // Нарисованный фон (userData.cover) заполняет экран без растяжения, лишнее обрезается по краям.
  fitBackground() {
    const b = this.world?.scene.background;
    if (!b?.isTexture || !b.userData.cover || !b.image?.width) return;
    const ia = b.image.width / b.image.height, sa = innerWidth / innerHeight;
    const key = ia + ':' + sa;
    if (b.userData.fitKey === key) return;
    b.userData.fitKey = key;
    if (sa > ia) { b.repeat.set(1, ia / sa); b.offset.set(0, (1 - ia / sa) / 2); }
    else { b.repeat.set(sa / ia, 1); b.offset.set((1 - sa / ia) * (b.userData.focusX ?? 0.5), 0); }
  }

  frame() {
    this.fitBackground();
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    updateTweens(dt);
    if (!this.world) return;
    this.world.update?.(dt, t);
    this.composer.render(dt);
  }
}
