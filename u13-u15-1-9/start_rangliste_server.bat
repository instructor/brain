@echo off
cd /d "%~dp0\.."
set PYTHON_EXE="C:\Users\Edi Klein\OneDrive\dev-projects\_BRAIN_Badminton-RAnking-INsights\.venv\Scripts\python.exe"
start "" http://localhost:8080/u13-u15-1-9/rangliste-u13-u15-1-9.html
%PYTHON_EXE% -m http.server 8080
