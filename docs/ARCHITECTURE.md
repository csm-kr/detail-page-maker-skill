# ARCHITECTURE — detail-page 스킬 재구성

**이 문서가 게이트 표의 유일한 출처다.** 다른 문서는 링크만 한다.
같은 표를 두 곳에 적으면 갈린다 — 그것이 2회차 실패의 형태였다.

---

## 1. 구성 요소

```text
detail-page-init                  워크스페이스 1회. 환경 인터뷰 + 로컬 세팅 + 정리
detail-page-orchestrator          제작 진입점. 순서·상태·검사·보고·트래커를 소유
  ├─ detail-page-g1-fact          공급처·사진에서 사실 잠금        → SSOT.md
  ├─ detail-page-g2-reference     기준작 판독                      → flow-map.md
  ├─ detail-page-g3-plan          Lean Page Plan (화면 문자열 전량) → flow-plan.json
  ├─ detail-page-g4-mockup        templates.md 조립 → 목업          → DESIGN-GUIDE.md, harvest.md
  ├─ detail-page-g5-inject        가이드를 플랜에 주입              → flow-plan.json 갱신
  ├─ detail-page-g6-stills        스틸 생성 + 원본 해상도 선별      → 스틸 N장, selection.json
  ├─ detail-page-g7-layout        섹션별 레이아웃 기획              → page-plan.md
  ├─ detail-page-g8-motion        brief → 컴포지션 재작성 → GIF     → 컴포지션 N, GIF N
  ├─ detail-page-g9-build         780px 조립 + 앵커 스냅샷          → detail-page.html, anchors.json
  ├─ detail-page-g10-qa           strict-media + 포맷·용량          → QA 리포트
  └─ detail-page-g11-deliver      authoring·Studio·Wing·report      → report.md
```

스킬 13개. `G0`은 스킬이 아니라 오케스트레이터의 `start` 명령이다.
`detail-page-init`은 사용자가 `$init`이라 부르는 단계다 — Claude Code에 `/init` 내장
명령이 있어 그 이름을 쓸 수 없다 ([ADR-0002](adr/0002-단계를-개별-스킬로-분리한다.md)).

### 역할 분담

| | init | 오케스트레이터 | 단계 스킬 |
| --- | --- | --- | --- |
| 환경 인터뷰·세팅·정리 | **소유** | 안 함 | 안 함 |
| 게이트 정의·순서 | — | **소유** (`gates.mjs`) | 참조만 |
| 게이트 상태·시간 | — | **소유** (`gates.json`) | 기록 요청만 |
| 해시 체인·무효화 전파 | — | **소유** | — |
| 트래커 | — | **소유** (`track`) | — |
| 실제 작업 | 세팅만 | **안 함** | **소유** (`run.mjs`) |
| 산출물 판정 | — | 호출 | **제공** (`check.mjs`) |
| 번들 의존 스킬 | 설치 | 소유(한 벌) | 경유 사용 |

**오케스트레이터는 일을 하지 않는다.** 순서와 판정만 한다. 이 분리가 없으면 다시
"한 스킬이 다 하는데 무엇을 안 했는지 모르는" 상태로 돌아간다.

---

## 2. 상태 파일

| 파일 | 위치 | 소유 | 내용 |
| --- | --- | --- | --- |
| `env.answers.json` | 워크스페이스 | init | 인터뷰 답. 두 번 묻지 않기 위한 것 |
| `env.lock.json` | `work/` (워크스페이스) | init | 런타임·설치·정책·정리 기록 |
| `gates.json` | `<프로젝트>/work/` | 오케스트레이터 | 게이트별 상태·입출력 해시·시각·수행 호스트 |
| `inputs.lock.json` | `<프로젝트>/work/` | 오케스트레이터 | 두 URL, 실물 사진, 수집 캡처의 해시·수집 시각·크기 |
| `gates.history.json` | `work/` (워크스페이스) | 오케스트레이터 | 회차별 통과·결함·소요. **완화 판단의 근거.** `report`가 회차마다 upsert |
| `active.json` | `work/` (워크스페이스) | 오케스트레이터 | 활성 회차 포인터. `start`가 쓴다. 옛 회차를 남겨 둬도 명령마다 고르지 않게 한다 |
| `killed.json` | `<프로젝트>/work/` | 각 단계 | 죽인 프로세스 `{pid, cmd, cwd, killed_at, by_gate}`. G11이 복구 |

사람이 열어 볼 파일이므로 `work/` 아래 평문 JSON에 둔다.

### `env.lock.json`

