# Genesis Reserve — API Dev Startup
# Run from apps/api/: .\start-dev.ps1
# Requires: Docker Desktop running

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  Genesis Reserve API — Dev Startup" -ForegroundColor Cyan
Write-Host "  ───────────────────────────────────" -ForegroundColor Cyan
Write-Host ""

# 1. Verify Docker
Write-Host "[1/5] Checking Docker..." -ForegroundColor Yellow
try {
    $null = docker info 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Docker daemon not responding" }
    Write-Host "      Docker OK" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Docker Desktop is not running." -ForegroundColor Red
    exit 1
}

# 2. Start PostgreSQL + Redis
Write-Host "[2/5] Starting PostgreSQL + Redis containers..." -ForegroundColor Yellow
docker compose up -d
if ($LASTEXITCODE -ne 0) { Write-Host "  ERROR: docker compose up failed" -ForegroundColor Red; exit 1 }
Write-Host "      Containers started" -ForegroundColor Green

# 3. Wait for PostgreSQL
Write-Host "[3/5] Waiting for PostgreSQL..." -ForegroundColor Yellow
$maxWait = 60; $waited = 0
do {
    Start-Sleep -Seconds 2; $waited += 2
    $check = docker exec genesis_db pg_isready -U genesis -d genesis_ledger 2>&1
    if ($LASTEXITCODE -eq 0) { break }
    Write-Host "      Still waiting... ($waited/$maxWait s)"
    if ($waited -ge $maxWait) { Write-Host "  ERROR: PostgreSQL timeout" -ForegroundColor Red; exit 1 }
} while ($true)
Write-Host "      PostgreSQL ready" -ForegroundColor Green

# 4. Migrations + Seed
Write-Host "[4/5] Running migrations..." -ForegroundColor Yellow
npx ts-node scripts/db-migrate.ts
if ($LASTEXITCODE -ne 0) { Write-Host "  ERROR: Migrations failed" -ForegroundColor Red; exit 1 }

$env:GENESIS_PARTNER_API_KEY = "demo-local-key"
npx ts-node scripts/seed.ts
if ($LASTEXITCODE -ne 0) { Write-Host "  WARNING: Seed may have already run" -ForegroundColor Yellow }
Write-Host "      Database ready" -ForegroundColor Green

# 5. Start API
Write-Host "[5/5] Starting API on port 4000..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Health:  http://localhost:4000/health" -ForegroundColor Cyan
Write-Host "  Ready:   http://localhost:4000/ready" -ForegroundColor Cyan
Write-Host ""

npx ts-node-dev --respawn src/server.ts
