<#
.SYNOPSIS
  Starts the voice agent locally in dev mode (hot reload, verbose logs).

.DESCRIPTION
  Expects services/voice-agent/.env.local to exist (copy from .env.example).
  Pass -Console to talk to the agent from the terminal without a phone.
#>

param(
    [switch] $Console
)

$ErrorActionPreference = 'Stop'
$agentDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'services/voice-agent'

if (-not (Test-Path (Join-Path $agentDir '.env.local')))
{
    throw 'services/voice-agent/.env.local not found. Copy .env.example and fill in LiveKit, OpenAI and Supabase values.'
}

Push-Location $agentDir
try
{
    if ($Console)
    {
        pnpm console
    }
    else
    {
        pnpm dev
    }
}
finally
{
    Pop-Location
}
