<#
.SYNOPSIS
  Starts the whole Reskure stack for local use: API, audit worker and web app.

.EXAMPLE
  .\run-dev.ps1                  # first run: installs, migrates, seeds demo data, starts everything
  .\run-dev.ps1 -SkipSeed        # keep your existing data
  .\run-dev.ps1 -Production      # next build + next start instead of the dev server
  .\run-dev.ps1 -Offline         # demo seed without downloading the real COMPAS file

Stop with Ctrl+C. Logs are written to .run\*.log
Requires: uv (https://docs.astral.sh/uv/), Node.js 20+ and npm.
#>
param(
  [switch]$SkipSeed,
  [switch]$Production,
  [switch]$Offline,
  [int]$ApiPort = 8000,
  [int]$WebPort = 3000,
  [string]$DemoPassword = "Password123!"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$runDir = Join-Path $root ".run"
New-Item -ItemType Directory -Force $runDir | Out-Null

foreach ($tool in "uv", "node", "npm") {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "'$tool' was not found on PATH. Install it first." }
}

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Run($file, $arguments, $dir, $log) {
  # cmd.exe handles the .cmd shims of npm/npx and uv reliably.
  $p = Start-Process cmd.exe -ArgumentList "/c $file $arguments > `"$log`" 2>&1" -WorkingDirectory $dir -Wait -PassThru -NoNewWindow
  if ($p.ExitCode -ne 0) { Get-Content $log -Tail 25; throw "'$file $arguments' failed (exit $($p.ExitCode)). See $log" }
}
function PortFree($port) { -not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }

if (-not (PortFree $ApiPort)) { throw "Port $ApiPort is already in use. Stop that process or pass -ApiPort." }
if (-not (PortFree $WebPort)) { throw "Port $WebPort is already in use. Stop that process or pass -WebPort." }

Step "Backend environment"
if (-not (Test-Path (Join-Path $backend ".env"))) {
  Copy-Item (Join-Path $backend ".env.example") (Join-Path $backend ".env")
  Write-Host "Created backend\.env from .env.example (DEBUG=True, local use only)."
}
Run "uv" "sync" $backend (Join-Path $runDir "uv-sync.log")
Run "uv" "run python manage.py migrate --noinput" $backend (Join-Path $runDir "migrate.log")

if (-not $SkipSeed) {
  Step "Demo data (tenant 'hirelens-demo')"
  $seedArgs = "run python manage.py seed_ai_demo --password `"$DemoPassword`""
  if ($Offline) { $seedArgs += " --offline" }
  Run "uv" $seedArgs $backend (Join-Path $runDir "seed.log")
}

Step "Frontend dependencies"
if (-not (Test-Path (Join-Path $frontend "node_modules"))) { Run "npm" "ci" $frontend (Join-Path $runDir "npm-ci.log") }
# Child processes inherit this, so the web app always talks to the API port chosen above.
$env:API_BASE_URL = "http://localhost:$ApiPort/api/v1"
if ($Production) { Step "Building the web app"; Run "npm" "run build" $frontend (Join-Path $runDir "build.log") }

$procs = @()
function Launch($name, $arguments, $dir) {
  $log = Join-Path $runDir "$name.log"
  $p = Start-Process cmd.exe -ArgumentList "/c $arguments > `"$log`" 2>&1" -WorkingDirectory $dir -PassThru -WindowStyle Hidden
  Write-Host ("  {0,-8} pid {1}  log .run\{0}.log" -f $name, $p.Id)
  return $p
}

try {
  Step "Starting services"
  $procs += Launch "api" "uv run python manage.py runserver $ApiPort --noreload" $backend
  $procs += Launch "worker" "uv run python manage.py run_audit_worker" $backend
  $webCmd = if ($Production) { "npx next start --port $WebPort" } else { "npx next dev --port $WebPort" }
  $procs += Launch "web" $webCmd $frontend

  Step "Waiting for the services"
  $deadline = (Get-Date).AddSeconds(120)
  $ready = @{ api = $false; web = $false }
  while ((Get-Date) -lt $deadline -and -not ($ready.api -and $ready.web)) {
    Start-Sleep 2
    if (-not $ready.api) { try { Invoke-WebRequest "http://localhost:$ApiPort/api/v1/auth/me/" -UseBasicParsing -TimeoutSec 3 | Out-Null; $ready.api = $true } catch { if ($_.Exception.Response) { $ready.api = $true } } }
    if (-not $ready.web) { try { Invoke-WebRequest "http://localhost:$WebPort/login" -UseBasicParsing -TimeoutSec 5 | Out-Null; $ready.web = $true } catch { } }
  }
  if (-not ($ready.api -and $ready.web)) { Write-Warning "A service did not answer in time. Check .run\api.log and .run\web.log." }

  Write-Host "`nReskure is running" -ForegroundColor Green
  Write-Host "  App      http://localhost:$WebPort"
  Write-Host "  API      http://localhost:$ApiPort/api/v1/   (docs: /api/docs/ if enabled)"
  if (-not $SkipSeed) {
    Write-Host "  Login    admin (or admin@hirelens.example) [tenant admin]"
    Write-Host "           founder@hirelens.example (risk owner)"
    Write-Host "           advisor@hirelens.example (compliance officer)"
    Write-Host "  Password $DemoPassword"
  }
  Write-Host "`nPress Ctrl+C to stop everything."
  while ($true) {
    Start-Sleep 5
    foreach ($p in $procs) { if ($p.HasExited) { Write-Warning "A service exited (pid $($p.Id)). See the logs in .run\" ; throw "service stopped" } }
  }
}
finally {
  Write-Host "`nStopping services..." -ForegroundColor Yellow
  foreach ($p in $procs) { if ($p -and -not $p.HasExited) { & taskkill /PID $p.Id /T /F 2>&1 | Out-Null } }
}
