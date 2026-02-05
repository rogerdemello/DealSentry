@echo off
echo ========================================
echo  Proposal Reviewer - Complete Edition
echo ========================================
echo.
echo Starting application servers...
echo.
echo Backend API: http://localhost:3001
echo Frontend App: http://localhost:8080
echo.
echo Login Credentials:
echo   Admin: admin@reviewer.ai / demo
echo   Test Users: test1@reviewer.ai through test5@reviewer.ai / demo
echo.
echo ========================================
echo.

start cmd /k "npm run server"
timeout /t 3 /nobreak >nul
start cmd /k "npm run dev"

echo.
echo Both servers starting...
echo Press any key to exit this window
echo (The servers will continue running)
pause >nul
