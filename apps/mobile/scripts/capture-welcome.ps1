# Dala — capture the 3 welcome/onboarding slides on a running emulator.
# Read-only against your data (no pm clear, no uninstall). Requires:
#   1. Android emulator running with the dev build installed (tn.dala.app)
#   2. Metro bundler running (npx expo start --dev-client) so the app can load JS
#
# Usage (from apps/mobile):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/capture-welcome.ps1
# Optional: -OutDir C:\tmp\shots -Serial emulator-5554
param(
  [string]$OutDir = "$env:TEMP\dala-welcome",
  [string]$Serial = "",
  [int]$BootWaitSec = 20
)

$ErrorActionPreference = 'Stop'
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) { throw "adb not found at $adb" }

# Target one emulator explicitly when several devices are attached.
$prefix = @()
if ($Serial -ne "") { $prefix = @('-s', $Serial) }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Shot([string]$name) {
  $dest = Join-Path $OutDir $name
  # Binary-safe capture: screencap to /sdcard, then pull (avoids any
  # PowerShell/cmd pipe re-encoding of the PNG bytes).
  $remote = "/sdcard/$name"
  & $adb @prefix shell screencap -p $remote | Out-Null
  & $adb @prefix pull $remote $dest | Out-Null
  & $adb @prefix shell rm $remote | Out-Null
  (Get-Item $dest | Select-Object Name, Length).ToString()
}

function TapSuivant() {
  # Advance the pager by tapping the "Suivant" button. Verified live on
  # emulator-5554 (Pixel, 1080x2400): the welcome-next button spans
  # bounds [47,2197][1033,2316], so its center is (540, 2256). The
  # uiautomator dump exposes resource-id="welcome-next" (see welcome.tsx
  # testIDs), but bounds regex on raw text nodes proved fragile
  # (React Native Text renders without text="..." attributes in the
  # dump), so tap the stable center coordinate instead.
  & $adb @prefix shell input tap 540 2256 | Out-Null
}

Write-Output "-- waiting for device ($BootWaitSec s max) --"
& $adb @prefix wait-for-device
$deadline = (Get-Date).AddSeconds($BootWaitSec)
do {
  $boot = (& $adb @prefix shell getprop sys.boot_completed 2>$null) -join ''
  if ($boot -match '1') { break }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)

Write-Output "-- opening dala://welcome --"
& $adb @prefix shell am start -a android.intent.action.VIEW -d "dala://welcome" tn.dala.app
Start-Sleep -Seconds 4
Shot 'welcome_1.png'

Write-Output "-- advancing to slide 2 (tap Suivant) --"
TapSuivant
Start-Sleep -Seconds 2
Shot 'welcome_2.png'

Write-Output "-- advancing to slide 3 (tap Suivant) --"
TapSuivant
Start-Sleep -Seconds 2
Shot 'welcome_3.png'

Write-Output "-- done: $OutDir --"
Get-ChildItem $OutDir -Filter 'welcome_*.png' | Select-Object Name, Length