```json
{
  "schema_version": "1.0",
  "initialized_at": "2026-08-05T…",
  "ready": true,
  "blocked": [],
  "hosts": ["claude-code", "codex"],
  "install": {
    "mode": "junction",
    "source": ".skill-src/skills",
    "targets": { "claude-code": ".claude/skills", "codex": ".agents/skills" },
    "skills": 13, "skills_list": ["detail-page-g1-fact", "…"], "sha256": "…"
  },
  "runtimes": {
    "node": "22.15.0", "python": "python", "ffmpeg": "7.1",
    "hyperframes": { "mode": "project-local", "path": "motion/", "pin": "0.7.90" },
    "font": "runtime/fonts/NotoSansKR-VF.ttf"
  },
  "browser": { "cdp": "http://127.0.0.1:9223", "chatgpt_login": true },
  "auth": { "god_tibo": { "source": "~/.codex/auth.json", "present": true, "verified": "dry-run-ok" } },
  "policy": {
    "host_install": "forbidden", "project_root": "./projects",
    "model_face": "<인터뷰 응답. 기본값 없음>",
    "media_budget_mb": 12, "photo_format": "webp-q85",
    "capture_max_age_days": 7, "wallclock_target_min": 95
  },
  "relaxations": [],
  "pruned": { "at": "…", "trash": ".trash/2026-08-05T12-40-11/", "entries": 14, "skipped": 0 },
  "host_dirs_clean": true
}
```

`policy` 의 값은 **기록된 인터뷰 답**이다. 위 `model_face` 는 예시일 뿐 추천값이 아니고,
코드에 그 문자열이 기본값으로 존재하지 않는다 (테스트로 고정).

`ready` 는 탐지에서 막히는 것이 하나도 없을 때만 `true` 다. `false` 면 `blocked` 에 이유가
남고 **`orchestrate start` 가 `ENV_NOT_READY` 로 거부한다.** init 은 사용자만 할 수 있는 것
(ChatGPT 로그인 · `codex login`)이나 시스템 설치(ffmpeg)를 대신 하지 않는다 — 대신 그
상태로 제작이 시작되지 않게 한다.

---

## 3. 게이트 표 (정본)

| 게이트 | 스킬 | 선행 | 주체 | 예산 | 산출물 | 거부 조건 |
| ---: | --- | --- | --- | ---: | --- | --- |
| **INIT** | `detail-page-init` | — | 혼합 | — | `work/env.lock.json` | 런타임·인증·폰트 결여 · **호스트 홈 오염** · `model_face` 미응답 |
| **G0** | (orchestrator `start`) | INIT | 스크립트 | 1분 | `gates.json`, `inputs.lock.json` | 두 URL 중 하나 없음 · env.lock 해시 불일치 · `policy.model_face` 결여 |
| **G1** | `g1-fact` | G0 | 에이전트 | 8분 | `work/SSOT.md` | 공급처 캡처가 `capture_max_age_days` 초과 · 사진을 원본 해상도로 열지 않음 |
| **G2** | `g2-reference` | G0 | 에이전트 | 10분 | `work/flow-map.md` | 기준작 캡처 해시가 lock에 없음 · 4개 절(섹션 순서 / 고객 질문 / 증명 방식 / **디자인 분위기**) 결여 · 분위기 절 실측 hex 3개 미만 |
| **G3** | `g3-plan` | G1, G2 | 에이전트 | 12분 | `work/flow-plan.draft.json` | 섹션 집합이 flow-map과 불일치 · **화면 문자열이 플랜 밖** · 금지 표현·미근거 수치 · `method` 미지정 |
| **G4** | `g4-mockup` | G3 | 에이전트 | 23분 | 목업, `variants/`, `DESIGN-GUIDE.md`, **`harvest.md`**, `prompts/` | 템플릿 블록 누락 · **무드 레퍼런스 0장** · 섹션↔파일 1:1 분류 기록 없음 · `harvest.md` 없음 · 얼굴 정책 미주입 |
| **G5** | `g5-inject` | G4 | 혼합 | 2분 | `flow-plan.json` (발행 플랜) | still 프롬프트에 가이드 배경 키워드·브랜드 hex 부재 · 주입 전후 컷 집합 불일치 |
| **G6** | `g6-stills` | G5 | 혼합 | 12분 | 스틸 N장, `selection.json` | 컷마다 레퍼런스 두 축 미충족 · **원본 해상도 검사 기록 없음** · 탈락 컷 재생성 job 없음 · 얼굴 정책 위반 컷이 발행 목록에 있음 |
| **G7** | `g7-layout` | G4, G6 | 에이전트 | 8분 | `work/page-plan.md` | 섹션 수 불일치 · **목업 이탈에 이유 없음** · 컴포넌트별 수단 열 결여 · `harvest.md` 미참조 |
| **G8** | `g8-motion` | G7 | 혼합 | 10분 | `work/comps/index.json` (+ 컴포지션·GIF) | brief↔컴포지션 수 불일치 · **자막 용어가 페이지 용어 집합 밖** · `method` 불일치 · GIF가 컴포지션보다 오래됨 |
| **G9** | `g9-build` | G7 | 스크립트 | 6분 | `output/detail-page.html`, `work/anchors.json` | **HTML에 플랜 밖의 문자열** · `:root` 밖의 hex · 가이드 구성 요소 누락 · 앵커 이미지 해시 불일치 |
| **G10** | `g10-qa` | G8, G9 | 스크립트 | 3분 | `work/qa-report.json` | `strict-media` 실패 · 사진 포맷 불일치 · 미디어 총량 초과 |
| **G11** | `g11-deliver` | G10 | 혼합 | 5분 | `work/report.md` (+ `work/delivery.json`) | `killed.json`의 서버 미복구 · Studio 미확인 · Wing 산출물 없음 |

