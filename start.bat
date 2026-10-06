@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   正在启动五子棋...
echo.
start "" http://localhost:5174
node server.js 5174
pause
