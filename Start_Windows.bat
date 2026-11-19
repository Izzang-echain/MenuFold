@echo off
setlocal
cd /d "%~dp0"
title MenuFold
if exist ".venv\Scripts\python.exe" goto install

py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if errorlevel 1 goto python_fallback
py -3 -m venv .venv
if errorlevel 1 goto python_error
goto install

:python_fallback
python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if errorlevel 1 goto python_error
python -m venv .venv
if errorlevel 1 goto python_error

:install
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
  echo Dependency installation failed. Check your connection and try again.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" start.py
if errorlevel 1 pause
exit /b

:python_error
echo Python 3.10+ is required. Install Python, then reopen this file.
pause
exit /b 1
