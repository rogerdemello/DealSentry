@echo off
echo ========================================
echo  Stopping DealSentry Servers
echo ========================================
echo.

REM Stop processes on port 3001 (API Server)
echo Stopping API Server (Port 3001)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM Stop processes on port 8080 (Frontend Dev Server)
echo Stopping Frontend Dev Server (Port 8080)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8080') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM Also check for port 5173 (alternate Vite port)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo ✓ Servers stopped successfully
echo.
pause
