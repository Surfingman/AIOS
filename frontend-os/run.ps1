param(
    [ValidateRange(1024, 65500)][int]$Port = 8035,
    [switch]$SkipInstall,
    [switch]$SkipBuild,
    [switch]$ResetVenv
)

$ErrorActionPreference = 'Stop'
& (Join-Path (Split-Path $PSScriptRoot -Parent) 'run.ps1') -Interface os @PSBoundParameters