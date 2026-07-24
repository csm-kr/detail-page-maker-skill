[CmdletBinding()]
param(
  [string]$ProjectRoot,
  [int]$MaxBehanceProjects = 12
)

$ErrorActionPreference = 'Stop'
$scriptUtf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $scriptUtf8
$OutputEncoding = $scriptUtf8
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}
$resolvedRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
$researchDir = Join-Path $resolvedRoot 'research\continuous-design-study'
$queuePath = Join-Path $researchDir 'queue.md'
$statePath = Join-Path $researchDir 'state.json'
$errorPath = Join-Path $researchDir 'last-error.md'

New-Item -ItemType Directory -Path $researchDir -Force | Out-Null

$browserHarness = (Get-Command browser-harness -ErrorAction SilentlyContinue).Source
if (-not $browserHarness) {
  $fallbackHarness = Join-Path $env:USERPROFILE '.local\bin\browser-harness.exe'
  if (Test-Path -LiteralPath $fallbackHarness) {
    $browserHarness = $fallbackHarness
  }
}
if (-not $browserHarness) {
  throw 'browser-harness 실행 파일을 찾을 수 없습니다.'
}

$browserScript = @'
import json

started = list_tabs()
started_ids = {tab["target_id"] for tab in started}
recording_path = start_recording(
    "scheduled-design-study-refresh",
    title="Behance 상세페이지와 Taste Skill 정기 검토 큐",
)

payload = {
    "recording_path": str(recording_path),
    "behance": [],
    "taste": {},
}

try:
    new_tab("https://www.behance.net/search/projects/%EC%83%81%EC%84%B8%ED%8E%98%EC%9D%B4%EC%A7%80")
    wait_for_load()
    cards = js("""
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
            unique.set(key, { href: `${url.origin}${url.pathname}`, title: row.title });
          }
        }
        return [...unique.values()];
      })()
    """)
    payload["behance"] = cards

    new_tab("https://www.tasteskill.dev/changelog")
    wait_for_load()
    payload["taste"] = js("""
      (() => {
        const headings = [...document.querySelectorAll('h1,h2,h3')]
          .map((node) => node.innerText.trim())
          .filter(Boolean);
        const text = document.body.innerText;
        const latestHeading = headings.find((heading) => /^v\\d/i.test(heading)) || headings[0] || '';
        const monthMatch = text.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+20\\d{2}/i);
        return {
          url: location.href,
          latest_heading: latestHeading,
          published_label: monthMatch ? monthMatch[0] : '',
          signal: text.includes('v2 (experimental)') ? 'v2 experimental' : latestHeading,
        };
      })()
    """)
finally:
    payload["recording_path"] = str(stop_recording())
    opened = [tab for tab in list_tabs() if tab["target_id"] not in started_ids]
    for tab in opened:
        try:
            close_tab(tab["target_id"])
        except Exception:
            pass

print("__DESIGN_REFRESH_JSON__" + json.dumps(payload, ensure_ascii=False))
'@

