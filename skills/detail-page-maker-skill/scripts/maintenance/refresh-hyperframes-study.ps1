[CmdletBinding()]
param(
  [string]$WorkspaceRoot,
  [int]$MaxSources = 24
)

$ErrorActionPreference = 'Stop'
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
  $WorkspaceRoot = (Get-Location).Path
}

$resolvedWorkspace = [System.IO.Path]::GetFullPath($WorkspaceRoot)
$learningRoot = Join-Path $resolvedWorkspace '.workspace\learning\gif'
$inboxPath = Join-Path $learningRoot 'inbox.md'
$reviewedPath = Join-Path $learningRoot 'reviewed.md'
$errorPath = Join-Path $learningRoot 'last-error.md'
New-Item -ItemType Directory -Path $learningRoot -Force | Out-Null

$browserHarness = (Get-Command browser-harness -ErrorAction SilentlyContinue).Source
if (-not $browserHarness) {
  throw 'browser-harness 실행 파일을 찾을 수 없습니다. scripts/setup-local.ps1을 실행하세요.'
}

$browserScript = @'
import json

def _attach_without_focus(target_id):
    wrapped = switch_tab
    inner = wrapped.__closure__[0].cell_contents if wrapped.__closure__ else wrapped
    private = inner.__globals__
    sid = cdp("Target.attachToTarget", targetId=target_id, flatten=True)["sessionId"]
    private["_send"]({
        "meta": "set_session",
        "session_id": sid,
        "target_id": target_id,
    })
    private["_mark_tab"]()
    return sid

def new_background_tab(url="about:blank"):
    previous = current_tab()["targetId"]
    target_id = cdp(
        "Target.createTarget",
        url="about:blank",
        background=True,
    )["targetId"]
    _attach_without_focus(target_id)
    if url != "about:blank":
        goto_url(url)
        wait_for_load()
    return {"targetId": target_id, "previousTargetId": previous}

def close_background_tab(context):
    cdp("Target.closeTarget", targetId=context["targetId"])
    _attach_without_focus(context["previousTargetId"])

recording_path = start_recording(
    "hyperframes-gif-learning-refresh",
    title="HyperFrames 공식 GIF 패턴 후보 수집",
)
context = None
payload = {"recording_path": str(recording_path), "sources": []}
try:
    context = new_background_tab(
        "https://api.github.com/repos/heygen-com/hyperframes/git/trees/main?recursive=1"
    )
    if js("document.hasFocus()") is not False:
        raise RuntimeError("배경 탭 포커스 안전성 검사에 실패했습니다.")
    tree = json.loads(js("document.body.innerText"))
    needles = (
        "mask-reveal",
        "clip-wipe",
        "transitions-push",
        "svg-path-draw",
        "nudge-curve",
        "reactive-displacement",
        "motion-blur-streak",
        "scale-swap-transition",
    )
    for row in tree.get("tree", []):
        path = row.get("path", "")
        if row.get("type") != "blob":
            continue
        if any(needle in path.lower() for needle in needles):
            payload["sources"].append({
                "path": path,
                "url": "https://github.com/heygen-com/hyperframes/blob/main/" + path,
            })
finally:
    if context:
        close_background_tab(context)
    payload["recording_path"] = str(stop_recording())

print("__HYPERFRAMES_LEARNING_JSON__" + json.dumps(payload, ensure_ascii=False))
'@

try {
  $rawOutput = $browserScript | & $browserHarness 2>&1
  $markerLine = $rawOutput |
    ForEach-Object { [string]$_ } |
    Where-Object { $_.StartsWith('__HYPERFRAMES_LEARNING_JSON__') } |
    Select-Object -Last 1
  if (-not $markerLine) {
    throw "Browser Harness 결과에서 JSON 표식을 찾지 못했습니다.`n$($rawOutput -join "`n")"
  }

  $payload = $markerLine.Substring('__HYPERFRAMES_LEARNING_JSON__'.Length) |
    ConvertFrom-Json
  $sources = @($payload.sources) | Select-Object -First $MaxSources
  $recordingPath = [string]$payload.recording_path
  $recordingId = $recordingPath -replace '^.*[\\/]', ''
  $now = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId(
    [DateTimeOffset]::UtcNow,
    'Korea Standard Time'
  )

  $rows = foreach ($source in $sources) {
    $safePath = ([string]$source.path).Replace('|', '\|')
    "| [$safePath]($($source.url)) | 검토 대기 |"
  }

  $inbox = @(
    '# HyperFrames GIF 학습 후보 Inbox'
    ''
    "갱신 시각: $($now.ToString('yyyy-MM-dd HH:mm:ss zzz'))"
    "Browser Harness 녹화 ID: ``$recordingId``"
    "Browser Harness 원문 녹화: ``$recordingPath``"
    '공식 저장소: `heygen-com/hyperframes`'
    ''
    '이 파일은 공식 패턴 후보만 저장한다. 수집만으로 motion.md를 수정하지 않는다.'
    ''
    '| 후보 | 상태 |'
    '| --- | --- |'
    $rows
    ''
    '## 다음 단계'
    ''
    '1. 주장과 직접 연결할 수 있는 마스크·경로·슬라이드·단계 패턴만 고른다.'
    '2. 예제의 카피·색·좌표는 복사하지 않고 구현 원리만 reviewed.md에 기록한다.'
    '3. 실제 제품 GIF 1개 이상에서 strict·frame-check·첫/중간/끝 프레임을 검증한다.'
    '4. motion.md의 MR 규칙으로 승격하거나 기각한다.'
    '5. 승격 또는 기각 뒤 이 파일·reviewed.md·후보 보고서·녹화 원문을 삭제한다.'
    ''
  ) -join "`n"
  [System.IO.File]::WriteAllText($inboxPath, $inbox, $utf8)

  if (-not (Test-Path -LiteralPath $reviewedPath)) {
    $reviewed = @(
      '# HyperFrames GIF 검토 학습'
      ''
      '공식 예제를 확인하고 현재 제품 GIF에서 검증한 뒤 아래 블록을 작성한다.'
      ''
      '### LEARN-GIF-YYYYMMDD-001'
      ''
      '- `category`: motion'
      '- `scope`: candidate-shared'
      '- `source_type`: hyperframes'
      '- `source_urls`:'
      '- `observation`:'
      '- `evidence_paths`: inbox.md'
      '- `before_after`:'
      '- `risk_if_reused`:'
      '- `next_validation`:'
      '- `owner_reference`: motion.md'
      "- `updated_at`: $($now.ToString('yyyy-MM-dd'))"
      '- `promotion_status`: local'
      ''
    ) -join "`n"
    [System.IO.File]::WriteAllText($reviewedPath, $reviewed, $utf8)
  }

  if (Test-Path -LiteralPath $errorPath) {
    Remove-Item -LiteralPath $errorPath -Force
  }
  Write-Output "updated=$inboxPath"
  Write-Output "review=$reviewedPath"
  Write-Output 'promotion=references/motion.md'
  Write-Output "candidates=$($sources.Count)"
}
catch {
  $now = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId(
    [DateTimeOffset]::UtcNow,
    'Korea Standard Time'
  )
  $message = @(
    '# HyperFrames GIF 학습 후보 수집 실패'
    ''
    "실패 시각: $($now.ToString('yyyy-MM-dd HH:mm:ss zzz'))"
    ''
    '```text'
    $_.Exception.Message
    '```'
    ''
    'motion.md와 승격 원장은 변경되지 않았다.'
    ''
  ) -join "`n"
  [System.IO.File]::WriteAllText($errorPath, $message, $utf8)
  throw
}
