@echo off
setlocal
title Employee Tracker - Local Setup
pushd "%~dp0"
if errorlevel 1 exit /b 1
set "result=1"

where node >nul 2>&1
if errorlevel 1 goto missing_node
where npm >nul 2>&1
if errorlevel 1 goto missing_node
node -e "if (Number(process.versions.node.split('.')[0]) < 24) { console.error('Node.js 24 or newer is required.'); process.exit(1); }"
if errorlevel 1 goto finish

echo Installing dependencies and local development tools from package-lock.json...
call npm ci --include=dev --bin-links=true
if not "%errorlevel%"=="0" goto finish

if exist ".env.local" goto ready
rem New local installations use fictional demo data, without a hosted connection.
>".env.local" (
  echo # Local synthetic preview. Configure public Supabase credentials for connected mode.
  echo VITE_SUPABASE_URL=
  echo VITE_SUPABASE_PUBLISHABLE_KEY=
  echo VITE_DEMO_MODE=true
  echo BASE_PATH=/
)
if errorlevel 1 goto finish
echo Created .env.local for synthetic local testing.

:ready
echo.
echo Setup complete. Existing .env.local settings were preserved.
echo Double-click start-local.bat to open the application.
set "result=0"
goto finish

:missing_node
echo Node.js and npm were not found. Install Node.js 24 or newer, then run this file again.

:finish
if not "%result%"=="0" echo Setup did not complete. Review the error above.
popd
if /i not "%~1"=="--no-pause" pause
exit /b %result%