예산 합계는 병렬을 반영해 **86분**이고 목표 95분에 9분 여유가 있다
([ADR-0007](adr/0007-벽시계-95분과-완화-규칙.md)).

### 초안 플랜과 발행 플랜을 나눈 이유

`G3` 과 `G5` 가 같은 파일을 쓰면 **순환이 생긴다.** G4 의 입력이 플랜이므로, G5 가 플랜을
고치는 순간 G4 의 입력 해시가 바뀌어 G4 가 무효화되고, G4 를 다시 돌리면 G5 가 다시
무효화된다. 무효화 전파를 구현하면서 드러났다.

```text
G3 → work/flow-plan.draft.json → G4 (초안을 읽는다)
G4 → DESIGN-GUIDE.md · harvest.md
G5 → flow-plan.json  (발행 플랜. G6·G7·G8·G9 가 읽는다)
```

부수 효과가 좋다 — **주입을 건너뛰면 발행 플랜이 아예 없다.** 2회차에는 주입을 건너뛴
플랜으로 스틸 30장이 생성됐는데, 이 구조에서는 그 상태가 파일의 부재로 드러난다.

### 구 → 신 대응

| 기존 | 새 | 변경 이유 |
| --- | --- | --- |
| — | **INIT** | 신설. 환경·로컬 세팅·정리를 앞에서 잠근다 |
| G0 | G0 + G1 | 진입과 사실 잠금 분리 |
| G1 | **G2 + G3** | **기준작 판독을 독립 게이트로** — 2회차 최대 누락 |
| G1.5 | **G4 + G5** | **무드 주입을 게이트로** 승격 |
| G2 | G6 | **선별**을 통과 조건으로 승격 |
| — | **G7** | 신설. 섹션별 레이아웃 기획 |
| G3 | G8 | brief↔구현 대조 추가 |
| G4 | G9 + G10 | 조립과 QA 분리, 앵커·포맷 조건 |
| G5 | **G11** | Studio·Wing까지가 완료 |

`G1.5` 같은 소수점을 없앤다. 소수점은 "끼워 넣은 단계"라는 신호이고, 실제로 그 단계의
후속(무드 주입)이 2회차에 통째로 누락됐다.

---

## 4. 의존 그래프와 병렬

```text
INIT → G0 ─┬─ G1 ─┬─ G3 → G4 → G5 → G6 ─┐
           └─ G2 ─┘                      ├─ G7 ─┬─ G8 ─┬─ G10 → G11
                                         │      └─ G9 ─┘
                                    (G4도 G7의 선행)
```

| 관계 | 근거 |
| --- | --- |
| **G1 ∥ G2** | 사실 추출과 기준작 판독은 입력이 다르다. ~8분 절약 |
| **G8 ∥ G9** | G9는 `page-plan.md`(G7)만 필요하고 GIF **파일 존재는 G10이 잡는다.** GIF 렌더를 임계경로에서 뺀다. ~6분 절약 ([ADR-0009](adr/0009-G8과-G9를-병렬로-돌린다.md)) |
| G3 → G4 → G5 → G6 직렬 필수 | 분위기·주입 의존. 2회차에 스틸을 백그라운드로 앞당긴 것이 G5 누락의 직접 원인이었다 |
| G10이 배리어 | G8·G9 양쪽 산출물을 함께 봐야 `ASSET_MISSING`을 잡는다 |

**게이트 내부 fan-out이 게이트 간 병렬보다 이득이 크다.**

| 단계 | 내부 병렬 | 현재 |
| --- | --- | --- |
| G6 스틸 | god-tibo가 32 workers 동시 | 이미 최대 |
| G8 GIF | 10개를 별도 프로세스로 동시 렌더 | **아직 순차** — 여기가 남은 이득 |
| G4 목업 | **불가.** 병렬 탭은 다른 대화가 되어 톤이 갈린다 | 4장씩 한 대화 유지 |

`run --parallel`은 **선행 게이트가 `○`인 단계만** 동시에 띄운다.

