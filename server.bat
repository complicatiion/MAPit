@echo off
cd /d "%~dp0"
py -m http.server 5501 --bind 127.0.0.1 2>NUL || python -m http.server 5501 --bind 127.0.0.1
pause
