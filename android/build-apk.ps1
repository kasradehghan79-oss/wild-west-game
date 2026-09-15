<#
  Windows convenience wrapper around android/build_apk.py.

  The real build lives in build_apk.py (cross-platform, single source of truth).
  This exists only so Windows users have a double-clickable / PowerShell-native way
  in; it forwards every argument straight through.

      powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
      powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 -Check
      powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 -Release -Keystore my.jks -StorePass secret
#>
[CmdletBinding()]
param(
  [string]$Sdk,
  [string]$JavaHome,
  [string]$Out,
  [int]$VersionCode = 0,
  [string]$VersionName = '',
  [switch]$Check,
  # not -Verbose: that name belongs to PowerShell's common parameters
  [switch]$ShowCommands,
  [switch]$Release,
  [string]$Keystore,
  [string]$KeyAlias = 'wildwest',
  [string]$StorePass
)

$script = Join-Path $PSScriptRoot 'build_apk.py'
if (-not (Test-Path $script)) { Write-Host "!! build_apk.py not found next to this script" -ForegroundColor Red; exit 1 }

$python = $null
foreach ($candidate in @('python', 'py', 'python3')) {
  $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
  if ($cmd) { $python = $cmd.Source; break }
}
if (-not $python) {
  Write-Host "!! Python 3 was not found on PATH." -ForegroundColor Red
  Write-Host "   Install it from https://python.org (tick 'Add python.exe to PATH'),"
  Write-Host "   or use the Gradle build: open the android/ folder in Android Studio."
  exit 1
}

$cliArgs = @($script)
if ($Sdk) { $cliArgs += @('--sdk', $Sdk) }
if ($JavaHome) { $cliArgs += @('--java-home', $JavaHome) }
if ($Out) { $cliArgs += @('--out', $Out) }
if ($VersionCode -gt 0) { $cliArgs += @('--version-code', $VersionCode) }
if ($VersionName) { $cliArgs += @('--version-name', $VersionName) }
if ($Check) { $cliArgs += '--check' }
if ($ShowCommands) { $cliArgs += '--verbose' }
if ($Release) { $cliArgs += '--release' }
if ($Keystore) { $cliArgs += @('--keystore', $Keystore) }
if ($KeyAlias) { $cliArgs += @('--key-alias', $KeyAlias) }
if ($StorePass) { $cliArgs += @('--store-pass', $StorePass) }

& $python @cliArgs
exit $LASTEXITCODE
