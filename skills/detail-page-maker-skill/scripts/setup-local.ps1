[CmdletBinding()]
param(
    [string]$Source = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$TargetProject = (Get-Location).Path,
    [switch]$DryRun,
    [switch]$ValidateOnly,
    [switch]$AllowNetwork,
    [switch]$QuickTest,
    [switch]$NoProject,
    [string]$ProductName,
    [string]$SupplierUrl,
    [ValidateRange(1, 65535)]
    [int]$Port = 8896,
    [switch]$SkipPackages,
    [switch]$SkipLogin
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$installer = Join-Path $PSScriptRoot "install-local.ps1"
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    throw "E_INSTALLER_MISSING: Project-local installer not found: $installer"
}

if ($SkipPackages -or $SkipLogin) {
    Write-Verbose "The installer never changes system packages or login state. SkipPackages and SkipLogin are compatibility parameters."
}

$installerArguments = @{
    Source = $Source
    TargetProject = $TargetProject
    DryRun = $DryRun
    ValidateOnly = $ValidateOnly
    AllowNetwork = $AllowNetwork
}
& $installer @installerArguments
if ($DryRun -or $ValidateOnly) {
    exit 0
}

$installedRoot = Join-Path (
    [System.IO.Path]::GetFullPath($TargetProject)
) ".agents\skills\detail-page-maker-skill"
$skillCli = Join-Path $installedRoot "scripts\detail-page.mjs"
$e2eCli = Join-Path $installedRoot "scripts\e2e.mjs"

if ($QuickTest) {
    if ($null -eq (Get-Command "node" -ErrorAction SilentlyContinue)) {
        throw "E_NODE_MISSING: QuickTest requires node."
    }
    & node $skillCli doctor
    if ($LASTEXITCODE -ne 0) {
        throw "E_DOCTOR_FAILED: detail-page doctor failed."
    }
    & node $e2eCli
    if ($LASTEXITCODE -ne 0) {
        throw "E_E2E_FAILED: detail-page E2E failed."
    }
}

if ($NoProject -or (
    [string]::IsNullOrWhiteSpace($ProductName) -and
    [string]::IsNullOrWhiteSpace($SupplierUrl)
)) {
    exit 0
}
if ([string]::IsNullOrWhiteSpace($ProductName)) {
    throw "E_PRODUCT_NAME: ProductName is required to create a project."
}
if ([string]::IsNullOrWhiteSpace($SupplierUrl)) {
    throw "E_SUPPLIER_URL: SupplierUrl is required to create a project."
}
if ($null -eq (Get-Command "node" -ErrorAction SilentlyContinue)) {
    throw "E_NODE_MISSING: Project creation requires node."
}

& node $skillCli new `
    --name $ProductName `
    --supplier-url $SupplierUrl `
    --port $Port.ToString()
if ($LASTEXITCODE -ne 0) {
    throw "E_PROJECT_CREATE: Initial detail-page project creation failed."
}
