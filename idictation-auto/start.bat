@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo   [!] Node.js not found.
    echo       Please install the LTS version from https://nodejs.org/
    echo       then run this file again.
    echo.
    pause
    exit /b 1
)

node start.mjs
if errorlevel 1 pause
