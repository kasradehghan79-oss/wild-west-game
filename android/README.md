# Android app

The Wild West ships as a thin WebView shell around the web game. There is no
native game code: one activity, no third party libraries, and the web build is
copied into the APK's assets at build time.

```
android/
  build_apk.py             the build: stages the game, compiles, dexes, aligns, signs
  build-apk.ps1            Windows convenience wrapper that just forwards to the Python script
  settings.gradle          Gradle project (for Android Studio)
  build.gradle
  gradle.properties
  app/
    build.gradle           copies the web game into assets/www on every build
    src/main/
      AndroidManifest.xml  landscape, fullscreen, no permissions
      java/com/kasradn/wildwest/MainActivity.java
      res/values/          app name and the fullscreen theme
      res/mipmap-*/        launcher icons (generated, see tools/)
  tools/make-icon.js       regenerates those icons: node tools/make-icon.js
```

`build_apk.py` is the single source of truth for the command line build; the
PowerShell script is a thin wrapper so Windows users have a native entry point.

## Requirements

| | |
| --- | --- |
| JDK | 17 or newer (Android Studio bundles one at `C:\Program Files\Android\Android Studio\jbr`) |
| Android SDK | `build-tools` and a `platform`, e.g. `sdkmanager "build-tools;34.0.0" "platforms;android-34"` |
| Python | 3.8+ for the command line build (or use the Gradle route and skip Python) |
| For Gradle route | Android Studio, or Gradle 8.7+ (the wrapper is not committed) |

Neither the JDK nor the SDK has to be on your PATH: the script finds them in the
usual install locations, or you can point at them with `--java-home` / `--sdk`.

## Build it

**Python, no Gradle:**

```bash
python android/build_apk.py            # add --java-home / --sdk if they are unusual
python android/build_apk.py --check    # just verify the toolchain
```

On Windows, `powershell -ExecutionPolicy Bypass -File android\build-apk.ps1`
does the same thing through the same script.

It stages the web game into `assets/www`, compiles resources with aapt2, compiles
and dexes the activity, aligns and signs the APK with a debug key (created on
first run), then verifies the signature. Output:

```
dist/The Wild West.apk
```

Install it over USB with `adb install -r "dist/The Wild West.apk"`, or copy it to
the phone and tap it (you may need to allow installing from unknown sources).

**Android Studio:** open the `android/` folder as a project and press Run. The
`syncWebAssets` task copies the game in first, so the APK always carries the
current build.

**Command line with Gradle** (after `gradle wrapper` or with Gradle installed):

```
cd android
gradle assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
```

## Signing for Google Play

Play needs a release build signed with your own key. Create one and keep it safe:

```powershell
keytool -genkeypair -v -keystore wildwest-release.jks -alias wildwest `
  -keyalg RSA -keysize 2048 -validity 10000
```

Then either

```powershell
powershell -File android\build-apk.ps1 -Release -Keystore wildwest-release.jks `
  -KeyAlias wildwest -StorePass <password> -VersionCode 2 -VersionName 1.1
```

or edit the `release` block in `app/build.gradle` to use that keystore and run
`gradle bundleRelease` (Play wants an `.aab`, not an APK).

Before uploading, remember: raise `versionCode` every time, keep `targetSdk` on
a currently supported API level, and fill in Play's Data safety form (the game
collects nothing - it only writes settings to the browser's local storage).

## Changing things

| To change | Edit |
| --- | --- |
| App name shown under the icon | `app/src/main/res/values/strings.xml` |
| Package / application id | `namespace` + `applicationId` in `app/build.gradle`, the `package` in the manifest is injected by the script, and the `package` line in `MainActivity.java` |
| Version | `versionCode` / `versionName` in the manifest (the script can also override them with `-VersionCode` / `-VersionName`) |
| Icon | `node tools/make-icon.js` (the artwork is code, in that file) |
| Orientation | `android:screenOrientation` in the manifest (`sensorLandscape` today) |
| WebView behaviour | `MainActivity.java` - fullscreen, keep-screen-on, pause on background, back button |

## Phone performance

The game ships with three quality levels (`settings.quality`, persisted per
device). On a phone, resolution and effect quality are separate:

