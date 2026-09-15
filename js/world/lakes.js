/* ==========================================================================
   The Wild West - js/world/lakes.js
   Water bodies: radial disc geometry, the water shader, shore reeds, rocks and lily pads.
   Provides:  waterMats, makeLake
   Expects:   heightAt, LAKES, mat, srgb (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- lakes ----------
// Water is a shader surface in a real basin: it reflects the current sky, breaks
// the sun into a specular glint, ripples in 3D and foams where it meets the bank.
function discGeo(radius, rings, segs) {
  const pos = [], uv = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const rr = radius * (r / rings);
    for (let s = 0; s <= segs; s++) {
      const a = s / segs * TAU;
      pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
      uv.push(0.5 + Math.cos(a) * (r / rings) * 0.5, 0.5 + Math.sin(a) * (r / rings) * 0.5);
    }
  }
  const row = segs + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * row + s;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const waterMats = [];
function waterMat() {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSky: { value: srgb(0x8fd0f2) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: srgb(0xfff0d0) },
      uDeep: { value: srgb(0x093a60) },
      uShallow: { value: srgb(0x35aec6) },
      uNight: { value: 0 }
    },
    vertexShader: [
      'uniform float uTime;',
      'varying vec3 vWorld; varying vec3 vN; varying float vRad;',
      'void main() {',
      '  vec4 wp = modelMatrix * vec4(position, 1.0);',
      '  float h = sin(wp.x * 0.9 + uTime * 1.5) * 0.035',
      '          + sin(wp.z * 1.3 - uTime * 1.9) * 0.030',
      '          + sin((wp.x + wp.z) * 0.55 + uTime * 0.9) * 0.045;',
      '  wp.y += h;',
      '  float dx = 0.9 * cos(wp.x * 0.9 + uTime * 1.5) * 0.035',
      '           + 0.55 * cos((wp.x + wp.z) * 0.55 + uTime * 0.9) * 0.045;',
      '  float dz = 1.3 * cos(wp.z * 1.3 - uTime * 1.9) * 0.030',
      '           + 0.55 * cos((wp.x + wp.z) * 0.55 + uTime * 0.9) * 0.045;',
      '  vN = normalize(vec3(-dx, 1.0, -dz));',
      '  vWorld = wp.xyz;',
      '  vRad = clamp(length(uv - 0.5) * 2.0, 0.0, 1.0);',
      '  gl_Position = projectionMatrix * viewMatrix * wp;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uSky, uSunDir, uSunCol, uDeep, uShallow;',
      'uniform float uTime, uNight;',
      'varying vec3 vWorld; varying vec3 vN; varying float vRad;',
      'void main() {',
      '  vec3 N = normalize(vN);',
      '  vec3 V = normalize(cameraPosition - vWorld);',
      '  float rip = sin(vWorld.x * 7.0 + uTime * 2.6) * 0.5 + sin(vWorld.z * 9.0 - uTime * 3.1) * 0.5;',
      '  N = normalize(N + vec3(rip * 0.05, 0.0, rip * 0.05));',
      '  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);',
      '  float shallow = smoothstep(0.35, 1.0, vRad);',
      '  vec3 col = mix(uDeep, uShallow, shallow);',
      '  col = mix(col, uSky, clamp(fres * 0.85 + 0.12, 0.0, 1.0));',
      '  vec3 L = normalize(uSunDir);',
      '  float sp = pow(max(dot(reflect(-V, N), L), 0.0), 120.0);',
      '  col += uSunCol * sp * 1.7 * (1.0 - uNight * 0.85);',
      '  col += uSunCol * pow(max(dot(reflect(-V, N), L), 0.0), 12.0) * 0.10;',
      '  float edge = smoothstep(0.80, 0.99, vRad + sin(vRad * 62.0 + uTime * 1.2) * 0.02);',
      '  col = mix(col, vec3(0.95, 0.99, 1.0) * (1.0 - uNight * 0.7), edge * 0.7);',
      '  float alpha = mix(0.92, 0.55, shallow);',
      '  alpha = mix(alpha, 0.95, edge);',
      '  gl_FragColor = vec4(col, alpha);',
      '}'
    ].join('\n')
  });
  waterMats.push(m);
  return m;
}
function waterRadius(L) {
  for (let i = 2; i <= 80; i++) {
    const rr = L.r * i / 80;
    if (heightAt(L.x + rr, L.z) > -L.level) return L.r * (i - 1) / 80;
  }
  return L.r * 0.5;
}
const reedMat = mat(0x5f9e3a, 0.9), cattailMat = mat(0x6b4a22, 0.9);
const shoreRockMat = mat(0xa89a80, 0.95), padMat = mat(0x3f8f42, 0.85);
function makeLake(L) {
  const wr = waterRadius(L) * 1.05;
  const w = new THREE.Mesh(discGeo(wr, 24, 44), waterMat());
  w.position.set(L.x, -L.level, L.z);
  w.renderOrder = 3;
  scene.add(w);
  const rn = Math.round(L.r * 1.7);
  for (let i = 0; i < rn; i++) {
    const a = rnd(0, TAU);
    const rr = wr + rnd(0.2, Math.max(0.6, L.r - wr + 1.8));
    const x = L.x + Math.cos(a) * rr, z = L.z + Math.sin(a) * rr;
    if (heightAt(x, z) < -L.level + 0.03) continue;
    if (Math.random() < 0.55) {
      const rc = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 4);
      for (let k = 0; k < n; k++) {
        const h = rnd(0.5, 1.15);
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, h, 4), reedMat);
        st.position.set(rnd(-0.16, 0.16), h / 2, rnd(-0.16, 0.16));
        st.rotation.z = rnd(-0.18, 0.18);
        st.castShadow = true;
        rc.add(st);
        if (Math.random() < 0.6) {
          const head = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.18, 6), cattailMat);
          head.position.set(st.position.x, h + 0.06, st.position.z);
          head.rotation.z = st.rotation.z;
          rc.add(head);
        }
      }
      rc.position.set(x, heightAt(x, z), z);
      scene.add(rc);
    } else {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.16, 0.44), 0), shoreRockMat);
      rock.position.set(x, heightAt(x, z) + 0.05, z);
      rock.rotation.set(rnd(0, TAU), rnd(0, TAU), rnd(0, TAU));
      rock.castShadow = true; rock.receiveShadow = true;
      scene.add(rock);
    }
  }
  for (let i = 0; i < 16; i++) {
    const a = rnd(0, TAU), rr = wr * rnd(0.5, 0.93);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(rnd(0.16, 0.3), 9), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = rnd(0, TAU);
    pad.position.set(L.x + Math.cos(a) * rr, -L.level + 0.015, L.z + Math.sin(a) * rr);
    pad.receiveShadow = true;
    scene.add(pad);
  }
}
LAKES.forEach(makeLake);

