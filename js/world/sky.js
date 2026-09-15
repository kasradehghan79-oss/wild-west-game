/* ==========================================================================
   The Wild West - js/world/sky.js
   Sky dome shader and the PMREM environment bake used as image based lighting.
   Provides:  skyU, skyDome, bakeEnvironment
   Expects:   scene, renderer, srgb (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- sky dome ----------
// A real shader sky: vertical gradient, warm horizon haze, sun disc with glow
// and a ground bounce, instead of a stretched 8-pixel gradient.
const skyU = {
  uZenith: { value: srgb(0x3f74b0) },
  uHorizon: { value: srgb(0xcfe0ee) },
  uGround: { value: srgb(0x6b5a3a) },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: srgb(0xffe9c4) },
  uNight: { value: 0 }
};
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(700, 32, 20),
  new THREE.ShaderMaterial({
    uniforms: skyU,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: [
      'varying vec3 vDir;',
      'void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uZenith, uHorizon, uGround, uSunCol;',
      'uniform vec3 uSunDir;',
      'uniform float uNight;',
      'varying vec3 vDir;',
      'void main() {',
      '  vec3 d = normalize(vDir);',
      '  float up = clamp(d.y, 0.0, 1.0);',
      '  vec3 sky = mix(uHorizon, uZenith, pow(up, 0.55));',
      '  float sd = max(dot(d, normalize(uSunDir)), 0.0);',
      '  float glow = pow(sd, 6.0) * 0.30 + pow(sd, 42.0) * 0.45 + pow(sd, 380.0) * 0.55;',
      '  float disc = smoothstep(0.99930, 0.99972, sd);',
      '  sky += uSunCol * (glow + disc * 7.0) * (1.0 - uNight * 0.92);',
      '  float haze = pow(1.0 - min(abs(d.y) * 1.7, 1.0), 5.0);',
      '  sky = mix(sky, uHorizon * 1.08, haze * 0.45);',
      '  sky = mix(sky, uGround * 0.5, smoothstep(0.0, -0.22, d.y));',
      '  gl_FragColor = vec4(sky, 1.0);',
      '}'
    ].join('\n')
  })
);
skyDome.frustumCulled = false;
skyDome.renderOrder = -1000;
scene.add(skyDome);

// ---------- image based lighting ----------
// A tiny equirect of sky + dust + sun, pre-filtered into an environment map so
// metal and cloth pick up real ambient colour instead of flat fills.
const envCv = document.createElement('canvas');
envCv.width = 128; envCv.height = 64;
const envCtx = envCv.getContext('2d');
const envTex = new THREE.CanvasTexture(envCv);
envTex.mapping = THREE.EquirectangularReflectionMapping;
envTex.encoding = THREE.sRGBEncoding;
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
let envRT = null;
function bakeEnvironment(c, sunDir, night) {
  // The ground and horizon bands are authored warm; they have to dim with the
  // scene or the baked ambient keeps the town lit like noon after dark.
  const dim = 1 - 0.86 * night;
  const warm = new THREE.Color(0x7d6647).multiplyScalar(dim);
  const soil = new THREE.Color(0x3a3226).multiplyScalar(dim);
  const top = c.clone().multiplyScalar(0.58);
  const g = envCtx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#' + top.getHexString());
  g.addColorStop(0.30, '#' + c.getHexString());
  g.addColorStop(0.47, '#' + c.clone().lerp(new THREE.Color(0xffe0b0), 0.65 * (1 - night)).getHexString());
  g.addColorStop(0.53, '#' + warm.getHexString());
  g.addColorStop(1, '#' + soil.getHexString());
  envCtx.fillStyle = g;
  envCtx.fillRect(0, 0, 128, 64);
  const u = (Math.atan2(sunDir.x, -sunDir.z) / TAU + 0.5) * 128;
  const v = (0.5 - Math.asin(clamp(sunDir.y, -1, 1)) / Math.PI) * 64;
  const rad = envCtx.createRadialGradient(u, v, 0, u, v, 26);
  rad.addColorStop(0, 'rgba(255,248,226,' + (0.95 * (1 - night)).toFixed(3) + ')');
  rad.addColorStop(0.35, 'rgba(255,196,120,' + (0.45 * (1 - night)).toFixed(3) + ')');
  rad.addColorStop(1, 'rgba(255,170,90,0)');
  envCtx.fillStyle = rad;
  envCtx.fillRect(0, 0, 128, 64);
  envTex.needsUpdate = true;
  const old = envRT;
  envRT = pmrem.fromEquirectangular(envTex);
  scene.environment = envRT.texture;
  if (old) old.dispose();
}

