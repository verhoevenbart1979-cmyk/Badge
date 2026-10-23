@echo off
rem ---------------------------------------------------------------------------
rem  Suivi des badges : ouvre l'application dans Google Chrome.
rem  Pour un d‚marrage automatique : placez un raccourci vers ce fichier dans
rem  le dossier ® D‚marrage ¯ de Windows (Windows+R, tapez  shell:startup ).
rem ---------------------------------------------------------------------------
set "PAGE=%~dp0index.html"
for %%C in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe") do (
  if exist %%C (
    start "" %%C "%PAGE%"
    exit /b
  )
)
rem Chrome introuvable aux emplacements habituels : on laisse Windows le trouver.
start "" chrome "%PAGE%"
