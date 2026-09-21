@echo off
cd /d "%~dp0"
title RECONOCIMIENTO - SKYDROID 5.8G OTG
set PYTHONUTF8=1
if exist "%~dp0.venv\Scripts\python.exe" (
  "%~dp0.venv\Scripts\python.exe" main.py --source analog %*
) else (
  python main.py --source analog %*
)
if errorlevel 1 pause
