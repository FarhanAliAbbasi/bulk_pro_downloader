@echo off
title TikTok Bulk Downloader Launcher
echo ===================================================
echo   Starting TikTok Bulk Downloader Web Dashboard...
echo ===================================================
echo.

cd /d "d:\Development\Auto downlod"

:: Check if python is available
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your system PATH!
    echo Please install Python and try again.
    pause
    exit /b
)

:: Open default browser automatically after a 3 second delay
echo [SYSTEM] Launching Dashboard in default browser...
start "" cmd /c "timeout /t 3 >nul && start http://localhost:5000"

:: Start Flask app directly in this window to keep processes cleanly grouped
echo [SYSTEM] Starting server...
python app.py

pause
