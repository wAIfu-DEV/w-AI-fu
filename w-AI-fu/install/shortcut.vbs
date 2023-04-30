Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

ScriptPath = fso.GetAbsolutePathName(WScript.ScriptFullName)
ParentFolder = fso.GetParentFolderName(ScriptPath)
ParentFolder2 = fso.GetParentFolderName(ParentFolder)
ParentFolder3 = fso.GetParentFolderName(ParentFolder2)

ShortcutPath = fso.BuildPath(ParentFolder3, "Run w-AI-fu.lnk")
Set Shortcut = WshShell.CreateShortcut(ShortcutPath)

Shortcut.TargetPath = fso.BuildPath(ParentFolder2, "run.bat")
Shortcut.IconLocation = fso.BuildPath(ParentFolder2, "icon.ico")
Shortcut.WorkingDirectory = ParentFolder2
Shortcut.Description = "Run w-AI-fu"

Shortcut.Save

Set Shortcut = Nothing
Set WshShell = Nothing