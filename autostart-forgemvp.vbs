' ============================================================================
'  ForgeMVP - logon launcher
'
'  Starts the ForgeMVP web server in a hidden window and lets it open the admin
'  page in your browser at the correct http:// address.
'
'  Why it matters: opening public\admin.html straight from disk uses a file://
'  path, and browsers refuse to load the page's scripts that way. Going through
'  the server avoids that entirely.
'
'  Installed as a Startup shortcut by install-startup.bat - no admin rights needed.
'  To undo: run uninstall-startup.bat.
'
'  Per-copy settings (optional, never committed): .local\settings.ini next to
'  this script, one KEY=VALUE per line. Without it you get the defaults below.
'    NAME=ForgeMVP     shortcut names (install-startup.bat uses it)
'    PORT=8080         port the server listens on
'    URLHOST=localhost host name used in the address you open
'    PAGE=admin.html   page opened at logon / by the desktop shortcut
'    OPEN=1            1 = open the page in the browser at logon, 0 = do not
'    LIVE=0            1 = run tools\dev-supervisor.mjs: pages refresh when files
'                      change, and the server restarts itself after a crash
' ============================================================================

Option Explicit

Const WAIT_MS = 800

Dim shell, fso, home, nodeExe, settings, PORT, openPage, livePage, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Diagnostics mode: "cscript //nologo autostart-forgemvp.vbs --check" reports what it
' found and changes nothing. Handy when the auto-start misbehaves.
Dim checkOnly, i
checkOnly = False
For i = 0 To WScript.Arguments.Count - 1
  If LCase(WScript.Arguments(i)) = "--check" Then checkOnly = True
Next

' The repo folder is wherever this script lives, so the Startup shortcut can
' point at the repo and pick up future edits without reinstalling.
home = fso.GetParentFolderName(WScript.ScriptFullName)

If Not fso.FileExists(home & "\server.js") Then
  If checkOnly Then
    WScript.Echo "ERROR: server.js not found in " & home
    WScript.Quit 1
  End If
  MsgBox "ForgeMVP could not start: server.js was not found next to this script." & vbCrLf & vbCrLf & _
         "Expected it in:" & vbCrLf & home, 48, "ForgeMVP"
  WScript.Quit 1
End If

nodeExe = FindNode()

Set settings = ReadSettings(home & "\.local\settings.ini")
PORT = Setting("PORT", "8080")
openPage = (Setting("OPEN", "1") = "1")
livePage = (Setting("LIVE", "0") = "1")

If livePage Then
  command = """" & nodeExe & """ """ & home & "\tools\dev-supervisor.mjs"""
Else
  command = """" & nodeExe & """ """ & home & "\server.js"""
End If
If openPage Then command = command & " --open"

If checkOnly Then
  WScript.Echo "repo folder : " & home
  WScript.Echo "server.js   : " & fso.FileExists(home & "\server.js")
  If nodeExe = "" Then
    WScript.Echo "node.exe    : NOT FOUND - install the LTS build from https://nodejs.org"
  Else
    WScript.Echo "node.exe    : " & nodeExe
  End If
  WScript.Echo "would run   : " & command
  WScript.Echo "with PORT   : " & PORT
  WScript.Echo "page        : http://" & Setting("URLHOST", "localhost") & ":" & PORT & "/" & Setting("PAGE", "admin.html")
  If nodeExe = "" Then
    WScript.Quit 1
  Else
    WScript.Quit 0
  End If
End If

If nodeExe = "" Then
  MsgBox "ForgeMVP could not start: Node.js was not found on this PC." & vbCrLf & vbCrLf & _
         "Install the LTS version from https://nodejs.org, then log out and back in.", 48, "ForgeMVP"
  WScript.Quit 1
End If

shell.CurrentDirectory = home
shell.Environment("PROCESS")("PORT") = PORT

' Window style 0 = hidden, and we do not wait: server.js opens the browser itself
' once it is actually listening. If the server is already running it detects the
' busy port, opens the browser and exits quietly, so logon never starts two copies.
' (Default command: node server.js --open)
shell.Run command, 0, False

WScript.Sleep WAIT_MS

' ---------------------------------------------------------------------------
' .local\settings.ini: KEY=VALUE lines; blank lines and ; or # comments ignored.
' ---------------------------------------------------------------------------
Function ReadSettings(file)
  Dim d, ts, line, eq
  Set d = CreateObject("Scripting.Dictionary")
  d.CompareMode = 1
  If fso.FileExists(file) Then
    Set ts = fso.OpenTextFile(file, 1)
    Do While Not ts.AtEndOfStream
      line = Trim(ts.ReadLine)
      eq = InStr(line, "=")
      If eq > 1 And Left(line, 1) <> ";" And Left(line, 1) <> "#" Then
        d(Trim(Left(line, eq - 1))) = Trim(Mid(line, eq + 1))
      End If
    Loop
    ts.Close
  End If
  Set ReadSettings = d
End Function

Function Setting(key, fallback)
  If settings.Exists(key) And settings(key) <> "" Then
    Setting = settings(key)
  Else
    Setting = fallback
  End If
End Function

' ---------------------------------------------------------------------------
' Find node.exe: PATH first, then the usual install locations.
' ---------------------------------------------------------------------------
Function FindNode()
  Dim tmp, ts, line, candidates, i, p

  FindNode = ""

  ' 1. Ask the system (hidden, waiting, output to a temp file).
  tmp = fso.GetSpecialFolder(2) & "\forgemvp-node-path.txt"
  On Error Resume Next
  shell.Run "cmd /c where node > """ & tmp & """ 2>nul", 0, True
  If fso.FileExists(tmp) Then
    Set ts = fso.OpenTextFile(tmp, 1)
    If Not ts.AtEndOfStream Then
      line = Trim(ts.ReadLine)
      If fso.FileExists(line) Then FindNode = line
    End If
    ts.Close
    fso.DeleteFile tmp, True
  End If
  On Error GoTo 0
  If FindNode <> "" Then Exit Function

  ' 2. The default install locations.
  candidates = Array( _
    shell.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe"), _
    shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\nodejs\node.exe"), _
    shell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\nodejs\node.exe"), _
    shell.ExpandEnvironmentStrings("%APPDATA%\npm\node.exe") )

  For i = 0 To UBound(candidates)
    p = candidates(i)
    If InStr(p, "%") = 0 And fso.FileExists(p) Then
      FindNode = p
      Exit Function
    End If
  Next
End Function