---

## 5. 수행 주체 — 완전 자동인 게이트는 12개 중 2개뿐

**스킬은 에이전트가 읽는 것이고, 스크립트가 스킬을 호출할 수는 없다.** 여기를 흐리면
`run`이 전부 돌려 준다고 오해한다.

| 주체 | 게이트 | 나뉘는 지점 |
| --- | --- | --- |
| **에이전트** | G1, G2, G3, G4, G7 | 판독·기획·카피·프롬프트. 전부 판단이다 |
| **스크립트** | G9, G10 | 조립과 검사. 결정적이다 |
| **혼합** | G5, G6, G8, G11 | 아래 |

| 혼합 게이트 | 스크립트가 하는 것 | 에이전트·사람이 하는 것 |
| --- | --- | --- |
| G5 | 무드 블록 주입, `validate-plan` 재실행 | 가이드의 무드 문장을 어느 컷에 붙일지 |
| G6 | batch 생성, 발행 파일명 매핑 | **원본 해상도로 보고 탈락시키는 선별** |
| G8 | 렌더, GIF 검증, 신선도 비교 | **컴포지션 재작성** (2회차에 여기를 건너뛰었다) |
| G11 | Wing export, 죽인 서버 복구 | Studio 확인 |

각 게이트의 `run.mjs`는 `"actor": "agent" | "script" | "mixed"`를 선언하고, 판단이 필요한
지점에서 **작업하지 않고 체크리스트와 참고 문서 경로만 출력하며 멈춘다.**

이 사실이 게이트 엔진의 필요성을 줄이는 것이 아니라 **키운다.** 12개 중 10개가 판단을
거치므로 순서를 문서에 맡기면 회차마다 갈린다. 판정은 언제나 `check.mjs`가 하고 —
주체가 누구든 **통과 조건은 같다.**

---

## 6. 강제 장치 7개

문서에 "해라"라고 쓰는 것으로는 안 된다. 2회차가 증거다
([ADR-0001](adr/0001-게이트-순서를-스크립트가-소유한다.md)).

### 6.1 선행 게이트 거부

모든 단계 스킬 `scripts/run.mjs`의 첫 줄.

```js
requireEnv();                          // env.lock.json 없으면 exit 1
requireGates(project, ["G2", "G3"]);   // 미통과면 exit 1, 부족한 게이트를 출력
```

사용자가 `detail-page-g6-stills`를 직접 불러도 거부된다.

### 6.2 산출물 해시 체인

```json
{ "G3": { "passed_at": "…", "by_host": "claude-code",
          "started_at": "…", "ended_at": "…",
          "inputs":  { "work/flow-map.md": "sha256:…", "work/SSOT.md": "sha256:…" },
          "outputs": { "flow-plan.json": "sha256:…" } } }
```

`flow-map.md` 없이 `flow-plan.json`을 만들어 두면 통과 기록을 쓸 수 없다.

### 6.3 무효화 전파 — 가장 강한 장치

`gates.json`을 읽을 때마다 기록된 입력 해시와 현재 해시를 비교해, 다르면 그 게이트와
**모든 하류를 `✗`로 되돌린다.** 2회차 결함 대부분이 "상류를 바꿨는데 하류를 다시 안
돌린 것"이었다.

```text
DESIGN-GUIDE.md 수정      → G5 ✗ → G6~G11 ✗
structure-full.png 재생성 → G9 ✗ (앵커 해시 불일치)
gif_briefs 수정           → G8 ✗
env.lock.json 무효         → G0~G11 ✗
```

해시 대상은 **의미 있는 산출물만**이다 (플랜·가이드·앵커 이미지·brief). 로그와 중간물을
넣으면 과민해져 계속 `✗`로 되돌아간다.

### 6.4 우회 경로 제거

루트 `work/`의 11개 스크립트를 해당 단계 스킬 안으로 옮기고 루트에 직접 실행 가능한
빌드 스크립트를 남기지 않는다. `build-all.mjs`를 없애고 `run`이 게이트를 걸어간다.
목록은 [`SKILL-UPDATES.md`](SKILL-UPDATES.md).

### 6.5 `--force`를 만들지 않는다

우회 플래그를 처음부터 두지 않는다. 게이트가 틀렸으면 게이트를 고친다.
2회차에 내가 만든 테스트를 통과시키는 최소한만 한 전례가 있다 — 탈출구를 주면 그 길로 간다.

### 6.6 완료 어휘 잠금

`report`만 완료를 선언할 수 있고 `✗`가 하나라도 있으면 **exit 1**이다. 오케스트레이터
`SKILL.md`에 규칙으로 박는다: **"`report`가 exit 0이 아니면 '완료'라는 단어를 쓰지 않고
표를 그대로 붙인다."**

### 6.7 시간 기록 강제

