@echo off

echo Installing nodejs dependencies ...
echo.

cd w-AI-fu
call npm install

echo Installing python dependencies ...
echo.

cd install
call pip install -r py_requirements.txt

echo.
echo Creating shortcut ...

call cscript /b shortcut.vbs

echo Done.
pause