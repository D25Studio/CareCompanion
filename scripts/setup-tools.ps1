<#
.SYNOPSIS
  Installs the command-line tools this repo needs on Windows.

.DESCRIPTION
  Idempotent: each tool is skipped when it is already on PATH.
  Requires Node 20+ to be installed first (https://nodejs.org).
#>

$ErrorActionPreference = 'Stop'

function Test-Command([string] $Name)
{
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

if (-not (Test-Command 'node'))
{
    throw 'Node.js 20+ is required. Install it from https://nodejs.org and re-run this script.'
}

$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20)
{
    throw "Node 20+ is required; found $(node --version)."
}

if (-not (Test-Command 'pnpm'))
{
    Write-Host 'Installing pnpm...'
    npm install -g pnpm@10
}
else
{
    Write-Host "pnpm already installed ($(pnpm --version))."
}

if (-not (Test-Command 'eas'))
{
    Write-Host 'Installing EAS CLI (Expo dev builds)...'
    npm install -g eas-cli
}
else
{
    Write-Host 'eas-cli already installed.'
}

if (-not (Test-Command 'supabase'))
{
    if (Test-Command 'scoop')
    {
        Write-Host 'Installing Supabase CLI via scoop...'
        scoop bucket add supabase https://github.com/supabase/scoop-bucket.git 2>$null
        scoop install supabase
    }
    else
    {
        Write-Host 'Supabase CLI not found and scoop is unavailable. The deploy script falls back to "npx supabase".'
    }
}
else
{
    Write-Host 'Supabase CLI already installed.'
}

if (-not (Test-Command 'lk'))
{
    if (Test-Command 'winget')
    {
        Write-Host 'Installing LiveKit CLI (optional, for "lk agent create")...'
        winget install --id LiveKit.LiveKitCLI --accept-source-agreements --accept-package-agreements
    }
    else
    {
        Write-Host 'LiveKit CLI not installed (winget unavailable). Optional; only needed to deploy the agent to LiveKit Cloud.'
    }
}
else
{
    Write-Host 'LiveKit CLI already installed.'
}

Write-Host ''
Write-Host 'Done. Next: pnpm install, then see README.md "Set up in order".'
