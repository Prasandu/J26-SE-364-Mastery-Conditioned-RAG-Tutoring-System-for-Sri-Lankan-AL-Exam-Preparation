# Starts the web app on http://localhost:5173. Needs the API running too (scripts\dev\start-api.ps1
# in its own window) because .env sets VITE_ENGINE_ADAPTER=api. Run this in its own terminal window
# and leave it running: closing the window stops the dev server.
#   powershell -ExecutionPolicy Bypass -File scripts\dev\start-web.ps1

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location (Join-Path $repoRoot 'apps\web')
pnpm dev
