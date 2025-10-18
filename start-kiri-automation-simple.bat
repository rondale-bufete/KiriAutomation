@echo off
REM Kiri Automation Simple Hidden Startup Script
REM This script starts the Kiri Automation server with minimal visibility

REM Change to the script directory
cd /d "%~dp0"

REM Start the application using PowerShell with hidden window
powershell -WindowStyle Hidden -ExecutionPolicy Bypass -Command "cd '%~dp0'; npm start"

REM Log startup
echo %date% %time% - Kiri Automation started >> startup.log