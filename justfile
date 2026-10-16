set shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

exe := "desktop/src-tauri/target/release/cibi.exe"

default:
    @just --list

# Open the built cibi app, restarting it if it is already running.
open:
    if (-not (Test-Path "{{exe}}")) { Write-Error "{{exe}} not found. Run 'make upd' first."; exit 1 }
    [System.Diagnostics.Process]::GetProcessesByName("cibi") | ForEach-Object { $_.Kill(); $_.WaitForExit() }
    Start-Process -FilePath (Resolve-Path "{{exe}}")
