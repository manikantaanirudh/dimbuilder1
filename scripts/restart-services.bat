@echo off
setlocal EnableExtensions

REM Restart DimBuilder services (Windows).
REM   scripts\restart-services.bat           - dev: stop API (8787) + Vite (5173), then npm run dev
REM   scripts\restart-services.bat docker    - docker compose restart
REM   scripts\restart-services.bat dev bg    - dev restart; start npm run dev minimized

cd /d "%~dp0\.."

set "MODE=%~1"
if "%MODE%"=="" set "MODE=dev"

if /i "%MODE%"=="docker" goto :docker
if /i "%MODE%"=="dev" goto :dev

echo Usage: %~nx0 [dev^|docker] [bg]
echo   dev    Stop listeners on 8787 and 5173, then start npm run dev (default)
echo   docker Run docker compose restart for the pilot stack
echo   bg     With dev: start dev server in a minimized window
exit /b 1

:docker
where docker >nul 2>&1
if errorlevel 1 (
  echo ERROR: docker is not on PATH.
  exit /b 1
)
echo Restarting Docker Compose stack...
docker compose restart
if errorlevel 1 (
  echo ERROR: docker compose restart failed.
  exit /b 1
)
echo Done. App should be on http://127.0.0.1:8787
exit /b 0

:dev
where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm is not on PATH. Install Node.js and run npm install in the repo root.
  exit /b 1
)

echo Stopping API (port 8787)...
call :StopPort 8787
echo Stopping Vite dev server (port 5173)...
call :StopPort 5173

echo Waiting for ports to clear...
timeout /t 2 /nobreak >nul

set "BG=%~2"
if /i "%BG%"=="bg" (
  echo Starting npm run dev in a new window...
  start "DimBuilder Dev" /min cmd /k "cd /d "%CD%" && set PORT=8787&& set HOST=127.0.0.1&& npm run dev"
) else (
  echo Starting npm run dev...
  echo   API:  http://127.0.0.1:8787
  echo   UI:   http://127.0.0.1:5173
  echo Press Ctrl+C to stop.
  set PORT=8787
  set HOST=127.0.0.1
  npm run dev
)
exit /b 0

:StopPort
set "PORT=%~1"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
  echo   Killing PID %%p
  taskkill /F /PID %%p >nul 2>&1
)
exit /b 0
