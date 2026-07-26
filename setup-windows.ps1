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

$RepoRoot = $PSScriptRoot
$SkillCli = Join-Path $RepoRoot "skills\detail-page-maker-skill\scripts\detail-page.mjs"
$TestRoot = Join-Path $RepoRoot "tests\studio-v2"
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Write-Step {
    param(
        [Parameter(Mandatory)]
        [string]$Message
    )

    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = @($machinePath, $userPath) -join ";"
}

function Test-CommandAvailable {
    param(
        [Parameter(Mandatory)]
        [string]$Name
    )

    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory)]
        [string]$Command,
        [string[]]$Arguments = @()
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "'$Command $($Arguments -join ' ')' failed with exit code $LASTEXITCODE."
    }
}

function Install-WingetPackage {
    param(
        [Parameter(Mandatory)]
        [string]$Id,
        [Parameter(Mandatory)]
        [string]$Command
    )

    if (Test-CommandAvailable $Command) {
        Write-Host "  [found] $Command" -ForegroundColor DarkGray
        return
    }

    Write-Host "  [install] $Id" -ForegroundColor Yellow
    Invoke-Checked "winget" @(
        "install",
        "--id", $Id,
        "--exact",
        "--silent",
        "--accept-package-agreements",
        "--accept-source-agreements"
    )
    Refresh-ProcessPath

    if (-not (Test-CommandAvailable $Command)) {
        throw "Installed $Id but '$Command' is unavailable. Open a new terminal and run this script again."
    }
}

function Invoke-QuickTest {
    Write-Step "Quick Test: commands, skill, and Studio"

    $requiredCommands = @(
        "git",
        "node",
        "npx",
        "codex",
        "uv",
        "ffmpeg",
        "browser-harness"
    )
    $missing = @()

    foreach ($command in $requiredCommands) {
        if (Test-CommandAvailable $command) {
            Write-Host "  [pass] $command" -ForegroundColor Green
        }
        else {
            Write-Host "  [missing] $command" -ForegroundColor Red
            $missing += $command
        }
    }

    if ($missing.Count -gt 0) {
        throw "Missing required commands: $($missing -join ', '). Run '.\setup-windows.ps1' first."
    }

    if (-not (Test-Path -LiteralPath $SkillCli -PathType Leaf)) {
        throw "Detail page CLI was not found: $SkillCli"
    }

    Write-Host ""
    Invoke-Checked "node" @($SkillCli, "doctor")

    $testFiles = @(
        Get-ChildItem -LiteralPath $TestRoot -Filter "*.test.mjs" -File |
            Sort-Object Name |
            ForEach-Object FullName
    )
    if ($testFiles.Count -eq 0) {
        throw "Studio test files were not found: $TestRoot"
    }

    Invoke-Checked "node" (@("--test") + $testFiles)
    Invoke-Checked "npx" @("skills", "add", ".", "--list", "--full-depth")

    Write-Host ""
    Write-Host "Quick Test passed. This repository is ready to run." -ForegroundColor Green
}

function Ensure-Login {
    if ($SkipLogin) {
        Write-Host "  Login checks skipped." -ForegroundColor DarkGray
        return
    }

    Write-Step "Check GitHub and Codex login"

    & gh auth status *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Starting GitHub login." -ForegroundColor Yellow
        Invoke-Checked "gh" @("auth", "login")
    }
    else {
        Write-Host "  [pass] GitHub login" -ForegroundColor Green
    }

    & codex login status *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Starting Codex device login." -ForegroundColor Yellow
        Invoke-Checked "codex" @("login", "--device-auth")
    }
    else {
        Write-Host "  [pass] Codex login" -ForegroundColor Green
    }
}

