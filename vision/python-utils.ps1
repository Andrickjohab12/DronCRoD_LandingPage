function Resolve-DronCrodPython {
  $candidates = [System.Collections.Generic.List[string]]::new()

  if ($env:PYTHON_EXECUTABLE) {
    $candidates.Add($env:PYTHON_EXECUTABLE)
  }

  $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($launcher) {
    try {
      $resolved = & $launcher.Source -3.11 -c "import sys; print(sys.executable)" 2>$null
      if ($LASTEXITCODE -eq 0 -and $resolved) { $candidates.Add(($resolved | Select-Object -Last 1).Trim()) }
    } catch {}
  }

  foreach ($commandName in @("python3.11.exe", "python3.11", "python3.exe", "python3", "python.exe", "python")) {
    $command = Get-Command $commandName -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command -and $command.Source -and (Test-Path -LiteralPath $command.Source)) {
      $candidates.Add($command.Source)
    }
  }

  foreach ($registryPath in @(
    "HKCU:\Software\Python\PythonCore\3.11\InstallPath",
    "HKLM:\Software\Python\PythonCore\3.11\InstallPath",
    "HKLM:\Software\WOW6432Node\Python\PythonCore\3.11\InstallPath"
  )) {
    try {
      $install = Get-ItemProperty -LiteralPath $registryPath -ErrorAction Stop
      foreach ($candidate in @($install.ExecutablePath, (Join-Path $install.'(default)' "python.exe"))) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { $candidates.Add($candidate) }
      }
    } catch {}
  }

  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    try {
      $versionText = & $candidate -c "import sys; print('.'.join(map(str, sys.version_info[:3])))" 2>$null
      if ($LASTEXITCODE -ne 0 -or -not $versionText) { continue }
      $version = [version](($versionText | Select-Object -Last 1).Trim())
      if ($version -ge [version]"3.10") { return $candidate }
    } catch {}
  }

  # Store-installed Python can be callable through its app alias even when its
  # package executable path itself is protected by Windows.
  foreach ($commandName in @("python3.11", "python3", "python")) {
    if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) { continue }
    try {
      $versionText = & $commandName -c "import sys; print('.'.join(map(str, sys.version_info[:3])))" 2>$null
      if ($LASTEXITCODE -eq 0 -and $versionText) {
        $version = [version](($versionText | Select-Object -Last 1).Trim())
        if ($version -ge [version]"3.10") { return $commandName }
      }
    } catch {}
  }

  throw "No pude iniciar Python 3.10 o posterior. Si Python funciona en tu terminal, configura PYTHON_EXECUTABLE con la ruta de python.exe."
}
