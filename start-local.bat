@echo off
setlocal
title Employee Tracker - Local Server
pushd "%~dp0"
if errorlevel 1 exit /b 1
set "result=1"

where node >nul 2>&1
if errorlevel 1 goto missing_node
where npm >nul 2>&1
if errorlevel 1 goto missing_node
node -e "if (Number(process.versions.node.split('.')[0]) < 24) { console.error('Node.js 24 or newer is required.'); process.exit(1); }"
if errorlevel 1 goto finish
if not exist "node_modules\vite\bin\vite.js" goto missing_setup
if not exist "node_modules\.bin\vite.cmd" goto missing_setup
if not exist ".env.local" goto missing_setup

echo Starting the local application and opening your browser...
echo Keep this window open. Press Ctrl+C to stop the server.
echo Existing .env.local settings determine demo or connected Supabase mode.
echo If port 5173 is busy, Vite will use the next available port.
echo.
call npm run dev -- --port 5173 --open
set "result=%errorlevel%"
goto finish

:missing_setup
echo Local setup or development tools are missing. Run setup-local.bat to install or repair them, then start-local.bat again.
goto finish

:missing_node
echo Node.js and npm were not found. Install Node.js 24 or newer, then run setup-local.bat.

:finish
if not "%result%"=="0" echo The server could not start or exited with an error. Review the message above.
popd
if /i not "%~1"=="--no-pause" pause
exit /b %result%
