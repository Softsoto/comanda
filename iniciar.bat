@echo off
title Comanda
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   No se encontro Node.js en este computador.
  echo   1. Entra a https://nodejs.org y descarga la version LTS.
  echo   2. Instalala con las opciones que trae por defecto.
  echo   3. Vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)
node scripts\iniciar.mjs %*
echo.
pause
