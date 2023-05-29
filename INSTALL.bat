@echo off

::File: INSTALL.bat
::Created by: wAIfu-DEV
::Contributors:
::Description: Responsible for checking python and nodejs installs + download dependencies
::TODO: 
::License: GPLv3 see ./LICENSE.txt

set NPM_PATH=npm
set PIP_PATH=pip


::INSTALL NPM PACKAGES
echo Installing nodejs dependencies ...

cd w-AI-fu

::Check if node is installed
where node.exe >nul 2>&1 || goto RetryNode
:AfterNode
::Check if npm is installed
where npm >nul 2>&1 || goto RetryNpm
:AfterNpm

call %NPM_PATH% install


::INSTALL PIP PACKAGES
echo Installing python dependencies ...

cd install

::Check if python is installed
python --version 2>NUL
if errorlevel 1 goto RetryPython
:AfterPython
::Check if pip is installed
pip --version 2>NUL
if errorlevel 1 goto RetryPip
:AfterPip

call %PIP_PATH% install -r py_requirements.txt


::CREATE SHORTCUT
echo.
echo Creating shortcut ...

call cscript /b shortcut.vbs


::END OF NORMAL EXECUTION
echo Done.

pause
goto:eof


::RETRY DIRECT IF ERROR
:RetryNode
echo Could not find node env variable, trying with direct path
where %PROGRAMFILES%\nodejs\node.exe >nul 2>&1 || goto ErrNode
goto AfterNode

:RetryNpm
echo Could not find npm env variable, trying with direct path
where %PROGRAMFILES%\nodejs\npm.cmd >nul 2>&1 || goto ErrNpm
set NPM_PATH=%PROGRAMFILES%\nodejs\npm.cmd
goto AfterNpm

:RetryPython
echo Could not find python env variable, trying with direct path
%LOCALAPPDATA%\Programs\Python\Python310\python.exe --version 2>NUL
if errorlevel 1 goto ErrPython
goto AfterPython

:RetryPip
echo Could not find pip env variable, trying with direct path
%LOCALAPPDATA%\Programs\Python\Python310\Scripts\pip.exe --version 2>NUL
if errorlevel 1 goto ErrPip
set PIP_PATH=%LOCALAPPDATA%\Programs\Python\Python310\Scripts\pip.exe
goto AfterPip


::ERROR HANDLING
:ErrPython
echo Could not find an installed Python environment. Please install Python (prefer 3.10.10) from the official website: https://www.python.org/downloads/
pause
goto:eof

:ErrPip
echo Could not find pip. Please install Python (prefer 3.10.10) with the 'pip' option checked. Or check: https://pip.pypa.io/en/stable/installation/
pause
goto:eof

:ErrNode
echo Could not find an installed NodeJS environment. Please install NodeJS (prefer v19.8.1) from the official website: https://nodejs.org/en/download/releases
pause
goto:eof

:ErrNpm
echo Could not find npm. Please install NodeJS (prefer v19.8.1) from the official website: https://nodejs.org/en/download/releases
pause
goto:eof