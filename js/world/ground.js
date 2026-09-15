/* ==========================================================================
   The Wild West - js/world/ground.js
   Ground mesh with its grass texture and vertex tinting, the dirt streets, and the bare-patch bookkeeping.
   Provides:  ground, shootables, solid, dirtPatches, groundGreen, roadRibbon
   Expects:   heightAt, LAKES, canvasTex, mat (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
const grassTex = canvasTex(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#679a5a';
  ctx.fillRect(0, 0, w, h);
  // bare dirt and darker scrub patches: tiling has to read as dry range land,
  // not as a mown lawn
  for (let i = 0; i < 84; i++) {
    const r = 16 + Math.random() * 62;
    ctx.fillStyle = Math.random() < 0.55 ? 'rgba(196,160,96,0.36)' : 'rgba(72,116,50,0.30)';
    ctx.beginPath();
    ctx.ellipse(Math.random() * w, Math.random() * h, r, r * (0.5 + Math.random() * 0.6), Math.random() * Math.PI, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 1100; i++) {
    const v = 118 + Math.floor(Math.random() * 74);
    ctx.fillStyle = 'rgba(' + v + ',' + (v - 16) + ',' + (v - 46) + ',0.45)';
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  for (let i = 0; i < 15000; i++) {
    const g = 104 + Math.floor(Math.random() * 76);
    ctx.strokeStyle = 'rgba(' + (g - 72) + ',' + g + ',' + (g - 58) + ',0.8)';
    ctx.lineWidth = 1;
    const x = Math.random() * w, y = Math.random() * h;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - 0.5) * 2, y - 2 - Math.random() * 4); ctx.stroke();
  }
});
grassTex.repeat.set(110, 110);
grassTex.anisotropy = 8;
const gGeo = new THREE.PlaneGeometry(600, 600, 200, 200);
gGeo.rotateX(-Math.PI / 2);
{
  const pa = gGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) pa.setY(i, heightAt(pa.getX(i), pa.getZ(i)));
  gGeo.computeVertexNormals();
}
const gCol = [];
{
  const pa = gGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), z = pa.getZ(i), y = pa.getY(i);
    const dry = clamp((y + 1.5) / 4.5, 0, 1);
    // smooth value noise instead of white noise, so the vertex grid stops
    // reading as a quilt of random squares
    const v = 0.94 + 0.07 * Math.sin(x * 0.21 + z * 0.13) + 0.05 * Math.sin(x * 0.07 - z * 0.17 + 1.3) + 0.03 * Math.cos(x * 0.53 + z * 0.41);
    let r0 = (0.54 + dry * 0.26) * v, g0 = (0.64 + dry * 0.12) * v, b0 = (0.46 + dry * 0.20) * v;
    // sand bank around every lake, and wet mud under the waterline
    for (const L of LAKES) {
      const dd = Math.hypot(x - L.x, z - L.z);
      if (dd > L.r + 6) continue;
      const bank = clamp((L.r + 6 - dd) / 6, 0, 1);
      r0 = lerp(r0, 0.84, bank * 0.9); g0 = lerp(g0, 0.71, bank * 0.9); b0 = lerp(b0, 0.50, bank * 0.9);
      if (y < L.level) {
        const sub = clamp((L.level - y) / Math.max(0.001, L.depth), 0, 1);
        r0 = lerp(r0, 0.30, sub * 0.7); g0 = lerp(g0, 0.25, sub * 0.7); b0 = lerp(b0, 0.16, sub * 0.7);
      }
    }
    gCol.push(r0, g0, b0);
  }
}
gGeo.setAttribute('color', new THREE.Float32BufferAttribute(gCol, 3));
const groundBump = softBumpTex(256, 120, 30, 0.5);
  groundBump.repeat.set(110, 110);
  const ground = new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({ map: grassTex, vertexColors: true, roughness: 0.95, metalness: 0.0, bumpMap: groundBump, bumpScale: 0.05 }));
ground.receiveShadow = true;
scene.add(ground);
const shootables = [ground];
const solid = [];
const dirtPatches = [];
for (let i = 0; i < 18; i++) {
  const dx = rnd(-130, 130), dz = rnd(-130, 130), dr = rnd(1.4, 4);
  const p = new THREE.Mesh(new THREE.CircleGeometry(dr, 14), mat(0x9c855a));
  p.rotation.x = -Math.PI / 2;
  p.position.set(dx, heightAt(dx, dz) + 0.02, dz);
  p.receiveShadow = true;
  scene.add(p);
  dirtPatches.push({ x: dx, z: dz, r: dr });
}

// How grassy is this spot, 0 (bare dirt) to 1 (green field). It is the same
// "dry" term the ground vertex tint uses, so the tufts grow exactly where the
// terrain actually looks green instead of sprouting out of the road.
function groundGreen(x, z) {
  const dry = clamp((heightAt(x, z) + 1.5) / 4.5, 0, 1);
  const v = 0.94 + 0.07 * Math.sin(x * 0.21 + z * 0.13) + 0.05 * Math.sin(x * 0.07 - z * 0.17 + 1.3) + 0.03 * Math.cos(x * 0.53 + z * 0.41);
  // low, flat ground is the green stuff; the higher it climbs the drier and
  // browner the tint gets, and the patchy noise term just breaks it up
  let g = clamp(1.18 - dry * 1.0, 0, 1) * (0.78 + 0.44 * clamp((v - 0.80) / 0.34, 0, 1));
  // the dirt streets and their shoulders
  g *= clamp((Math.min(Math.abs(x), Math.abs(z)) - 1.75) / 1.1, 0, 1);
  // bare patches
  for (let i = 0; i < dirtPatches.length; i++) {
    const p = dirtPatches[i];
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r + 1.6) g *= clamp((d - p.r) / 1.6, 0, 1);
  }
  // the sandy bank around every lake
  for (const L of LAKES) {
    const d = Math.hypot(x - L.x, z - L.z);
    if (d < L.r + 6) g *= clamp((d - (L.r + 3.2)) / 2.4, 0, 1);
  }
  // nothing grows in the campfire pit
  const fd = Math.hypot(x - 8, z + 5);
  if (fd < 3.2) g *= clamp((fd - 1.5) / 1.7, 0, 1);
  return clamp(g, 0, 1);
}

function dirtTex(repX, repY) {
  const t = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8a6b45';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      const v = 105 + Math.floor(Math.random() * 70);
      ctx.fillStyle = 'rgb(' + v + ',' + (v - 28) + ',' + (v - 62) + ')';
      ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 2 + Math.random() * 5);
    }
  });
  t.repeat.set(repX, repY);
  return t;
}
function roadRibbon(w, l, axis, cx, cz) {
  const segs = 24;
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs - 0.5) * l;
    const px = axis === 'z' ? cx : cx + t;
    const pz = axis === 'z' ? cz + t : cz;
    const y = heightAt(px, pz) + 0.04;
    const ox = axis === 'z' ? 1 : 0, oz = axis === 'z' ? 0 : 1;
    positions.push(px - ox * w / 2, y, pz - oz * w / 2, px + ox * w / 2, y, pz + oz * w / 2);
    uvs.push(0, i / 2, 1, i / 2);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const t = dirtTex(5, 5);
  const r = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.98, metalness: 0.0, bumpMap: groundBump, bumpScale: 0.04 }));
  r.receiveShadow = true;
  scene.add(r);
}
roadRibbon(3.4, 240, 'z', 0, 0);
roadRibbon(3.4, 240, 'x', 0, 0);
