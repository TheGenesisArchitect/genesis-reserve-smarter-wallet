# Genesis Reserve — Full Dev Boot
# Run this once from anywhere: right-click → Run with PowerShell
# Requires: Docker Desktop open and running

$root    = $PSScriptRoot
$backend = Join-Path $root "gr\gr"
$frontend = $root

Write-Host ""
Write-Host "  Genesis Reserve — Dev Boot" -ForegroundColor Cyan
Write-Host "  ──────────────────────────" -ForegroundColor Cyan
Write-Host ""

# ── Verify Docker is accessible ───────────────────────────────────────────────
Write-Host "Checking Docker..." -ForegroundColor Yellow
$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  Docker Desktop is not running." -ForegroundColor Red
    Write-Host "  Open Docker Desktop, wait for it to fully start, then run this script again." -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "Docker is running." -ForegroundColor Green
Write-Host ""

# ── Launch backend terminal ───────────────────────────────────────────────────
Write-Host "Launching backend terminal (PostgreSQL + API on :4000)..." -ForegroundColor Yellow
$backendCmd = "Set-Location '$backend'; Write-Host 'Backend terminal ready' -ForegroundColor Cyan; .\start-dev.ps1"
Start-Process powershell -ArgumentList '-NoExit', '-Command', $backendCmd
Start-Sleep -Seconds 2

# ── Launch frontend terminal ──────────────────────────────────────────────────
Write-Host "Launching frontend terminal (Next.js on :3200)..." -ForegroundColor Yellow
$frontendCmd = "Set-Location '$frontend'; Write-Host 'Frontend terminal ready' -ForegroundColor Cyan; npm run dev"
Start-Process powershell -ArgumentList '-NoExit', '-Command', $frontendCmd

Write-Host ""
Write-Host "  Both terminals launched." -ForegroundColor Green
Write-Host ""
Write-Host "  Backend:  http://localhost:4000/health" -ForegroundColor Cyan
Write-Host "  Frontend: http://localhost:3200" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Wait for the backend terminal to show:" -ForegroundColor Yellow
Write-Host "  'Genesis Reserve API Gateway running'" -ForegroundColor White
Write-Host "  before opening the frontend in Chrome." -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter to close this launcher"
