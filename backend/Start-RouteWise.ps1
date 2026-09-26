param([switch]$Build)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $nodeFolder = Join-Path $runtimeRoot 'node\bin'
    if (-not (Test-Path -LiteralPath (Join-Path $nodeFolder 'node.exe'))) { throw 'Install Node.js 24 LTS, reopen PowerShell, and try again.' }
    $env:PATH = $nodeFolder + ';' + $env:PATH
}
$pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
$pnpmPath = if ($pnpmCommand) { $pnpmCommand.Source } else { Join-Path $runtimeRoot 'bin\fallback\pnpm.cmd' }
if (-not (Test-Path -LiteralPath $pnpmPath)) { throw 'Install pnpm 11: npm install -g pnpm@11.25.0' }
$env:PATH = (Split-Path -Parent $pnpmPath) + ';' + $env:PATH
if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
if (-not (Test-Path -LiteralPath 'node_modules')) {
    & $pnpmPath install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
if ($Build) {
    & $pnpmPath build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    & $pnpmPath start
} else {
    & $pnpmPath dev
}