`gate <id> --start` 없이 `--pass`를 부르면 거부된다. 시간이 없으면 예산도 완화 판단도
근거를 잃는다.

---

## 7. 트래커 — `orchestrator track`

**R13.** 어느 단계인지 전체 맵에서 눈에 보이게 한다. 로컬 HTML 대시보드다
([ADR-0006](adr/0006-트래커는-로컬-HTML-대시보드다.md)).

```text
orchestrator track  →  http://127.0.0.1:9310

 팔토시  경과 42:18 / 목표 95:00                 7/13
─────────────────────────────────────────────────────
 INIT ○──G0 ○──┬─ G1 ○ ─┬─ G3 ○ ── G4 ○
               └─ G2 ○ ─┘            │
                                     ▼
   G7 ✗ ◀── G6 ⟨⟨ 진행중 21:04 ⟩⟩ ◀── G5 ○
    │              ▲ 발광·맥동
    ├─▶ G8 ✗ ─┐
    └─▶ G9 ✗ ─┴─▶ G10 ✗ ─▶ G11 ✗
─────────────────────────────────────────────────────
 G6  스틸 30장 생성 + 원본 해상도 선별
     ▸ 예산 12분 · 경과 21:04  ⚠ 초과
     ▸ 남은 검사: selection.json 없음
                  checked_at_full_res 0/30
```

### 구현

| 항목 | 방식 |
| --- | --- |
| 서버 | node `http` 하나. 외부 의존 0. 기존 `lean-studio-server.mjs` 패턴 재사용 |
| 포트 | 9310 고정, 사용 중이면 +1씩 탐색 |
| 데이터 | `gates.json` + `env.lock.json`. **트래커는 상태를 만들지 않고 읽기만 한다** |
| 갱신 | `fs.watch` → SSE(`EventSource`). 폴링 없음 |
| 스타일 | 인라인 CSS. `@keyframes`로 진행 중 노드 `box-shadow` 맥동 |
| 종료 | `Ctrl+C`. PID를 `killed.json`에 남기지 않는다(스스로 띄운 것) |

### 노드 상태 5종

| 표시 | 뜻 | 시각 |
| --- | --- | --- |
| `✗` | 미착수 | 회색 외곽선 |
| `⟨⟨ ⟩⟩` | 진행 중 | **브랜드 컬러 발광 + 맥동** |
| `○` | 통과 | 채워진 원 |
| `⚠` | 무효화됨 (상류 해시 변경) | 노랑 + 원인 게이트 화살표 강조 |
| `⛔` | 거부 | 빨강 + 부족 항목 목록 |

### 상세 패널

노드를 클릭하면 그 게이트의 **거부 이유와 부족 항목**을 보여준다. `/check/<id>` 가 그 자리에서
`check.mjs` 를 돌리므로 사람이 보는 것과 게이트가 판정하는 것이 **같다.** 매 갱신마다 돌리지
않는 이유는 파일을 계속 읽게 되기 때문이다.

**구현 상태 — 3개 GREEN** (`scripts/tests/track.test.mjs`). 그중 하나가
"`gates.json` 을 쓰지 않는다" 다 — 트래커가 상태를 만들면 상태가 두 곳에 생겨 갈린다.

### 예산 표시

경과 > 예산이면 `⚠`를 붙이지만 **막지 않는다.** 시간은 관찰 대상이고 게이트가 아니다.
막으면 "시간 때문에 검사를 건너뛴다"가 정당화된다.

---

## 8. 설치 레이아웃 — 원본은 한 벌

**R9.** 현재 세 곳에 109개 파일씩 동일 사본이 있고 2회차에 이것을 손으로 동기화했다.
([ADR-0003](adr/0003-스킬-원본은-한-벌이다.md))

```text
.skill-src/skills/          ← 원본. git 저장소(브랜치 assets-default-square). 편집은 여기만
  ↓ init이 연결
.claude/skills/             ← Claude Code가 읽는다
.agents/skills/             ← Codex가 읽는다
```

| 모드 | 방법 | 조건 |
| --- | --- | --- |
| **junction** (우선) | `mklink /J` 로 스킬별 디렉터리 연결. 관리자 권한 불필요 | init이 연결 후 **두 호스트가 실제로 스킬을 인식하는지 검증**한다 |
| **복사** (폴백) | 파일 복사 + 해시 기록 | junction 인식 실패 시. 원본 수정 후 `init --sync` 필요 |

어느 모드인지 `env.lock.json.install.mode`에 기록한다. 두 호스트의 스킬 탐색이 junction을
따르는지는 **미검증**이므로 검증 실패를 정상 경로로 설계한다.

### 파일 트리 (재구성 후)

실제 트리 (2026-08-05 구현 후).

