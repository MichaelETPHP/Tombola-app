@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  Tombola — Smart Dev Launcher
::  Auto-detects LAN IP, patches .env files, starts all servers
::
::  Ports:
::    API        -> http://<LAN_IP>:3435
::    mobile-app -> http://<LAN_IP>:4345
::    admin-app  -> http://<LAN_IP>:5355
::
::  Why LAN IP instead of localhost?
::    Physical Android devices testing the APK cannot reach
::    "localhost" — it resolves to the phone itself, not your PC.
::    We use the real LAN IP so the APK always connects to this
::    dev machine over the same WiFi network.
:: ============================================================

set ROOT=%~dp0

echo.
echo  =====================================================
echo   T O M B O L A   Dev Launcher
echo  =====================================================
echo.

:: ── 1. Detect Local Network (LAN/WiFi) IP ─────────────────────────
set LAN_IP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1" ^| findstr /v "169.254"') do (
  set RAW=%%a
  :: Trim leading space
  for /f "tokens=1" %%b in ("!RAW!") do (
    if not defined LAN_IP set LAN_IP=%%b
  )
)

if not defined LAN_IP (
  echo  [WARN] Could not detect LAN IP. Falling back to localhost.
  echo         Make sure you are connected to WiFi or LAN.
  set LAN_IP=localhost
)

echo  [OK] Detected LAN IP: !LAN_IP!
echo.

:: ── 2. Kill any process already using our ports ────────────────────
echo  [INFO] Clearing ports 3435, 4345, 5355...
for %%P in (3435 4345 5355) do (
  for /f "tokens=5" %%i in ('netstat -aon 2^>nul ^| findstr ":%%P "') do (
    taskkill /PID %%i /F >nul 2>&1
  )
)
echo  [OK] Ports cleared.
echo.

:: ── 3. Ensure .env files exist (copy from .env.example if missing) ─
if not exist "%ROOT%api\.env" (
  if exist "%ROOT%api\.env.example" (
    copy "%ROOT%api\.env.example" "%ROOT%api\.env" >nul
    echo  [OK] Created api\.env from .env.example
  ) else (
    echo  [WARN] api\.env not found and no .env.example to copy from!
  )
)
if not exist "%ROOT%mobile-app\.env" (
  if exist "%ROOT%mobile-app\.env.example" (
    copy "%ROOT%mobile-app\.env.example" "%ROOT%mobile-app\.env" >nul
    echo  [OK] Created mobile-app\.env from .env.example
  ) else (
    echo  [WARN] mobile-app\.env not found and no .env.example to copy from!
  )
)
if not exist "%ROOT%admin-app\.env" (
  if exist "%ROOT%admin-app\.env.example" (
    copy "%ROOT%admin-app\.env.example" "%ROOT%admin-app\.env" >nul
    echo  [OK] Created admin-app\.env from .env.example
  ) else (
    echo  [WARN] admin-app\.env not found and no .env.example to copy from!
  )
)

:: ── 4. Patch VITE_API_URL in mobile-app\.env ──────────────────────
::  Use PowerShell to reliably do an in-place regex replace.
echo  [INFO] Patching mobile-app\.env  VITE_API_URL -> http://!LAN_IP!:3435
powershell -NoProfile -Command ^
  "(Get-Content '%ROOT%mobile-app\.env') -replace 'VITE_API_URL=.*', 'VITE_API_URL=http://!LAN_IP!:3435' | Set-Content '%ROOT%mobile-app\.env'"
echo  [OK] mobile-app\.env updated.

:: ── 5. Patch VITE_API_URL in admin-app\.env ───────────────────────
echo  [INFO] Patching admin-app\.env   VITE_API_URL -> http://!LAN_IP!:3435
powershell -NoProfile -Command ^
  "(Get-Content '%ROOT%admin-app\.env') -replace 'VITE_API_URL=.*', 'VITE_API_URL=http://!LAN_IP!:3435' | Set-Content '%ROOT%admin-app\.env'"
echo  [OK] admin-app\.env updated.

:: ── 6. Patch CORS_ORIGINS & MOBILE_APP_URL in api\.env ────────────
echo  [INFO] Patching api\.env CORS_ORIGINS and MOBILE_APP_URL...
powershell -NoProfile -Command ^
  "$content = Get-Content '%ROOT%api\.env';" ^
  "$content = $content -replace 'CORS_ORIGINS=.*', 'CORS_ORIGINS=http://!LAN_IP!:4345,http://!LAN_IP!:5355,http://localhost:4345,http://localhost:5355';" ^
  "$content = $content -replace 'MOBILE_APP_URL=.*', 'MOBILE_APP_URL=http://!LAN_IP!:4345';" ^
  "$content | Set-Content '%ROOT%api\.env'"
echo  [OK] api\.env updated.

:: ── 7. Enable DEMO_OTP in api\.env for dev testing ────────────────
powershell -NoProfile -Command ^
  "(Get-Content '%ROOT%api\.env') -replace 'DEMO_OTP_ENABLED=.*', 'DEMO_OTP_ENABLED=true' | Set-Content '%ROOT%api\.env'"

echo.
echo  =====================================================
echo   Starting all 3 services...
echo  =====================================================
echo.
echo   API          http://!LAN_IP!:3435   (also localhost:3435)
echo   Mobile App   http://!LAN_IP!:4345   (also localhost:4345)
echo   Admin App    http://!LAN_IP!:5355   (also localhost:5355)
echo.
echo   APK test URL: http://!LAN_IP!:3435
echo   (Use this IP when building the Capacitor APK)
echo  =====================================================
echo.

:: ── 8. Launch all 3 servers in separate windows ────────────────────
start "Tombola  API  :3435" cmd /k "title Tombola API :3435 && cd /d "%ROOT%api" && echo Starting API on !LAN_IP!:3435... && bun run dev"
timeout /t 2 /nobreak >nul

start "Tombola  Mobile :4345" cmd /k "title Tombola Mobile :4345 && cd /d "%ROOT%mobile-app" && echo VITE_API_URL=http://!LAN_IP!:3435 && bun run dev"
timeout /t 1 /nobreak >nul

start "Tombola  Admin  :5355" cmd /k "title Tombola Admin :5355 && cd /d "%ROOT%admin-app" && echo VITE_API_URL=http://!LAN_IP!:3435 && bun run dev"

echo  [OK] All 3 windows launched!
echo.
echo  Tip: Share http://!LAN_IP!:4345 with devices on the same WiFi
echo       to test the mobile web app on a real phone.
echo.
pause
endlocal
