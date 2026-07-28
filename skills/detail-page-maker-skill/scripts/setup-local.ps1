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

$SkillRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LocalSkillRoot = Join-Path $SkillRoot ".agents\skills"
$SkillCli = Join-Path $SkillRoot "scripts\detail-page.mjs"
$E2ECli = Join-Path $SkillRoot "scripts\e2e.mjs"
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
    $machinePathValue = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPathValue = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = @($machinePathValue, $userPathValue) -join ";"
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

    if (-not (Test-CommandAvailable "winget")) {
        throw "winget이 없습니다. Microsoft Store의 App Installer를 설치한 뒤 다시 실행하세요."
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
        throw "$Id 설치 후에도 '$Command'를 찾을 수 없습니다. 새 PowerShell에서 다시 실행하세요."
    }
}

function Install-Prerequisites {
    if ($SkipPackages) {
        Write-Host "필수 프로그램 설치를 건너뜁니다." -ForegroundColor DarkGray
        return
    }

    Write-Step "필수 프로그램 확인"
    Install-WingetPackage -Id "Git.Git" -Command "git"
    Install-WingetPackage -Id "GitHub.cli" -Command "gh"
    Install-WingetPackage -Id "OpenJS.NodeJS.LTS" -Command "node"
    Install-WingetPackage -Id "OpenAI.Codex" -Command "codex"
    Install-WingetPackage -Id "astral-sh.uv" -Command "uv"
    Install-WingetPackage -Id "Gyan.FFmpeg" -Command "ffmpeg"
}

function Ensure-Login {
    if ($SkipLogin) {
        Write-Host "GitHub·Codex 로그인 확인을 건너뜁니다." -ForegroundColor DarkGray
        return
    }

    Write-Step "GitHub·Codex 로그인 확인"
    & gh auth status *> $null
    if ($LASTEXITCODE -ne 0) {
        Invoke-Checked "gh" @("auth", "login")
    }
    else {
        Write-Host "  [pass] GitHub" -ForegroundColor Green
    }

    & codex login status *> $null
    if ($LASTEXITCODE -ne 0) {
        Invoke-Checked "codex" @("login", "--device-auth")
    }
    else {
        Write-Host "  [pass] Codex" -ForegroundColor Green
    }
}

function Install-LocalBrowserHarness {
    Write-Step "Browser Harness 실행 도구와 로컬 스킬 설치"
    $browserHarnessReady = $false
    if (Test-CommandAvailable "browser-harness") {
        & browser-harness --version *> $null
        $browserHarnessReady = $LASTEXITCODE -eq 0
    }

    if (-not $browserHarnessReady -and -not (Test-CommandAvailable "browser-harness")) {
        Invoke-Checked "uv" @(
            "tool", "install",
            "--python", "3.12",
            "browser-harness"
        )
        Refresh-ProcessPath
    }
    elseif (-not $browserHarnessReady) {
        $daemonProcesses = Get-CimInstance Win32_Process |
            Where-Object {
                $_.Name -eq "python.exe" -and
                $_.CommandLine -match "-m browser_harness\.daemon"
            }
        if ($daemonProcesses.Count -gt 0) {
            Stop-Process -Id $daemonProcesses.ProcessId
        }
        Invoke-Checked "uv" @(
            "tool", "install",
            "--python", "3.12",
            "--upgrade",
            "--force",
            "browser-harness"
        )
        Refresh-ProcessPath
    }
    else {
        Write-Host "  [found] browser-harness" -ForegroundColor DarkGray
    }

    if (-not (Test-CommandAvailable "browser-harness")) {
        throw "Browser Harness 설치 후 실행 명령을 찾을 수 없습니다."
    }

    $browserSkillDirectory = Join-Path $LocalSkillRoot "browser-harness"
    $browserSkillFile = Join-Path $browserSkillDirectory "SKILL.md"
    New-Item -ItemType Directory -Path $browserSkillDirectory -Force | Out-Null
    $skillText = (& browser-harness skill | Out-String)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($skillText)) {
        throw "Browser Harness의 Codex 스킬 내용을 만들지 못했습니다."
    }
    [System.IO.File]::WriteAllText($browserSkillFile, $skillText, $Utf8NoBom)
    Write-Host "  [local] $browserSkillFile" -ForegroundColor Green
}

