/* ==========================================================================
   The Wild West - js/world/nature.js
   Vegetation: trees, the 3D grass tufts with wind and walk-trample, clouds and cacti.
   Provides:  makeTree, bladeTex, grassMat, addTufts, updateGrassPads, QUAL, clouds, makeCactus
   Expects:   scene, heightAt, groundGreen, collide, srgb (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- trees ----------
function makeTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.34, 2.8, 6), mat(0x5d3d22));
  trunk.position.y = 1.4; trunk.castShadow = true; g.add(trunk);
  const leaf = [0x4aa03c, 0x5ab345, 0x3f8f36];
  // every tree gets its own tint so the tree line stops reading as one flat green
  const jit = c => {
    const col = srgb(c);
    col.offsetHSL(rnd(-0.03, 0.03), rnd(-0.04, 0.06), rnd(-0.03, 0.07));
    return col;
  };
  const leafMat = c => { const m = mat(0xffffff, 0.9); m.color.copy(jit(c)); return m; };
  const s1 = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), leafMat(leaf[0]));
  s1.position.y = 3.4; s1.scale.y = 0.85; s1.castShadow = true; g.add(s1);
  const s2 = new THREE.Mesh(new THREE.SphereGeometry(1.3, 7, 5), leafMat(leaf[1]));
  s2.position.set(0.7, 4.4, 0.3); s2.scale.y = 0.85; s2.castShadow = true; g.add(s2);
  const s3 = new THREE.Mesh(new THREE.SphereGeometry(1.0, 6, 5), leafMat(leaf[2]));
  s3.position.set(-0.7, 4.2, -0.4); s3.scale.y = 0.85; s3.castShadow = true; g.add(s3);
  return g;
}
for (let i = 0; i < 52; i++) {
  const a = Math.random() * TAU, r = 30 + Math.random() * 135;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (inLake(x, z, 2.5)) continue;
  const t = makeTree();
  t.position.set(x, heightAt(x, z), z);
  t.scale.setScalar(0.8 + Math.random() * 0.8);
  t.traverse(o => { if (o.isMesh) { shootables.push(o); if (o.geometry.type === 'CylinderGeometry') solid.push(o); } });
  scene.add(t);
  blocks.push({ x, z, r: 0.6 });
}

// v3: real grass. Each instance is a tuft of tapered blades, every blade a pair
// of crossed quads, so a tuft has volume from any angle instead of being a flat
// card. The vertex shader adds wind sway and a press response, so grass flattens
// under whoever walks through it and springs back after they leave.
function bladeAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 64, 0, 4);
  g.addColorStop(0, '#2f6220');
  g.addColorStop(0.45, '#569436');
  g.addColorStop(0.8, '#7cb84a');
  g.addColorStop(1, '#b0da76');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(10, 64);
  ctx.quadraticCurveTo(8, 34, 15, 3);
  ctx.quadraticCurveTo(22, 34, 22, 64);
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  return t;
}
const bladeTex = bladeAtlas();

const GRASS_H = 0.5;
function tuftGeometry(blades) {
  const pos = [], uv = [], idx = [];
  const hw = 0.085;
  let v = 0;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * TAU + rnd(-0.3, 0.3);
    const lean = rnd(0.1, 0.26);
    const h = GRASS_H * rnd(0.55, 1.05);
    const dx = Math.cos(a), dz = Math.sin(a);
    for (let c = 0; c < 2; c++) {
      // two perpendicular vertical planes per blade
      const ax = c === 0 ? -dz : dx, az = c === 0 ? dx : dz;
      const rows = 3, base = v;
      for (let r = 0; r < rows; r++) {
        const t = r / (rows - 1);
        const w = hw * (1 - t * 0.8);
        const y = h * t, ox = dx * lean * t * t, oz = dz * lean * t * t;
        pos.push(ox - ax * w, y, oz - az * w);
        pos.push(ox + ax * w, y, oz + az * w);
        uv.push(0, t, 1, t);
        v += 2;
      }
      for (let r = 0; r < rows - 1; r++) {
        const p0 = base + r * 2;
        idx.push(p0, p0 + 1, p0 + 2, p0 + 1, p0 + 3, p0 + 2);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const WALK_PADS = 16;
const walkPads = [];
for (let i = 0; i < WALK_PADS; i++) walkPads.push(new THREE.Vector4(0, 0, 0, 0));
const grassShaders = [];
function grassMat(map) {
  const m = new THREE.MeshStandardMaterial({ map: map, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
  m.__lin = true;
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = { value: 0 };
    sh.uniforms.uWalk = { value: walkPads };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform float uTime;',
        'uniform vec4 uWalk[' + WALK_PADS + '];'
      ].join('\n'))
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'float kk = clamp(transformed.y / ' + GRASS_H.toFixed(2) + ', 0.0, 1.0);',
        '#ifdef USE_INSTANCING',
        '  vec2 ip = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;',
        '  float sw = sin(uTime * 1.6 + ip.x * 0.5 + ip.y * 0.4) * 0.6',
        '           + sin(uTime * 2.9 + ip.x * 1.1 + ip.y * 0.73) * 0.4;',
        '  transformed.x += sw * 0.10 * kk;',
        '  transformed.z += sw * 0.05 * kk;',
        '  vec2 acc = vec2(0.0);',
        '  float press = 0.0;',
        '  for (int i = 0; i < ' + WALK_PADS + '; i++) {',
        '    vec4 w = uWalk[i];',
        '    if (w.w <= 0.002) continue;',
        '    vec2 d = ip - w.xy;',
        '    float dd = length(d);',
        '    float f = (1.0 - smoothstep(0.0, w.z, dd)) * w.w;',
        '    press += f;',
        '    acc += (d / max(dd, 0.001)) * f;',
        '  }',
        '  press = clamp(press, 0.0, 1.0);',
        '  transformed.y *= 1.0 - 0.88 * press * kk;',
        '  transformed.x += acc.x * 0.36 * kk;',
        '  transformed.z += acc.y * 0.36 * kk;',
        '#endif'
      ].join('\n'));
    grassShaders.push(sh);
  };
  return m;
}
function scatterInstanced(count, fn, range, avoidLakes, accept) {
  const pos = [];
  const R = range || 140;
  let tries = 0;
  while (pos.length < count && tries < count * 40) {
    tries++;
    const x = rnd(-R, R), z = rnd(-R, R);
    if (collide(x, z)) continue;
    if (avoidLakes && inLake(x, z, 0.5)) continue;
    if (accept && !accept(x, z)) continue;
    pos.push([x, Math.random(), z]);
  }
  return fn(pos);
}
function addTufts(count, range, minScale, maxScale) {
  scatterInstanced(count, pos => {
    const im = new THREE.InstancedMesh(tuftGeometry(4), grassMat(bladeTex), pos.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
    pos.forEach(([x, rn, z], i) => {
      // thicker and taller in the middle of a green field, thinning out as the
      // ground turns to dirt at the edges of it
      const g = groundGreen(x, z);
      const s = rnd(minScale, maxScale) * (0.72 + 0.42 * g);
      Q.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, 0));
      P.set(x, heightAt(x, z) + 0.01, z); S.set(s, s * rnd(0.85, 1.15) * (0.82 + 0.3 * g), s);
      M.compose(P, Q, S);
      im.setMatrixAt(i, M);
    });
    scene.add(im);
    return im;
  }, range, true, (x, z) => groundGreen(x, z) >= 0.45);
}
const QUAL = Math.max(0.35, settings.quality / 2 * 0.65 + 0.35);
addTufts(Math.floor(1500 * QUAL), 120, 0.65, 1.45);
// dense band over the town, where the player actually looks at the ground
addTufts(Math.floor(2400 * QUAL), 30, 0.75, 1.6);

// Trample pads. Each pad is (worldX, worldZ, radius, strength): walking stamps a
// pad every half metre, pads keep whatever you are standing on pressed down, and
// they all fade over a couple of seconds - so you push a trail through the grass
// and it springs back up behind you.
const grassActors = [];
const stampAt = new Map();
function updateGrassPads(dt) {
  for (let i = 0; i < WALK_PADS; i++) {
    const p = walkPads[i];
    if (p.w > 0) p.w = Math.max(0, p.w - dt * 0.62);
  }
  const px = player.g.position.x, pz = player.g.position.z;
  grassActors.length = 0;
  grassActors.push(player.g.position);
  if (horse && horse.g) grassActors.push(horse.g.position);
  for (const n of npcs) {
    if (n.dead) continue;
    const g = n.g.position;
    if (Math.hypot(g.x - px, g.z - pz) > 26) continue;
    grassActors.push(g);
  }
  for (let ai = 0; ai < grassActors.length; ai++) {
    const a = grassActors[ai];
    // the player owns the low slots so a wandering posse can never recycle the
    // trail you are leaving in the grass
    const lo = ai === 0 ? 0 : 6, hi = ai === 0 ? 6 : WALK_PADS;
    // whatever we are standing on stays pressed
    let here = -1;
    for (let i = lo; i < hi; i++) {
      const p = walkPads[i];
      if (p.w > 0.15 && Math.hypot(p.x - a.x, p.y - a.z) < 0.5) { here = i; break; }
    }
    const last = stampAt.get(a);
    if (last && Math.hypot(a.x - last.x, a.z - last.z) < 0.55) {
      if (here >= 0) walkPads[here].w = Math.min(1, walkPads[here].w + dt * 3.5);
      continue;
    }
    stampAt.set(a, { x: a.x, z: a.z });
    let slot = here;
    if (slot < 0) {
      slot = lo;
      for (let i = lo + 1; i < hi; i++) if (walkPads[i].w < walkPads[slot].w) slot = i;
      walkPads[slot].set(a.x, a.z, rnd(1.15, 1.5), 1);
    } else {
      walkPads[slot].w = 1;
    }
  }
}
scatterInstanced(Math.floor(340 * QUAL), pos => {
  const geo = new THREE.SphereGeometry(0.05, 5, 4);
  geo.translate(0, 0.3, 0);
  const fmat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0 });
  fmat.__lin = true;
  const im = new THREE.InstancedMesh(geo, fmat, pos.length);
  const fCols = [0xffffff, 0xf2e94e, 0xd65a5a, 0xc78fd6, 0xf2a25a];
  const c = new THREE.Color();
  pos.forEach(([x, rn, z], i) => {
    const M = new THREE.Matrix4().compose(new THREE.Vector3(x, heightAt(x, z) + 0.01, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    im.setMatrixAt(i, M);
    im.setColorAt(i, c.setHex(pick(fCols)).convertSRGBToLinear());
  });
  scene.add(im);
  return im;
}, 120, true, (x, z) => groundGreen(x, z) >= 0.5);

// ---------- scenery: clouds, rocks, cacti, bushes, barrels ----------
// One material and one sphere for every puff: they are all identical, and the loop
// tints the whole sky from a single place as the day burns down (see loop.js).
const cloudMat = linMat({ color: srgb(0xeef4ff), transparent: true, opacity: 0.88, roughness: 1 });
const cloudGeo = new THREE.SphereGeometry(1, 10, 7);
const clouds = [];
for (let i = 0; i < 12; i++) {
  const c = new THREE.Group();
  for (let j = 0; j < 4; j++) {
    const p = new THREE.Mesh(cloudGeo, cloudMat);
    p.position.set(j * 3.5 - 5, Math.random() * 0.8, Math.random() * 2);
    p.scale.set(2 + Math.random() * 2.5, 1 + Math.random() * 0.6, 1.5 + Math.random() * 1.5);
    c.add(p);
  }
  c.position.set(rnd(-250, 250), 54 + Math.random() * 20, rnd(-250, 250));
  scene.add(c);
  clouds.push(c);
}
for (let i = 0; i < 18; i++) {
  const a = Math.random() * TAU, r = 25 + Math.random() * 120;
  const rx = Math.cos(a) * r, rz = Math.sin(a) * r;
  const rock = box(rnd(0.7, 1.5), rnd(0.4, 0.9), rnd(0.7, 1.5), 0xb2a184, rx, heightAt(rx, rz) + 0.25, rz, scene);
  rock.rotation.y = Math.random() * Math.PI;
  rock.rotation.z = Math.random() * 0.3;
}
function makeCactus() {
  const g = new THREE.Group();
  const green = 0x4fae48;
  box(0.28, 1.9, 0.28, green, 0, 0.95, 0, g);
  box(0.2, 0.2, 0.2, green, -0.2, 0.7, 0, g);
  box(0.2, 0.8, 0.2, green, -0.32, 1.0, 0, g);
  box(0.2, 0.2, 0.2, green, 0.2, 0.75, 0, g);
  box(0.2, 1.1, 0.2, green, 0.32, 1.25, 0, g);
  g.traverse(o => { if (o.isMesh) shootables.push(o); });
  return g;
}
for (let i = 0; i < 12; i++) {
  const a = Math.random() * TAU, r = 25 + Math.random() * 110;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (collide(x, z)) continue;
  const c = makeCactus();
  c.position.set(x, heightAt(x, z), z);
  c.scale.setScalar(rnd(0.8, 1.5));
  scene.add(c);
  blocks.push({ x, z, r: 0.5 });
}
for (let i = 0; i < 20; i++) {
  const a = Math.random() * TAU, r = 15 + Math.random() * 120;
  const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 7, 5), linMat({ color: srgb(0x57a83f), roughness: 0.95 }));
  b.position.set(bx, heightAt(bx, bz) + 0.35, bz);
  b.scale.set(rnd(1, 2), rnd(0.5, 0.8), rnd(1, 2));
  b.castShadow = true;
  scene.add(b);
}
