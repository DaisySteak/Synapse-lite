@echo off
rem ===========================================================================
rem  Synapse Lite - lanceur
rem
rem  Ouvre l'application (sources\Synapse Lite.html) dans Google Chrome, ou
rem  Microsoft Edge a defaut, et connecte automatiquement l'utilisateur avec
rem  son identifiant Windows (%USERNAME%). Si cet identifiant n'est pas declare
rem  dans Administration, Utilisateurs, l'ecran de connexion s'affiche.
rem
rem  Genere par "npm run build" a partir de sources\launcher\Synapse Lite.cmd :
rem  modifier ce dernier, pas la copie a la racine.
rem ===========================================================================
setlocal

set "APP=%~dp0sources\Synapse Lite.html"
if not exist "%APP%" goto :no_application

set "BROWSER="
call :candidate "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
call :candidate "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
call :candidate "%LocalAppData%\Google\Chrome\Application\chrome.exe"
call :registry chrome.exe
call :candidate "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
call :candidate "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
call :registry msedge.exe
if not defined BROWSER goto :no_browser

rem Adresse file:///D:/.../sources/Synapse Lite.html?matricule=IDENTIFIANT
set "URL=file:///%APP:\=/%?matricule=%USERNAME%"

start "" "%BROWSER%" "%URL%"
endlocal
exit /b 0


rem --- Retient le premier navigateur trouve ---------------------------------
:candidate
if defined BROWSER goto :eof
if exist "%~1" set "BROWSER=%~1"
goto :eof


rem --- Chemin declare dans le registre (installations non standard) ---------
:registry
if defined BROWSER goto :eof
for %%H in (HKCU HKLM) do call :registry_key %%H %1
goto :eof

:registry_key
if defined BROWSER goto :eof
set "LINE="
for /f "delims=" %%L in ('reg query "%1\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\%2" /ve 2^>nul ^| find "REG_SZ"') do set "LINE=%%L"
if not defined LINE goto :eof
set "LINE=%LINE:*REG_SZ=%"
for /f "tokens=* delims= " %%P in ("%LINE%") do call :candidate "%%~P"
goto :eof


rem --- Erreurs ---------------------------------------------------------------
:no_application
echo.
echo  Synapse Lite : le fichier de l'application est introuvable.
echo  Attendu : "%APP%"
echo.
pause
exit /b 1

:no_browser
echo.
echo  Synapse Lite fonctionne avec Google Chrome ou Microsoft Edge,
echo  et aucun des deux n'a ete trouve sur ce poste.
echo.
pause
exit /b 1
