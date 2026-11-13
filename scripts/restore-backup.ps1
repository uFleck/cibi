<#
.SYNOPSIS
    Restores a cibi backup (SQL dump or binary snapshot) into the app database.

.DESCRIPTION
    Refuses to run while cibi is open. An existing database is moved aside, not
    deleted: cibi.db, cibi.db-wal and cibi.db-shm are renamed to
    <name>.before-restore-<timestamp>. Then the app's restore mode runs:
    <cibi exe> --restore <file>. If the restore fails, the moved files are put
    back.

.PARAMETER File
    A cibi-latest.sql dump or a cibi-YYYYMMDD-HHMMSS.db snapshot.

.PARAMETER Exe
    The cibi executable. Defaults to the newest cibi*.exe in
    desktop\src-tauri\target\release. Required if none is found there.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\restore-backup.ps1 -File "$env:APPDATA\com.ufleck.cibi\backups\cibi-latest.sql"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$File,

    [string]$Exe
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Exit-WithError {
    param([string]$Message)
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

$repoRoot = Split-Path -Parent $PSScriptRoot

# 1. Input file.
if (-not (Test-Path -LiteralPath $File -PathType Leaf)) {
    Exit-WithError "Backup file not found: $File"
}
$File = (Resolve-Path -LiteralPath $File).Path
$extension = [System.IO.Path]::GetExtension($File).ToLowerInvariant()
if ($extension -ne '.sql' -and $extension -ne '.db') {
    Exit-WithError "Expected a .sql or .db file, got: $File"
}

# 2. Executable.
if (-not $Exe) {
    $releaseDir = Join-Path $repoRoot 'desktop\src-tauri\target\release'
    $candidates = @(Get-ChildItem -Path $releaseDir -Filter 'cibi*.exe' -File -ErrorAction SilentlyContinue |
        Sort-Object -Property LastWriteTime -Descending)
    if ($candidates.Count -eq 0) {
        Exit-WithError "No cibi*.exe found in $releaseDir. Build the app (make upd) or pass -Exe <path>."
    }
    $Exe = $candidates[0].FullName
    Write-Host "Using executable: $Exe"
}
if (-not (Test-Path -LiteralPath $Exe -PathType Leaf)) {
    Exit-WithError "cibi executable not found: $Exe"
}
$Exe = (Resolve-Path -LiteralPath $Exe).Path

# 3. The app must be closed, or the database files are locked and change under us.
$running = @(Get-Process -Name 'cibi*' -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) {
    Exit-WithError 'cibi is running. Quit it from the system tray, then run this script again.'
}

# 4. Database location.
if ($env:CIBI_DB_PATH) {
    $dbPath = $env:CIBI_DB_PATH
} else {
    $dbPath = Join-Path $env:APPDATA 'com.ufleck.cibi\cibi.db'
}
$dbFiles = @($dbPath, "$dbPath-wal", "$dbPath-shm")
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Write-Host "Database: $dbPath"

# 5. Move any existing database aside. Nothing is deleted.
$moved = @()
foreach ($src in $dbFiles) {
    if (Test-Path -LiteralPath $src -PathType Leaf) {
        $moved += [pscustomobject]@{ Src = $src; Saved = "$src.before-restore-$stamp" }
    }
}

if ($moved.Count -gt 0) {
    Write-Host 'Existing database found. Moving it aside:'
    $done = @()
    try {
        foreach ($item in $moved) {
            Move-Item -LiteralPath $item.Src -Destination $item.Saved
            $done += $item
            Write-Host "  $($item.Src) -> $($item.Saved)"
        }
    } catch {
        foreach ($item in $done) {
            Move-Item -LiteralPath $item.Saved -Destination $item.Src
        }
        Exit-WithError "Could not move the existing database aside: $($_.Exception.Message)"
    }
}

# 6. Restore.
Write-Host "Restoring $File ..."
# cibi is a GUI-subsystem app: a plain call returns before the restore ends and
# $LASTEXITCODE is not set. Start-Process -Wait is the only reliable way to get the exit code.
$p = Start-Process -FilePath $Exe -ArgumentList @('--restore', "`"$File`"") -Wait -PassThru
$exitCode = $p.ExitCode

# The app appends its result messages to restore.log next to the target database.
$logPath = Join-Path (Split-Path -Parent $dbPath) 'restore.log'
if (Test-Path -LiteralPath $logPath -PathType Leaf) {
    Write-Host "Last lines of $logPath :"
    Get-Content -LiteralPath $logPath -Tail 3 | ForEach-Object { Write-Host "  $_" }
}

if ($exitCode -ne 0) {
    Write-Host "Restore failed with exit code $exitCode." -ForegroundColor Red
    # Keep any partial output of the failed restore, then put the original files back.
    foreach ($src in $dbFiles) {
        if (Test-Path -LiteralPath $src -PathType Leaf) {
            Move-Item -LiteralPath $src -Destination "$src.failed-restore-$stamp"
            Write-Host "  partial output kept at $src.failed-restore-$stamp"
        }
    }
    foreach ($item in $moved) {
        Move-Item -LiteralPath $item.Saved -Destination $item.Src
        Write-Host "  restored $($item.Src)"
    }
    Exit-WithError "Restore failed (exit code $exitCode). The previous database files were put back."
}

# 7. Final state.
Write-Host ''
Write-Host 'Restore finished.' -ForegroundColor Green
Write-Host 'Database files now:'
foreach ($src in $dbFiles) {
    if (Test-Path -LiteralPath $src -PathType Leaf) {
        $size = (Get-Item -LiteralPath $src).Length
        Write-Host ('  {0}  ({1:N0} bytes)' -f $src, $size)
    }
}
if ($moved.Count -gt 0) {
    Write-Host 'Previous database kept at:'
    foreach ($item in $moved) {
        Write-Host "  $($item.Saved)"
    }
}
Write-Host 'Start cibi again to use the restored data.'
exit 0
