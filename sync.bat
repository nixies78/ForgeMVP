@echo off
setlocal enabledelayedexpansion
title Git Sync - ForgeMVP
echo ========================================================
echo               Git Sync Helper: ForgeMVP
echo ========================================================
echo.

git status --short
echo.

set /p commit_msg="Enter commit message (Press Enter for auto timestamp): "
if "!commit_msg!"=="" (
    for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime 2^>nul ^| findstr "="') do set dt=%%I
    if "!dt!"=="" (
        set commit_msg=Update %date% %time%
    ) else (
        set commit_msg=Update !dt:~0,4!-!dt:~4,2!-!dt:~6,2! !dt:~8,2!:!dt:~10,2!
    )
)

echo.
echo [1/3] Staging changes...
git add -A

echo [2/3] Committing changes...
git commit -m "!commit_msg!"

echo [3/3] Pushing to remote repository...
git push
if %errorlevel% neq 0 (
    echo.
    echo ========================================================
    echo [NOTE] Push failed or no remote repository is configured yet.
    echo To link GitHub, follow the steps in GIT_SYNC.md or run:
    echo   git remote add origin https://github.com/YOUR_USERNAME/ForgeMVP.git
    echo   git branch -M main
    echo   git push -u origin main
    echo ========================================================
) else (
    echo.
    echo [SUCCESS] All changes successfully synced to GitHub!
)

echo.
pause