try {
  $rawOutput = $browserScript | & $browserHarness 2>&1
  $markerLine = $rawOutput |
    ForEach-Object { [string]$_ } |
    Where-Object { $_.StartsWith('__DESIGN_REFRESH_JSON__') } |
    Select-Object -Last 1

  if (-not $markerLine) {
    throw "Browser Harness 결과에서 JSON 표식을 찾지 못했습니다.`n$($rawOutput -join "`n")"
  }

  $payload = $markerLine.Substring('__DESIGN_REFRESH_JSON__'.Length) | ConvertFrom-Json
  $now = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId(
    [DateTimeOffset]::UtcNow,
    'Korea Standard Time'
  )

  $projects = @($payload.behance) | Select-Object -First $MaxBehanceProjects
  $tableRows = foreach ($project in $projects) {
    $title = ([string]$project.title).Trim()
    if (-not $title) {
      $title = '제목은 수동 확인'
    }
    $safeTitle = $title.Replace('|', '\|').Replace("`r", ' ').Replace("`n", ' ')
    $category = if ($safeTitle -match '뷰티|헤어|앰플|클렌저|팩') {
      '뷰티'
    } elseif ($safeTitle -match '식품|샐러드|요거트|푸드|멜론') {
      '식품'
    } elseif ($safeTitle -match 'Portfolio|포트폴리오') {
      '포트폴리오'
    } else {
      '상세페이지'
    }
    $hypothesis = switch ($category) {
      '뷰티' { '소재 매크로와 효능 카피 사이에 실물·근거 블록이 어떻게 복귀하는지 확인' }
      '식품' { '식재료 장면, 문제 제기, 제품 증거의 리듬을 편집 가능한 HTML로 분리할 수 있는지 확인' }
      '포트폴리오' { '개별 상품 사례만 골라 섹션 리듬과 정보 밀도를 비교하고 포트폴리오 장식은 제외' }
      default { '첫 화면 대비, 문제→해결 연결, 제품·치수·GIF로 전환 가능한 모듈을 확인' }
    }
    "| [$safeTitle]($($project.href)) | $category | $hypothesis | 검토 대기 |"
  }

  $queue = @(
    '# 정기 디자인 학습 검토 큐'
    ''
    "갱신 시각: $($now.ToString('yyyy-MM-dd HH:mm:ss zzz'))"
    "Browser Harness 녹화: ``$($payload.recording_path)``"
    ''
    '이 파일은 후보와 검토 가설만 갱신한다. 상용 HTML, 상품 사실, 영구 규약은 자동 수정하지 않는다.'
    ''
    '## Behance 상세페이지 후보'
    ''
    '| 후보 | 분류 | 검토 가설 | 상태 |'
    '|---|---|---|---|'
    $tableRows
    ''
    '## Taste Skill 변경 신호'
    ''
    "- 페이지: $($payload.taste.url)"
    "- 최신 표기: $($payload.taste.latest_heading)"
    "- 게시 표기: $($payload.taste.published_label)"
    "- 감지 신호: $($payload.taste.signal)"
    ''
    '## 사람 검토 게이트'
    ''
    '- [ ] 실제 상품 상세페이지 사례인가'
    '- [ ] 제품 동일성과 주장 근거를 해치지 않는가'
    '- [ ] 카피·이미지·치수·모션을 수정 가능한 HTML로 분리할 수 있는가'
    '- [ ] 서로 다른 우수 사례 3개 이상에서 같은 규칙이 재현되는가'
    '- [ ] 현재 상품 A/B에서 점수를 높이고 하드 실패가 없는가'
    ''
    '통과한 규칙만 `study-desing-skill.md`에 `candidate`로 기록한다.'
    ''
  ) -join "`n"

  $state = [ordered]@{
    schema_version = '1.0'
    last_run_kst = $now.ToString('o')
    recording_path = [string]$payload.recording_path
    behance_count = $projects.Count
    behance_projects = $projects
    taste = $payload.taste
  } | ConvertTo-Json -Depth 8

  $utf8 = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($queuePath, $queue, $utf8)
  [System.IO.File]::WriteAllText($statePath, $state, $utf8)
  if (Test-Path -LiteralPath $errorPath) {
    Remove-Item -LiteralPath $errorPath -Force
  }

  Write-Output "updated=$queuePath"
  Write-Output "candidates=$($projects.Count)"
  Write-Output "recording=$($payload.recording_path)"
}
catch {
  $now = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId(
    [DateTimeOffset]::UtcNow,
    'Korea Standard Time'
  )
  $message = @(
    '# 정기 디자인 학습 갱신 실패'
    ''
    "실패 시각: $($now.ToString('yyyy-MM-dd HH:mm:ss zzz'))"
    ''
    '```text'
    $_.Exception.Message
    '```'
    ''
    '상용 HTML과 영구 규약은 변경되지 않았다. Chrome 원격 디버깅과 Browser Harness 연결을 확인한 뒤 수동 재실행한다.'
    ''
  ) -join "`n"
  [System.IO.File]::WriteAllText(
    $errorPath,
    $message,
    [System.Text.UTF8Encoding]::new($false)
  )
  throw
}
