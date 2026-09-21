@echo off
title DronCRoD - Telemetria Web
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-web.ps1"
if errorlevel 1 (
  echo.
  echo No se pudo iniciar la telemetria web.
  pause
)
