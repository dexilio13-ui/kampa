@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Kampa - local dashboard

where node >nul 2>nul
if errorlevel 1 goto :no_node
where npm >nul 2>nul
if errorlevel 1 goto :no_npm

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR goto :no_node
if %NODE_MAJOR% LSS 20 goto :old_node

if not exist "node_modules\" (
  echo [Kampa] Installing dependencies. This can take a minute...
  call npm install
  if errorlevel 1 goto :failed
)

if not exist ".env.local" (
  copy /y ".env.example" ".env.local" >nul
  if errorlevel 1 goto :failed
  echo [Kampa] Created .env.local from .env.example.
)

node -e "const fs=require('fs');const p='.env.local';let s=fs.readFileSync(p,'utf8');if(!/^APP_SECRET=.+/m.test(s)){const secret=require('crypto').randomBytes(32).toString('base64url');s=/^APP_SECRET=/m.test(s)?s.replace(/^APP_SECRET=.*$/m,'APP_SECRET='+secret):s+'\nAPP_SECRET='+secret+'\n';fs.writeFileSync(p,s);console.log('[Kampa] Generated APP_SECRET in .env.local.');}else{console.log('[Kampa] APP_SECRET is already configured.');}"
if errorlevel 1 goto :failed

set "PORT=3000"
for /f "delims=" %%p in ('node -e "const net=require('net');let p=3000;const next=()=>{const s=net.createServer();s.once('error',()=>{p++;next()});s.listen(p,()=>{console.log(p);s.close()})};next()"') do set "PORT=%%p"
if not defined PORT set "PORT=3000"

echo.
echo [Kampa] Starting at http://localhost:%PORT%
echo [Kampa] Your ad buddy that never sleeps.
echo [Kampa] Press Ctrl+C to stop the server.
echo.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "$u='http://localhost:%PORT%';for($i=0;$i -lt 40;$i++){try{(Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 1)|Out-Null;Start-Process $u;break}catch{Start-Sleep -Milliseconds 500}}"
call npm run dev -- --port %PORT%
if errorlevel 1 goto :failed
exit /b 0

:no_node
echo.
echo [Kampa] Node.js was not found. Install Node.js 20 or newer from https://nodejs.org and run this file again.
pause
exit /b 1

:no_npm
echo.
echo [Kampa] npm was not found. Reinstall Node.js with npm included and run this file again.
pause
exit /b 1

:old_node
echo.
echo [Kampa] Node.js 20 or newer is required. Found version %NODE_MAJOR%.
pause
exit /b 1

:failed
echo.
echo [Kampa] Startup failed. Read the error above, then run start.bat again.
pause
exit /b 1
