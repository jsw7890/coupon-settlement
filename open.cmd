@echo off
chcp 65001 >nul
cd /d "%~dp0"
title coupon-settlement

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Install LTS from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

node server.mjs --open
if errorlevel 1 (
  echo.
  echo Could not open the screen. Port 3460 may already be in use.
  echo Try http://127.0.0.1:3460 in a browser.
  echo.
)
pause