function Install-BrowserHarnessSkill {
    Write-Step "Install Browser Harness and register its Codex skill"

    Invoke-Checked "uv" @(
        "tool", "install",
        "--python", "3.12",
        "--upgrade",
        "--force",
        "browser-harness"
    )
    Refresh-ProcessPath

    if (-not (Test-CommandAvailable "browser-harness")) {
        throw "Browser Harness is unavailable after install. Open a new terminal and run this script again."
    }

    $codexRoot = if ([string]::IsNullOrWhiteSpace($env:CODEX_HOME)) {
        Join-Path $env:USERPROFILE ".codex"
    }
    else {
        $env:CODEX_HOME
    }
    $browserSkillDirectory = Join-Path $codexRoot "skills\browser-harness"
    $browserSkillFile = Join-Path $browserSkillDirectory "SKILL.md"
    New-Item -ItemType Directory -Path $browserSkillDirectory -Force | Out-Null

    $skillText = (& browser-harness skill | Out-String)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($skillText)) {
        throw "Could not generate the Browser Harness Codex skill."
    }
    [System.IO.File]::WriteAllText($browserSkillFile, $skillText, $Utf8NoBom)
    Write-Host "  Registered: $browserSkillFile" -ForegroundColor Green
}

function Install-ProjectSkills {
    Write-Step "Register HyperFrames and detail-page-maker-skill"

    Invoke-Checked "npx" @("hyperframes", "skills", "update")
    Invoke-Checked "npx" @(
        "skills", "add", ".",
        "--skill", "detail-page-maker-skill",
        "--agent", "codex",
        "--global",
        "--yes",
        "--full-depth"
    )
}

function Test-SupplierUrl {
    param(
        [Parameter(Mandatory)]
        [string]$Url
    )

    $parsed = $null
    if (-not [Uri]::TryCreate($Url, [UriKind]::Absolute, [ref]$parsed)) {
        return $false
    }
    return $parsed.Scheme -in @("http", "https")
}

function Start-FirstProject {
    if ($NoProject) {
        return
    }

    if ([string]::IsNullOrWhiteSpace($ProductName) -and [string]::IsNullOrWhiteSpace($SupplierUrl)) {
        Write-Host ""
        $answer = Read-Host "Create the first product project now? [Y/n]"
        if ($answer -match "^(n|no)$") {
            return
        }
    }

    if ([string]::IsNullOrWhiteSpace($ProductName)) {
        $ProductName = Read-Host "Product name"
    }
    if ([string]::IsNullOrWhiteSpace($SupplierUrl)) {
        $SupplierUrl = Read-Host "Supplier URL"
    }

    if ([string]::IsNullOrWhiteSpace($ProductName)) {
        throw "Product name cannot be empty."
    }
    if (-not (Test-SupplierUrl $SupplierUrl)) {
        throw "Supplier URL must be a valid http:// or https:// URL."
    }

    Write-Step "Create '$ProductName' and start Studio"
    Write-Host "Press Ctrl+C in this window to stop Studio." -ForegroundColor DarkGray
    Invoke-Checked "node" @(
        $SkillCli,
        "new",
        "--name", $ProductName,
        "--supplier-url", $SupplierUrl,
        "--port", $Port.ToString()
    )
}

Set-Location -LiteralPath $RepoRoot

if ($QuickTest) {
    Invoke-QuickTest
    exit 0
}

Write-Host "detail-page-maker-skill Windows setup" -ForegroundColor White
Write-Host "Repository: $RepoRoot" -ForegroundColor DarkGray

if (-not $SkipPackages) {
    Write-Step "Check and install prerequisites"

    if (-not (Test-CommandAvailable "winget")) {
        throw "winget was not found. Install 'App Installer' from Microsoft Store and run this script again."
    }

    Install-WingetPackage -Id "Git.Git" -Command "git"
    Install-WingetPackage -Id "GitHub.cli" -Command "gh"
    Install-WingetPackage -Id "OpenJS.NodeJS.LTS" -Command "node"
    Install-WingetPackage -Id "OpenAI.Codex" -Command "codex"
    Install-WingetPackage -Id "astral-sh.uv" -Command "uv"
    Install-WingetPackage -Id "Gyan.FFmpeg" -Command "ffmpeg"
}
else {
    Write-Host "Prerequisite installation skipped." -ForegroundColor DarkGray
}

Refresh-ProcessPath
Ensure-Login
Install-BrowserHarnessSkill
Install-ProjectSkills
Invoke-QuickTest

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Run later: .\setup-windows.ps1 -QuickTest" -ForegroundColor White
Start-FirstProject
