# Starts the API on http://127.0.0.1:8000, from the short-path embeddings venv (see docs/SETUP.md
# step 4 and D24). Run this in its own terminal window and leave it running: closing the window
# stops the server. Double-click-friendly: right-click > "Run with PowerShell", or from a terminal:
#   powershell -ExecutionPolicy Bypass -File scripts\dev\start-api.ps1
# To explicitly enable the configured Groq/OpenAI pair:
#   powershell -ExecutionPolicy Bypass -File scripts\dev\start-api.ps1 -LlmProvider failover -Port 9100

param(
    [ValidateSet('disabled', 'groq', 'openai', 'ollama', 'failover')]
    [string]$LlmProvider,
    [ValidateRange(1, 65535)]
    [int]$Port = 8000,
    [ValidateRange(64, 4096)]
    [int]$MaxOutputTokens = 2048,
    [ValidateSet('file', 'postgres')]
    [string]$AdminRepository
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
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
if ($LlmProvider) {
    $env:LAB_LLM_PROVIDER = $LlmProvider
}
$env:LAB_LLM_MAX_OUTPUT_TOKENS = [string]$MaxOutputTokens
if ($AdminRepository) {
    $env:LAB_ADMIN_REPOSITORY = $AdminRepository
    Write-Host "Admin storage: $AdminRepository (explicit startup selection; no records are migrated)." -ForegroundColor Cyan
}
Write-Host "Checking locked API dependencies..." -ForegroundColor Cyan
uv sync --locked --inexact --group rag
if ($LASTEXITCODE -ne 0) { throw 'API dependency synchronization failed; server was not started.' }
Write-Host "Starting the API on http://127.0.0.1:$Port (Ctrl+C to stop)..." -ForegroundColor Cyan
Write-Host "VITE_API_BASE_URL must point to this same address. Stop an older API on this port first." -ForegroundColor Yellow
uv run --no-sync uvicorn app.main:app --host 127.0.0.1 --port $Port --log-level info
