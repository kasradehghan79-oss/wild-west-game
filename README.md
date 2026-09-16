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
| Phone / tablet | open it, or install the APK | On-screen controls appear automatically: stick to move (push to the rim to sprint), drag to look, plus fire, aim, reload, weapon switch, mount, store and pause. |

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

**The built APK is committed**, so it can be downloaded and side-loaded without
building anything: [`dist/wildwest.apk`](dist/wildwest.apk) (0.36 MB) - open it on
the phone, or `adb install -r "dist/wildwest.apk"`. It is the same bytes the build
script produces; `tests/apk.spec.mjs` fails if it drifts from the web build, so a
committed APK is never a stale one.

---

## What ships, and what can be read

The repository is meant to be read. What leaves it is not. `tools/make-dist.mjs`
folds the 57 game scripts into one wrapped in an IIFE - which turns every shared
global into a local, so a compiler may rename all of them - and runs that
through the Closure Compiler, which drops every comment, every blank line and
every name it can. `dist/www/` is the result, and it is what the APK and the
Windows setup carry: unzipping either one gives you a 213 KB script, not the
source.

```bash
node tools/make-dist.mjs    # -> dist/www  (index.html, app.js, css/, js/vendor/)
```

Both builders run it themselves, so a stale copy cannot ship, and
`tests/dist.spec.mjs` plays that build through the page - its globals are gone,
so it is driven like a player would - and checks that the source names, the
comments and the file layout are no longer in there.

**This is deterrence, not protection, and it is worth being plain about that.**
Anything a machine can run, a determined person can read: the compiled script is
still JavaScript, and a patient reader with a debugger can follow what it does.
What it stops is the casual thing - downloading the APK, unzipping it, and
finding the game's source, comments and all, sitting in `assets/www`.

---
## Windows

`windows/` builds a setup file for any Windows 10 or 11 PC: a normal
`Setup.exe` with a wizard, a Start Menu shortcut, an uninstaller and an entry in
Settings > Apps - all of it per-user, so **no administrator is needed**, in
either direction.

```bash
python windows/build_setup.py            # -> dist/The Wild West Setup.exe  (0.4 MB)
python windows/build_setup.py --check    # report the toolchain and payload
python windows/build_setup.py --selftest # build, then install and remove it in a scratch folder
```

One file, and one file only: the version lives inside it, so Explorer's Details
tab and the wizard both report it. The uninstaller appears when you install -
the setup writes a copy of itself into the install folder as `Uninstall.exe`
alongside `Uninstall` in Settings > Apps. It finds the install through the
registry, so that copy works even if it is moved.

The compiler it uses is `csc.exe`, which ships inside Windows with the .NET
Framework, so there is nothing to install first and no third party tooling to
keep around: `windows/setup.cs` is the whole installer.

It installs the web build as it is - the game runs from `file://`, with no
server and no network - and opens it in Microsoft Edge's application mode, which
gives it a window of its own, without an address bar or tabs, on the browser
every Windows machine already has. `tests/windows.spec.mjs` boots the game over
`file://` to keep that premise honest, and runs the setup into a scratch folder
to check it installs and removes cleanly.

The setup is unsigned, so the first run shows SmartScreen's "Windows protected
your PC": *More info* then *Run anyway*. Signing it needs a code signing
certificate, which is the only part of this that costs money. Details, including
the `--portable` mode that unpacks the game without any shortcuts or registry
entry, are in [`windows/README.md`](windows/README.md).

---

## The mark, and the opening screen

The mark is **Six Suns**: a revolver cylinder standing on the horizon where a
sun would be, its six chambers each holding a sunset. It is the game's world (a
day that ends) and the game's gun (six rounds) in one shape, and it is drawn in
the same colours the world is - ink `0x241c12`, brass `0xd4af37`, steel
`0x475372`, twilight `0xff9a4a`, sun `0xffdd55`, adobe `0xf0d8a8`.

