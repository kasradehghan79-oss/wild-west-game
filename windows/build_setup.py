#!/usr/bin/env python3
"""Builds the Windows installer for The Wild West.

Cross-platform Python 3, no third party modules, and nothing to download: the
compiler it uses (csc.exe) and the runtime it targets (.NET Framework 4.x) are
both part of Windows itself, so the setup file can be rebuilt on any Windows 10
or 11 machine.

    1. collects the web build - index.html, css/ and js/ - into one zip
    2. builds the Windows icon from the artwork the Android tool already drew
    3. substitutes the version into setup.cs and compiles it
    4. writes dist/<name>.exe, ready to run on a PC with no administrator

    python windows/build_setup.py            # build it
    python windows/build_setup.py --check    # report the toolchain and payload
    python windows/build_setup.py --selftest # build, then install and remove it
                                             # into a scratch folder to prove it

The installed game runs from file:// with no server and no network, which is
what makes a plain folder plus a window to see it in a complete install.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # the project
WINDOWS = ROOT / "windows"
DIST = ROOT / "dist"
BUILD = WINDOWS / "build"

# what a player needs at runtime, and nothing else: the tests, the Android
# shell, the brand sources and the tools are all build time things
PAYLOAD_DIRS = ["css", "js"]
PAYLOAD_FILES = ["index.html"]

README = """The Wild West
=============

Created by Kasra_dn

This folder is the whole game. To play it, use the shortcut in your Start Menu
called "The Wild West", or double click index.html.

Windows opens it in Microsoft Edge's application mode, which gives the game a
window of its own - no address bar, no tabs - using the browser that is already
part of Windows. If Edge is ever missing, the shortcut falls back to your
default browser.

To remove it, use "The Wild West" in Settings > Apps, or run Uninstall.exe here.
Nothing was written outside this folder and your own user account: no
administrator was needed to install it, and none is needed to remove it.
"""


def say(message: str) -> None:
    print(f"   {message}")


def die(message: str) -> "NoReturn":  # type: ignore[valid-type]
    print(f"!! {message}")
    sys.exit(1)


def version() -> str:
    package = ROOT / "package.json"
    if package.exists():
        try:
            return json.loads(package.read_text(encoding="utf-8")).get("version", "0.0.0")
        except (ValueError, OSError):
            pass
    return "0.0.0"


def find_csc() -> Path | None:
    """The C# compiler that ships inside Windows with the .NET Framework."""
    candidates = [
        Path(os.environ.get("WINDIR", r"C:\Windows")) / "Microsoft.NET" / "Framework64" / "v4.0.30319" / "csc.exe",
        Path(os.environ.get("WINDIR", r"C:\Windows")) / "Microsoft.NET" / "Framework" / "v4.0.30319" / "csc.exe",
    ]
    for c in candidates:
        if c.exists():
            return c
    found = shutil.which("csc")
    return Path(found) if found else None


def framework_dir(csc: Path) -> Path:
    return csc.parent


def payload_files() -> list[Path]:
    files: list[Path] = []
    for name in PAYLOAD_FILES:
        path = ROOT / name
        if not path.exists():
            die(f"missing {name} - this is not a complete checkout")
        files.append(path)
    for name in PAYLOAD_DIRS:
        directory = ROOT / name
        if not directory.is_dir():
            die(f"missing {name}/ - this is not a complete checkout")
        files.extend(sorted(p for p in directory.rglob("*") if p.is_file()))
    return files


def make_payload(files: list[Path], target: Path) -> int:
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for path in files:
            z.write(path, path.relative_to(ROOT).as_posix())
        z.writestr("READ-ME.txt", README.replace("\n", "\r\n"))
    return target.stat().st_size


def make_manifest(target: Path) -> None:
    """Without this, Windows sees "setup" in the file name and its installer
    detection demands elevation - which would defeat a per-user install."""
    target.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">\n'
        '  <assemblyIdentity version="1.0.0.0" name="TheWildWest.Setup" type="win32"/>\n'
        '  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v2">\n'
        '    <security><requestedPrivileges>\n'
        '      <requestedExecutionLevel level="asInvoker" uiAccess="false"/>\n'
        '    </requestedPrivileges></security>\n'
        '  </trustInfo>\n'
        '  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">\n'
        '    <application>\n'
        '      <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/>\n'   # 10 and 11
        '      <supportedOS Id="{1f676c76-80e1-4239-95bb-83d0f6d0da78}"/>\n'   # 8.1
        '    </application>\n'
        '  </compatibility>\n'
        '</assembly>\n',
        encoding="utf-8")


