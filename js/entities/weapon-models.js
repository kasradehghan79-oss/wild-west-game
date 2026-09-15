/* ==========================================================================
   The Wild West - js/entities/weapon-models.js
   Revolver and rifle models: shared gun geometry, materials and assembly.
   Provides:  revSteel, revWood, makeRevolver, makeRifle
   Expects:   box, mat, tmpV (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
const revSteel = new THREE.MeshStandardMaterial({ color: 0x9ba3ac, metalness: 0.7, roughness: 0.35 });
const revDark = new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: 0.6, roughness: 0.5 });
const revWood = new THREE.MeshStandardMaterial({ color: 0x6a4126, metalness: 0.05, roughness: 0.8 });
const gBarrel = new THREE.CylinderGeometry(0.016, 0.019, 0.2, 8);
const gBand = new THREE.CylinderGeometry(0.0205, 0.0205, 0.012, 8);
const gMuzzle = new THREE.CylinderGeometry(0.02, 0.02, 0.014, 8);
const gBore = new THREE.CylinderGeometry(0.009, 0.009, 0.004, 12);
const gSight = new THREE.BoxGeometry(0.005, 0.014, 0.01);
const gDrum = new THREE.CylinderGeometry(0.023, 0.023, 0.055, 12);
const gFrame = new THREE.BoxGeometry(0.022, 0.03, 0.075);
const gHammer = new THREE.BoxGeometry(0.014, 0.028, 0.016);
const gGuard = new THREE.TorusGeometry(0.017, 0.0045, 8, 18);
const gTrigger = new THREE.BoxGeometry(0.006, 0.016, 0.006);
const gGrip = new THREE.BoxGeometry(0.026, 0.09, 0.055);
const gPin = new THREE.CylinderGeometry(0.005, 0.005, 0.03, 8);
function makeRevolver() {
  const gun = new THREE.Group();
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    gun.add(o);
  };
  add(gBarrel, revSteel, 0, 0.004, -0.16, Math.PI / 2);
  add(gBand, revDark, 0, 0.004, -0.2, Math.PI / 2);
  add(gMuzzle, revDark, 0, 0.004, -0.258, Math.PI / 2);
  add(gBore, revDark, 0, 0.004, -0.263, Math.PI / 2);
  add(gSight, revDark, 0, 0.026, -0.215);
  add(gDrum, revSteel, 0, 0.002, -0.05, Math.PI / 2);
  add(gFrame, revDark, 0, -0.006, 0);
  add(gHammer, revSteel, 0, 0.008, 0.045, 0.5);
  add(gGuard, revSteel, 0, -0.022, 0.028, 0, Math.PI / 2);
  add(gTrigger, revDark, 0, -0.018, 0.026, -0.3);
  add(gGrip, revWood, 0, -0.045, 0.068, 0.55);
  add(gPin, revDark, 0, -0.028, 0.048, 0, 0, Math.PI / 2);
  return gun;
}
const winSteel = new THREE.MeshStandardMaterial({ color: 0x5b6169, metalness: 0.78, roughness: 0.34 });
const winDark = new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 0.65, roughness: 0.45 });
const winWood = new THREE.MeshStandardMaterial({ color: 0x7a4a26, metalness: 0.05, roughness: 0.72 });
function makeRifle() {
  const gun = new THREE.Group();
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    gun.add(o);
    return o;
  };
  add(new THREE.CylinderGeometry(0.0115, 0.013, 0.62, 10), winSteel, 0, 0.004, -0.34, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.0195, 0.0195, 0.03, 10), winDark, 0, 0.004, -0.5, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.34, 8), winDark, 0, 0.004, -0.5, Math.PI / 2);
  add(new THREE.BoxGeometry(0.03, 0.028, 0.12), winDark, 0, 0.004, -0.09);
  add(new THREE.BoxGeometry(0.026, 0.05, 0.09), winDark, 0, -0.012, -0.03);
  add(new THREE.BoxGeometry(0.04, 0.036, 0.2), winWood, 0, -0.006, 0.12);
  add(new THREE.BoxGeometry(0.036, 0.05, 0.3), winWood, 0, -0.028, 0.3, 0.16);
  add(new THREE.BoxGeometry(0.028, 0.062, 0.2), winWood, 0, -0.05, 0.42, 0.3);
  add(new THREE.TorusGeometry(0.03, 0.005, 6, 14, Math.PI * 1.35), winDark, 0, -0.03, 0.02, 0, Math.PI / 2, 0.3);
  add(new THREE.BoxGeometry(0.005, 0.014, 0.006), winDark, 0, -0.02, -0.02);
  add(new THREE.BoxGeometry(0.005, 0.02, 0.008), winSteel, 0, 0.024, -0.56);
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 10), winWood, 0, -0.006, -0.2, Math.PI / 2);
  return gun;
}

