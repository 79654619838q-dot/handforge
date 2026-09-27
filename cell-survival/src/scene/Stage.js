import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { GradeShader, GRADE_DEFAULT } from './grade.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { ASSETS } from '../paths.js';
import { updateTweens } from './tween.js';
import { updateAvatars, setMainRenderer, setLowFx } from '../managers/AvatarManager.js';

// Один WebGL-холст на всю игру. Экран подменяет «мир» (scene + camera + update).
export class Stage {
  constructor(container, settings) {
    this.container = container;
    Stage.current = this; // сцены выбывания включают размытие фона через Stage.current.setDof
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true; // срез фигуры при уходе «под землю» (cinematics.js)
    container.appendChild(this.renderer.domElement);
    setMainRenderer(this.renderer); // портреты игроков рисуются этим же окном (общие шейдеры и текстуры)

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.themeEnv = new Map(); // освещение миров из панорам Poly Haven (CC0), assets/env/<тема>.hdr

    this.world = null;
    this.clock = new THREE.Clock();
    this.composer = null;
    this.applySettings(settings);
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // Уровни: ultra — компьютер (объём в углах, SMAA, всё включено); high — телефон (свечение, FXAA);
  // low — слабые устройства. «auto» выбирает сам по устройству.
  // «Авто»: «Максимум» (постобработка) — только на отдельной видеокарте. Встроенная (Intel UHD/Iris, AMD Radeon
  // Graphics, телефоны) — «Высокое»: кадр сразу на экран. Замер 28.09 на ноутбуке оператора (Chrome рисует на
  // Intel UHD): «Максимум» 7 к/с, прямой вывод — 60+.
  static resolveQuality(q) {
    if (q !== 'auto') return q;
    const phone = Math.min(innerWidth, innerHeight) < 600 || matchMedia('(pointer: coarse)').matches;
    return phone || Stage.integratedGpu() ? 'high' : 'ultra';
  }
  static integratedGpu() {
    if (Stage._igpu !== undefined) return Stage._igpu;
    let name = '';
    try { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl?.getExtension('WEBGL_debug_renderer_info'); name = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : ''; gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* нет данных */ }
    Stage.gpuName = name;
    return (Stage._igpu = !name || /intel|uhd|iris|radeon\(tm\) graphics|radeon graphics|vega|mali|adreno|powervr|apple|swiftshader|llvmpipe|microsoft basic/i.test(name));
  }

  applySettings(s) {
    this.quality = Stage.resolveQuality(s.quality || 'auto');
    setLowFx(this.quality === 'low');
    this.renderScale = s.renderScale;
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.resize();
    if (this.world) this._buildComposer();
  }

  setWorld(world) {
    if (this.world && this.world !== world) this.world.dispose?.();
    this.world = world;
    world.scene.environment = world.scene.environment ?? this.envMap;
    world.scene.environmentIntensity = world.envIntensity ?? 0.45;
    if (world.themeId && this.quality !== 'low') this.loadThemeEnv(world.themeId).then((env) => { if (env && this.world === world) world.scene.environment = env; });
    this._buildComposer();
    this.resize();
  }

  // Панорама мира даёт настоящие отражения и блики на людях и клетках (тёплое солнце пустыни, холодный лёд…).
  // Одна загрузка на тему; пока грузится — нейтральная студия.
  loadThemeEnv(id) {
    if (!this.themeEnv.has(id)) {
      this.themeEnv.set(id, new HDRLoader().loadAsync(`${ASSETS}env/${id}.hdr`).then((tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        const env = this.pmrem.fromEquirectangular(tex).texture;
        tex.dispose();
        return env;
      }).catch(() => null));
    }
    return this.themeEnv.get(id);
  }

  _buildComposer() {
    const { scene, camera, bloom = 0.7 } = this.world;
    // Старые цели рендера надо освобождать: иначе каждая смена экрана съедает видеопамять
    // и через несколько игр браузер теряет WebGL-контекст (белый экран).
    if (this.composer) {
      this.composer.passes.forEach((p) => p.dispose?.());
      this.composer.dispose();
      this.composer = null;
    }
    this.bloomPass = this.aoPass = this.dofPass = this.gradePass = null;
    // «Высокое» и «Низкое» — без постобработки: кадр сразу на экран, сглаживание — встроенное в холст,
    // тон и цвет — сам рендерер, затемнение краёв — слоем страницы (#vignette). На встроенной видеокарте это 60+ к/с.
    this.setVignette(this.world.grade);
    if (this.quality !== 'ultra') { this.resize(); return; }
    // Кадр рисуется в цель со встроенным сглаживанием краёв 4× (MSAA): без него постобработка
    // давала «лесенку» на краях клеток и фигурок — игра выглядела пиксельной (оператор 27.09).
    const q0 = this.quality;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q0 === 'low' ? 0 : 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    const q = this.quality;
    this.aoPass = null; this.bloomPass = null; this.aaPass = null;
    if (q === 'ultra') {
      // объёмное затенение в стыках: у ног на клетке, между клетками, в складках одежды
      this.aoPass = new GTAOPass(scene, camera, innerWidth, innerHeight);
      this.aoPass.blendIntensity = 0.85;
      this.aoPass.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.6, thickness: 1.2, scale: 1, samples: 12 });
      this.composer.addPass(this.aoPass);
    }
    this.dofPass = null;
    if (q === 'ultra') {
      // «кино»: в сцене выбывания фон за игроком размывается (включает Cinematic.focus)
      this.dofPass = new BokehPass(scene, camera, { focus: 4, aperture: 0.004, maxblur: 0.009 });
      this.dofPass.enabled = false;
      this.composer.addPass(this.dofPass);
    }
    if (q !== 'low') {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), bloom, 0.55, 0.95);
      this.composer.addPass(this.bloomPass);
    }
    this.composer.addPass(new OutputPass());
    if (q !== 'low') {
      const g = this.world.grade || GRADE_DEFAULT;
      this.gradePass = new ShaderPass(GradeShader);
      const u = this.gradePass.uniforms;
      u.uLift.value.set(...g.lift); u.uGain.value.set(...g.gain); u.uSat.value = g.sat; u.uContrast.value = g.contrast; u.uVignette.value = g.vignette;
      this.composer.addPass(this.gradePass);
      // после постобработки встроенное сглаживание не работает — сглаживаем сами
      this.aaPass = null; // сглаживание — MSAA в цели кадра (FXAA/SMAA мылили картинку)
    }
    this.resize();
  }

  // Размытие фона: focus — расстояние от камеры до игрока; null — выключить.
  setDof(focus) {
    if (!this.dofPass || this.dofOff) return;
    this.dofPass.enabled = focus != null;
    if (focus != null) this.dofPass.uniforms.focus.value = focus;
  }

  // затемнение краёв и лёгкая сочность — слоем страницы поверх холста (почти бесплатно, в отличие от прохода по кадру)
  setVignette(g) {
    if (!this.vig) { this.vig = document.createElement('div'); this.vig.id = 'vignette'; this.vig.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1'; this.container.after(this.vig); }
    const v = this.quality === 'ultra' ? 0 : (g?.vignette ?? 0.4);
    this.vig.style.background = v ? `radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,${Math.min(0.75, v * 1.3)}) 100%)` : 'none';
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    // телефон: выше 1.5 пикселя на точку глаз разницы не видит, а видеокарта считает вдвое больше
    const phone = Math.min(w, h) < 600 || matchMedia('(pointer: coarse)').matches;
    const pr = Math.min(window.devicePixelRatio, phone ? 1.5 : 2) * (this.renderScale || 1) * (this.autoScale || 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
    if (this.gradePass) this.gradePass.uniforms.uAspect.value = w / h;
    if (this.aaPass?.material?.uniforms?.resolution) this.aaPass.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
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
  // Экран без 3D (world.cssOnly — главное меню): картинка показывается слоем страницы в полном качестве и цвете,
  // холст скрыт и не рисуется. (Прозрачный холст поверх картинки в игре ронял частоту до 1–2 кадров.)
  cssBackdrop() {
    const url = this.world?.cssOnly ? this.world.cssUrl : '';
    if (url === this.bgUrl) return !!url;
    this.bgUrl = url;
    const st = this.container.style;
    st.backgroundImage = url ? `url("${url}")` : ''; st.backgroundSize = 'cover'; st.backgroundPosition = `${(this.world?.cssFocusX ?? 0.5) * 100}% 50%`; st.backgroundRepeat = 'no-repeat';
    this.renderer.domElement.style.visibility = url ? 'hidden' : '';
    return !!url;
  }


  // Автокачество: раз в 2 с смотрим частоту кадров. Меньше 45 — выключаем объёмное затенение,
  // потом снижаем разрешение (до 60%), затем выключаем свечение. Больше 57 долго — возвращаем по шагу. Настройки игрока не трогаем.
  autoTune(raw) {
    if (document.hidden || raw > 0.5) { this.fpsT = 0; this.fpsN = 0; return; } // вкладка спала — не считаем
    this.fpsT = (this.fpsT || 0) + raw; this.fpsN = (this.fpsN || 0) + 1;
    if (this.fpsT < 2) return;
    const fps = this.fpsN / this.fpsT;
    this.fpsT = 0; this.fpsN = 0;
    this.fps = fps;
    const s = this.autoScale || 1;
    if (fps < 40) {
      // «Максимум» не тянет — сразу на прямой вывод (постобработка самая дорогая)
      if (this.quality === 'ultra' && (this.slowRuns = (this.slowRuns || 0) + 1) >= 2) { this.quality = 'high'; this.slowRuns = 0; this._buildComposer(); return; }
      // сначала выключаем дорогие эффекты; разрешение трогаем последним и не ниже 85% — иначе «пиксели»
      if (this.aoPass?.enabled) this.aoPass.enabled = false;
      else if (!this.composer && this.renderer.shadowMap.enabled) { this.renderer.shadowMap.enabled = false; this.world?.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); }); }
      else if (this.dofPass && !this.dofOff) this.dofOff = true;
      else if (this.bloomPass?.enabled) this.bloomPass.enabled = false;
      else if (s > 0.86) { this.autoScale = Math.max(0.85, s - 0.15); this.resize(); }
      this.goodRuns = 0;
    } else if (fps > 57 && (this.goodRuns = (this.goodRuns || 0) + 1) >= 3) {
      this.goodRuns = 0;
      if (s < 1) { this.autoScale = 1; this.resize(); }
      else if (this.bloomPass && !this.bloomPass.enabled) this.bloomPass.enabled = true;
      else if (this.aoPass && !this.aoPass.enabled) this.aoPass.enabled = true;
    }
  }

  frame() {
    const raw = this.clock.getDelta();
    this.autoTune(raw);
    const dt = Math.min(raw, 0.05);
    const t = this.clock.elapsedTime;
    updateTweens(dt);
    if (!this.world) return;
    updateAvatars(dt, this.world.scene);
    this.world.update?.(dt, t);
    if (this.cssBackdrop()) return; // меню: только картинка, 3D не рисуется
    this.fitBackground();
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.world.scene, this.world.camera);
  }
}
