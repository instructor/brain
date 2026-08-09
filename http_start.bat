@echo off
set PYTHON_EXE="C:\Users\Edi Klein\OneDrive\dev-projects\_BRAIN_Badminton-RAnking-INsights\.venv\Scripts\python.exe"
start "" http://localhost:8080/rangliste.html
%PYTHON_EXE% -m http.server 8080
pause