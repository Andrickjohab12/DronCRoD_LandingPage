$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "python-utils.ps1")

try {
  $python = Resolve-DronCrodPython
  Write-Host "Python seleccionado: $python"
  & $python --version
  if ($LASTEXITCODE -ne 0) { throw "El intérprete detectado no pudo ejecutarse." }

  & $python -m pip --version 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "pip no está disponible; intentando habilitarlo con ensurepip..."
    & $python -m ensurepip --upgrade
    if ($LASTEXITCODE -ne 0) { throw "No se pudo preparar pip. Repara la instalación de Python o configura PYTHON_EXECUTABLE." }
  }

  Write-Host "Instalando paquetes de YOLO, OpenCV y WebSockets..."
  & $python -m pip install -r (Join-Path $PSScriptRoot "requirements.txt")
  if ($LASTEXITCODE -ne 0) { throw "pip terminó con código $LASTEXITCODE. Revisa el error anterior (red, permisos o versión de pip)." }

  Write-Host ""
  Write-Host "Listo. Al pulsar Iniciar reconocimiento, la página abrirá el servicio YOLO."
} catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
