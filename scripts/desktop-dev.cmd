@echo off
setlocal
call D:\visualStudio\VC\Auxiliary\Build\vcvars64.bat
set PATH=C:\Users\wangz\.cargo\bin;%PATH%
npm run tauri dev
