@echo off
rem Starts Virtual Measurement and opens it in your browser. Close this window to stop it.
title Virtual Measurement
cd /d "%~dp0"
node server.js
pause
