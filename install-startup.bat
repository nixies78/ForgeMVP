@echo off
setlocal
title ForgeMVP - install auto-start
cd /d "%~dp0"

rem Optional per-copy settings (see autostart-forgemvp.vbs): .local\settings.ini
set "NAME=ForgeMVP"
set "LABEL=ForgeMVP Admin"
set "URLHOST=localhost"
set "PORT=8080"
set "PAGE=admin.html"
if exist "%~dp0.local\settings.ini" (
    for /f "usebackq eol=; tokens=1,* delims==" %%a in ("%~dp0.local\settings.ini") do (
        if /i "%%a"=="NAME" set "NAME=%%b"
        if /i "%%a"=="LABEL" set "LABEL=%%b"
        if /i "%%a"=="URLHOST" set "URLHOST=%%b"
        if /i "%%a"=="PORT" set "PORT=%%b"
        if /i "%%a"=="PAGE" set "PAGE=%%b"
    )
)

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\%NAME%.lnk"
set "DESKTOP=%USERPROFILE%\Desktop"
set "URLFILE=%DESKTOP%\%LABEL%.url"
set "SERVERURL=http://%URLHOST%:%PORT%/%PAGE%"
set "TESTMODE="
if /i "%~1"=="test" set "TESTMODE=1"

echo ========================================================
echo   %NAME% - start automatically
echo ========================================================
echo.
echo This will set up your PC so that:
echo   1. The %NAME% web server starts by itself when you log in.
echo   2. The page is served at %SERVERURL%
echo      (a plain double-click, never the file:// path that browsers block).
echo   3. You get a "%LABEL%" shortcut on your desktop.
echo.
echo Nothing here needs administrator rights, and nothing is installed
echo outside your own user account.
echo.

if defined TESTMODE (
    echo [TEST MODE] No files will be written. Showing what would happen:
    echo   - create shortcut : %LNK%
    echo                          -^> wscript.exe "%~dp0autostart-forgemvp.vbs"
    echo   - create shortcut : %URLFILE%
    echo                          -^> %SERVERURL%
    echo   - launch it now   : wscript "%~dp0autostart-forgemvp.vbs"
    echo.
    echo [TEST MODE] Finished without changing anything.
    exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found on this PC.
    echo         Install the LTS version from https://nodejs.org and run this again.
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0autostart-forgemvp.vbs" (
    echo [ERROR] autostart-forgemvp.vbs is missing from this folder.
    echo         Re-download the project, then run this again.
    echo.
    pause
    exit /b 1
)

echo [1/3] Adding %NAME% to your Startup folder...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$w = New-Object -ComObject WScript.Shell;" ^
  "$s = $w.CreateShortcut('%LNK%');" ^
  "$s.TargetPath = 'wscript.exe';" ^
  "$s.Arguments = '\"%~dp0autostart-forgemvp.vbs\"';" ^
  "$s.WorkingDirectory = '%~dp0';" ^
  "$s.Description = 'Start the %NAME% web server';" ^
  "$s.Save()"
if errorlevel 1 (
    echo [ERROR] Could not create the startup shortcut.
    echo.
    pause
    exit /b 1
)

echo [2/3] Adding the "%LABEL%" desktop shortcut...
> "%URLFILE%" echo [InternetShortcut]
>> "%URLFILE%" echo URL=%SERVERURL%
>> "%URLFILE%" echo IconIndex=0

echo [3/3] Starting %NAME% now, so you can try it immediately...
wscript "%~dp0autostart-forgemvp.vbs"

echo.
echo ========================================================
echo  Done. %NAME% will now start with Windows.
echo.
echo  Open it any time with the "%LABEL%" desktop
echo  shortcut, or by going to %SERVERURL%
echo.
echo  To undo this later, run uninstall-startup.bat.
echo ========================================================
echo.
if not defined NOPAUSE pause
