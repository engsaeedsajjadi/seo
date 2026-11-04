# Creates or starts the separate main RankForge stack on this computer.
# Its database, secrets and ports are not shared with the test stack.
# The secrets stay in .env.main, which is ignored by Git.
$ErrorActionPreference = 'Stop'
$project = 'rankforge-main'
$envFile = '.env.main'

function New-Secret {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

if (-not (Test-Path 'docker-compose.yml')) { throw 'Run this script from the application folder.' }

if (Test-Path $envFile) {
  Write-Host "$envFile already exists. Keeping its secrets and database password."
} else {
  @(
    "DATABASE_PASSWORD=$(New-Secret)"
    "WORKER_DATABASE_PASSWORD=$(New-Secret)"
    "API_DATABASE_PASSWORD=$(New-Secret)"
    "JWT_SECRET=$(New-Secret)"
    "ENCRYPTION_KEY=$(New-Secret)"
    'POSTGRES_PORT=55532'
    'REDIS_PORT=56479'
    'API_PORT=34011'
    'MCP_PORT=34002'
    'WEB_PORT=127.0.0.1:34000'
    'APP_URL=http://localhost:34000'
    'CORS_ORIGINS=http://localhost:34000'
    'RATE_LIMIT_MAX_REQUESTS=1000'
    'GOOGLE_REDIRECT_URI=http://localhost:34011/api/v1/integrations/google/callback'
  ) | Set-Content -Path $envFile -Encoding ascii
  Write-Host "$envFile created with new random secrets."
}

docker compose -p $project --env-file $envFile up --build -d
if ($LASTEXITCODE -ne 0) { throw 'Starting the main stack failed.' }
docker compose -p $project --env-file $envFile ps
Write-Host 'Main stack address: http://localhost:34000'
