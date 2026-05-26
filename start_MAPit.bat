@echo off
setlocal
cd /d "%~dp0"
title MAPit - 2D Mini-Map Editor V1.1.2
echo [MAPit] Starting local offline web server...
echo [MAPit] URL: http://127.0.0.1:5501/
echo.
start "" http://127.0.0.1:5501/
py -m http.server 5501 --bind 127.0.0.1 2>NUL || python -m http.server 5501 --bind 127.0.0.1
pause
