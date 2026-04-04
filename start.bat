@echo off
echo ========================================
echo  DealSentry - Complete Edition
echo ========================================
echo.
echo Starting application servers...
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules" (
    echo WARNING: node_modules folder not found
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Check if port 3001 is already in use (API server)
netstat -ano | findstr ":3001" >nul 2>&1
if %errorlevel% equ 0 (
    echo WARNING: Port 3001 is already in use
    echo Attempting to stop existing process...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do (
        taskkill /F /PID %%a >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
)

REM Check if port 8080 is already in use (Frontend dev server)
netstat -ano | findstr ":8080" >nul 2>&1
if %errorlevel% equ 0 (
    echo WARNING: Port 8080 is already in use
    echo Attempting to stop existing process...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8080') do (
        taskkill /F /PID %%a >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
)

echo.
echo Backend API: http://localhost:3001
echo Frontend App: http://localhost:8080
echo.
echo Login Credentials:
echo   Admin: admin@dealsentry.ai / demo
echo   Test Users: test1@dealsentry.ai through test5@dealsentry.ai / demo
echo.
echo ========================================
echo.

REM Start backend API server
start "API Server (Port 3001)" cmd /k "echo Starting API Server... && npm run server"
echo Backend API server starting...
timeout /t 5 /nobreak >nul

REM Verify backend is running before starting frontend
echo Checking if API server started successfully...
curl -s http://localhost:3001/api/health >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: API server may not have started correctly
    echo Please check the API Server window for errors
    timeout /t 3 /nobreak >nul
)

REM Start frontend dev server
start "Frontend Dev Server (Port 8080)" cmd /k "echo Starting Frontend Dev Server... && npm run dev"
echo Frontend dev server starting...

echo.
echo ========================================
echo Both servers are starting up!
echo.
echo If you see errors:
echo   1. Check the server windows for error messages
echo   2. Make sure ports 3001 and 8080 are not in use
echo   3. Run 'npm install' if you haven't already
echo.
echo Press any key to exit this window
echo (The servers will continue running in their own windows)
echo ========================================
pause >nul
