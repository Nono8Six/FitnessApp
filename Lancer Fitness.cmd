@echo off
setlocal
title Fitness
rem Charger les modules Windows PowerShell, meme depuis PowerShell 7.
set "PSModulePath="
powershell.exe -NoProfile -File "%~dp0start-app.ps1" -Reseau -Ouvrir %*
if errorlevel 1 (
    echo.
    echo Le lancement a echoue. Le detail est affiche ci-dessus.
    pause
    exit /b 1
)
