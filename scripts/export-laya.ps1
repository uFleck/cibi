# Installs the Laya model that cibi uses to pick a category for descriptions it cannot match by rules.
# See docs/laya.md. Run once:
#   powershell -ExecutionPolicy Bypass -File scripts\export-laya.ps1
#
# Downloads convaiinnovations/laya-multilingual (about 0.7 GB) and exports it to ONNX in a temp venv
# outside the repo (torch is about 1 GB). The venv and downloads are deleted at the end unless -KeepTemp.
# Copies encoder.onnx (int8, about 0.31 GB), head.onnx (+ sidecar), tokenizer.json and rl_agent_config.json to
# %APPDATA%\com.ufleck.cibi\models\laya\. Restart cibi afterwards.
param(
  [string]$Repo = 'convaiinnovations/laya-multilingual',
  [string]$LayaCommit = '4ac226d5ee88ed6df8db288a05c766d7a34ee682',
  [switch]$KeepTemp
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $env:APPDATA 'com.ufleck.cibi\models\laya'
$work = Join-Path $env:TEMP ('laya-export-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null

try {
  $py = $null
  # Windows PowerShell 5.1 turns a native command's stderr into an error under 'Stop'; probe with 'Continue'.
  $ErrorActionPreference = 'Continue'
  foreach ($v in @('-3.13', '-3.12')) {
    $global:LASTEXITCODE = 1
    try { & py $v -c 'import sys' 2>$null | Out-Null } catch {}
    if ($LASTEXITCODE -eq 0) { $py = $v; break }
  }
  $ErrorActionPreference = 'Stop'
  if (-not $py) { throw 'Python 3.12 or 3.13 is required (py launcher).' }

  $venv = Join-Path $work 'venv'
  $python = Join-Path $venv 'Scripts\python.exe'
  Write-Host "Creating venv in $venv"
  & py $py -m venv $venv
  $env:PYTHONUTF8 = '1'
  $env:HF_HOME = Join-Path $work 'hf'
  & $python -m pip install --quiet --upgrade pip
  & $python -m pip install --quiet torch transformers safetensors huggingface_hub numpy onnx onnxruntime onnxscript `
    "https://github.com/NandhaKishorM/laya/archive/$LayaCommit.zip"
  if ($LASTEXITCODE -ne 0) { throw 'pip install failed.' }

  $exporter = Join-Path $work 'export_onnx.py'
  Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/NandhaKishorM/laya/$LayaCommit/laya-ts/scripts/export_onnx.py" -OutFile $exporter

  $onnx = Join-Path $work 'onnx'
  Write-Host "Downloading $Repo and exporting to ONNX"
  & $python $exporter --repo $Repo --out-dir $onnx
  if ($LASTEXITCODE -ne 0) { throw 'export failed.' }

  $int8 = Join-Path $work 'int8'
  Write-Host 'Quantizing the encoder (int8)'
  & $python (Join-Path $here 'laya_quantize.py') --src $onnx --out $int8 --verify
  if ($LASTEXITCODE -ne 0) { throw 'quantization failed.' }

  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  Copy-Item (Join-Path $int8 'encoder.onnx') $dest -Force
  foreach ($f in @('head.onnx', 'head.onnx.data', 'tokenizer.json', 'rl_agent_config.json')) {
    $src = Join-Path $onnx $f
    if (Test-Path $src) { Copy-Item $src $dest -Force }
  }
  Get-ChildItem $dest | Format-Table Name, @{ n = 'MB'; e = { [math]::Round($_.Length / 1MB, 1) } } -AutoSize | Out-String | Write-Host
  Write-Host "Installed to $dest. Restart cibi to use it."
}
finally {
  if ($KeepTemp) {
    Write-Host "Kept $work"
  } else {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
  }
}