| Quality | Effects | Render scale on touch | On desktop |
| --- | --- | --- | --- |
| 0 (phone default) | no post-processing, no shadows | 1.5x | 1x |
| 1 | post-processing, 1024 shadows | 1.75x | 2x |
| 2 | post-processing, 2048 shadows | 2x | 2x |

So the phone default is *sharp* (a DPR-3 screen at 1x was visibly blocky, and with
the post chain off there was no anti-aliasing either) while still skipping the
expensive effects. MSAA is requested on the canvas (4 samples in testing), which
tiled mobile GPUs handle cheaply. If a device struggles, quality 0 is the lightest
setting available. The panel is in the pause menu.

Android lets you profile the running app from a desktop Chrome at
`chrome://inspect` - the activity enables WebView debugging, so you get the same
DevTools (including a live frame graph) you would have in a browser.

## Installing it on a phone

The build is debug-signed, which is fine for your own device but has consequences:

- **Keep `android/.debug.keystore`.** It is created on the first build and reused
  after that, so every APK you build updates the previous one. Delete it and the
  next APK is signed with a different key — Android then refuses to install over
  the old app and you have to uninstall it first. The file is gitignored; back it
  up if you care about your installs.
- **If an install says "App not installed"**, the usual causes in order:
  1. an earlier build of the same package is installed with a different key →
     uninstall "The Wild West" from the phone, then install again;
  2. Play Protect blocking a sideloaded debug build → tap "Install anyway"
     (or temporarily turn off scanning in Play Store → Play Protect);
  3. installing from an app that is not allowed to install unknown apps →
     allow it for that app (Files, browser, messenger) in Android settings;
  4. the APK was renamed or re-compressed in transit (some messengers do) →
     check the file is still ~300 KB and ends in `.apk`, and compare its SHA-256
     with the one printed by the build.
- **Android 7.0 or newer** is required (`minSdk 24`).
- USB install, which also gives you the exact error if something is wrong:

  ```bash
  adb install -r "dist/The Wild West.apk"
  ```

  Failures appear as codes such as `INSTALL_FAILED_UPDATE_INCOMPATIBLE` (older
  build with another key: uninstall first) or `INSTALL_FAILED_VERIFICATION_FAILURE`
  (Play Protect).

## Touch controls and phone tuning

The web build detects a touch device (`ontouchstart` / `maxTouchPoints`) and turns
on an on-screen control layer. Nothing extra is needed in the app for this.

| Control | Where | What it does |
| --- | --- | --- |
| Left half drag | wherever you press | Virtual stick: walks in that direction |
| Stick pushed to the rim | — | Sprint (the same run the keyboard gets from Shift) |
| FIRE | bottom-right corner | Shoot (hold to keep firing) |
| AIM | left of FIRE | Toggle aim-down-sights |
| JUMP | above FIRE | Jump |
| RELOAD | diagonal, inboard | Reload |
| Context pill | bottom centre | Appears only when relevant: **OPEN STORE** at the store, **MOUNT HORSE** / **DISMOUNT** beside the horse |
| PAUSE | top left, under the HUD | Pause menu: settings (quality, volume, look), restart |
| Right half drag | anywhere clear of the buttons | Turn the camera |

The cluster is deliberately tight in the bottom-right thumb arc, leaving ~85% of
the right half free for dragging the camera. Everything is sized and positioned in
`vh` (`css/menus.css`), so the layout scales with the screen instead of being
pinned to pixel offsets that only suit one device, and every control stays at least
~50px so it is finger sized. The store and mount actions are one labelled pill
rather than two fixed buttons in the thumb zone.

Phone specific behaviour, all in the web build:

- **Quality defaults to 0 on first launch** on a touch device (no post-processing,
  no shadows) so the first impression is a smooth frame rate. The player's choice in
  the pause menu is saved and respected afterwards.
- **Render scale on touch starts at 1.5x and rises with the quality slider** (1.5 /
  1.75 / 2), and the canvas requests MSAA. Drawing a DPR-3 screen at 1x looked
  blocky, and with the effects off there was no anti-aliasing at all.
- **Safe areas.** The HUD panels and every touch button are inset by
  `env(safe-area-inset-*)`, so nothing hides under a notch, punch hole or the
  gesture bar. `viewport-fit=cover` is already set, and the activity draws under
  the cutout (`LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES`).
