@echo off
title ForgeMVP - local web server
cd /d "%~dp0"

echo ========================================================
echo   ForgeMVP - starting the local web server
echo ========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found on this PC.
    echo         Install it from https://nodejs.org  ^(the LTS version^), then run this again.
    echo.
    pause
    exit /b 1
)

echo Starting the server and opening your browser at the admin page...
echo.
echo IMPORTANT: use the http://localhost:5173/ address it opens.
echo            Do NOT open public\admin.html directly - the file:// path
echo            is blocked by the browser, which is why the buttons stop working.
echo.
echo Close this window (or press Ctrl+C) to stop the server.
echo.

node server.js --open

echo.
echo Server stopped.
pause
