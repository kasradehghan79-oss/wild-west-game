#!/usr/bin/env python3
"""Build an installable APK for The Wild West.

Cross-platform replacement for build-apk.ps1: same pipeline (aapt2 -> javac ->
d8 -> zipalign -> apksigner), but plain Python 3 so it runs on Windows, macOS and
Linux with nothing installed beyond a JDK and the Android SDK build tools.

    python android/build_apk.py                  # debug signed, ready to sideload
    python android/build_apk.py --check          # only verify the toolchain
    python android/build_apk.py --release --keystore my.jks --store-pass secret

Output: dist/The Wild West.apk

What it does
  1. copies index.html, css/ and js/ into build/assets/www (the APK ships the web
     game as assets, so it plays offline)
  2. injects the package name into the manifest (the source omits it, because
     Gradle wants it in `namespace` instead) and applies version overrides
  3. compiles resources with aapt2, links with android.jar, generates R.java
  4. compiles MainActivity with javac --release 11 against android.jar
  5. dexes with d8 and stores classes.dex in the APK
  6. aligns with zipalign and signs with apksigner (debug key created on demand)
"""

from __future__ import annotations

import argparse
import glob
import os
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

# --------------------------------------------------------------------------- ui
VERBOSE = False


def head(msg: str) -> None:
    print(f"\n== {msg}", flush=True)


def say(msg: str) -> None:
    print(f"   {msg}", flush=True)


def warn(msg: str) -> None:
    print(f"   WARNING: {msg}", flush=True)


def die(msg: str) -> None:
    print(f"\n!! {msg}", file=sys.stderr, flush=True)
    sys.exit(1)


