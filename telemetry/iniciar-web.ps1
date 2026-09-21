param(
    [string]$DashboardUrl
)

$ErrorActionPreference = "Stop"
$RuntimeDir = Join-Path $PSScriptRoot ".runtime"
$ToolsDir = Join-Path $PSScriptRoot ".tools"
$BridgeScript = Join-Path $PSScriptRoot "mav_ws_bridge.py"
$DashboardFile = Join-Path $RuntimeDir "dashboard-url.txt"
$TunnelLog = Join-Path $RuntimeDir "cloudflared.log"
$TunnelPidFile = Join-Path $RuntimeDir "cloudflared.pid"
$Cloudflared = Join-Path $ToolsDir "cloudflared.exe"

New-Item -ItemType Directory -Force -Path $RuntimeDir, $ToolsDir | Out-Null

function Test-LocalPort([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $result = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $result.AsyncWaitHandle.WaitOne(350)) {
            return $false
        }
        $client.EndConnect($result)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

if (-not $DashboardUrl -and (Test-Path $DashboardFile)) {
    $DashboardUrl = (Get-Content $DashboardFile -Raw).Trim()
}
if (-not $DashboardUrl) {
    $DashboardUrl = Read-Host "Pega la URL principal de tu proyecto en Vercel (https://...vercel.app)"
}
$DashboardUrl = $DashboardUrl.Trim().TrimEnd("/")
if ($DashboardUrl -notmatch "^https://") {
    throw "La URL del dashboard debe comenzar con https://"
}
Set-Content -Path $DashboardFile -Value $DashboardUrl -Encoding UTF8

if (-not (Test-LocalPort 8768)) {
    if (Test-LocalPort 8766) {
        Write-Host "Reiniciando el puente anterior para activar acceso web..." -ForegroundColor Yellow
        Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 1
    }

    $venvPython = Join-Path $PSScriptRoot "venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        $python = $venvPython
        $pythonArgs = @($BridgeScript)
    }
    elseif (Get-Command py -ErrorAction SilentlyContinue) {
        $python = "py"
        $pythonArgs = @("-3", $BridgeScript)
    }
    elseif (Get-Command python -ErrorAction SilentlyContinue) {
        $python = "python"
        $pythonArgs = @($BridgeScript)
    }
    else {
        throw "No se encontró Python. Instala Python 3 y ejecuta: pip install -r telemetry\requirements.txt"
    }

    Write-Host "Iniciando puente MAVLink..." -ForegroundColor Cyan
    Start-Process -FilePath $python -ArgumentList $pythonArgs -WorkingDirectory $PSScriptRoot
    $bridgeDeadline = (Get-Date).AddSeconds(25)
    while (-not (Test-LocalPort 8768) -and (Get-Date) -lt $bridgeDeadline) {
        Start-Sleep -Milliseconds 500
    }
    if (-not (Test-LocalPort 8768)) {
        throw "El puente MAVLink no inició. Revisa la ventana de Python y telemetry\requirements.txt."
    }
}

if (-not (Test-Path $Cloudflared)) {
    Write-Host "Descargando Cloudflare Tunnel (solo la primera vez)..." -ForegroundColor Cyan
    Invoke-WebRequest `
        -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
        -OutFile $Cloudflared
}

if (Test-Path $TunnelPidFile) {
    $oldPid = (Get-Content $TunnelPidFile -Raw).Trim()
    if ($oldPid -match "^\d+$") {
        Stop-Process -Id ([int]$oldPid) -Force -ErrorAction SilentlyContinue
    }
}
Remove-Item $TunnelLog -Force -ErrorAction SilentlyContinue

Write-Host "Creando canal WSS seguro de solo lectura..." -ForegroundColor Cyan
$tunnel = Start-Process `
    -FilePath $Cloudflared `
    -ArgumentList @(
        "tunnel",
        "--url", "http://127.0.0.1:8768",
        "--no-autoupdate",
        "--logfile", $TunnelLog,
        "--loglevel", "info"
    ) `
    -WindowStyle Hidden `
    -PassThru
Set-Content -Path $TunnelPidFile -Value $tunnel.Id

$publicUrl = $null
$tunnelDeadline = (Get-Date).AddSeconds(35)
while (-not $publicUrl -and (Get-Date) -lt $tunnelDeadline) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $TunnelLog) {
        $match = [regex]::Match((Get-Content $TunnelLog -Raw), "https://[a-z0-9-]+\.trycloudflare\.com")
        if ($match.Success) {
            $publicUrl = $match.Value
        }
    }
    if ($tunnel.HasExited) {
        throw "Cloudflare Tunnel terminó inesperadamente. Revisa $TunnelLog"
    }
}
if (-not $publicUrl) {
    Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue
    throw "No se pudo obtener una URL segura de Cloudflare. Revisa tu conexión a Internet."
}

$wssUrl = $publicUrl -replace "^https://", "wss://"
$encodedWss = [Uri]::EscapeDataString($wssUrl)
$launchUrl = "$DashboardUrl/?telemetry_ws=$encodedWss"

Set-Clipboard -Value $launchUrl
Write-Host ""
Write-Host "Telemetría web lista." -ForegroundColor Green
Write-Host "El enlace fue copiado al portapapeles:" -ForegroundColor Green
Write-Host $launchUrl -ForegroundColor White
Write-Host ""
Write-Host "Mantén esta laptop encendida. El canal web es de solo lectura por seguridad." -ForegroundColor Yellow
Start-Process $launchUrl
