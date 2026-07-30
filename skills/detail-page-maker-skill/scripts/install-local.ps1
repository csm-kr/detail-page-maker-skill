[CmdletBinding()]
param(
    [string]$Source = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$TargetProject = (Get-Location).Path,
    [switch]$DryRun,
    [switch]$ValidateOnly,
    [switch]$AllowNetwork,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$SkillName = "detail-page-maker-skill"

function Get-NormalizedPath {
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    return [System.IO.Path]::GetFullPath($Path).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    )
}

function Get-PhysicalRootPath {
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    $normalized = Get-NormalizedPath $Path
    if (-not (Test-Path -LiteralPath $normalized)) {
        return $normalized
    }

    $item = Get-Item -Force -LiteralPath $normalized
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        $targets = @($item.Target)
        if ($targets.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace($targets[0])) {
            $target = [string]$targets[0]
            if (-not [System.IO.Path]::IsPathRooted($target)) {
                $target = Join-Path $item.Parent.FullName $target
            }
            return Get-NormalizedPath $target
        }
    }

    return $normalized
}

function Test-SamePath {
    param(
        [Parameter(Mandatory)]
        [string]$Left,
        [Parameter(Mandatory)]
        [string]$Right
    )

    return [string]::Equals(
        (Get-PhysicalRootPath $Left),
        (Get-PhysicalRootPath $Right),
        [System.StringComparison]::OrdinalIgnoreCase
    )
}

function Test-DescendantPath {
    param(
        [Parameter(Mandatory)]
        [string]$Candidate,
        [Parameter(Mandatory)]
        [string]$Parent
    )

    $candidatePath = Get-PhysicalRootPath $Candidate
    $parentPath = Get-PhysicalRootPath $Parent
    $prefix = $parentPath + [System.IO.Path]::DirectorySeparatorChar
    return $candidatePath.StartsWith(
        $prefix,
        [System.StringComparison]::OrdinalIgnoreCase
    )
}

function Assert-NoReparseAncestor {
    param(
        [Parameter(Mandatory)]
        [string]$Root,
        [Parameter(Mandatory)]
        [string]$Candidate
    )

    $rootPath = Get-NormalizedPath $Root
    $candidatePath = Get-NormalizedPath $Candidate
    $prefix = $rootPath + [System.IO.Path]::DirectorySeparatorChar
    if (-not [string]::Equals(
            $candidatePath,
            $rootPath,
            [System.StringComparison]::OrdinalIgnoreCase
        ) -and -not $candidatePath.StartsWith(
            $prefix,
            [System.StringComparison]::OrdinalIgnoreCase
        )) {
        throw "E_TARGET_SCOPE: Candidate is outside the target project: $candidatePath"
    }

    $relative = $candidatePath.Substring($rootPath.Length).TrimStart("\", "/")
    $segments = if ([string]::IsNullOrWhiteSpace($relative)) {
        @()
    }
    else {
        @($relative -split "[\\/]+")
    }
    $current = $rootPath
    foreach ($segment in @($null) + $segments) {
        if ($null -ne $segment) {
            $current = Join-Path $current $segment
        }
        if (-not (Test-Path -LiteralPath $current)) {
            continue
        }
        $item = Get-Item -Force -LiteralPath $current
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "E_TARGET_REPARSE: Reparse points are not allowed from the target project to an install destination: $current"
        }
    }
}

