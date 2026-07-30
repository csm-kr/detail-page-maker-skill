[CmdletBinding()]
param(
  [string]$WorkspaceRoot,
  [int]$MaxProjects = 12
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
$behanceRoot = Join-Path $resolvedWorkspace '.workspace\learning\behance'
$inboxPath = Join-Path $behanceRoot 'inbox.md'
$reviewedPath = Join-Path $behanceRoot 'reviewed.md'
$errorPath = Join-Path $behanceRoot 'last-error.md'

New-Item -ItemType Directory -Path $behanceRoot -Force | Out-Null

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
    "behance-learning-refresh",
    title="Behance 상세페이지 학습 후보 수집",
)
context = None
payload = {"recording_path": str(recording_path), "projects": []}
try:
    context = new_background_tab(
        "https://www.behance.net/search/projects/%EC%83%81%EC%84%B8%ED%8E%98%EC%9D%B4%EC%A7%80"
    )
    if js("document.hasFocus()") is not False:
        raise RuntimeError("배경 탭 포커스 안전성 검사에 실패했습니다.")
    payload["projects"] = js("""
      (() => {
        const rows = [...document.querySelectorAll('a[href*="/gallery/"]')]
          .map((anchor) => ({
            href: anchor.href,
            title: (anchor.innerText || anchor.getAttribute('aria-label') || '').trim(),
          }))
          .filter((row) => row.href);
        const unique = new Map();
        for (const row of rows) {
          const url = new URL(row.href);
          const key = decodeURIComponent(url.pathname);
          const current = unique.get(key);
          if (!current || (!current.title && row.title)) {
            unique.set(key, {
              href: `${url.origin}${url.pathname}`,
              title: row.title,
            });
          }
        }
        return [...unique.values()];
      })()
    """)
finally:
    if context:
        close_background_tab(context)
    payload["recording_path"] = str(stop_recording())

print("__BEHANCE_LEARNING_JSON__" + json.dumps(payload, ensure_ascii=False))
'@

try {
  $rawOutput = $browserScript | & $browserHarness 2>&1
  $markerLine = $rawOutput |
    ForEach-Object { [string]$_ } |
    Where-Object { $_.StartsWith('__BEHANCE_LEARNING_JSON__') } |
    Select-Object -Last 1
  if (-not $markerLine) {
    throw "Browser Harness 결과에서 JSON 표식을 찾지 못했습니다.`n$($rawOutput -join "`n")"
  }

  $payload = $markerLine.Substring('__BEHANCE_LEARNING_JSON__'.Length) |
    ConvertFrom-Json
  $projects = @($payload.projects) | Select-Object -First $MaxProjects
  $recordingPath = [string]$payload.recording_path
  $recordingId = $recordingPath -replace '^.*[\\/]', ''
  $now = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId(
    [DateTimeOffset]::UtcNow,
    'Korea Standard Time'
  )

  $rows = foreach ($project in $projects) {
    $title = ([string]$project.title).Trim()
    if (-not $title) {
      $title = '제목 수동 확인'
    }
    $safeTitle = $title.Replace('|', '\|').Replace("`r", ' ').Replace("`n", ' ')
    "| [$safeTitle]($($project.href)) | 검토 대기 |"
  }

  $inbox = @(
    '# Behance 학습 후보 Inbox'
    ''
    "갱신 시각: $($now.ToString('yyyy-MM-dd HH:mm:ss zzz'))"
    "Browser Harness 녹화 ID: ``$recordingId``"
    "Browser Harness 원문 녹화: ``$recordingPath``"
    ''
    '이 파일은 URL 후보만 저장한다. 후보 수집만으로 스킬 규칙은 업데이트되지 않는다.'
    ''
    '| 후보 | 상태 |'
    '| --- | --- |'
    $rows
    ''
    '## 다음 단계'
    ''
    '1. 실제 상품 상세페이지인지 확인한다.'
    '2. 작품 고유 색·서체·레이아웃을 제외하고 반복 원리만 관찰한다.'
    '3. 세 사례 이상에서 반복된 원리를 `reviewed.md`의 LEARN 블록으로 기록한다.'
    '4. 다른 상품 또는 회귀 테스트로 검증한 뒤에만 reference로 승격한다.'
    '5. commercial.md 승격 또는 기각 뒤 이 파일·reviewed.md·녹화 원문을 삭제한다.'
    ''
  ) -join "`n"
  [System.IO.File]::WriteAllText($inboxPath, $inbox, $utf8)

  if (-not (Test-Path -LiteralPath $reviewedPath)) {
    $reviewed = @(
      '# Behance 검토 학습'
      ''
      'Inbox 후보를 실제로 열어 관찰한 뒤 아래 블록을 복사해 작성한다.'
      ''
      '### LEARN-BH-YYYYMMDD-001'
      ''
      '- `category`: commercial'
      '- `scope`: candidate-shared'
      '- `source_type`: behance'
      '- `source_urls`:'
      '- `observation`:'
      '- `evidence_paths`: inbox.md'
      '- `before_after`:'
      '- `risk_if_reused`:'
      '- `next_validation`:'
      '- `owner_reference`: commercial.md'
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
  Write-Output 'promotion=references/commercial.md'
  Write-Output "candidates=$($projects.Count)"
}
catch {
  $now = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId(
    [DateTimeOffset]::UtcNow,
    'Korea Standard Time'
  )
  $message = @(
    '# Behance 학습 후보 수집 실패'
    ''
    "실패 시각: $($now.ToString('yyyy-MM-dd HH:mm:ss zzz'))"
    ''
    '```text'
    $_.Exception.Message
    '```'
    ''
    '활성 reference와 승격 원장은 변경되지 않았다.'
    ''
  ) -join "`n"
  [System.IO.File]::WriteAllText($errorPath, $message, $utf8)
  throw
}