```text
.skill-src/skills/
├── detail-page-init/
│   ├── SKILL.md
│   └── scripts/
│       ├── init.mjs                 --apply · --prune · --install-mode
│       ├── lib/{detect,interview,install,vendor,prune}.mjs
│       └── tests/init.test.mjs      12개 GREEN
├── detail-page-orchestrator/
│   ├── SKILL.md
│   ├── dependencies.json            host_skills 제거 · host_auth 신설
│   ├── agents/openai.yaml           Codex 카탈로그
│   ├── assets/project-template/     start 가 쓴다
│   ├── policies/lean-page-plan-v1.json
│   ├── scripts/
│   │   ├── orchestrate.mjs          start · gates · gate · lock · run · report · doctor
│   │   ├── track.mjs                트래커 서버
│   │   ├── lib/
│   │   │   ├── gates.mjs            ← 게이트 정의의 유일한 출처
│   │   │   ├── gates-state.mjs      무효화 전파 · 시간 기록
│   │   │   ├── hashchain.mjs  project.mjs  env.mjs
│   │   │   ├── check.mjs  checkkit.mjs  stage.mjs
│   │   │   ├── cdp.mjs  new-project.mjs
│   │   ├── lean-{contract,html-qa,studio-server,wing-export}.mjs
│   │   ├── e2e.mjs · runtime/cloudflare-*.mjs
│   │   └── tests/                   order 16 · track 3 · 기존 19
│   ├── references/{workflow.md, claude-code.md, codex.md, install.md}
│   └── .agents/skills/…             번들 의존 5개 — 여기 한 벌만 (79개 파일)
├── detail-page-g1-fact/       references/commercial.md
├── detail-page-g2-reference/  references/flow-map-guide.md
├── detail-page-g3-plan/
├── detail-page-g4-mockup/     references/{templates.md, design-reference.md} · assets/
├── detail-page-g5-inject/
├── detail-page-g6-stills/     references/assets.md
├── detail-page-g7-layout/     references/layout.md
├── detail-page-g8-motion/
├── detail-page-g9-build/      references/{art-direction.md, pipeline.md}
├── detail-page-g10-qa/
├── detail-page-g11-deliver/   references/{studio.md, coupang-wing-detail-780.html}
└── detail-page-maker-skill/   SKILL.md 한 장. 실행부 없음 (§대체됨)
```

단계 스킬마다 `SKILL.md` + `scripts/run.mjs` + `scripts/check.mjs`.

**`lean-*.mjs` 와 그 단위 테스트는 함께 오케스트레이터에 둔다.** 계획에서는 QA·납품 스킬로
나누려 했지만 `lean-wing-export.mjs` 가 `./runtime/` 을, 테스트가 `../lean-*.mjs` 를
상대 경로로 참조한다. 쪼개면 import 가 깨지므로 **공용 배관은 한곳에 두고 단계 스킬이
경유해 쓴다.**

번들 의존 스킬을 13번 복제하지 않는다.

---

## 9. 호스트 중립성

> **순서와 검사는 스크립트에, 역할 배분만 호스트 문서에.**

| 구분 | 위치 | 호스트별 차이 |
| --- | --- | --- |
| 환경 잠금 | `work/env.lock.json` | 설치 대상만 다름 |
| 게이트 정의·순서·거부 | `orchestrator/scripts/lib/gates.mjs` | **없음** |
| 게이트 상태 | `<프로젝트>/work/gates.json` | **없음** |
| 단계 실행 | 각 단계 스킬 `scripts/run.mjs` | **없음** |
| 트래커 | `scripts/track.mjs` | **없음** |
| sub-agent 역할·lane | `references/{claude-code,codex}.md` | 있음 |

- **구동 호스트를 고정하지 않는다.** 어느 쪽에서 `start`해도 되고, 회차 중간에 바꿔도 된다.
  공유 상태는 `gates.json` 하나뿐이다 ([ADR-0005](adr/0005-두-호스트를-모두-허용한다.md)).
- 게이트마다 `by_host`를 기록한다. 어느 게이트를 누가 했는지 나중에 볼 수 있어야 한다.
- `codex.md`를 신설한다. 지금은 `claude-code.md`만 있어 비대칭이고, 그 비대칭이
  "호스트가 Codex가 아니면 …" 조건문을 낳아 순서 차이를 허용했다.
- 두 호스트 문서는 **게이트 순서를 다시 적지 않는다.** 적으면 갈린다.

---

## 10. 오케스트레이터 명령

