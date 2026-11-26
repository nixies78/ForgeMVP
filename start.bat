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

rem Optional per-copy settings, the same file the logon entry reads (see README.md,
rem "Several copies on one PC, and live reload"): .local\settings.ini. Without this,
rem LIVE=1 was honoured at logon and ignored by a hand-start, so a copy that refreshes
rem its own pages when a file changes stopped doing that the moment it was started here.
set "PORT=8080"
set "LIVE=0"
if exist "%~dp0.local\settings.ini" (
    for /f "usebackq eol=; tokens=1,* delims==" %%a in ("%~dp0.local\settings.ini") do (
        if /i "%%a"=="PORT" set "PORT=%%b"
        if /i "%%a"=="LIVE" set "LIVE=%%b"
    )
)

echo Starting the server and opening your browser at the admin page...
echo.
echo IMPORTANT: use the http://localhost:%PORT%/ address it opens.
echo            Do NOT open public\admin.html directly - the file:// path
echo            is blocked by the browser, which is why the buttons stop working.
echo.
echo Close this window (or press Ctrl+C) to stop the server.
echo.

if "%LIVE%"=="1" (
    node tools\dev-supervisor.mjs --open
) else (
    node server.js --open
)

echo.
echo Server stopped.
pause
