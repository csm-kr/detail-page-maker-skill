[CmdletBinding()]
param(
  [string]$TaskName = 'DetailPageMaker-DesignStudyRefresh',
  [string]$WeeklyAt = '09:30'
)

$ErrorActionPreference = 'Stop'
$refreshScript = [System.IO.Path]::GetFullPath(
  (Join-Path $PSScriptRoot 'refresh-design-study.ps1')
)
if (-not (Test-Path -LiteralPath $refreshScript)) {
  throw "예약 실행 스크립트를 찾을 수 없습니다: $refreshScript"
}

$time = [DateTime]::ParseExact(
  $WeeklyAt,
  'HH:mm',
  [System.Globalization.CultureInfo]::InvariantCulture
)
$firstMonday = [DateTime]::Today
while ($firstMonday.DayOfWeek -ne [DayOfWeek]::Monday) {
  $firstMonday = $firstMonday.AddDays(1)
}
$firstRun = $firstMonday.Add($time.TimeOfDay)
if ($firstRun -le [DateTime]::Now) {
  $firstRun = $firstRun.AddDays(7)
}

$pwsh = (Get-Command powershell.exe).Source
$arguments = @(
  '-NoProfile'
  '-ExecutionPolicy'
  'Bypass'
  '-File'
  "`"$refreshScript`""
) -join ' '

$action = New-ScheduledTaskAction -Execute $pwsh -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At $firstRun
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Behance 상세페이지와 Taste Skill 후보만 갱신하며 상용 HTML은 수정하지 않습니다.' `
  -Force | Out-Null

$registered = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName

[pscustomobject]@{
  TaskName = $registered.TaskName
  State = $registered.State
  NextRunTime = $info.NextRunTime
  Script = $refreshScript
}
