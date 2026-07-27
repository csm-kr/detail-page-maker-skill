[CmdletBinding()]
param(
    [switch]$QuickTest,
    [switch]$SkipPackages,
    [switch]$SkipLogin,
    [switch]$NoProject,
    [string]$ProductName,
    [string]$SupplierUrl,
    [ValidateRange(1, 65535)]
    [int]$Port = 8896
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$installer = Join-Path $repositoryRoot "skills\detail-page-maker-skill\scripts\setup-local.ps1"
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    throw "단일 스킬 설치 스크립트를 찾을 수 없습니다: $installer"
}

& $installer @PSBoundParameters
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
