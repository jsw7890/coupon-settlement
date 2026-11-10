@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 쿠폰 정산 대조

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js가 없어 화면을 열 수 없습니다.
  echo https://nodejs.org 에서 LTS를 설치한 뒤, 이 파일을 다시 실행해 주세요.
  echo.
  pause
  exit /b 1
)

node server.mjs --open
if errorlevel 1 (
  echo.
  echo 화면을 열지 못했습니다. 이미 열려 있거나 3460번 포트가 사용 중일 수 있습니다.
  echo 브라우저에서 http://127.0.0.1:3460 을 직접 열어 보세요.
  echo.
)
pause