The title is a wordmark, not a font: the letters are stroked SVG paths in
`index.html`, so the name opens the same on every machine and the Android icon
can be cut from the same artwork. Source files live in `brand/` (`icon.svg`,
`mark.svg`, `title.svg`, `wide.svg`); the launcher PNGs are generated from the
same drawing in `android/tools/make-icon.cjs`.

Opening the game plays one day: `js/game/splash.js` paints a 2D canvas behind
the title screen - the sky walking night, first light, dawn, morning, noon,
golden hour and dusk - while the cylinder indexes across it, sixty degrees at a
time, one chamber lighting in battery per round. Six rounds, six steps of
daylight, and the last frame leaves the cylinder standing on the horizon exactly
as the icon draws it.

Three things about it are deliberate:

- **It is 2D, on its own canvas.** The WebGL renderer is already building the
  town behind this screen; the opening must not compete with it for the device.
- **Its clock counts painted frames, not wall time**, so a slow phone or a long
  world build cannot eat the first third of the day.
- **It stops when the match starts**, and it is a one-off: the game says so with
  the `mode:change` event it already emits, so nothing in the play path needed a
  hook. If the browser asks for reduced motion, one finished frame is drawn and
  no animation is scheduled at all.

The canvas publishes where its horizon landed as the `--horizon` CSS variable,
and `#start` uses it as padding: on a screen with room, the sun, the title and
the menu are three separate bands, and on a landscape phone - where the menu
needs the whole screen - the sun drops low and passes behind the panel.

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
    event-bus.js      Bus: one publish/subscribe channel between systems
    settings.js       player settings (localStorage) + sRGB→linear helper
    engine.js         renderer, scene, camera, resize
    lights.js         hemisphere, ambient, sun + shadow camera, moon, camp glow
    materials.js      material/mesh factories + the linear-space sweep
    collision.js      static collision circles, movement resolver
    audio.js          WebAudio synth (no audio assets)
    game-state.js     Mode: the named states and the one author of "frozen"
    save-system.js    Save: versioned snapshots, slots, autosave, validation
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
  ai/
    perception.js     sight, hearing and memory: what an NPC can notice and recall
    behavior.js       the state machine that turns that into what he is doing
    squad.js          shared sightings, roles and orders for the posse
  fx/
    particles.js      point-sprite dust and glow systems
    casings.js        ejected brass
    decals.js         bullet holes, blood splats/pools, tracers
  missions/
    objectives.js     the reusable objective components (kill, reach, survive, escort...)
    mission.js        a mission: stages, failure conditions, rewards, branching
    manager.js        which missions are running, flags, markers, prompts, save/load
    catalog.js        the missions themselves, as data
  game/
    dom.js            every DOM handle, resolved once
    state.js          health, stamina, score, wanted level, HUD feedback
    shop.js           general store economy
    rounds.js         round/match flow, scoring, respawns
    save-ui.js        save/load screen, pause menu entries, CONTINUE
    loop.js           player input, camera, HUD drawing, day/night, main frame loop
    splash.js         the opening screen: the animated day on the title card
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

