# The Wild West

A third-person western shooter that runs entirely in the browser: procedural town,
desert terrain, a rideable horse, posse NPCs, day/night cycle, and a full
round-based match loop. Built on three.js r128. **No build step, no package
manager, no bundler** — open `index.html` and it runs, and it also builds into an
Android APK (see [Android](#android)).

---

## Running it

| How | What to do | Notes |
| --- | --- | --- |
| Double-click | open `index.html` | Works: all resources are plain files next to it (verified over `file://`). |
| Local server | `serve.cmd` (or any static server) | Use this if a browser blocks `file://` sub-resources, or if you add ES modules later. |
| Android | `android\build-apk.ps1` | Builds and signs `dist\The Wild West.apk`. See [Android](#android). |
| Phone / tablet | open it, or install the APK | On-screen controls appear automatically: stick to move (push to the rim to sprint), drag to look, plus fire, aim, reload, jump, mount, store and pause. |

three.js is vendored in `js/vendor/three.min.js`, so nothing is fetched from the
network — the game runs fully offline in a browser and inside the APK.

---

## Android

`android/` is a WebView shell around the same web build: one activity, no third
party libraries, no permissions, and the game is copied into the APK's assets at
build time.

```bash
python android/build_apk.py          # -> dist/The Wild West.apk  (0.3 MB, debug signed)
```

You need a JDK 17+ and Android SDK `build-tools` + `platforms;android-34`; the
script finds both, or takes `--java-home` / `--sdk`, and tells you what to install
if they are missing. `android/build_apk.py --check` only probes the toolchain.
Android Studio users can open `android/` and press Run instead, or publish via
Gradle. Details, signing for Play, and the phone performance notes are in
[`android/README.md`](android/README.md).

---

## Project layout

```
index.html            markup for the canvas, HUD and menus + the load order
android/              WebView shell + build scripts for the APK
css/
  base.css            theme variables, reset, page shell
  hud.css             in-game HUD: score, minimap, vitals, crosshair, kill feed
  menus.css           overlays and menus: round end, start, pause, shop, buttons, touch
js/
  core/
    utils.js          maths/colour/scratch helpers used everywhere
    settings.js       player settings (localStorage) + sRGB→linear helper
    engine.js         renderer, scene, camera, resize
    lights.js         hemisphere, ambient, sun + shadow camera, moon, camp glow
    materials.js      material/mesh factories + the linear-space sweep
    collision.js      static collision circles, movement resolver
    audio.js          WebAudio synth (no audio assets)
    input.js          keyboard, mouse, pointer-lock look, settings panel bindings
    touch.js          mobile controls
  world/
    sky.js            sky dome shader + PMREM environment bake (IBL)
    cycle.js          time of day, sky palette, sun/moon/stars bodies
    textures.js       canvas texture helpers, shingle/plank maps
    terrain.js        heightAt() and the lake basins
    ground.js         ground mesh + tint, dirt streets, bare patches, groundGreen()
    lakes.js          water shader, shore reeds/rocks, lily pads
    mountains.js      distant ridge, sky signature
    buildings.js      houses, windows, chimney smoke, gas lamps, birds
    nature.js         trees, 3D grass tufts (wind + walk trample), clouds, cacti
    props.js          barrels, crates, wheels, hay, troughs, tumbleweeds, pickups
    campfire.js       stone ring, logs, embers, procedural flames
    store.js          the general store building
  entities/
    weapon-models.js  revolver and rifle models
    weapons.js        weapon stats, ammo/upgrades, held models, muzzle flash
    human.js          shared body geometry + makeHuman rig
    archetypes.js     archetype table, the player, camp boundary
    npcs.js           NPC population, spawning, patrol, NPC shooting
    locomotion.js     procedural walk/run, foot planting, NPC brains
    horse.js          horse geometry/rig + updateHorse
    shooting.js       the player's shot: hitscan, damage, recoil
    mount.js          mounting and dismounting
  fx/
    particles.js      point-sprite dust and glow systems
    casings.js        ejected brass
    decals.js         bullet holes, blood splats/pools, tracers
  game/
    dom.js            every DOM handle, resolved once
    state.js          health, stamina, score, wanted level, HUD feedback
    shop.js           general store economy
    rounds.js         round/match flow, scoring, respawns
    loop.js           player input, camera, HUD drawing, day/night, main frame loop
  render/
    post.js           MSAA target, bloom, ACES tonemap, grade, vignette, sRGB encode
```

---

## Architecture

**Classic scripts sharing one global scope.** Each file is a plain
`<script src>` (not an ES module) so the game still runs from `file://` without a
server. Consequences to know about:

1. **Load order in `index.html` is load bearing.** A file may use anything
   declared in a file loaded *above* it. The order in `index.html` mirrors the
   order the code was originally written in, which is also the order the world is
   built in. Do not reorder casually.
2. **No duplicate top-level names.** Because everything shares one scope, two
   files declaring the same `const` is a fatal error. Prefix new globals by
   system (as the existing code does: `gH…` horse geometry, `g…` human geometry,
   `C_…` palettes, `*El` DOM handles).
3. **Each file starts with `"use strict";`.** The original was a single strict
   script, so the directive is repeated per file to keep identical semantics.
4. Every file begins with a banner naming what it provides and what it expects.

**Every system is a plain object literal or IIFE** exposing a small surface
(`FX`, `Sound`, `Post`, `fire`, `horse`), so state stays private where it can.
Shared mutable collections (`blocks`, `shootables`, `solid`, `npcs`, `decals`,
`walkPads`) are deliberately module-level in the file that owns them and pushed
to by whoever needs to register something.

**Build order matters for the world.** Terrain is generated first, then the town
(which registers collision blockers), then vegetation and props (which skip
positions where `collide()` is true). That is why grass avoids the buildings.

---

## Find it fast

| I want to change… | Edit |
| --- | --- |
| Gameplay feel (speed, jump, gravity) | `js/game/loop.js` (`GRAVITY`, `JUMP_V`, move speeds in the player block) |
| Round length, win score | `js/game/state.js` (`ROUND_TIME`, `WIN_PTS`, `MAX_ROUNDS`) |
| Day length, night look | `js/world/cycle.js` (`DAY_LENGTH`, palettes) + the lighting block in `js/game/loop.js` (that block also tints `cloudMat`, the one material every cloud puff shares) |
| Fog, exposure, bloom, grade | `js/render/post.js` (uniforms) and the fog lines in `js/game/loop.js` |
| Terrain shape, lakes | `js/world/terrain.js` (`heightAt`, `LAKES`) |
| Where grass is allowed to grow | `js/world/ground.js` (`groundGreen`) |
| Grass density, wind, trample | `js/world/nature.js` |
| House look and palette | `js/world/buildings.js` (`WALL_COLS`, `ROOF_COLS`) |
| Street props | `js/world/props.js` |
| Horse shape/anatomy | `js/entities/horse.js` (the `loft([…])` ring tables) |
| Horse gait | `js/entities/horse.js` (`updateHorse`) |
| Walking/running animation | `js/entities/locomotion.js` |
| Weapon stats, shop prices | `js/entities/weapons.js`, `js/game/shop.js` |
| Blood, impacts, decals | `js/fx/particles.js`, `js/fx/decals.js` |
| HUD layout | `index.html` markup + `css/hud.css` |
| Menus and overlays | `index.html` markup + `css/menus.css` |

---

## Conventions and gotchas

- **Geometry is generated, not imported.** There are no model files: the horse,
  humans, guns and props are built from three.js primitives and the local
  `loft()` / `sheet()` helpers in `js/entities/horse.js`.
  - `loft(rings, segments, axis, arcStart, arcEnd)` sweeps a surface through
    elliptical rings. Rings may run either direction — winding is corrected
    automatically — and full circles get end caps so a tube can never show its
    own interior. Partial arcs (used for the saddle pad and girth) are open
    sheets by design.
  - `sheet(rows)` makes a thin double-sided strip, used for the mane.
- **Surfaces must not sit a hair apart.** Overlapping shells need ~1 cm of
  separation or they z-fight and shimmer (this bit the muzzle, the neck joint,
  the girth band and the mane sheet). Sink a part *inside* another volume, or
  offset it clearly outside — never flush.
- **Stay in linear space.** Colours authored with `srgb()` are already linear;
  materials built that way must set `__lin = true` so the `linearizeMaterials()`
  sweep does not decode them a second time. Plain hex goes through the sweep once.
- **Grass walking pads** are `Vector4(x, z, radius, strength)` uploaded to the
  grass vertex shader each frame from `updateGrassPads()`.
- **Shooting is hitscan** against `shootables`, with `blocks` used for movement
  collision only.

---

## Verifying a change

The game has no test suite; it is verified by running it. Useful checks:

1. Open the console: it should be silent apart from a `favicon.ico` 404.
2. `scene` object count, `npcs.length`, `renderer.info.programs.length` and the
   frame time are the quick regression signals (baseline ~2200 objects,
   11 NPCs, ~21 programs, ~6.3 ms/frame → about 160 fps).
3. Both `index.html` over `file://` and the same page over a local server boot
   with no console errors.
4. `player.g.position.y`, `horse.g` and the bounding box bottom of the horse
   (should be ≈ 0, hooves on the ground) catch placement regressions.
