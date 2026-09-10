<#
.SYNOPSIS
  Pushes migrations, sets Edge Function secrets and deploys the three Edge Functions.

.DESCRIPTION
  Reads key=value pairs from a .env file (default: <repo>/.env, copied from .env.example)
  and forwards the server-side ones to "supabase secrets set".
  You must have run "supabase login" and "supabase link --project-ref <ref>" once before.

.PARAMETER EnvFile
  Path to the .env file to read. Defaults to .env in the repository root.

.PARAMETER SkipDbPush
  Deploy functions and secrets only; do not run "supabase db push".
#>

param(
    [string] $EnvFile = (Join-Path (Split-Path -Parent $PSScriptRoot) '.env'),
    [switch] $SkipDbPush
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path $EnvFile))
{
    throw "Env file not found: $EnvFile. Copy .env.example to .env and fill it in."
}

# Prefer a globally installed CLI, otherwise fall back to npx.
$supabase = if (Get-Command supabase -ErrorAction SilentlyContinue) { @('supabase') } else { @('npx', 'supabase') }

function Invoke-Supabase([string[]] $Arguments)
{
    & $supabase[0] @($supabase[1..($supabase.Length - 1)] + $Arguments)
    if ($LASTEXITCODE -ne 0)
    {
        throw "supabase $($Arguments -join ' ') failed"
    }
}

# Parse the .env file into a hashtable (ignores comments and blank lines).
$values = @{}
Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line.Contains('='))
    {
        $index = $line.IndexOf('=')
        $values[$line.Substring(0, $index).Trim()] = $line.Substring($index + 1).Trim()
    }
}

# Only server-side values belong in Edge Function secrets. SUPABASE_* are injected automatically.
$secretKeys = @(
    'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_AGENT_NAME',
    'OPENAI_API_KEY', 'SUMMARY_MODEL', 'SUMMARY_TIMEZONE'
)
$secretArguments = @()
foreach ($key in $secretKeys)
{
    if ($values.ContainsKey($key) -and $values[$key] -and -not $values[$key].StartsWith('YOUR-'))
    {
        $secretArguments += "$key=$($values[$key])"
    }
    else
    {
        Write-Warning "$key is missing or still a placeholder in $EnvFile; skipping."
    }
}

Push-Location $repoRoot
try
{
    if (-not $SkipDbPush)
    {
        Write-Host '== supabase db push' -ForegroundColor Cyan
        Invoke-Supabase @('db', 'push')
    }

    if ($secretArguments.Count -gt 0)
    {
        Write-Host '== supabase secrets set' -ForegroundColor Cyan
        Invoke-Supabase (@('secrets', 'set') + $secretArguments)
    }

    Write-Host '== deploy functions' -ForegroundColor Cyan
    Invoke-Supabase @('functions', 'deploy', 'livekit-token')
    Invoke-Supabase @('functions', 'deploy', 'notify-request', '--no-verify-jwt')
    Invoke-Supabase @('functions', 'deploy', 'generate-daily-summary', '--no-verify-jwt')

    Write-Host ''
    Write-Host 'Deployed. Remember the one-time Vault secrets for pg_cron (see README, step 2.3).' -ForegroundColor Green
}
finally
{
    Pop-Location
}
