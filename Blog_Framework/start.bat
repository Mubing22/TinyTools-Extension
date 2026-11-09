@echo off
setlocal
cd /d "%~dp0"
call npm run build
if errorlevel 1 (
  pause
  exit /b 1
)
start "" http://127.0.0.1:4173/
node scripts\serve.js
pause