function Install-LocalProjectSkills {
    Write-Step "Taste, God Tibo GPT Image 2와 HyperFrames 스킬을 받은 폴더 안에 설치"
    Set-Location -LiteralPath $SkillRoot

    Invoke-Checked "npx" @(
        "skills", "add", "Leonxlnx/taste-skill",
        "--skill", "design-taste-frontend",
        "--agent", "codex",
        "--yes",
        "--copy",
        "--full-depth"
    )
    Invoke-Checked "npx" @(
        "skills", "add", "csm-kr/god-tibo-gpt-image2-skill",
        "--skill", "god-tibo-gpt-image2-skill",
        "--agent", "codex",
        "--yes",
        "--copy",
        "--full-depth"
    )
    $godTiboSkillRoot = Join-Path $LocalSkillRoot "god-tibo-gpt-image2-skill"
    if (-not (Test-Path -LiteralPath (Join-Path $godTiboSkillRoot "SKILL.md") -PathType Leaf)) {
        throw "God Tibo GPT Image 2 로컬 스킬을 설치하지 못했습니다."
    }
    Invoke-Checked "npm" @(
        "install",
        "--omit=dev",
        "--prefix", $godTiboSkillRoot
    )
    Invoke-Checked "npx" @(
        "skills", "add", "heygen-com/hyperframes",
        "--skill",
        "hyperframes",
        "hyperframes-animation",
        "hyperframes-cli",
        "hyperframes-core",
        "hyperframes-creative",
        "hyperframes-keyframes",
        "hyperframes-registry",
        "media-use",
        "motion-graphics",
        "--agent", "codex",
        "--yes",
        "--copy",
        "--full-depth"
    )
}

function Invoke-QuickTest {
    Write-Step "단일 스킬 폴더 E2E"
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
        throw "필수 명령이 없습니다: $($missing -join ', ')"
    }

    if (-not (Test-Path -LiteralPath $SkillCli -PathType Leaf)) {
        throw "상세페이지 CLI를 찾을 수 없습니다: $SkillCli"
    }
    if (-not (Test-Path -LiteralPath $E2ECli -PathType Leaf)) {
        throw "E2E CLI를 찾을 수 없습니다: $E2ECli"
    }

    Invoke-Checked "node" @($SkillCli, "doctor")
    Invoke-Checked "node" @($E2ECli)
    Write-Host ""
    Write-Host "Quick Test 통과: 이 스킬 폴더에서 전체 로컬 기능을 사용할 수 있습니다." -ForegroundColor Green
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
        $answer = Read-Host "첫 상품 프로젝트를 지금 만들까요? [Y/n]"
        if ($answer -match "^(n|no)$") {
            return
        }
    }
    if ([string]::IsNullOrWhiteSpace($ProductName)) {
        $ProductName = Read-Host "상품명"
    }
    if ([string]::IsNullOrWhiteSpace($SupplierUrl)) {
        $SupplierUrl = Read-Host "공급처 URL"
    }
    if ([string]::IsNullOrWhiteSpace($ProductName)) {
        throw "상품명은 비워 둘 수 없습니다."
    }
    if (-not (Test-SupplierUrl $SupplierUrl)) {
        throw "공급처 URL은 http:// 또는 https:// 주소여야 합니다."
    }

    Write-Step "'$ProductName' 프로젝트와 Studio v1 시작"
    Write-Host "Studio를 종료하려면 이 창에서 Ctrl+C를 누르세요." -ForegroundColor DarkGray
    Invoke-Checked "node" @(
        $SkillCli,
        "new",
        "--name", $ProductName,
        "--supplier-url", $SupplierUrl,
        "--port", $Port.ToString()
    )
}

Set-Location -LiteralPath $SkillRoot

if ($QuickTest) {
    Invoke-QuickTest
    exit 0
}

Write-Host "detail-page-maker-skill 로컬 설치" -ForegroundColor White
Write-Host "Skill folder: $SkillRoot" -ForegroundColor DarkGray
Install-Prerequisites
Refresh-ProcessPath
Ensure-Login
Install-LocalBrowserHarness
Install-LocalProjectSkills
Invoke-QuickTest

Write-Host ""
Write-Host "설치 완료. Codex를 다시 시작하면 로컬 의존 스킬이 적용됩니다." -ForegroundColor Green
Start-FirstProject