function Get-Sha256 {
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Get-DirectoryDigest {
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    $root = Get-NormalizedPath $Path
    $reparsePoint = Get-ChildItem -Force -Recurse -LiteralPath $root |
        Where-Object {
            ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
        } |
        Select-Object -First 1
    if ($null -ne $reparsePoint) {
        throw "E_SOURCE_LINK: Reparse points are not allowed inside a copy source: $($reparsePoint.FullName)"
    }

    $lines = Get-ChildItem -Force -Recurse -File -LiteralPath $root |
        ForEach-Object {
            $relative = $_.FullName.Substring($root.Length).TrimStart("\", "/")
            "$($relative.Replace('\', '/'))`0$(Get-Sha256 $_.FullName)"
        } |
        Sort-Object
    $payload = [string]::Join("`n", @($lines))
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = $Utf8NoBom.GetBytes($payload)
        return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }
}

function Get-LockEntry {
    param(
        [Parameter(Mandatory)]
        [object]$Lock,
        [Parameter(Mandatory)]
        [string]$Name
    )

    $property = $Lock.skills.PSObject.Properties[$Name]
    if ($null -eq $property) {
        throw "E_LOCK_MISSING: skills-lock.json has no '$Name' entry."
    }
    return $property.Value
}

function Assert-SafeSkillName {
    param(
        [Parameter(Mandatory)]
        [string]$Name
    )

    if ($Name -notmatch '^[a-z0-9][a-z0-9-]{0,63}$') {
        throw "E_SKILL_NAME_INVALID: Skill names must use lowercase letters, digits, and hyphens only: $Name"
    }
}

function Invoke-NetworkFallback {
    param(
        [Parameter(Mandatory)]
        [object[]]$MissingSkills,
        [Parameter(Mandatory)]
        [string]$StageRoot
    )

    $browser = @($MissingSkills | Where-Object { $_.networkSource -eq "browser-harness skill" })
    if ($browser.Count -gt 0) {
        if ($null -eq (Get-Command "browser-harness" -ErrorAction SilentlyContinue)) {
            throw "E_BROWSER_HARNESS_MISSING: Use the local bundle or install the browser-harness executable first."
        }
        $browserTarget = Join-Path $StageRoot ".agents\skills\browser-harness"
        New-Item -ItemType Directory -Force -Path $browserTarget | Out-Null
        $skillText = (& browser-harness skill | Out-String)
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($skillText)) {
            throw "E_BROWSER_HARNESS_GENERATE: Could not generate the browser-harness fallback skill."
        }
        [System.IO.File]::WriteAllText(
            (Join-Path $browserTarget "SKILL.md"),
            $skillText,
            $Utf8NoBom
        )
    }

    $githubGroups = @(
        $MissingSkills |
            Where-Object { $_.networkSource -and $_.networkSource -ne "browser-harness skill" } |
            Group-Object networkSource
    )
    if ($githubGroups.Count -gt 0 -and $null -eq (Get-Command "npx" -ErrorAction SilentlyContinue)) {
        throw "E_NPX_MISSING: Explicit network installation requires npx."
    }

    Push-Location -LiteralPath $StageRoot
    try {
        foreach ($group in $githubGroups) {
            $arguments = @("skills", "add", $group.Name, "--skill")
            $arguments += @($group.Group | ForEach-Object { $_.name })
            $arguments += @(
                "--agent", "codex",
                "--yes",
                "--copy",
                "--full-depth"
            )
            & npx @arguments
            if ($LASTEXITCODE -ne 0) {
                throw "E_NETWORK_INSTALL: Skill network installation failed: $($group.Name)"
            }
        }
    }
    finally {
        Pop-Location
    }
}

$sourceRoot = Get-NormalizedPath $Source
if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
    throw "E_SOURCE_MISSING: Skill source directory does not exist: $sourceRoot"
}
if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot "SKILL.md") -PathType Leaf)) {
    throw "E_SOURCE_SKILL: The source has no SKILL.md: $sourceRoot"
}

$manifestPath = Join-Path $sourceRoot "dependencies.json"
$lockPath = Join-Path $sourceRoot "skills-lock.json"
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "E_MANIFEST_MISSING: dependencies.json does not exist: $manifestPath"
}
if (-not (Test-Path -LiteralPath $lockPath -PathType Leaf)) {
    throw "E_LOCKFILE_MISSING: skills-lock.json does not exist: $lockPath"
}

