# Genesis Reserve — Full Dev Boot
# Right-click -> Run with PowerShell  OR  from terminal: .\launch.ps1
# Requires: Docker Desktop open and running

$api  = Join-Path $PSScriptRoot 'apps\api'
$web  = Join-Path $PSScriptRoot 'apps\web'

Write-Host ""
Write-Host "  Genesis Reserve — Dev Boot" -ForegroundColor Cyan
Write-Host "  ──────────────────────────" -ForegroundColor Cyan
Write-Host ""

# Verify Docker
Write-Host "Checking Docker..." -ForegroundColor Yellow
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Docker Desktop is not running. Open it, wait for it to start, then re-run." -ForegroundColor Red
    exit 1
}
Write-Host "Docker is running." -ForegroundColor Green
Write-Host ""

# Launch API terminal
Write-Host "Launching API terminal (PostgreSQL + API on :4000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location '$api'; .\start-dev.ps1"
)
Start-Sleep -Seconds 2

# Launch Web terminal
Write-Host "Launching Web terminal (Next.js on :3200)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location '$web'; npm run dev"
)

Write-Host ""
Write-Host "  Both terminals launched." -ForegroundColor Green
Write-Host ""
Write-Host "  API:      http://localhost:4000/health" -ForegroundColor Cyan
Write-Host "  Frontend: http://localhost:3200" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Wait for the API terminal to show:" -ForegroundColor Yellow
Write-Host "  'Genesis Reserve API Gateway running'" -ForegroundColor White
Write-Host "  before opening the frontend in Chrome." -ForegroundColor Yellow
Write-Host ""
