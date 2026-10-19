# Starts the API on http://127.0.0.1:8000, from the short-path embeddings venv (see docs/SETUP.md
# step 4 and D24). Run this in its own terminal window and leave it running: closing the window
# stops the server. Double-click-friendly: right-click > "Run with PowerShell", or from a terminal:
#   powershell -ExecutionPolicy Bypass -File scripts\dev\start-api.ps1

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ragVenv = "$env:USERPROFILE\.venvs\vlab-rag"

if (-not (Test-Path $ragVenv)) {
    Write-Host "Short-path rag environment not found at $ragVenv." -ForegroundColor Yellow
    Write-Host "Create it first (see docs/SETUP.md, step 4):" -ForegroundColor Yellow
    Write-Host "  `$env:UV_PROJECT_ENVIRONMENT = `"$ragVenv`"" -ForegroundColor Yellow
    Write-Host "  uv sync --project apps/api --group rag" -ForegroundColor Yellow
    exit 1
}

Set-Location (Join-Path $repoRoot 'apps\api')
$env:UV_PROJECT_ENVIRONMENT = $ragVenv
Write-Host "Starting the API on http://127.0.0.1:8000 (Ctrl+C to stop)..." -ForegroundColor Cyan
uv run --no-sync uvicorn app.main:app --host 127.0.0.1 --port 8000
