<#
.SYNOPSIS
  Installs dependencies, type-checks every workspace package and runs all tests.

.DESCRIPTION
  Run from anywhere; the script changes to the repository root.
  Exits non-zero on the first failing step so it is safe to use in CI.
#>

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try
{
    Write-Host '== pnpm install' -ForegroundColor Cyan
    pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed' }

    Write-Host '== typecheck (all packages)' -ForegroundColor Cyan
    pnpm -r typecheck
    if ($LASTEXITCODE -ne 0) { throw 'typecheck failed' }

    Write-Host '== tests' -ForegroundColor Cyan
    pnpm -r test
    if ($LASTEXITCODE -ne 0) { throw 'tests failed' }

    Write-Host ''
    Write-Host 'All checks passed.' -ForegroundColor Green
}
finally
{
    Pop-Location
}