$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
$lock = Get-Content -Raw -Encoding UTF8 -LiteralPath $lockPath | ConvertFrom-Json
if ($manifest.schemaVersion -ne 2) {
    throw "E_MANIFEST_VERSION: Unsupported dependencies.json schemaVersion: $($manifest.schemaVersion)"
}
if ($manifest.installScope -ne "project-local") {
    throw "E_INSTALL_SCOPE: installScope must be project-local."
}
if ($manifest.defaultTargetSkillDirectory -ne ".agents/skills") {
    throw "E_INSTALL_TARGET: The default target must be .agents/skills."
}
if ($manifest.networkFallback -ne "explicit-only") {
    throw "E_NETWORK_POLICY: networkFallback must be explicit-only."
}

$declaredNames = @($manifest.skills | ForEach-Object { [string]$_.name })
$lockedNames = @($lock.skills.PSObject.Properties | ForEach-Object { $_.Name })
Assert-SafeSkillName -Name $SkillName
foreach ($name in @($declaredNames + $lockedNames)) {
    Assert-SafeSkillName -Name $name
}
if (($declaredNames | Select-Object -Unique).Count -ne $declaredNames.Count) {
    throw "E_MANIFEST_DUPLICATE: dependencies.json contains duplicate skill names."
}
if ([string]::Join("`n", @($declaredNames | Sort-Object)) -ne
    [string]::Join("`n", @($lockedNames | Sort-Object))) {
    throw "E_LOCK_SET: dependencies.json and skills-lock.json contain different skill sets."
}

$vendoredRoot = Join-Path $sourceRoot $manifest.vendoredSkillDirectory
$resolvedSkills = @()
$missingSkills = @()
foreach ($skill in $manifest.skills) {
    $name = [string]$skill.name
    $vendoredPath = Join-Path $vendoredRoot $name
    $lockEntry = Get-LockEntry -Lock $lock -Name $name
    if (Test-Path -LiteralPath (Join-Path $vendoredPath "SKILL.md") -PathType Leaf) {
        $actualHash = Get-Sha256 (Join-Path $vendoredPath "SKILL.md")
        if ($actualHash -ne ([string]$lockEntry.skillFileSha256).ToLowerInvariant()) {
            throw "E_VENDORED_HASH: Vendored '$name' does not match skills-lock.json."
        }
        $resolvedSkills += [pscustomobject]@{
            name = $name
            path = $vendoredPath
            resolution = "vendored-local"
        }
        continue
    }

    $networkSource = $null
    if ($null -ne $skill.PSObject.Properties["networkSource"]) {
        $networkSource = [string]$skill.networkSource
    }
    if (-not $AllowNetwork) {
        throw "E_NETWORK_FORBIDDEN: Vendored '$name' is missing. Network fallback requires explicit -AllowNetwork."
    }
    if ([string]::IsNullOrWhiteSpace($networkSource)) {
        throw "E_NO_FALLBACK: Vendored '$name' is missing and has no allowed network fallback."
    }
    $missingSkills += [pscustomobject]@{
        name = $name
        networkSource = $networkSource
    }
}

$targetRoot = Get-NormalizedPath $TargetProject
$targetSkillRoot = Join-Path $targetRoot $manifest.defaultTargetSkillDirectory
$mainDestination = Join-Path $targetSkillRoot $SkillName
if (-not (Test-Path -LiteralPath $targetRoot -PathType Container)) {
    throw "E_TARGET_PROJECT_MISSING: Target project must be an existing directory: $targetRoot"
}
Assert-NoReparseAncestor -Root $targetRoot -Candidate $targetRoot
Assert-NoReparseAncestor -Root $targetRoot -Candidate $targetSkillRoot
if ((Test-SamePath -Left $sourceRoot -Right $mainDestination) -or
    (Test-DescendantPath -Candidate $mainDestination -Parent $sourceRoot)) {
    throw "E_RECURSIVE_COPY: Source and destination are equal, or the destination is inside the source: $mainDestination"
}

$installSources = @(
    [pscustomobject]@{
        name = $SkillName
        path = $sourceRoot
        resolution = "selected-source"
    }
) + $resolvedSkills

