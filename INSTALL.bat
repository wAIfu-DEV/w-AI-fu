@echo off

cd w-AI-fu
cd install

echo Installing python dependencies ...
echo.

call pip install -r py_requirements.txt

echo.
echo Creating shortcut ...
echo.

call cscript /b shortcut.vbs

echo Done.
pause