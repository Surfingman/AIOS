param(
    [ValidateRange(1024, 65500)][int]$Port = 8035,
    [switch]$SkipInstall,
    [switch]$SkipBuild,
    [switch]$ResetVenv
)

$ErrorActionPreference = 'Stop'
$python = Join-Path $PSScriptRoot 'backend\.venv\Scripts\python.exe'
$frontend = Join-Path $PSScriptRoot 'frontend-canvas'

function Assert-ExitCode {
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
}

function Test-PythonArchitecture {
    param([string]$Path)
    $stream = [System.IO.File]::OpenRead($Path)
    $reader = [System.IO.BinaryReader]::new($stream)
    try {
        if ($reader.ReadUInt16() -ne 0x5A4D) { return $false }
        $stream.Position = 0x3C
        $headerOffset = $reader.ReadInt32()
        $stream.Position = $headerOffset
        if ($reader.ReadUInt32() -ne 0x4550) { return $false }
        $machine = $reader.ReadUInt16()
        $architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
        switch ($architecture) {
            'X64' { return $machine -in @(0x8664, 0x014C) }
            'Arm64' { return $machine -in @(0xAA64, 0x8664, 0x014C) }
            'X86' { return $machine -eq 0x014C }
            default { return $false }
        }
    } catch {
        return $false
    } finally {
        $reader.Dispose()
    }
}

if ($ResetVenv) {
    if ($SkipInstall) { throw '-ResetVenv cannot be combined with -SkipInstall.' }
    $venv = Join-Path $PSScriptRoot 'backend\.venv'
    if (Test-Path $venv) {
        $backupName = '.venv-backup-' + [guid]::NewGuid().ToString('N')
        Rename-Item -LiteralPath $venv -NewName $backupName
        Write-Host "Previous virtual environment preserved as backend\$backupName"
    }
}
if (-not (Test-Path $python)) {
    python -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)"
    Assert-ExitCode
    python -m venv (Join-Path $PSScriptRoot 'backend\.venv')
    Assert-ExitCode
}
if (-not (Test-PythonArchitecture $python)) {
    throw 'The virtual environment Python is incompatible with this PC. Run: .\run.ps1 -ResetVenv. Do not copy .venv between PCs.'
}
try {
    & $python -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)"
    Assert-ExitCode
} catch {
    throw 'The virtual environment cannot run on this PC. Install Python 3.12+ locally, then run: .\run.ps1 -ResetVenv'
}
if (-not $SkipInstall) {
    & $python -m pip install --prefer-binary --only-binary=cryptography,cffi -r (Join-Path $PSScriptRoot 'backend\requirements.txt')
    Assert-ExitCode
    npm --prefix $frontend ci
    Assert-ExitCode
}
if (-not $SkipBuild) {
    npm --prefix $frontend run build
    Assert-ExitCode
}
if (-not (Test-Path (Join-Path $frontend 'dist\index.html'))) {
    throw 'Frontend build is missing. Run without -SkipBuild.'
}

$activePorts = @([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | ForEach-Object { $_.Port })
while ($Port -in $activePorts) { $Port++ }
$serverArgs = @('-m', 'uvicorn', 'app.main:app', '--app-dir', (Join-Path $PSScriptRoot 'backend'), '--host', '127.0.0.1', '--port', "$Port")
$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path $envFile) { $serverArgs += @('--env-file', $envFile) }
Write-Host "Guardian: http://127.0.0.1:$Port (Ctrl+C to stop)"
& $python @serverArgs
Assert-ExitCode