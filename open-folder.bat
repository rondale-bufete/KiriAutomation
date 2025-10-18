@echo off
REM Batch file to open folder in Windows Explorer
REM Usage: open-folder.bat "folder_path"

if "%~1"=="" (
    echo Error: No folder path provided
    exit /b 1
)

set "folder_path=%~1"

REM Check if folder exists
if not exist "%folder_path%" (
    echo Error: Folder does not exist: %folder_path%
    exit /b 1
)

REM Open folder in Windows Explorer
start "" "%folder_path%"

echo Folder opened: %folder_path%
