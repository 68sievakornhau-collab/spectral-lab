@echo off
cd /d "%~dp0"
start "" "http://localhost:8765/FRONTEND_RGB_MINI_V5.html"
py -3 -m http.server 8765
if errorlevel 1 python -m http.server 8765
pause
