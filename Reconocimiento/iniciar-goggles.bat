@echo off
cd /d "%~dp0"
title RECONOCIMIENTO - FAT SHARK / AVATAR HD
set PYTHONUTF8=1
if exist "%~dp0.venv\Scripts\python.exe" (
  "%~dp0.venv\Scripts\python.exe" main.py --source goggles %*
) else (
  python main.py --source goggles %*
)
if errorlevel 1 pause