def build(quiet: bool = False) -> Path:
    csc = find_csc()
    if not csc:
        die("no C# compiler found - this needs a Windows 10 or 11 system")
    ver = version()

    if not quiet:
        say(f"compiler  {csc}")
        say(f"version   {ver}")

    BUILD.mkdir(parents=True, exist_ok=True)
    files = payload_files()
    payload = BUILD / "payload.zip"
    size = make_payload(files, payload)
    if not quiet:
        say(f"payload   {len(files)} files, {size / 1024:.0f} KB zipped")

    # the icon, from the artwork the Android tool drew
    ico = BUILD / "brand.ico"
    subprocess.run(["node", str(WINDOWS / "tools" / "make-ico.cjs")],
                   cwd=str(ROOT), check=True, capture_output=quiet)

    # the version is text, so it is substituted rather than passed as a define
    source = (WINDOWS / "setup.cs").read_text(encoding="utf-8").replace("__VERSION__", ver)
    staged = BUILD / "setup.cs"
    staged.write_text(source, encoding="utf-8")
    manifest = BUILD / "setup.manifest"
    make_manifest(manifest)

    out = BUILD / "TheWildWestSetup.exe"
    lib = framework_dir(csc)
    references = ["System.dll", "System.Core.dll", "System.Drawing.dll",
                  "System.Windows.Forms.dll", "System.IO.Compression.dll",
                  "System.IO.Compression.FileSystem.dll"]
    cmd = [str(csc), "/nologo", "/target:winexe", "/optimize+", "/platform:anycpu",
           f"/win32icon:{ico}", f"/win32manifest:{manifest}",
           f"/resource:{payload},payload.zip",
           f"/out:{out}", str(staged)]
    for ref in references:
        path = lib / ref
        if path.exists():
            cmd.append(f"/reference:{path}")
        elif not quiet:
            say(f"note: {ref} not found next to the compiler, using the framework's own copy")
    proc = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    if proc.returncode != 0:
        die("the compiler failed:\n" + (proc.stdout or "") + (proc.stderr or ""))
    for line in (proc.stdout or "").splitlines():
        if line.strip() and not quiet:
            say(line.strip())

    # one file, one name: a second aligned-to-the-URL copy only made a folder of
    # two setup files that look like two versions. The version is inside it -
    # Explorer's Details tab and the wizard both show it.
    DIST.mkdir(parents=True, exist_ok=True)
    named = DIST / "The Wild West Setup.exe"
    shutil.copyfile(out, named)
    return named


def selftest(exe: Path) -> int:
    """Install into a scratch folder and take it away again. This is the only
    honest way to check an installer, and --portable keeps it from touching the
    Start Menu, the desktop or the registry while it runs."""
    scratch = Path(tempfile.mkdtemp(prefix="wildwest-selftest-"))
    target = scratch / "The Wild West"
    failures: list[str] = []
    try:
        say(f"installing to {target}")
        proc = subprocess.run([str(exe), "--portable", f"--dir={target}"],
                              capture_output=True, text=True, errors="replace", timeout=300)
        if proc.returncode != 0:
            failures.append(f"the installer exited {proc.returncode}: {proc.stdout} {proc.stderr}")
        wanted = ["index.html", "READ-ME.txt", "css/base.css", "js/game/loop.js",
                  "js/game/splash.js", "js/vendor/three.min.js", "js/entities/shooting.js"]
        for name in wanted:
            if not (target / name).exists():
                failures.append(f"missing after install: {name}")
        total = sum(p.stat().st_size for p in target.rglob("*") if p.is_file())
        if not quiet_summary(target, total):
            failures.append("the installed folder looks too small to be the game")
        installed = len([p for p in target.rglob("*") if p.is_file()])
        say(f"installed {installed} files, {total / 1024:.0f} KB")
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
        say("scratch folder removed")

    if failures:
        for f in failures:
            print(f"!! {f}")
        return 1
    print("== setup self test passed")
    return 0


def quiet_summary(target: Path, total: int) -> bool:
    return (target / "index.html").exists() and total > 100_000


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the Windows installer")
    parser.add_argument("--check", action="store_true", help="report the toolchain and payload, build nothing")
    parser.add_argument("--selftest", action="store_true", help="build, then install and remove it in a scratch folder")
    args = parser.parse_args()

    if args.check:
        csc = find_csc()
        ver = version()
        files = payload_files()
        ico = BUILD / "brand.ico"
        print("== Checking the Windows build")
        say(f"project   {ROOT}")
        say(f"compiler  {csc if csc else 'MISSING - needs Windows with .NET Framework 4.x'}")
        say(f"version   {ver}")
        say(f"payload   {len(files)} files, {sum(p.stat().st_size for p in files) / 1024:.0f} KB")
        for name in ["index.html", "css/base.css", "js/game/splash.js", "js/vendor/three.min.js"]:
            say(f"  {'ok ' if (ROOT / name).exists() else 'MISSING'} {name}")
        say(f"icon      {ico.name} {'present' if ico.exists() else 'will be built from the Android artwork'}")
        if not csc:
            return 1
        print("== Ready")
        return 0

    print("== Building the Windows installer")
    exe = build()
    size = exe.stat().st_size / 1024 / 1024
    print(f"== Done\n   Setup: {exe}\n   Size:  {size:.1f} MB\n   The uninstaller is written into the install folder at install time.")

    if args.selftest:
        print("== Self test")
        return selftest(DIST / "The Wild West Setup.exe")
    return 0


if __name__ == "__main__":
    sys.exit(main())