$actions = @()
$conflicts = @()
foreach ($item in $installSources) {
    $destination = Join-Path $targetSkillRoot $item.name
    if (Test-SamePath -Left $item.path -Right $destination) {
        throw "E_RECURSIVE_COPY: Source and destination are equal: $destination"
    }
    $sourceDigest = Get-DirectoryDigest $item.path
    Write-Verbose "source digest [$($item.name)] $sourceDigest"
    if (-not (Test-Path -LiteralPath $destination)) {
        $actions += [pscustomobject]@{
            name = $item.name
            action = "copy"
            source = $item.path
            destination = $destination
            digest = $sourceDigest
            resolution = $item.resolution
        }
        continue
    }
    if (-not (Test-Path -LiteralPath $destination -PathType Container)) {
        $conflicts += "$destination (not a directory)"
        continue
    }
    $destinationDigest = Get-DirectoryDigest $destination
    Write-Verbose "target digest [$($item.name)] $destinationDigest"
    if ($destinationDigest -eq $sourceDigest) {
        $actions += [pscustomobject]@{
            name = $item.name
            action = "skip-identical"
            source = $item.path
            destination = $destination
            digest = $sourceDigest
            resolution = $item.resolution
        }
    }
    else {
        $conflicts += "$destination (existing content differs from source)"
    }
}

foreach ($missing in $missingSkills) {
    $destination = Join-Path $targetSkillRoot $missing.name
    if (Test-Path -LiteralPath $destination) {
        $conflicts += "$destination (network target already exists)"
    }
    else {
        $actions += [pscustomobject]@{
            name = $missing.name
            action = "network-copy"
            source = $missing.networkSource
            destination = $destination
            digest = $null
            resolution = "explicit-network"
        }
    }
}

