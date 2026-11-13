<#
.SYNOPSIS
    Commits and pushes the cibi SQL backup dump to the private backups repo.

.DESCRIPTION
    The cibi app writes cibi-latest.sql into its backups folder. This script
    commits that file, plus a .gitignore that keeps the binary snapshots out of
    git, and pushes it. A failed push is a warning, not an error: the commit
    stays local and is pushed on the next run.

    The backups repo MUST stay private. The dump is plain-text financial data.

.PARAMETER BackupDir
    Backups folder. Defaults to $env:CIBI_BACKUP_DIR, then
    %APPDATA%\com.ufleck.cibi\backups.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup-push.ps1
#>
[CmdletBinding()]
param(
    [string]$BackupDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Exit-WithError {
    param([string]$Message)
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

function Push-Backup {
    $remotes = @(& git @gitBase remote)
    if ($remotes -notcontains 'origin') {
        Write-Warning "No 'origin' remote configured. The commit stays local until one is added."
        return
    }

    & git @gitBase push -u origin HEAD
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'git push failed (offline or not authorized). The commit is kept locally and will be pushed on the next run.'
        return
    }
    Write-Host 'Backup pushed.' -ForegroundColor Green
}

if (-not $BackupDir) {
    if ($env:CIBI_BACKUP_DIR) {
        $BackupDir = $env:CIBI_BACKUP_DIR
    } else {
        $BackupDir = Join-Path $env:APPDATA 'com.ufleck.cibi\backups'
    }
}

if (-not (Test-Path -LiteralPath $BackupDir -PathType Container)) {
    Exit-WithError "Backups folder not found: $BackupDir. Start the app once, or set CIBI_BACKUP_DIR."
}

$latest = Join-Path $BackupDir 'cibi-latest.sql'
if (-not (Test-Path -LiteralPath $latest -PathType Leaf)) {
    Exit-WithError "cibi-latest.sql not found in $BackupDir. Start the app once so it writes the dump."
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Exit-WithError 'git is not on PATH.'
}

$gitBase = @('-C', $BackupDir)

if (-not (Test-Path -LiteralPath (Join-Path $BackupDir '.git'))) {
    $template = Join-Path $PSScriptRoot 'backups-gitignore'
    Write-Host "$BackupDir is not a git repository yet. One-time setup (run these yourself):" -ForegroundColor Yellow
    Write-Host ''
    Write-Host "  gh repo create uFleck/cibi-backups --private"
    Write-Host "  git -C `"$BackupDir`" init -b main"
    Write-Host "  Copy-Item `"$template`" `"$(Join-Path $BackupDir '.gitignore')`""
    Write-Host "  git -C `"$BackupDir`" remote add origin <private-repo-url>"
    Write-Host ''
    Write-Host 'Nothing was changed. Run this script again after setup.'
    exit 1
}

# Keep the binary snapshots (*.db, *.db-wal, *.db-shm) out of git.
$ignorePath = Join-Path $BackupDir '.gitignore'
$requiredIgnores = @('*.db', '*.db-wal', '*.db-shm')
$existingIgnores = @()
if (Test-Path -LiteralPath $ignorePath -PathType Leaf) {
    $existingIgnores = @(Get-Content -LiteralPath $ignorePath)
}
$missingIgnores = @($requiredIgnores | Where-Object { $existingIgnores -notcontains $_ })
if ($missingIgnores.Count -gt 0) {
    Add-Content -LiteralPath $ignorePath -Value $missingIgnores
    Write-Host "Added to .gitignore: $($missingIgnores -join ', ')"
}

& git @gitBase add -- cibi-latest.sql .gitignore
if ($LASTEXITCODE -ne 0) {
    Exit-WithError 'git add failed.'
}

& git @gitBase diff --cached --quiet
$hasStagedChanges = ($LASTEXITCODE -ne 0)

if (-not $hasStagedChanges) {
    # Nothing new. Push anyway: it is a no-op when up to date, and it sends any
    # commit left unpushed by an earlier run (including one made before an upstream was set).
    Write-Host 'No new changes.'
    Push-Backup
    exit 0
}

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
& git @gitBase commit -m "backup $stamp"
if ($LASTEXITCODE -ne 0) {
    Exit-WithError 'git commit failed. Check git user.name and user.email.'
}
Write-Host "Committed: backup $stamp"

Push-Backup
exit 0
