@echo off
title AI Game Classroom
cd /d "%~dp0"

echo.
echo  ========================================
echo    AI Game Classroom
echo  ========================================
echo.

echo [1/3] Checking Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo    ERROR: Node.js not found!
    echo    Please install from https://nodejs.org
    echo.
    pause
    exit /b
)
echo    OK

echo [2/3] Checking dependencies...
if not exist "node_modules" (
    echo    Installing...
    call npm install
    if %errorlevel% neq 0 (
        echo    Install failed!
        pause
        exit /b
    )
    echo    Done
) else (
    echo    OK
)

echo [3/3] Checking port 3000...
netstat -ano 2>nul | findstr ":3000" | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo    Port 3000 in use, opening browser...
    start http://localhost:3000
    echo.
    pause
    exit /b
)
echo    OK

echo.
echo  Starting server...
echo.

:: Start server in background
start /b cmd /c "npm run dev > server.log 2>&1"

:: Wait for server to be ready
echo  Waiting for server to start...
:wait_loop
timeout /t 2 /nobreak >nul
curl -s http://localhost:3000 >nul 2>&1
if %errorlevel% neq 0 goto wait_loop

echo  Server is ready!
echo.

:: Open browser
start http://localhost:3000

echo  Press any key to stop the server...
pause >nul

:: Kill the server process
taskkill /f /im node.exe >nul 2>&1
del server.log 2>nul