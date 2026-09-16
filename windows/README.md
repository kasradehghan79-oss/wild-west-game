# The Wild West - the Windows build

`windows/` produces a setup file for Windows 10 and 11: a wizard, a Start Menu
shortcut, an uninstaller, and an entry in Settings > Apps. It needs no
administrator to install and none to remove, because everything it writes goes
into your own user account.

```bash
python windows/build_setup.py            # -> dist/The Wild West Setup.exe  (0.4 MB)
python windows/build_setup.py --check    # report the toolchain and payload
python windows/build_setup.py --selftest # build, then install and remove it in a scratch folder
```

## What it needs

Nothing. The build uses `csc.exe`, the C# compiler that comes with the .NET
Framework inside every Windows 10 and 11 install, and the installer itself only
needs the .NET Framework, which is also already there. No SDK, no downloads, no
Inno Setup, no WiX - `windows/setup.cs` is the whole installer, and it is
compiled from source at build time.

| | |
| --- | --- |
| Python | 3.8+ for the build script |
| Node | for the distribution build (`tools/make-dist.mjs`) and the icon packer |
| Closure Compiler | `closure.jar`, fetched on demand into `~/.kilotools`: it compiles the game before it is packaged |
| Compiler | `csc.exe` (in Windows) |
| Runtime on the target PC | .NET Framework 4.x (in Windows 10 and 11) |

## What it does

The game is a web build that runs from `file://` - no server, no XHR, no
network - so the install is the build in a folder plus a way to see it:

| | |
| --- | --- |
| Installs to | `%LOCALAPPDATA%\Programs\The Wild West` |
| Installs | the compiled build from `dist/www`, not the sources: the setup file is opened by strangers, and it must not hand them the repository |
| Shortcut | Start Menu (and the desktop, if you tick the box) |
| Opens it with | Microsoft Edge in application mode: a window of its own, no address bar, no tabs |
| If Edge is missing | the shortcut falls back to your default browser |
| Saves | in the browser's storage, as on the web build |
| Uninstall | Settings > Apps, or `Uninstall.exe` in the install folder |
| That uninstaller | written there at install time: the setup copies itself in, and finds the install through the registry, so it works even if moved |
| Writes to | that one folder, your Start Menu, and `HKCU\...\Uninstall\TheWildWest` |

Nothing is written to `Program Files`, nothing to `HKLM`, and no elevation is
requested - the installer carries a manifest saying `asInvoker` on purpose,
because Windows treats any file called "setup" as an installer and would
otherwise demand administrator rights.

## Options

```
"The Wild West Setup.exe"                      the wizard
      --silent --dir="C:\some\where"           install with no questions
      --portable --dir="C:\some\where"         unpack the game only: no
                                               shortcuts, no registry entry
      --uninstall [--silent]                   remove it
```

`--portable` is what the build's self test uses, so testing never touches your
Start Menu.

## SmartScreen

The setup is not code signed, so the first run shows **"Windows protected your
PC"**. Click *More info*, then *Run anyway*. That warning is about the absence of
a certificate, not about the file; signing needs a code signing certificate,
which is the one part of this that cannot be done with free tools.

## Checking it by hand

```bash
python windows/build_setup.py --selftest
```

That builds the setup, installs it into a scratch folder with `--portable`,
checks the game arrived whole, and deletes the folder. To do the same by hand
without leaving anything behind:

```powershell
$env:LOCALAPPDATA\Programs\The Wild West\Uninstall.exe --uninstall --silent
```

## Files

```
setup.cs             the installer and the uninstaller, in C#
build_setup.py       collects the payload, compiles setup.cs, writes dist/
tools/make-ico.cjs   packs the Android artwork into brand.ico
brand.ico            built from that artwork, not drawn twice
```
