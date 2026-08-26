@echo off
title Konsept Gelsin Statik Sunucu
cd /d "%~dp0"

echo Bagimsiz statik frontend sunucusu baslatiliyor...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sunucu_baslat.ps1"
pause
