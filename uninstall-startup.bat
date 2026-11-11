@echo off
setlocal
title ForgeMVP - remove auto-start
cd /d "%~dp0"

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\ForgeMVP.lnk"
set "URLFILE=%USERPROFILE%\Desktop\ForgeMVP Admin.url"

echo ========================================================
echo   ForgeMVP - remove automatic start-up
echo ========================================================
echo.

if exist "%LNK%" (
    del "%LNK%" >nul 2>nul
    echo [OK]   Removed the Startup shortcut: %LNK%
) else (
    echo [SKIP] No Startup shortcut was installed.
)

if exist "%URLFILE%" (
    del "%URLFILE%" >nul 2>nul
    echo [OK]   Removed the desktop shortcut: %URLFILE%
) else (
    echo [SKIP] No desktop shortcut was found.
)

echo.
echo ForgeMVP will no longer start when you log in.
echo You can still run it by hand with start.bat.
echo.
echo Note: this does not stop a server that is already running.
echo Close its hidden window via Task Manager (node.exe), or just log off.
echo.
pause