| 명령 | 내용 |
| --- | --- |
| `start` | 프로젝트 생성 + `gates.json`·`inputs.lock.json` + 표 출력 |
| `gates` | 표 출력, 첫 `✗`와 호출할 스킬 이름 |
| `gate <id> --start` / `--check` / `--pass` | 시작 시각 기록 / 검사 / 검사 후 통과 기록 |
| `lock --read <path>` | 입력 파일을 읽고 해시 기록 |
| `run [--parallel]` | 남은 게이트를 실행. **판단이 필요한 지점에서 멈추고 스킬 이름을 출력** |
| `track` | 트래커 서버 (§7) |
| `report` | `report.md` 생성. `✗` 있으면 exit 1 |
| `doctor` | 런타임·CDP 확인 (env.lock 대조) |
| `relax <id> --evidence …` | 게이트 완화. 근거 없으면 거부 ([ADR-0007](adr/0007-벽시계-95분과-완화-규칙.md)) |

---

## 11. 테스트 전략

2회차에 45개가 전부 통과한 채 6개 결함이 남았다. 전부 **존재 검사**였기 때문이다.
신규 테스트는 **일치 검사**를 과반으로 둔다.

### 11.1 순서 강제 (가장 먼저 쓴다)

**구현 상태 — 16개 전부 GREEN** (`detail-page-orchestrator/scripts/tests/order.test.mjs`).

| 테스트 | 기대 |
| --- | --- |
| `env.lock.json` 없이 `start` | exit 1 |
| 호스트 홈에 detail-page 스킬이 있으면 `start` | exit 1 |
| **`ready: false` 인 `env.lock.json` 으로 `start`** | exit 1 (`ENV_NOT_READY`) |
| `policy.model_face` 없이 `start` | exit 1 |
| **설치 사본 해시가 어긋나면 `start`** | exit 1 (`INSTALL_HASH_MISMATCH`) |
| G2 미통과에서 `g3-plan` | exit 1 |
| G5 미통과에서 `g6-stills` | exit 1 |
| `flow-map.md` 수정 후 `gates` | G3~G11 `✗` |
| `DESIGN-GUIDE.md` 수정 후 | G5~G11 `✗` |
| `env.lock.json` 해시 불일치 | G0~G11 `✗` |
| `gates.json` 없이 `gate --pass` | exit 1 |
| `--start` 없이 `--pass` | exit 1 |
| `gate --pass`는 언제나 `check.mjs`를 다시 돌린다 | 검사를 건너뛴 통과 기록이 남지 않는다 |
| `actor`가 `agent`·`mixed`인 게이트에서 `run` | 스킬 이름 출력 후 멈춤. 판단 지점 이후 산출물 0건 |
| `✗` 상태에서 `report` | exit 1 |
| 게이트 순서가 `gates.mjs` 밖에 목록으로 존재 | 실패 |

### 11.2 init

**구현 상태 — 12개 전부 GREEN** (`detail-page-init/scripts/tests/init.test.mjs`).

| 테스트 | 잡는 2회차 결함 |
| --- | --- |
| **빈 워크스페이스에서 필요한 디렉터리를 부트스트랩한다** | 다른 기계에서 스킬만 받았을 때 |
| 설치가 `.claude/skills`·`.agents/skills` 두 곳에만 이뤄진다 | — |
| 홈 세 경로에 아무것도 쓰지 않는다 | 사용자 방침 위반 |
| `hyperframes`가 프로젝트-로컬로 해석된다 | 현재 `~/.codex/skills/` 의존 |
| `host_skills` 문자열이 스킬 트리 어디에도 없다 | `doctor`가 홈을 보고 통과시킨 일 |
| 프로젝트 루트 기본값이 워크스페이스 안이다 | `Documents\DetailPageStudio`로 새어 나간 일 |
| `model_face` 없는 답변 파일로 `--apply` → exit 1 | 근거 없는 제약을 기본값으로 굳힌 일 |
| 코드·기본값 어디에도 `model_face` 리터럴 기본값이 없다 | 같은 일의 재발 |
| junction 인식 실패 시 복사로 폴백하고 모드를 기록한다 | — |
| `--prune`이 기본 dry-run이고 목록을 출력한다 | 되돌릴 지점 없는 삭제 |
| `--prune --apply`가 삭제 대신 `.trash/`로 옮긴다 | 같은 것 |
| 보호 목록(프로젝트 산출물·인증·`.skill-src`)은 정리 대상에서 제외된다 | 같은 것 |

### 11.3 게이트별 (2회차 결함을 잡는지)