- **Short screens.** A landscape phone is only ~390px tall. Menus tighten up below
  560px of height, the start screen drops the keyboard cheat sheet, and overlays
  scroll instead of pushing a button off screen.
- **No stray long-press menu.** The activity disables long-click and the CSS
  suppresses the touch callout and tap highlight, so holding a finger on the
  canvas does not pop a context menu or start a text selection.
- **Backgrounding pauses the match**, and touch state is released on blur or
  visibility change so the stick cannot stay stuck on screen.
- **The browser fullscreen button is hidden inside the app** (the activity is
  already immersive); the page detects the shell through the `WildWestApp`
  JavaScript interface the activity injects. It is also hidden for *any* touch
  device through `body.touch`: the desktop glyph is laid out from the top of a
  tall window, so on a landscape phone it landed on the JUMP button, and touch
  already has its own fullscreen button under PAUSE.
- **The `?` help glyph moves with the device.** Its desktop offset (`top: 214px`)
  also put it on top of JUMP, so on touch it sits in the top-left strip beside
  PAUSE (50px, clear of everything) and opens a panel of *touch* controls in the
  middle of the screen - the desktop sheet, which talks about WASD and Esc, is
  hidden there.
- **Clouds stay moonlit at night.** They lose the key light with the sun and only
  the warm environment bake was left holding them up, which turned them into brown
  smudges against a black sky; a weak cool emissive on the shared cloud material
  fixes that from the day/night block in `js/game/loop.js`.

## What was verified, and what was not

The build was run end to end and the resulting APK was inspected:

- `dist/The Wild West.apk` — 0.30 MB, package `com.kasradn.wildwest`, versionCode 1,
  minSdk 24, targetSdk 34, label "The Wild West", **no permissions requested**.
- `aapt2 dump badging` reports a launchable activity
  `com.kasradn.wildwest.MainActivity` and all five launcher icon densities.
- `apksigner verify` exits 0 and Verifies (APK Signature Scheme v2 and v3; v1 is
  not needed because minSdk is 24).
- `zipalign -c -p 4` exits 0, and `resources.arsc` plus `classes.dex` are stored
  uncompressed so they stay page aligned.
- The APK contains 44 web assets under `assets/www/`, matching the path the
  activity loads (`file:///android_asset/www/index.html`), and **all 44 are
  byte-identical to the project files** (SHA-256 compared).
- `classes.dex` contains `MainActivity` and its `android/webkit/WebView`
  dependency, so the shell really is in there.
- **Touch controls, driven for real** in an emulated landscape phone (844x390,
  device pixel ratio 3, touch enabled, real touch events through CDP):
  - start menu: the PLAY button is on screen and receives the tap (it used to be
    covered by the credit line, which made the game unstartable on a phone);
  - stick: gentle push walks, rim push sprints, release clears the keys and hides
    the stick;
  - right-half drag turns the camera; FIRE empties a round; AIM toggles; JUMP
    lifts the player; RELOAD reloads; MOUNT mounts the horse;
  - PAUSE opens the pause menu with the RESUME button and the quality slider on
    screen, and RESUME returns to the match;
  - STORE opens when standing at the store, a purchase goes through (cash
    500 -> 475), and LEAVE closes it;
  - quality came up as 0 with a render scale of 1.5 against a device ratio of 3
    (drawing buffer 1266x585 for an 844x390 screen) and 4x MSAA on the canvas, so the
    phone image is sharp rather than a 1x upscale, and nothing under the safe-area
    insets moved;
  - the browser fullscreen button is hidden inside the app and, in a browser, sits
    under the pause button instead of on top of the minimap;
  - the help glyph sits beside PAUSE, is 50px, and opens the touch cheat sheet
    without overlapping the vitals panel or any thumb control;
  - the contextual STORE / MOUNT pill sits above the control hint line instead of
    clipping its top edge;
  - **no console errors** during any of it.
- The platform renderer in that emulator reported SwiftShader (software GL), so
  its frame rate is not a device figure. On a GPU-backed desktop browser the same
  build runs at ~160 fps.

Not verified: launching the APK on a real device or emulator. Nothing here could
install it, so the first run on hardware is yours. If it misbehaves, attach
`chrome://inspect` over USB — the activity enables WebView debugging.
