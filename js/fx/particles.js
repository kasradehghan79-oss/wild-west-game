/* ==========================================================================
   The Wild West - js/fx/particles.js
   Point-sprite particle systems (dust and glow) behind impacts, sprays and embers.
   Provides:  FX
   Expects:   scene, srgb (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// =====================================================================
//  PARTICLE FX
// =====================================================================
const FX = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const cx = cv.getContext('2d');
  const gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.42, 'rgba(255,255,255,0.62)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  const VS = [
    'attribute float aSize; attribute float aAlpha; attribute vec3 aColor;',
    'varying float vA; varying vec3 vC;',
    'void main() {',
    '  vA = aAlpha; vC = aColor;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = aSize * (340.0 / max(0.001, -mv.z));',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');
  const FS = [
    'uniform sampler2D map; varying float vA; varying vec3 vC;',
    'void main() {',
    '  vec4 t = texture2D(map, gl_PointCoord);',
    '  float a = t.a * vA;',
    '  if (a < 0.02) discard;',
    '  gl_FragColor = vec4(vC, a);',
    '}'
  ].join('\n');
  function makeSys(blend, cap) {
  const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(cap * 3), col = new Float32Array(cap * 3);
    const alp = new Float32Array(cap), sz = new Float32Array(cap);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } }, vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, blending: blend
    });
    const pts = new THREE.Points(geo, m);
    pts.frustumCulled = false;
    scene.add(pts);
    const vel = new Float32Array(cap * 3), life = new Float32Array(cap), maxl = new Float32Array(cap);
    const grav = new Float32Array(cap), drag = new Float32Array(cap), grow = new Float32Array(cap), a0 = new Float32Array(cap);
    let head = 0;
    function emit(o) {
      const i = head; head = (head + 1) % cap;
      pos[i * 3] = o.x; pos[i * 3 + 1] = o.y; pos[i * 3 + 2] = o.z;
      vel[i * 3] = o.vx; vel[i * 3 + 1] = o.vy; vel[i * 3 + 2] = o.vz;
      const c = o.color;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      life[i] = maxl[i] = o.life;
      grav[i] = o.gravity === undefined ? -3 : o.gravity;
      drag[i] = o.drag === undefined ? 1.8 : o.drag;
      grow[i] = o.grow === undefined ? 0 : o.grow;
      a0[i] = o.alpha === undefined ? 1 : o.alpha;
      sz[i] = o.size;
      alp[i] = a0[i];
    }
    function update(dt) {
      let any = false;
      for (let i = 0; i < cap; i++) {
        if (life[i] <= 0) continue;
        any = true;
        life[i] -= dt;
        if (life[i] <= 0) { alp[i] = 0; sz[i] = 0; continue; }
        const k = Math.exp(-drag[i] * dt);
        vel[i * 3] *= k; vel[i * 3 + 2] *= k;
        vel[i * 3 + 1] = vel[i * 3 + 1] * k + grav[i] * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const f = life[i] / maxl[i];
        alp[i] = a0[i] * f * f * (3 - 2 * f);
        sz[i] += grow[i] * dt;
      }
      if (any) {
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aAlpha.needsUpdate = true;
        geo.attributes.aSize.needsUpdate = true;
        geo.attributes.aColor.needsUpdate = true;
      }
    }
    function clear() { life.fill(0); alp.fill(0); geo.attributes.aAlpha.needsUpdate = true; }
    return { emit, update, clear };
  }
  const dust = makeSys(THREE.NormalBlending, 1100);
  const glow = makeSys(THREE.AdditiveBlending, 600);
  const colTmp = new THREE.Color();
  function burst(sys, p, n, o) {
    // particle colours are authored in sRGB like everything else; the point
    // shader outputs them straight into the linear frame, so decode them here or
    // blood comes out pink and dust comes out chalky
    colTmp.set(o.color).convertSRGBToLinear();
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), sp = rnd(o.spMin, o.spMax);
      sys.emit({
        x: p.x + rnd(-o.jx, o.jx), y: p.y + rnd(-o.jy, o.jy), z: p.z + rnd(-o.jz, o.jz),
        vx: Math.cos(a) * sp + (o.dx || 0), vy: rnd(o.upMin, o.upMax) + (o.dy || 0), vz: Math.sin(a) * sp + (o.dz || 0),
        color: colTmp, life: rnd(o.lifeMin, o.lifeMax), size: rnd(o.sizeMin, o.sizeMax),
        gravity: o.gravity, drag: o.drag, grow: o.grow, alpha: o.alpha
      });
    }
  }
  function impact(point, normal, kind) {
    if (settings.quality === 0 && kind !== 'flesh') return;
    const p = point.clone().addScaledVector(normal, 0.05);
    if (kind === 'dirt') {
      burst(dust, p, 13, { color: 0xa89066, spMin: 0.4, spMax: 2.6, upMin: -0.3, upMax: 1.8, jx: 0.1, jy: 0.1, jz: 0.1, lifeMin: 0.35, lifeMax: 1.0, sizeMin: 0.09, sizeMax: 0.26, gravity: -2.6, drag: 2.4, grow: 0.4, alpha: 0.8 });
      // a slow cloud that keeps the hit readable in the air for a moment
      burst(dust, p, 4, { color: 0xb6a37c, spMin: 0.1, spMax: 0.7, upMin: 0.3, upMax: 1.0, jx: 0.14, jy: 0.1, jz: 0.14, lifeMin: 0.6, lifeMax: 1.3, sizeMin: 0.2, sizeMax: 0.42, gravity: -0.35, drag: 1.4, grow: 1.5, alpha: 0.4 });
      // grit sparking off the impact
      burst(glow, p, 5, { color: 0xffd9a0, spMin: 1.4, spMax: 4.0, upMin: 0.3, upMax: 2.2, jx: 0.04, jy: 0.04, jz: 0.04, lifeMin: 0.06, lifeMax: 0.2, sizeMin: 0.03, sizeMax: 0.08, gravity: -9, drag: 1.0, alpha: 1 });
    } else if (kind === 'wood') {
      burst(dust, p, 9, { color: 0x9a7448, spMin: 0.5, spMax: 3, upMin: 0.2, upMax: 2, jx: 0.07, jy: 0.07, jz: 0.07, lifeMin: 0.3, lifeMax: 0.8, sizeMin: 0.07, sizeMax: 0.18, gravity: -4, drag: 2.6, grow: 0.3, alpha: 0.85 });
      // splinters: few, small, heavy
      burst(dust, p, 6, { color: 0x6f512c, spMin: 1.2, spMax: 3.6, upMin: 0.4, upMax: 2.6, jx: 0.05, jy: 0.05, jz: 0.05, lifeMin: 0.35, lifeMax: 0.8, sizeMin: 0.02, sizeMax: 0.06, gravity: -14, drag: 0.8, alpha: 1 });
      burst(glow, p, 7, { color: 0xffb45a, spMin: 0.8, spMax: 3.4, upMin: 0.4, upMax: 2.4, jx: 0.05, jy: 0.05, jz: 0.05, lifeMin: 0.12, lifeMax: 0.34, sizeMin: 0.05, sizeMax: 0.12, gravity: -5, drag: 1.2, alpha: 1 });
      burst(dust, p, 3, { color: 0xbfae90, spMin: 0.1, spMax: 0.5, upMin: 0.25, upMax: 0.8, jx: 0.08, jy: 0.06, jz: 0.08, lifeMin: 0.5, lifeMax: 1.1, sizeMin: 0.16, sizeMax: 0.3, gravity: -0.4, drag: 1.5, grow: 1.2, alpha: 0.35 });
    } else if (kind === 'metal') {
      burst(glow, p, 14, { color: 0xfff0a8, spMin: 1, spMax: 5.5, upMin: 0.2, upMax: 2.6, jx: 0.04, jy: 0.04, jz: 0.04, lifeMin: 0.1, lifeMax: 0.32, sizeMin: 0.04, sizeMax: 0.11, gravity: -7, drag: 1.1, alpha: 1 });
      burst(glow, p, 6, { color: 0xffe9b0, spMin: 3.5, spMax: 7.5, upMin: -0.4, upMax: 1.2, jx: 0.02, jy: 0.02, jz: 0.02, lifeMin: 0.05, lifeMax: 0.14, sizeMin: 0.02, sizeMax: 0.05, gravity: -12, drag: 0.6, alpha: 1 });
    } else if (kind === 'water') {
      splash(p, 12);
    } else if (kind === 'muzzle') {
      burst(glow, p, 8, { color: 0xffcf70, spMin: 0.6, spMax: 3.2, upMin: -0.3, upMax: 1.4, jx: 0.05, jy: 0.05, jz: 0.05, lifeMin: 0.06, lifeMax: 0.16, sizeMin: 0.08, sizeMax: 0.2, gravity: -1, drag: 2.6, alpha: 1 });
      burst(dust, p, 5, { color: 0xcfc3aa, spMin: 0.2, spMax: 1.1, upMin: 0.2, upMax: 1.1, jx: 0.05, jy: 0.05, jz: 0.05, lifeMin: 0.3, lifeMax: 0.7, sizeMin: 0.1, sizeMax: 0.24, gravity: 0.6, drag: 1.6, grow: 0.7, alpha: 0.4 });
    } else if (kind === 'flesh') {
      burst(dust, p, 9, { color: 0x9c1414, spMin: 0.6, spMax: 3.4, upMin: 0.1, upMax: 2, jx: 0.08, jy: 0.08, jz: 0.08, lifeMin: 0.25, lifeMax: 0.7, sizeMin: 0.07, sizeMax: 0.17, gravity: -6, drag: 2.2, grow: 0.2, alpha: 0.95 });
    }
  }
  // wading spray: a white core thrown up, plus a softer skim over the surface
  function splash(p, n) {
    if (settings.quality === 0) return;
    burst(dust, p, n, { color: 0xdff2f7, spMin: 0.5, spMax: 2.3, upMin: 0.7, upMax: 2.6, jx: 0.18, jy: 0.04, jz: 0.18, lifeMin: 0.2, lifeMax: 0.5, sizeMin: 0.05, sizeMax: 0.15, gravity: -10, drag: 1.1, alpha: 0.9 });
    burst(dust, p, Math.max(2, n >> 1), { color: 0xbfe4ee, spMin: 0.2, spMax: 1.0, upMin: 0.15, upMax: 0.8, jx: 0.22, jy: 0.04, jz: 0.22, lifeMin: 0.4, lifeMax: 0.9, sizeMin: 0.1, sizeMax: 0.26, gravity: -2.0, drag: 2.2, grow: 0.9, alpha: 0.5 });
  }
  function blood(p, dir, n) {
    if (settings.quality === 0) return;
    const dx = dir ? dir.x : 0, dy = dir ? dir.y : 0, dz = dir ? dir.z : 0;
    // main spray carried by the bullet
    burst(dust, p, n, { color: 0x9c1414, spMin: 0.8, spMax: 4.2, upMin: 0.4, upMax: 2.6, jx: 0.09, jy: 0.09, jz: 0.09, lifeMin: 0.25, lifeMax: 0.75, sizeMin: 0.07, sizeMax: 0.19, gravity: -7, drag: 1.8, grow: 0.2, alpha: 0.95, dx: dx * 1.6, dy: dy * 1.2, dz: dz * 1.6 });
    // fast thin streaks that shoot out along the wound channel
    burst(dust, p, Math.max(3, Math.round(n * 0.5)), { color: 0xa31212, spMin: 2.2, spMax: 6.5, upMin: 0.5, upMax: 3.0, jx: 0.05, jy: 0.05, jz: 0.05, lifeMin: 0.12, lifeMax: 0.34, sizeMin: 0.025, sizeMax: 0.07, gravity: -13, drag: 0.7, alpha: 1, dx: dx * 3.4, dy: dy * 2.6, dz: dz * 3.4 });
    // fine mist that hangs in the air
    burst(dust, p, Math.max(2, Math.round(n * 0.4)), { color: 0x6f0b0b, spMin: 0.2, spMax: 1.2, upMin: 0.2, upMax: 1.3, jx: 0.12, jy: 0.1, jz: 0.12, lifeMin: 0.45, lifeMax: 1.0, sizeMin: 0.12, sizeMax: 0.3, gravity: -0.7, drag: 2.6, grow: 1.1, alpha: 0.5 });
  }
  function dustRing(p, n) {
    burst(dust, p, n, { color: 0xb2a077, spMin: 1.1, spMax: 2.6, upMin: 0.05, upMax: 0.5, jx: 0.25, jy: 0.05, jz: 0.25, lifeMin: 0.35, lifeMax: 0.8, sizeMin: 0.12, sizeMax: 0.3, gravity: -0.6, drag: 2.4, grow: 1.1, alpha: 0.5 });
  }
  function emit(sys, o) { sys.emit(o); }
  function update(dt) { dust.update(dt); glow.update(dt); }
  function clear() { dust.clear(); glow.clear(); }
  return { emit, burst, impact, blood, splash, dustRing, update, clear, dust, glow };
})();