if ($conflicts.Count -gt 0) {
    throw "E_TARGET_CONFLICT: Installation stopped to preserve existing user content:`n - $($conflicts -join "`n - ")"
}

$report = [ordered]@{
    ok = $true
    mode = if ($ValidateOnly) { "validate-only" } elseif ($DryRun) { "dry-run" } else { "install" }
    source = $sourceRoot
    targetProject = $targetRoot
    targetSkillDirectory = $targetSkillRoot
    allowNetwork = [bool]$AllowNetwork
    actions = @($actions)
}

if ($DryRun -or $ValidateOnly) {
    if ($Json) {
        $report | ConvertTo-Json -Depth 8
    }
    else {
        Write-Host "Validation passed; no files were changed." -ForegroundColor Green
        $actions | ForEach-Object {
            Write-Host "  [$($_.action)] $($_.name) -> $($_.destination)"
        }
    }
    exit 0
}

$targetAgentsRoot = Join-Path $targetRoot ".agents"
Assert-NoReparseAncestor -Root $targetRoot -Candidate $targetAgentsRoot
New-Item -ItemType Directory -Force -Path $targetAgentsRoot | Out-Null
Assert-NoReparseAncestor -Root $targetRoot -Candidate $targetAgentsRoot
$stageRoot = Join-Path $targetRoot (
    ".agents\.detail-page-maker-install-" + [Guid]::NewGuid().ToString("N")
)
$stageSkillRoot = Join-Path $stageRoot ".agents\skills"
$committedDestinations = @()
$receiptPath = Join-Path $targetRoot ".agents\detail-page-maker-skill.install.json"
$receiptExisted = Test-Path -LiteralPath $receiptPath
if ($receiptExisted -and -not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) {
    throw "E_RECEIPT_CONFLICT: Install receipt path exists and is not a file: $receiptPath"
}
$previousReceipt = if ($receiptExisted) {
    [System.IO.File]::ReadAllBytes($receiptPath)
}
else {
    $null
}

try {
    Assert-NoReparseAncestor -Root $targetRoot -Candidate $stageRoot
    New-Item -ItemType Directory -Force -Path $stageSkillRoot | Out-Null
    Assert-NoReparseAncestor -Root $targetRoot -Candidate $stageSkillRoot
    foreach ($action in @($actions | Where-Object { $_.action -eq "copy" })) {
        Copy-Item -Recurse -Force -LiteralPath $action.source -Destination (Join-Path $stageSkillRoot $action.name)
    }
    if ($missingSkills.Count -gt 0) {
        Invoke-NetworkFallback -MissingSkills $missingSkills -StageRoot $stageRoot
    }

    foreach ($action in @($actions | Where-Object { $_.action -in @("copy", "network-copy") })) {
        $stagedPath = Join-Path $stageSkillRoot $action.name
        $stagedSkill = Join-Path $stagedPath "SKILL.md"
        if (-not (Test-Path -LiteralPath $stagedSkill -PathType Leaf)) {
            throw "E_STAGE_SKILL: Missing staged $($action.name)/SKILL.md."
        }
        if ($action.name -ne $SkillName) {
            $lockEntry = Get-LockEntry -Lock $lock -Name $action.name
            $actualHash = Get-Sha256 $stagedSkill
            if ($actualHash -ne ([string]$lockEntry.skillFileSha256).ToLowerInvariant()) {
                throw "E_STAGE_HASH: Staged '$($action.name)' does not match skills-lock.json."
            }
        }
        $action.digest = Get-DirectoryDigest $stagedPath
    }

    Assert-NoReparseAncestor -Root $targetRoot -Candidate $targetSkillRoot
    New-Item -ItemType Directory -Force -Path $targetSkillRoot | Out-Null
    Assert-NoReparseAncestor -Root $targetRoot -Candidate $targetSkillRoot
    foreach ($action in @($actions | Where-Object { $_.action -in @("copy", "network-copy") })) {
        Assert-SafeSkillName -Name $action.name
        Assert-NoReparseAncestor -Root $targetRoot -Candidate $action.destination
        if (Test-Path -LiteralPath $action.destination) {
            throw "E_TARGET_RACE: Install target appeared after validation: $($action.destination)"
        }
        Move-Item -LiteralPath (Join-Path $stageSkillRoot $action.name) -Destination $action.destination
        Assert-NoReparseAncestor -Root $targetRoot -Candidate $action.destination
        $committedDestinations += $action.destination
    }

    Assert-NoReparseAncestor -Root $targetRoot -Candidate $receiptPath
    $receipt = [ordered]@{
        schemaVersion = 1
        installedAt = [DateTimeOffset]::UtcNow.ToString("o")
        source = $sourceRoot
        targetSkillDirectory = $targetSkillRoot
        networkUsed = $missingSkills.Count -gt 0
        skills = @(
            $actions | ForEach-Object {
                [ordered]@{
                    name = $_.name
                    action = $_.action
                    digest = $_.digest
                    resolution = $_.resolution
                }
            }
        )
    }
    [System.IO.File]::WriteAllText(
        $receiptPath,
        ($receipt | ConvertTo-Json -Depth 8),
        $Utf8NoBom
    )
    $report.receipt = $receiptPath
}
catch {
    foreach ($destination in @($committedDestinations | Select-Object -Unique)) {
        Assert-NoReparseAncestor -Root $targetRoot -Candidate $destination
        if (-not (Test-DescendantPath -Candidate $destination -Parent $targetSkillRoot)) {
            throw "E_ROLLBACK_SCOPE: Refusing to roll back a path outside the target skill directory: $destination"
        }
        if (Test-Path -LiteralPath $destination) {
            Remove-Item -Recurse -Force -LiteralPath $destination
        }
    }
    if (-not $receiptExisted) {
        Assert-NoReparseAncestor -Root $targetRoot -Candidate $receiptPath
        if (Test-Path -LiteralPath $receiptPath) {
            Remove-Item -Force -LiteralPath $receiptPath
        }
    }
    else {
        Assert-NoReparseAncestor -Root $targetRoot -Candidate $receiptPath
        [System.IO.File]::WriteAllBytes($receiptPath, $previousReceipt)
    }
    throw
}
finally {
    if (Test-Path -LiteralPath $stageRoot) {
        Remove-Item -Recurse -Force -LiteralPath $stageRoot
    }
}

if ($Json) {
    $report | ConvertTo-Json -Depth 8
}
else {
    Write-Host "Project-local installation complete: $targetSkillRoot" -ForegroundColor Green
    $actions | ForEach-Object {
        Write-Host "  [$($_.action)] $($_.name)"
    }
}
