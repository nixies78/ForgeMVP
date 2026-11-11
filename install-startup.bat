@echo off
setlocal
title ForgeMVP - install auto-start
cd /d "%~dp0"

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\ForgeMVP.lnk"
set "DESKTOP=%USERPROFILE%\Desktop"
set "URLFILE=%DESKTOP%\ForgeMVP Admin.url"
set "SERVERURL=http://localhost:5173/admin.html"
set "TESTMODE="
if /i "%~1"=="test" set "TESTMODE=1"

echo ========================================================
echo   ForgeMVP - start the admin page automatically
echo ========================================================
echo.
echo This will set up your PC so that:
echo   1. The ForgeMVP web server starts by itself when you log in.
echo   2. The admin page opens in your browser at %SERVERURL%
echo      (a plain double-click, never the file:// path that browsers block).
echo   3. You get a "ForgeMVP Admin" shortcut on your desktop.
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

echo [1/3] Adding ForgeMVP to your Startup folder...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$w = New-Object -ComObject WScript.Shell;" ^
  "$s = $w.CreateShortcut('%LNK%');" ^
  "$s.TargetPath = 'wscript.exe';" ^
  "$s.Arguments = '\"%~dp0autostart-forgemvp.vbs\"';" ^
  "$s.WorkingDirectory = '%~dp0';" ^
  "$s.Description = 'Start the ForgeMVP server and open the admin page';" ^
  "$s.Save()"
if errorlevel 1 (
    echo [ERROR] Could not create the startup shortcut.
    echo.
    pause
    exit /b 1
)

echo [2/3] Adding the "ForgeMVP Admin" desktop shortcut...
> "%URLFILE%" echo [InternetShortcut]
>> "%URLFILE%" echo URL=%SERVERURL%
>> "%URLFILE%" echo IconIndex=0

echo [3/3] Starting ForgeMVP now, so you can try it immediately...
wscript "%~dp0autostart-forgemvp.vbs"

echo.
echo ========================================================
echo  Done. ForgeMVP will now start with Windows.
echo.
echo  Open it any time with the "ForgeMVP Admin" desktop
echo  shortcut, or by going to %SERVERURL%
echo.
echo  To undo this later, run uninstall-startup.bat.
echo ========================================================
echo.
pause
