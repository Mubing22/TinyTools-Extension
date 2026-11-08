@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem Node detection / installation / solving are all handled by ensure-node.ps1
rem (keep this file ASCII-only: cmd parses .bat by the OEM code page and would
rem  mis-split lines containing multi-byte UTF-8 characters)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ensure-node.ps1"
set "CODE=%errorlevel%"

if not "%CODE%"=="0" (
    echo.
    pause
)
exit /b %CODE%