| 게이트 | 테스트 | 잡는 결함 |
| --- | --- | --- |
| G1 | 공급처 캡처 7일 초과 거부 | 하루 지난 캡처 무경고 재사용 |
| G1/G2 | 입력 경로에 `scratchpad`·`prev-run` 포함 시 거부 | 1회차 파생본 참조 |
| G2 | `flow-map.md` 4개 절 + hex 3개 | 문서 자체가 없었다 |
| G2 | 캡처는 수집 스크립트만 `inputs.lock.json`에 등록할 수 있다 | 손으로 놓은 파일로 게이트 위조 |
| G3 | 플랜 섹션 == flow-map 섹션 | 공급처 순서 상속 |
| G3/G9 | 빌더에 한글 리터럴 없음 | 약 100개 문자열이 플랜 밖 |
| G4 | 템플릿 블록 전량 존재 | 5블록 누락 |
| G4/G6 | 컷마다 무드 레퍼런스 ≥ 1 | 0장 |
| G4 | 목업 섹션↔파일 1:1 기록 | 콜라주 2 + 중복 1을 개수 검사가 못 잡음 |
| G4 | `harvest.md` 존재 + 수확 금지 항목 명시 | 팔레트만 가져오고 끝난 일 |
| G5 | still 프롬프트에 가이드 키워드·hex | 0건 |
| G6 | `selection.json` 전량 + `checked_at_full_res` | 원본 검사 0컷 |
| G6 | `no_product` 컷에 identity 레퍼런스 없음 | `problem-bare`에 착용 사진 |
| G7 | 이탈 섹션에 이유 존재 | 4건 무기록 |
| G7 | 수단 열 전량 + 전부 SVG/CSS면 경고 | 목업 강점을 버린 일 |
| G8 | 컴포지션 자막 ⊆ 페이지 용어 집합 | g06 5개 불일치 |
| G8 | brief 핵심 명사가 컴포지션에 존재 | g07 두 결 대비 누락 |
| G8 | `method` 전량 지정 + 한 수단 8개 초과 시 경고 | HyperFrames 10/10, 나머지 경로 미사용 |
| G9 | 앵커 이미지 해시 일치 | 좌표가 조용히 깨질 구조 |
| G10 | 사진 PNG 없음 · 총량 상한 | 31장 PNG 21.3 MB / 합계 38 MB |
| G11 | `killed.json` 서버 전량 복구 | studio PID 7312 미복구 |

기존 45개는 유지하고 해당 단계 스킬로 점진 이관한다. 신규 약 45개.

---

## 12. 위험과 완화

| 위험 | 완화 |
| --- | --- |
| 스킬 목록이 시끄럽고 엉뚱한 단계가 자동 호출된다 | 모든 단계 `description`에 "오케스트레이터가 G_n 에서 호출한다 / 직접 호출하면 거부된다" 명시. 실제로 거부되므로 오호출이 사고가 되지 않는다 |
| 게이트 순서가 여러 문서에 중복돼 갈린다 | `gates.mjs` 단일 출처 + 중복 기재 금지 테스트 |
| 무효화 전파가 과민해 계속 `✗`로 되돌아간다 | 해시 대상을 의미 있는 산출물만으로 제한 |
| init이 무거워 매번 돌리기 싫어진다 | 워크스페이스 1회 + `--recheck`는 만료 항목만 |
| `/init` 내장 명령과 혼동 | 스킬 이름은 `detail-page-init` |
| 13개 스킬 동기화 실수 | 원본 한 벌 + junction. 실패 시 해시 검증 |
| **에이전트가 스킬을 건너뛰고 파일을 직접 만든다** | 막지 못한다. 대신 **판정을 우회할 수 없게** 한다 — `--pass`는 항상 `check.mjs`를 돌리고 `report`는 `✗`에서 exit 1이다 |
| **게이트를 통과시키려 산출물을 위조한다** | 검사를 내용 일치로 쓴다. 캡처는 수집 스크립트만 lock에 등록할 수 있게 하고 `{url, 수집 시각, 바이트, 이미지 크기}`를 함께 기록한다 |
| **미디어 예산 12 MB를 GIF가 넘긴다** | **실측으로 닫았다** (2026-08-05, 2회차 산출물). 현재 사진 20.76 + GIF 16.38 = 37.14 MB. 사진을 WebP q85로 바꾸면 **0.95 MB**(95% 절감, 추정 4–5 MB보다 훨씬 작다), JPEG q88 폴백은 2.00 MB. GIF는 큰 3개(`g07-pleats` 4.94 · `g05-shade` 3.75 · `g01-hero` 3.30)만 깎으면 되고 나머지 7개(4.40 MB)는 그대로 둔다 → 64색·12fps 에서 GIF 합계 10.86 MB, 48색·10fps 에서 9.30 MB. **폭 780은 계약이므로 영역은 줄이지 않는다.** 조합별 합계는 [TODO §남은 결정](TODO.md) |
| **정리가 되돌릴 수 없는 삭제가 된다** | 루트는 git이 아니다. 그래서 삭제하지 않고 `.trash/<타임스탬프>/`로 옮긴다 ([ADR-0010](adr/0010-init이-정리까지-한다.md)) |
| **완화가 검사 삭제로 흐른다** | 완화는 `gates.history.json`의 근거를 요구하고, 결함 1건이면 즉시 원복한다 |
