$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "python-utils.ps1")

try {
  $python = Resolve-DronCrodPython
  $env:PYTHON_EXECUTABLE = $python
  & $python -u (Join-Path $PSScriptRoot "object_detection_server.py")
  exit $LASTEXITCODE
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