**The camera is over the shoulder, and the shot leaves from that eye.** The camera
block in `js/game/loop.js` holds it a little to one side of the player, further over
when aiming and higher in the saddle (at the rider's eyes, looking over the horse),
so your own body, hat or horse's neck never sits under the crosshair. The crosshair
is the centre of the view, and `shoot()` in `js/entities/shooting.js` casts from the
same camera along the same direction, discarding hits nearer than the player and, in
the saddle, the horse: a shot cannot stop on your own mount or on a man standing
behind you. `tests/gameplay.spec.mjs` (`aiming`) asserts both halves from the real
shot path.

---

## Game states, events and saves

Three small modules carry the cross-cutting concerns, so no gameplay file has to
know about the menus and no menu has to know about gameplay:

- **`Mode`** (`js/core/game-state.js`) owns the states — `boot`, `menu`,
  `playing`, `paused`, `shop`, `dialogue`, `inventory`, `missionComplete`,
  `missionFailed`, `dead`, `over`. It is the *only* writer of the `paused` and
  `shopOpen` flags that older systems read, and `Mode.live()` is the single
  definition of "the match is running" that the frame loop and every gameplay
  system ask. Anything that moves or ticks is gated on it, so pausing genuinely
  stops the world: NPCs, the horse rig, particles, shell casings, pickups, the
  round timer, the day/night clock, wanted decay and passive healing all hold
  still behind a menu instead of running on.
- **`Bus`** (`js/core/event-bus.js`) is a publish/subscribe channel so systems
  can react to each other without importing each other. Live channels:
  `mode:change`, `round:start`, `round:end`, `player:hurt`, `player:died`,
  `save:loaded`. A listener that throws is caught and logged, never fatal.
- **`Save`** (`js/core/save-system.js`) writes versioned snapshots into
  `localStorage` under `wildwest.save.<slot>`: three manual slots plus a rolling
  `auto`. Autosave is written at every round boundary and on a fresh match, and
  manual saves can be taken from the pause menu at any time. Reading never trusts
  the file: every field is type checked, clamped into the range the game can run
  with, and defaulted if missing, so a tampered or half written save cannot put
  the world into an impossible state — and the previous contents of a slot are
  kept as a fallback before it is overwritten. A save that cannot be parsed is
  reported as `corrupt` in the UI rather than silently deleted.

Loading rebuilds a clean round and then stamps the saved progress over it, so
every derived system (NPC respawn, spawn points, pickups, effects) starts from a
state the game knows how to run. A saved position that is inside a wall after the
rebuild is nudged to the nearest clear spot.

---

## Crimes, witnesses and the law

The wanted level is not a timer, it is a record. `js/law/` keeps that record and
the people who can add to it:

- **`law.js`** — a table of crimes and what each is worth
  (`gunfire`, `menace`, `assault`, `theft`, `property`, `robbery`, `horseTheft`,
  `murder`, `lawman`). Heat accumulates, and the wanted level is *derived* from the
  running total, so the level is a consequence rather than a counter. On top of it
  sits the escalation table: one deputy comes asking at 1, a pair at 2, the sheriff
  rides out at 3, a search party at 4, and at 5 a price is set on your head. The record
  cools when nobody has eyes on you, and it is saved, so consequences outlive the round
  they were earned in.
  **The posse is a fixed garrison.** The town holds exactly as many lawmen as the chosen
  difficulty says - four at GREENHORN up to eleven at LEGEND, one of them the sheriff and
  the top levels including bounty hunters - and it is rebuilt to that roster at the start
  of each round, entering from fixed posts on the roads into town. Nothing spawns a lawman
  mid-round: a rising wanted level *commits* men who already exist, so the headcount in the
  street never changes and no one ever materialises beside the player. **Noise is a confrontation, blood is a gunfight**: firing into the dirt or a wall buys you a deputy's
  attention: he comes and stands in front of you with his gun out and does not shoot. Shoot a
  *person* - assault, murder, a lawman, armed robbery - and the county answers with lead
  immediately, at whatever wanted level that offence happens to earn. Anyone you shoot at may
  return fire regardless (self defence needs no permission).
- **`witnesses.js`** — a crime is only worth what somebody saw. A crime opens a
  case, and the case finds its witnesses with the *same* senses the AI uses
  (`Perceive.canSee`: range, field of view, line of sight). A witness runs for the
  nearest lawman, and only when he gets there does the report land and the heat
  arrive — which is the window the player plays in: run him down, put a gun on him
  (a levelled gun for a second makes him drop it), or pay him off with the `BRIBE`
  pill. Silence him and the case goes cold; spare one of three and the other two
  still talk.

Shooting, wounding and killing all feed it: public gunfire is a crime when it is
seen, an assault is worth more, and the death of a lawman is worth the most. The
HUD shows the price on your head while there is one.

---

## Difficulty

Five levels - GREENHORN, DEPUTY, GUNHAND, OUTLAW, LEGEND - picked on the title
screen or in the pause menu, remembered in settings, and applied from a single
table in `js/core/difficulty.js`. Nothing else reads that table: every system asks
the module for a scaled number, so the shape of a level can change without touching
a call site.

A level turns every knob that matters, not just enemy health: foe health, damage,
miss chance, fire rate, reaction time and engagement range; how far they can see,
how fast they work it out and how hard they press as a squad; **how many lawmen there are at all** (4 at GREENHORN up to 11 at LEGEND, one of them the sheriff, including bounty hunters at the top); how often the law
calls for help; your own damage, your healing rate and how many bandages and
cartridges the county has lying around; shop prices and mission pay; how long the
wanted level takes to cool off; and the width of the aim assist cone. Missions
scale too - more men in a crowd objective, shorter hold-outs, tighter clocks - but
a count of one is always one, so the sheriff is still one man to find.

| Level | Tag | In one line |
| --- | --- | --- |
| GREENHORN | EASY | They miss a lot, they hesitate, and the county is generous. |
| DEPUTY | NORMAL | Forgiving, but they will still shoot back. |
| GUNHAND | HARD | The balance the game was tuned around. |
| OUTLAW | VERY HARD | Cover matters. Every shot has to count. |
| LEGEND | BRUTAL | One mistake. They remember your face. |

The tuning baseline sits at **HARD**: GUNHAND's numbers are the ones the game was
balanced around, and the two levels below it are progressively softer so there is
room to learn. DEPUTY (the default) is one notch gentler than that baseline, and
GREENHORN below it is gentler again.

---

## The knife, and silence

The player always carries a knife, alongside the guns. It is a weapon first and a lethal
one: anyone within arm's reach (2m) dies to a single blow. **The sheriff is the only
exception** - he takes two, because he is the round's target.

A swing is an animation rather than an instant result. He draws the blade back and turns
his shoulder, drives it through with his body behind it, and settles back to guard; the
blow lands at the impact frame partway through, so distance and facing are judged at the
moment the knife arrives, not when the button went down. A man who has stepped out of
reach is not stabbed.

- **A backstab** - a man whose back is turned, who has not seen you, at 1.6m or less -
  kills him outright, with no shot, no shout and no noise at all.
- **Nobody hears it, so nobody reports it.** The wanted level is derived from the
  crimes the law *hears about*, and a crime only reaches the law through a witness
  (see the law system above). Kill a man in an empty alley and the record stays clean:
  no heat, no wanted level, no posse. Do it in front of a lawman and it is a murder
  like any other.
- **An ordinary stab is not silent.** It makes a noise that nearby men will come and
  investigate, and it is a crime when anyone is watching.
- Backstabbing is not a free pass: it needs the man unaware *and* facing away, so it
  rewards reading a scene rather than walking in swinging.

| Weapon | Where it comes from | Damage | Notes |
| --- | --- | --- | --- |
| Revolver | carried | 1.0 | 8 rounds |
| Winchester | bought at the store | 1.75 | 10 rounds |
| **Knife** | carried | lethal | one blow kills anyone; two for the sheriff; silent from behind. No ammo, 2m reach |

Switch weapons with `1` / `2` / `3`, cycle with `V`, or on a phone tap the switch
button in the top-left strip (the ammo readout shows `—` for the knife, since it has
nothing to count).

---

## How the code is organised

Layers, and the rule that dependencies only ever point downwards:

```
core/       utils, event bus, settings, difficulty, engine, lights, materials,
            collision, audio, game state, saves, input, touch     - no game rules
world/      sky, cycle, terrain, ground, lakes, mountains, buildings, nature,
            props, campfire, store                                 - the place
entities/   human, archetypes, npcs, locomotion, horse, weapons,
            weapon-models, shooting, mount                         - the people
ai/         perception, behavior, squad                            - what they decide
law/        law, witnesses                                         - what it costs
missions/   objectives, mission, manager, catalog                  - what is being asked
game/       dom, state, shop, rounds, hud, minimap, save-ui,
            difficulty-ui, loop                                    - the frame, the HUD, the menu
```

Everything is a **classic script in one shared global scope**, which is deliberate:
the game has to run from `file://` inside the Android WebView, where ES modules are
blocked by CORS, and it has to run with no build step. The price is that every
top-level name is public and the load order in `index.html` is load-bearing, so
there are three rules and two tools to keep that honest:

- **Load order is top to bottom by layer.** A file may only use names from files
  above it in `index.html`. The one exception worth knowing: a file that *spawns
  things at load time* (npcs.js builds the garrison, which needs `Squads`) must sit
  below what it uses, which is why `ai/` loads before `entities/npcs.js`.
- **Every top-level name is declared exactly once**, and is referenced by something.
- **No file is loaded that does not exist, and no file exists that is not loaded.**

```bash
npm run lint    # eslint, tuned for a shared global scope: no-undef, no-redeclare,
                # no-dupe-keys, no-unreachable, eqeqeq ... correctness, not taste
npm run audit   # sizes, the global surface, dead names, and the load order
                # (--check turns it into a gate; tests/structure.spec.mjs runs it)
```

`npm run lint` is the one that earns its keep: `no-undef` in a shared scope catches
exactly the failures this architecture invites - a name used before it exists, a
typo that silently creates a global, a helper that only works because a browser
global happens to share its name. `tools/globals.json` is the inventory the linter
checks against, generated from the code by the audit, so the two cannot drift.

**Adding a system** is then four steps: write the file, add it to `index.html` below
everything it uses, run `npm run audit` to regenerate the inventory, run
`npm run lint` and the specs.

---

## Perception, behaviour and squads

NPCs notice things before anyone shoots. `js/ai/` is a three part layer over the
existing movement and combat code, which it left alone:

- **`perception.js`** — every archetype has senses: a sight range, a field of view,
  a hearing radius, sharpness and courage (`SENSES`). Sight is not a distance check:
  it is a field of view test plus a real line of sight ray against the same `solid`
  list that blocks movement, re-checked a few times a second and staggered across
  the cast so the cost per frame stays flat. Hearing is a `Perceive.noise(x, z,
  radius, kind)` event, fired by gunshots, shouts and bodies hitting the dirt. Out
  of both comes `suspicion` (0..1), which *settles towards* what the man is actually
  looking at - a stranger walking past levels off around 0.25, a levelled gun, a
  fresh shot, a price on your head or being hit takes him over the line - plus
  `lastKnown` and `heard`, which age and are eventually forgotten.
- **`behavior.js`** — one state machine for everyone: `wander`, `work`,
  `suspicious`, `investigate`, `search`, `combat`, `cover`, `flank`, `retreat`,
  `flee`, `dead`. The chain the game did not have before is the interesting one: an
  NPC can notice you *without* being ordered to fight, walk over and look, sweep the
  area for a few seconds, and only then go loud. It writes exactly one thing,
  `n.ai = { state, moveTo, speed }`, and the movement code carries it out, so this
  file never has to know how a leg bends. Cover is chosen by finding a solid object
  whose far side actually breaks the line to the player.
- **`squad.js`** — lawmen are one posse: a sighting by any of them, once he is sure,
  becomes everyone's, and the squad hands out roles so three men do not do the same
  thing - `suppress` (closest man pins you down), `flank` (the next swing wide,
  alternating sides), `advance`, `hold`, and `withdraw` when enough of them are
  down. A call to arms also goes out for bodies in the street, civilian ones
  included, which is the thread the law system will pull on.

Everything is archetype driven and additive: `ARCH.bandit` is on the table with
`hostile: true` for the road agents of later phases, and a new archetype only needs
an entry there plus a row in `SENSES`.

**Cost control.** Sight runs on a stagger, hearing is an event list, and the squad
decides orders a few times a second rather than every frame. `startRound()` clears
everyone is suspicion, so a reshuffled town has not seen you yet.

---

## Missions

The round loop is the *match* (rounds, score, respawns, the clock); what a round is
actually about is a mission. `js/missions/` is a small framework that any amount of
content can be built on:

- **`objectives.js`** — the reusable components. Each is a state machine with the
  same surface (`setup`, `update`, `marker`, `prompt`, `use`, `snapshot`,
  `restore`) so missions can mix them freely:
  `killTargets`, `reachLocation`, `escapeArea`, `surviveDuration`, `protectNpc`,
  `collectItems`, `interactWith` (talk / steal / search / report, optionally held),
  `captureTarget` (wound, then walk them down), and the group objectives `all` and
  `any` — `any` is how a mission branches ("outlast them **or** cut them down").
- **`mission.js`** — a mission definition: metadata, one or more **stages** (each a
  list of objectives), `fail` conditions (`playerDead`, `timeLimit`, `npcDead`,
  `leftArea`, `wanted`, `custom`), a `reward`, and hooks (`onStart`, `onDone`,
  `onFail`). A stage can branch: `next(m)` returns the stage to move to.
- **`manager.js`** — the registry and the running missions (one main plus any side
  jobs), the story flags they set, and the surfaces the rest of the game asks for:
  the HUD tracker, minimap markers, the contextual interact prompt, and
  `snapshot()` / `restore()` for saves.
- **`catalog.js`** — the content, as data: the round's sheriff hunt plus side jobs
  (an ambush with two ways out, a lost cache, scouting the ridge, walking a witness
  in, bringing one in alive), each gated by `when` on the round number and flags.

**Adding a mission** is a definition and nothing else:

```js
Missions.define({
  id: 'side_example', kind: 'side', name: 'A favour',
  brief: 'Somebody wants something fetched.',
  when: () => roundNum >= 3,
  stages: [{ name: 'Fetch it', objectives: [
    { type: 'reachLocation', label: 'Get to the marker', x: 40, z: -20 },
    { type: 'interactWith', label: 'load the wagon', verb: 'LOAD', seconds: 3, x: 40, z: -20 }
  ]}],
  fail: [{ type: 'playerDead' }],
  reward: { cash: 80, flags: { didTheFavour: true } }
});
```

Everything else follows: the tracker lists it, the minimap marks it, `E` (and the
touch pill) drives its interactions, the reward lands in the wallet, the flags are
saved, and a load puts the running missions back with their counters, targets and
spawned crates intact.

**Events.** Missions are driven by the bus, so no gameplay file has to know about
them: `npc:died` (from `shooting.js`) is what a `killTargets` objective listens to,
and the manager emits `mission:start`, `mission:stage`, `mission:objective`,
`mission:done`, `mission:failed`, `mission:aborted` and `mission:restored` for
whatever comes next (the campaign, the newspaper, the audio director).

**One deliberate seam:** the sheriff dying still calls `endRound('outlaw')` from
`shooting.js`, because ending the round is match business. The mission observes the
same kill and pays its own reward, so the mission layer adds meaning without
owning the round.

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
| What a save file stores | `js/core/save-system.js` (`snapshot`, `normalize`, `apply`) |
| Autosave timing, slots | `js/game/rounds.js` (`Save.autosave()` calls), `js/core/save-system.js` (`SAVE_SLOTS`) |
| Game states, what freezes the world | `js/core/game-state.js` (`MODE`, `Mode.live`) |
| Crimes and what they are worth | js/law/law.js (CRIMES, HEAT_LEVELS, RESPONSE) |
| Witnesses, bribes, intimidation | js/law/witnesses.js |
| Difficulty levels and what they scale | js/core/difficulty.js |
| The picker on the title screen and pause menu | js/game/difficulty-ui.js |
| Cross-system events | `js/core/event-bus.js` (`Bus.on` / `Bus.emit`) |
| Mission content (what a round is about) | `js/missions/catalog.js` |
| What an NPC can notice, and how long he remembers it | `js/ai/perception.js` (`SENSES`, `Perceive.noise`) |
| NPC states, cover, investigation | `js/ai/behavior.js` |
| Squad roles, orders, reinforcements | `js/ai/squad.js` |
| Objective behaviour | `js/missions/objectives.js` (`objectiveType`) |
| Which missions run, markers, prompts | `js/missions/manager.js` (`beginRound`, `pickMain`, `pickSide`) |
| Rewards, story flags | the mission's `reward` block, read in `js/missions/mission.js` |
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
