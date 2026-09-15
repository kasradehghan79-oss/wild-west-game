/* ==========================================================================
   The Wild West - js/world/campfire.js
   Camp fire: stone ring, charred logs, ember bed, procedural flames and smoke.
   Provides:  fire
   Expects:   scene, heightAt, blocks, FX, canvasTex (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- campfire ----------
// A real fire: a stone ring, charred logs with glowing cracks, a bed of embers,
// and a procedural flame built from crossed sheets of noise that lick upward.
// Additive blending plus the bloom in the post chain makes it actually glow.
const fire = (() => {
  const g = new THREE.Group();
  g.position.set(8, heightAt(8, -5), -5);
  // scorched earth under the fire
  const ash = new THREE.Mesh(new THREE.CircleGeometry(1.35, 20), linMat({ color: srgb(0x2a2019), roughness: 1, transparent: true, opacity: 0.9, depthWrite: false }));
  ash.rotation.x = -Math.PI / 2;
  ash.position.y = 0.015;
  ash.receiveShadow = true;
  g.add(ash);
  // stone ring: flattened, tilted, varied
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * TAU + rnd(-0.1, 0.1);
    const r = 0.72 + rnd(-0.05, 0.05);
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.15, 0.26), 0), mat(pick([0x8d8b83, 0x7c7a72, 0x9a968c])));
    s.position.set(Math.cos(a) * r, rnd(0.02, 0.07), Math.sin(a) * r);
    s.scale.set(1, rnd(0.5, 0.7), 1);
    s.rotation.set(rnd(0, TAU), rnd(0, TAU), rnd(0, TAU));
    s.castShadow = true; s.receiveShadow = true;
    g.add(s);
  }
  // logs: charred, laid in a star, with an emissive map for the burning cracks
  const charMap = canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#241a12'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = 'rgba(60,45,32,0.5)';
      ctx.fillRect(Math.random() * w, Math.random() * h, rnd(2, 9), rnd(1, 3));
    }
  });
  const emberMap = canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, rnd(3, 8));
      grd.addColorStop(0, '#ffb04a');
      grd.addColorStop(0.5, '#c23a06');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);
    }
  });
  const logMat = new THREE.MeshStandardMaterial({
    map: charMap, bumpMap: groundBump, bumpScale: 0.06, roughness: 0.95,
    emissive: 0xff5a12, emissiveMap: emberMap, emissiveIntensity: 0.8
  });
  logMat.__lin = true;
  const gLog = new THREE.CylinderGeometry(0.075, 0.095, 1.05, 7);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU + 0.35;
    const log = new THREE.Mesh(gLog, logMat);
    log.rotation.z = Math.PI / 2 - rnd(0.05, 0.2);
    log.rotation.y = a + rnd(-0.12, 0.12);
    log.position.set(Math.cos(a) * 0.12, 0.12, Math.sin(a) * 0.12);
    log.castShadow = true; log.receiveShadow = true;
    g.add(log);
  }
  // ember bed
  const emberMats = [];
  for (let i = 0; i < 16; i++) {
    const em = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.42, 0.1) });
    em.__lin = true;
    const e = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.035, 0.075), 0), em);
    const a = rnd(0, TAU), r = rnd(0.05, 0.5);
    e.position.set(Math.cos(a) * r, rnd(0.04, 0.11), Math.sin(a) * r);
    e.rotation.set(rnd(0, TAU), rnd(0, TAU), rnd(0, TAU));
    g.add(e);
    emberMats.push({ m: em, seed: rnd(0, 6.3) });
  }
  // flames: four crossed sheets, noise driven, hot at the base
  const flameGeo = new THREE.PlaneGeometry(0.72, 1.35);
  flameGeo.translate(0, 0.675, 0);
  const flameMats = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSeed: { value: i * 1.9 }, uH: { value: 1 } },
      vertexShader: [
        'varying vec2 vUv;',
        'void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime, uSeed;',
        'varying vec2 vUv;',
        'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
        'float noise(vec2 p) {',
        '  vec2 i = floor(p), f = fract(p);',
        '  f = f * f * (3.0 - 2.0 * f);',
        '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),',
        '             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);',
        '}',
        'void main() {',
        '  float t = uTime * 1.7 + uSeed * 9.0;',
        '  float n = noise(vec2(vUv.x * 3.2 + uSeed, vUv.y * 3.6 - t));',
        '  float n2 = noise(vec2(vUv.x * 7.5 - uSeed, vUv.y * 8.0 - t * 1.9));',
        // taper the flame toward the tip and let the noise push it around
        '  float w = mix(0.60, 0.05, pow(vUv.y, 1.3));',
        '  float cx = 0.5 + (n - 0.5) * 0.42 * vUv.y + (n2 - 0.5) * 0.13;',
        '  float a = smoothstep(w, w * 0.1, abs(vUv.x - cx));',
        '  a *= smoothstep(1.0, 0.45, vUv.y);',
        '  a *= smoothstep(0.0, 0.1, vUv.y);',
        '  a *= 0.5 + 0.5 * n2;',
        '  vec3 hot = vec3(1.0, 0.94, 0.62);',
        '  vec3 mid = vec3(1.0, 0.55, 0.12);',
        '  vec3 cool = vec3(0.82, 0.13, 0.02);',
        '  vec3 col = mix(hot, mid, smoothstep(0.0, 0.34, vUv.y));',
        '  col = mix(col, cool, smoothstep(0.4, 0.95, vUv.y));',
        '  col = mix(col, cool * 0.7, 1.0 - n);',
        '  gl_FragColor = vec4(col * a * 1.55, a);',
        '}'
      ].join('\n')
    });
    const f = new THREE.Mesh(flameGeo, m);
    f.rotation.y = i * Math.PI / 4;
    f.renderOrder = 4;
    g.add(f);
    flameMats.push(m);
  }
  // glow ball at the base so the fire has a hot core
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.18), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  coreMat.__lin = true;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), coreMat);
  core.position.y = 0.24;
  core.renderOrder = 3;
  g.add(core);
  const light = new THREE.PointLight(0xff8a30, 1.6, 28, 2);
  light.position.y = 1;
  g.add(light);
  scene.add(g);
  return { flames: flameMats, logMat, emberMats, core: coreMat, light, phase: 0, pos: g.position.clone() };
})();
blocks.push({ x: 8, z: -5, r: 1 });