def run(cmd, cwd=None, env=None) -> None:
    """Run a build step, echoing the command, and fail loudly."""
    printable = " ".join(str(c) for c in cmd)
    if VERBOSE:
        say(f"$ {printable}")
    proc = subprocess.run(
        [str(c) for c in cmd],
        cwd=str(cwd) if cwd else None,
        env=env,
        capture_output=True,
        text=True,
        errors="replace",
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode != 0:
        print(out.strip()[-4000:], file=sys.stderr, flush=True)
        die(f"command failed ({proc.returncode}):\n    {printable}")
    if out.strip() and VERBOSE:
        print("\n".join("   | " + line for line in out.strip().splitlines()), flush=True)


# ------------------------------------------------------------------- discovery
def exe(name: str) -> str:
    """Platform-appropriate executable name."""
    return name + ".exe" if os.name == "nt" else name


def first_existing(paths) -> Path | None:
    for p in paths:
        if not p:
            continue
        p = Path(os.path.expandvars(p)).expanduser()
        if p.exists():
            return p
    return None


def find_java_home(explicit: str | None) -> Path:
    head("Locating a JDK")
    candidates = []
    if explicit:
        candidates.append(explicit)
    candidates.append(os.environ.get("JAVA_HOME", ""))
    candidates += [
        # where this project's own toolchain lives, so the usual command works
        # without --java-home: see android/README.md
        "~/.kilotools/jdk/*",
        "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
        "~/Library/Java/JavaVirtualMachines/*/Contents/Home",
        "/usr/lib/jvm/*",
        "/opt/homebrew/opt/openjdk*/libexec/openjdk.jdk/Contents/Home",
        "%ProgramFiles%/Android/Android Studio/jbr",
        "%LOCALAPPDATA%/Programs/Android Studio/jbr",
        "%ProgramFiles%/Eclipse Adoptium/jdk-*",
        "%ProgramFiles%/Java/jdk-*",
        "%ProgramFiles%/Microsoft/jdk-*",
        "%LOCALAPPDATA%/Programs/Eclipse Adoptium/jdk-*",
    ]
    for c in candidates:
        if not c:
            continue
        # expanduser as well as expandvars: every "~" path in that list used to
        # be dead, because glob does not expand the tilde either
        base = str(Path(os.path.expandvars(str(c))).expanduser()).replace("\\", "/")
        for path in sorted(glob.glob(base)) or ([base] if Path(base).exists() else []):
            p = Path(path)
            if (p / "bin" / exe("javac")).exists():
                say(f"JDK: {p}")
                return p
    # last resort: javac on PATH
    found = shutil.which("javac")
    if found:
        home = Path(found).resolve().parent.parent
        say(f"JDK: {home} (from PATH)")
        return home
    die(
        "No JDK found. Install one of:\n"
        "    winget install EclipseAdoptium.Temurin.17.JDK   (Windows)\n"
        "    brew install openjdk@17                          (macOS)\n"
        "    sudo apt install openjdk-17-jdk                  (Debian/Ubuntu)\n"
        "  or install Android Studio, which bundles a JDK.\n"
        "  You can also pass --java-home."
    )
    raise SystemExit(1)


def find_sdk(explicit: str | None) -> Path:
    head("Locating the Android SDK")
    roots = [explicit, os.environ.get("ANDROID_HOME"), os.environ.get("ANDROID_SDK_ROOT"),
             # this project's own toolchain, so the usual command works without --sdk
             "~/.kilotools/sdk",
             "%LOCALAPPDATA%/Android/Sdk", "~/Android/Sdk", "~/Library/Android/sdk",
             "/usr/local/lib/android/sdk", "/opt/android-sdk"]
    sdk = first_existing(roots)
    if not sdk:
        die(
            "No Android SDK found (looked at ANDROID_HOME, ANDROID_SDK_ROOT and the\n"
            "  usual install locations). Easiest fix is Android Studio, or the command\n"
            "  line tools plus:\n"
            '    sdkmanager "platform-tools" "build-tools;34.0.0" "platforms;android-34"'
        )
    say(f"SDK: {sdk}")
    return sdk


def version_key(name: str):
    """Sort build-tools / platform directory names by their version numbers."""
    parts = []
    for chunk in name.replace("-", ".").split("."):
        parts.append(int(chunk) if chunk.isdigit() else 0)
    return parts


def tool_path(bt: Path, name: str):
    """Find a build tool. The SDK ships apksigner as a shell script on unix and as
    a .bat on Windows, so all of those spellings have to be tried."""
    for candidate in (bt / exe(name), bt / name, bt / (name + ".bat"), bt / (name + ".cmd")):
        if candidate.exists():
            return candidate
    return None


def tool(bt: Path, name: str) -> Path:
    found = tool_path(bt, name)
    if not found:
        die(f"Missing {name} in {bt}")
    return found


def launch(tool_path_: Path, *args):
    """Command list for a tool. Windows batch launchers are avoided rather than
    wrapped: cmd strips the outermost pair of quotes on a /c line, so a toolchain
    under a path with a space in it - C:\\Users\\Some Name\\... - fails to start at
    all. These launchers only run a jar from the sibling lib/ directory, so the
    jar is run directly instead, which also skips a process."""
    exe_path = str(tool_path_)
    if exe_path.lower().endswith((".bat", ".cmd")):
        jar = Path(exe_path).parent / "lib" / (Path(exe_path).stem + ".jar")
        java_home = os.environ.get("JAVA_HOME", "")
        if jar.exists() and java_home:
            return [str(Path(java_home) / "bin" / exe("java")), "-jar", str(jar),
                    *[str(a) for a in args]]
        return ["cmd", "/c", exe_path, *[str(a) for a in args]]
    return [exe_path, *[str(a) for a in args]]


def find_toolchain(sdk: Path):
    bt_root = sdk / "build-tools"
    if not bt_root.is_dir():
        die(f'No build-tools in {bt_root} - run: sdkmanager "build-tools;34.0.0"')
    bt_dirs = sorted((d for d in bt_root.iterdir() if d.is_dir()), key=lambda d: version_key(d.name))
    bt = bt_dirs[-1]
    say(f"build-tools: {bt.name}")

    missing = [name for name in ("aapt2", "zipalign", "apksigner") if tool_path(bt, name) is None]
    if missing:
        die(f"Missing build tools in {bt}: {', '.join(missing)}")
    d8_jar = bt / "lib" / "d8.jar"
    if not d8_jar.exists():
        die(f"Missing lib/d8.jar in {bt}")

    plat_root = sdk / "platforms"
    if not plat_root.is_dir():
        die(f'No platforms in {plat_root} - run: sdkmanager "platforms;android-34"')
    plats = sorted((d for d in plat_root.iterdir() if d.is_dir()), key=lambda d: version_key(d.name))
    android_jar = plats[-1] / "android.jar"
    if not android_jar.exists():
        die(f"Missing android.jar in {plats[-1]}")
    say(f"platform: {plats[-1].name}")
    return bt, android_jar


# ----------------------------------------------------------------------- build
def stage_assets(root: Path, build_dir: Path) -> None:
    head("Staging the web game into assets")
    # aapt2's -A packs the *contents* of this folder as the APK's assets/, so the
    # game ends up at assets/www and MainActivity can load
    # file:///android_asset/www/index.html
    www = build_dir / "assets" / "www"
    if www.exists():
        shutil.rmtree(www)
    www.mkdir(parents=True)
    shutil.copy2(root / "index.html", www / "index.html")
    for folder in ("css", "js"):
        src = root / folder
        if not src.is_dir():
            die(f"Missing {folder}/ next to index.html in {root}")
        shutil.copytree(src, www / folder)
    files = [p for p in www.rglob("*") if p.is_file()]
    size_kb = sum(p.stat().st_size for p in files) / 1024
    say(f"{len(files)} files, {size_kb:.0f} KB")
    if not (www / "js" / "vendor" / "three.min.js").exists():
        warn("js/vendor/three.min.js is missing - the game needs it to run offline")


def prepare_manifest(app: Path, build_dir: Path, version_code: int, version_name: str) -> Path:
    head("Preparing the manifest")
    src = app / "src" / "main" / "AndroidManifest.xml"
    text = src.read_text(encoding="utf-8")

    # The source manifest deliberately has no package attribute (Gradle takes it
    # from `namespace`), so aapt2 needs one injected. Only the <manifest> start tag
    # is inspected: the file's own comments mention the word package, which fooled
    # an earlier version of this check into skipping the injection.
    tag = re.search(r"<manifest\b[^>]*>", text)
    if not tag:
        die("no <manifest> element found in the manifest")
    start_tag = tag.group(0)
    if "package=" not in start_tag:
        marker = 'xmlns:android="http://schemas.android.com/apk/res/android"'
        if marker not in start_tag:
            die("manifest is missing the android namespace declaration")
        patched = start_tag.replace(marker, marker + '\n    package="com.kasradn.wildwest"', 1)
        text = text[:tag.start()] + patched + text[tag.end():]

    if version_code:
        text = re.sub(r'android:versionCode="\d+"', f'android:versionCode="{version_code}"', text)
    if version_name:
        text = re.sub(r'android:versionName="[^"]+"', f'android:versionName="{version_name}"', text)

    new_tag = re.search(r"<manifest\b[^>]*>", text)
    if not new_tag or 'package="com.kasradn.wildwest"' not in new_tag.group(0):
        die("failed to inject the package attribute")

    out = build_dir / "manifest"
    out.mkdir(parents=True, exist_ok=True)
    target = out / "AndroidManifest.xml"
    target.write_text(text, encoding="utf-8")

    try:
        ET.parse(target)
    except ET.ParseError as exc:
        die(f"generated manifest is not valid XML: {exc}")
    say("package com.kasradn.wildwest")
    return target


def build_apk(root: Path, app: Path, build_dir: Path, dist_dir: Path, args) -> Path:
    shutil.rmtree(build_dir, ignore_errors=True)
    build_dir.mkdir(parents=True)
    stage_assets(root, build_dir)
    manifest = prepare_manifest(app, build_dir, args.version_code, args.version_name)

    java_home = find_java_home(args.java_home)
    sdk = find_sdk(args.sdk)
    bt, android_jar = find_toolchain(sdk)

    env = dict(os.environ)
    env["JAVA_HOME"] = str(java_home)
    env["PATH"] = str(java_home / "bin") + os.pathsep + env.get("PATH", "")
    # build tools like apksigner.bat and the d8 launcher shell out to `java`
    # themselves, so the JDK has to be in the environment of every child process,
    # not only in a dict this script keeps to itself
    os.environ.update(env)

    # -- aapt2: resources -> res.zip, then link into a base APK with assets
    head("Compiling resources")
    aapt2 = tool(bt, "aapt2")
    res_zip = build_dir / "res.zip"
    run(launch(aapt2, "compile", "--dir", app / "src" / "main" / "res", "-o", res_zip))
    gen = build_dir / "gen"
    gen.mkdir()
    base_apk = build_dir / "base.apk"
    run(launch(aapt2, "link", "-o", base_apk, "-I", android_jar,
               "--manifest", manifest, "-A", build_dir / "assets", "--java", gen, res_zip))
    say("resources linked (R.java generated)")

    # -- javac: the activity plus the generated R class
    head("Compiling the activity")
    classes = build_dir / "classes"
    classes.mkdir()
    sources = sorted(str(p) for p in (app / "src" / "main" / "java").rglob("*.java"))
    sources += sorted(str(p) for p in gen.rglob("*.java"))
    say(f"{len(sources)} source files")
    # --release keeps the code to Java 11 APIs (what d8 and older devices want);
    # android.jar on the classpath supplies android.*
    run([java_home / "bin" / exe("javac"), "-nowarn", "--release", "11",
         "-cp", android_jar, "-d", classes, *sources])

    # -- d8: bytecode -> classes.dex
    head("Dexing")
    classes_jar = build_dir / "classes.jar"
    run([java_home / "bin" / exe("jar"), "cf", classes_jar, "-C", classes, "."])
    dex_dir = build_dir / "dex"
    dex_dir.mkdir()
    run([java_home / "bin" / exe("java"), "-cp", bt / "lib" / "d8.jar",
         "com.android.tools.r8.D8", "--lib", android_jar, "--min-api", "24",
         "--output", dex_dir, classes_jar])
    dex = dex_dir / "classes.dex"
    if not dex.exists():
        die("d8 produced no classes.dex")
    say(f"classes.dex {dex.stat().st_size / 1024:.0f} KB")

    # store the dex uncompressed so zipalign can page align it for fast startup
    with zipfile.ZipFile(base_apk, "a", zipfile.ZIP_STORED) as zf:
        zf.write(dex, "classes.dex")
    say("classes.dex added")

    # -- zipalign then sign
    head("Aligning and signing")
    aligned = build_dir / "aligned.apk"
    run(launch(tool(bt, "zipalign"), "-f", "-p", "4", base_apk, aligned))

    if args.release or args.keystore:
        if not args.keystore or not Path(args.keystore).exists():
            die("--release needs --keystore <file>")
        if not args.store_pass:
            die("--release needs --store-pass <password>")
        keystore = Path(args.keystore).resolve()
        key_alias = args.key_alias
        store_pass = args.store_pass
        say(f"keystore: {keystore}")
    else:
        # Kept OUTSIDE build/: the build directory is wiped on every run, and a
        # recreated key would mean every new APK had a different signature, which
        # Android refuses to install over an earlier one ("App not installed").
        keystore = app.parent / ".debug.keystore"
        if not keystore.exists():
            run([java_home / "bin" / exe("keytool"), "-genkeypair", "-v", "-keystore", keystore,
                 "-storepass", "android", "-keypass", "android", "-alias", "androiddebugkey",
                 "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
                 "-dname", "CN=Android Debug,O=Android,C=US"])
            say("created " + str(keystore) + " (keep it: every update must be signed with it)")
        else:
            say("keystore: " + str(keystore))
        key_alias, store_pass = "androiddebugkey", "android"

    dist_dir.mkdir(parents=True, exist_ok=True)
    apk = dist_dir / "The Wild West.apk"
    apk.unlink(missing_ok=True)
    apksigner = tool(bt, "apksigner")
    run(launch(apksigner, "sign", "--ks", keystore, "--ks-key-alias", key_alias,
               "--ks-pass", f"pass:{store_pass}", "--key-pass", f"pass:{store_pass}",
               # Sign with all three schemes. v1 (JAR) is only *needed* below API 24,
               # but some sideload installers and older Android builds reject an APK
               # that has none, so it is written anyway. 21 here is apksigner's own
               # minimum-api switch, not the app's minSdk (that stays 24 in the manifest).
               "--min-sdk-version", "21",
               "--v1-signing-enabled", "true", "--v2-signing-enabled", "true",
               # v4 only exists for `adb install --incremental`, and it leaves a
               # .idsig file next to the APK that nothing here needs
               "--v4-signing-enabled", "false",
               "--out", apk, aligned))

    proc = subprocess.run(launch(apksigner, "verify", "--print-certs", apk),
                          capture_output=True, text=True, errors="replace")
    if proc.returncode != 0:
        die(f"apksigner verify failed:\n{proc.stdout}\n{proc.stderr}")
    for line in proc.stdout.strip().splitlines()[:4]:
        say(line.strip())
    return apk


def verify_apk(root: Path, apk: Path, sdk_arg: str | None, java_arg: str | None) -> int:
    """Check a built APK against the project it claims to contain.

    Three questions, in order of how much they matter:
      1. are the web assets inside the APK byte for byte the ones in the project?
         (this is the one that catches "I changed the game and forgot to rebuild")
      2. is it signed at all, and with the debug key it was built with?
      3. is it aligned, so the installer does not have to spool it first?
    Signature and alignment need build tools; asset parity needs nothing but
    Python, so a machine without the SDK still gets the important half.
    """
    import hashlib
    import zipfile

    head("Verifying the APK")
    if not apk.is_file():
        die(f"no APK at {apk} - build it first")
    say(f"apk      {apk}")
    say(f"size     {apk.stat().st_size / 1024:.0f} KB")

    failures = []

    # ---- 1. asset parity -------------------------------------------------
    with zipfile.ZipFile(apk) as z:
        names = z.namelist()
        assets = [n for n in names if n.startswith("assets/www/") and not n.endswith("/")]
        if not assets:
            failures.append("the APK contains no assets/www/ payload at all")
        missing = []
        differing = []
        for name in assets:
            rel = name[len("assets/www/"):]
            disk = root / rel
            if not disk.is_file():
                missing.append(rel)
                continue
            apk_hash = hashlib.sha256(z.read(name)).hexdigest()
            disk_hash = hashlib.sha256(disk.read_bytes()).hexdigest()
            if apk_hash != disk_hash:
                differing.append(rel)
        say(f"assets   {len(assets)} compared, {len(missing)} missing, {len(differing)} different")
        for rel in (missing + differing)[:12]:
            failures.append(f"asset out of date inside the APK: {rel}")
        # every project file has to be in there too, not just the other way round
        expected = [p for p in (root / "index.html", root / "css", root / "js")
                    if p.exists()]
        project_files = []
        for p in expected:
            if p.is_file():
                project_files.append(p)
            else:
                project_files += [f for f in p.rglob("*") if f.is_file()]
        in_apk = set(assets)
        absent = []
        for f in project_files:
            rel = f.relative_to(root).as_posix()
            if "assets/www/" + rel not in in_apk:
                absent.append(rel)
        for rel in absent[:12]:
            failures.append(f"the APK is missing project file: {rel}")
        say(f"coverage {len(project_files)} project files, "
            f"{len(absent)} missing from the APK")

        # ---- manifest facts ---------------------------------------------
        try:
            manifest = z.read("AndroidManifest.xml")
            say(f"manifest {len(manifest)} bytes (binary XML, checked below when aapt2 is available)")
        except KeyError:
            failures.append("AndroidManifest.xml is missing")

    # ---- 2/3. signature and alignment ------------------------------------
    try:
        sdk = find_sdk(sdk_arg)
        bt, _ = find_toolchain(sdk)
    except SystemExit:
        bt = None
    if bt is None:
        warn("no Android SDK found, skipping the signature and alignment checks")
        say("skipped  apksigner, zipalign (install build-tools to cover these)")
    else:
        java_home = None
        try:
            java_home = find_java_home(java_arg)
        except SystemExit:
            warn("apksigner needs a JDK and none was found")
        apksigner = tool_path(bt, "apksigner")
        zipalign = tool_path(bt, "zipalign")
        env = dict(os.environ)
        if java_home:
            env["JAVA_HOME"] = str(java_home)
            env["PATH"] = str(Path(java_home) / "bin") + os.pathsep + env.get("PATH", "")
            # the same reason as in build_apk: the tools, and the launchers that
            # wrap them, find their java through the environment they inherit
            os.environ.update(env)
        if apksigner:
            proc = subprocess.run(launch(apksigner, "verify", "--print-certs", apk),
                                  capture_output=True, text=True, errors="replace", env=env)
            if proc.returncode == 0:
                digest = ""
                for line in (proc.stdout or "").splitlines():
                    if "SHA-256" in line:
                        digest = line.split(":", 1)[1].strip()[:16] + "..."
                say(f"signed   yes ({digest or 'certificate present'})")
            else:
                failures.append("apksigner verify failed")
                say("signed   NO")
        else:
            warn("apksigner not found in build-tools")
        if zipalign:
            proc = subprocess.run([str(zipalign), "-c", "-v", "4", str(apk)],
                                  capture_output=True, text=True, errors="replace", env=env)
            say(f"aligned  {'yes' if proc.returncode == 0 else 'NO'}")
            if proc.returncode != 0:
                failures.append("zipalign -c failed")
        else:
            warn("zipalign not found in build-tools")

        # package name, minSdk and permissions, straight from the manifest
        aapt2 = tool_path(bt, "aapt2")
        if aapt2:
            proc = subprocess.run(launch(aapt2, "dump", "badging", apk),
                                  capture_output=True, text=True, errors="replace", env=env)
            if proc.returncode == 0:
                text = proc.stdout or ""
                pkg = next((l for l in text.splitlines() if l.startswith("package:")), "")
                sdk = next((l for l in text.splitlines() if l.startswith("sdkVersion:")), "")
                perms = [l for l in text.splitlines() if "uses-permission" in l]
                say(f"badging  {pkg.strip()[:70]}")
                say(f"         {sdk.strip()}, {len(perms)} permissions requested")
                if "com.kasradn.wildwest" not in pkg:
                    failures.append("unexpected package name in the manifest")
                if perms:
                    failures.append(f"the app asks for permissions it should not need: {perms}")
                if "sdkVersion:'24'" not in text.replace('"', "'"):
                    warn("minSdk is not 24 - check that this is intended")
            else:
                warn("aapt2 dump badging failed")
        else:
            warn("aapt2 not found, skipping the manifest check")

    if failures:
        print("", flush=True)
        for f in failures:
            print(f"   FAIL: {f}", flush=True)
        die(f"{len(failures)} check(s) failed")
    head("APK verified")
    say("assets inside the APK match the project exactly")
    return 0


def main() -> int:
    global VERBOSE
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(
        description="Build an installable APK for The Wild West.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("What it does")[0].strip(),
    )
    parser.add_argument("--root", default=str(here.parent),
                        help="project root holding index.html (default: the parent of android/)")
    parser.add_argument("--sdk", help="Android SDK path (default: $ANDROID_HOME or usual locations)")
    parser.add_argument("--java-home", help="JDK path (default: $JAVA_HOME or usual locations)")
    parser.add_argument("--out", help="output APK path (default: dist/The Wild West.apk)")
    parser.add_argument("--version-code", type=int, default=0, help="override android:versionCode")
    parser.add_argument("--version-name", default="", help="override android:versionName")
    parser.add_argument("--check", action="store_true", help="only check that the toolchain is present")
    parser.add_argument("--verify", action="store_true",
                        help="check a built APK: asset parity, signature, alignment, manifest")
    parser.add_argument("-v", "--verbose", action="store_true", help="print every command and its output")
    parser.add_argument("--release", action="store_true", help="sign with --keystore instead of the debug key")
    parser.add_argument("--keystore", help="keystore file (implies --release)")
    parser.add_argument("--key-alias", default="wildwest", help="key alias in the keystore")
    parser.add_argument("--store-pass", default="", help="keystore password")
    args = parser.parse_args()
    VERBOSE = args.verbose

    root = Path(args.root).resolve()
    if not (root / "index.html").is_file():
        die(f"No index.html in {root} - pass --root <project folder>")
    app = here / "app"
    build_dir = here / "build"
    dist_dir = Path(args.out).parent if args.out else root / "dist"

    if args.check:
        java_home = find_java_home(args.java_home)
        sdk = find_sdk(args.sdk)
        bt, android_jar = find_toolchain(sdk)
        head("Toolchain ready")
        say(f"java     {java_home}")
        say(f"sdk      {sdk}")
        say(f"tools    {bt}")
        say(f"platform {android_jar}")
        return 0

    if args.verify:
        return verify_apk(root, Path(args.out) if args.out else dist_dir / "The Wild West.apk",
                          args.sdk, args.java_home)

    apk = build_apk(root, app, build_dir, dist_dir, args)
    if args.out:
        target = Path(args.out)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(apk), str(target))
        apk = target
    head("Done")
    say(f"APK:  {apk}")
    say(f"Size: {apk.stat().st_size / 1024 / 1024:.2f} MB")
    say(f'Install with:  adb install -r "{apk}"')
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
