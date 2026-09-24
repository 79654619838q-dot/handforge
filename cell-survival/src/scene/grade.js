// Цветокоррекция и виньетка — последний штрих кадра (после OutputPass, в sRGB).
// Параметры — у каждой темы свои (THEMES[...].grade): тёплая пустыня, холодный айсберг и т. д.
import * as THREE from 'three';

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uLift: { value: new THREE.Vector3(0, 0, 0) },     // сдвиг теней по цвету
    uGain: { value: new THREE.Vector3(1, 1, 1) },     // оттенок светов
    uSat: { value: 1.0 },
    uContrast: { value: 1.0 },
    uVignette: { value: 0.35 },
    uAspect: { value: 1.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec3 uLift; uniform vec3 uGain; uniform float uSat; uniform float uContrast; uniform float uVignette; uniform float uAspect;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      col = col * uGain + uLift * (1.0 - col);
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
      col *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(d) * 1.35);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

// нейтральная коррекция — для меню и экранов без темы
export const GRADE_DEFAULT = { lift: [0.01, 0.005, 0.02], gain: [1.02, 1.0, 0.98], sat: 1.06, contrast: 1.05, vignette: 0.4 };
