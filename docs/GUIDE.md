# GUIDE — 사용법

상세페이지 한 장을 만드는 전 과정. 게이트 정의는 [`ARCHITECTURE.md`](ARCHITECTURE.md),
왜 이런 구조인지는 [`adr/`](adr/README.md).

> **아직 구현 전이다.** 이 문서는 만들 것의 사용법이며, 구현 순서는
> [`ROADMAP.md`](ROADMAP.md)다. 지금 이 명령들을 치면 없다고 나온다.

---

## 1. 세 줄 요약

```bash
# 1회 — 환경 인터뷰 + 로컬 세팅 + 정리
detail-page-init                     →  node scripts/init.mjs

# 회차마다 — 제작 시작
detail-page-orchestrator             →  node scripts/orchestrate.mjs start \
                                          --name 팔토시 \
                                          --supplier-url … --coupang-url …

# 진행 — 첫 ✗ 게이트의 스킬을 부른다. 순서를 바꾸지 않는다
                                        node scripts/orchestrate.mjs gates
```

사용자가 `$init`이라 부르는 것이 **`detail-page-init`** 이다. Claude Code에 `/init`
내장 명령(CLAUDE.md 생성)이 있어 그 이름은 쓸 수 없고 가릴 수도 없다.

---

## 2. 폴더 구조

```text
팔토시-스킬/                          워크스페이스 루트 (git 저장소 아님)
│
├── docs/                            문서. 이 파일이 있는 곳
│   ├── reference/templates.md         프롬프트 템플릿 (G4가 전량 검사)
│   └── history/                       기록. 갱신하지 않는다
│
├── .skill-src/skills/               ◆ 스킬 원본. 편집은 여기만 (git repo)
│   ├── detail-page-init/
│   ├── detail-page-orchestrator/
│   └── detail-page-g1-fact/ … g11-deliver/
│
├── .claude/skills/                  ○ init 생성. Claude Code가 읽는다
├── .agents/skills/                  ○ init 생성. Codex가 읽는다
├── motion/                          ○ init 생성. hyperframes 로컬 런타임
├── runtime/fonts/                   ○ init 생성. 한글 폰트
│
├── work/
│   ├── env.lock.json                ○ init 생성. 환경·정책 잠금
│   ├── env.answers.json             ○ init 생성. 인터뷰 답 (두 번 묻지 않기 위해)
│   └── gates.history.json           ○ 회차 누적. 완화 판단의 근거
│
├── .trash/<ISO 타임스탬프>/          ○ init --prune 이 옮긴 것. 삭제 아님
│
└── projects/<이름>-<타임스탬프>/      ● start 생성. 회차마다 하나
    └── input/photos/                ★ 실물 제품 사진을 여기 넣는다 (없어도 된다)
    ├── flow-plan.json                 G3 작성 → G5 갱신. 화면 문자열 전량
    ├── work/
    │   ├── gates.json                 게이트 상태·해시·시각·수행 호스트
    │   ├── inputs.lock.json           URL·사진·캡처의 해시와 수집 시각
    │   ├── killed.json                죽인 프로세스. G11이 복구
    │   ├── SSOT.md                    G1 — 공개 가능한 사실만
    │   ├── flow-map.md                G2 — 섹션 흐름 + 디자인 분위기 실측
    │   ├── page-plan.md               G7 — 섹션별 레이아웃 + 컴포넌트 수단
    │   ├── selection.json             G6 — 컷별 채택·탈락과 이유
    │   ├── anchors.json               G9 — 좌표가 묶인 이미지 해시
    │   ├── report.md                  G11 — 완료 보고
    │   ├── design-ref/                G4
    │   │   ├── mockups/               목업. 발행하지 않는다
    │   │   ├── prompts/ prompts-sent/ variants/
    │   │   ├── DESIGN-GUIDE.md        팔레트·타이포·구성 요소 실측
    │   │   └── harvest.md             목업에서 무엇을 가져오고 무엇을 안 가져오나
    │   ├── gen/                       G6 생성 원본 (frame-NNN.png)
    │   └── comps/                     G8 컴포지션
    └── output/                        ★ 발행물. 여기만 공개된다
        ├── detail-page.html
        ├── media/images/  media/gifs/
        └── wing/<export-id>/
```

| 기호 | 누가 만드나 |
| --- | --- |
| ★ | **사용자** — 사진을 넣고, 결과를 본다 |
| ◆ | 사람이 편집 — 스킬 원본. 여기만 고친다 |
| ○ | `detail-page-init` |
| ● | `orchestrate start` 와 각 게이트 |

**`.claude/skills`·`.agents/skills`는 생성물이다.** 여기를 직접 고치면 다음 `init`에서
덮어써진다. `.skill-src`를 고친다.

> init이 만들 디렉터리를 **미리 만들어 두지 않았다.** 손으로 채운 산출물을 해시 체인이
> 거부하도록 설계했는데, 내가 손으로 채워 두면 그 검사가 무의미해진다.

---

## 3. 시작 전 준비

| 준비물 | 어디에 | 비고 |
| --- | --- | --- |
| 공급처 URL | `start --supplier-url` | 도매꾹 등 |
| 기준 쿠팡 URL | `start --coupang-url` | 흐름을 베낄 기준작 **하나** |
| 실물 제품 사진 | **`projects/<회차>/input/photos/`** | 없으면 공급처 동일 SKU로 진행. 있으면 최우선. start 뒤에 넣었으면 `orchestrate photos` 로 잠근다 |
| ChatGPT 로그인 | **전용 브라우저 프로필** (아래) | **사용자만 한다.** G4가 이것을 쓴다 |
| Codex 로그인 | `codex login` | **사용자만 한다.** G6 이미지 생성이 `~/.codex/auth.json`을 읽는다 |

두 로그인은 내가 대신 할 수 없다. init이 확인만 하고, 없으면 멈추고 요청한다.

### 브라우저 CDP — 쓰던 창을 닫지 않는다

```bash
node scripts/open-browser.mjs     # detail-page-init 안에 있다
```

**Chrome 136부터 기본 프로필에서는 `--remote-debugging-port`가 무시된다.** 그래서
`runtime/chrome-profile/`을 전용 프로필로 두고 두 번째 인스턴스를 띄운다. 덕분에

- 쓰던 창과 탭을 닫지 않아도 된다 (프로필이 다르므로 나란히 돈다)
- ChatGPT 로그인이 그 프로필에 남아 **다음 회차에도 그대로** 쓰인다
- 프로필이 워크스페이스 안이라 다른 기계에서도 같은 방법이 통한다

이 창에서 ChatGPT에 한 번 로그인한다. 그 뒤 `init`을 다시 돌리면 `ready`가 `true`가 된다.

---

## 4. `detail-page-init` — 처음 한 번

### 4.1 실행

```bash
node scripts/init.mjs              # 대화형
node scripts/init.mjs --apply      # env.answers.json 을 읽어 무인 실행
node scripts/init.mjs --recheck    # 만료 항목만 (CDP·로그인)
node scripts/init.mjs --sync       # 원본 수정을 사본에 반영 (복사 모드일 때만)
node scripts/init.mjs --prune      # 정리 dry-run
```

### 4.2 탐지 — 묻지 않는다

OS·Node(≥22.15.0)·Python·PIL·fontTools·ffmpeg·브라우저 CDP·한글 폰트·디스크 여유,
그리고 두 가지를 더 본다.

- **`~/.codex/auth.json` 존재 여부만.** 내용을 읽지도 출력하지도 않는다.
- **호스트 홈 오염** — `~/.claude/skills`, `~/.agents/skills`, `~/.codex/skills`에
  detail-page 계열이 있는지. 있으면 정리 대상이고, 남아 있으면 `start`가 거부한다.

### 4.3 인터뷰 — 탐지로 알 수 없는 것만

| 질문 | 기본값 |
| --- | --- |
| 어느 호스트에 설치하나 (Claude Code / Codex / 둘 다) | 둘 다 |
| 프로젝트 루트 | `<워크스페이스>/projects` |
| **모델 얼굴을 어떻게 하나** (`none` / `crop-below-chin` / `allow`) | **없음 — 반드시 답한다** |
| ChatGPT 로그인이 되어 있나 | 확인 요청 |
| god-tibo 인증이 되어 있나 | `--dry-run`으로 검증 |
| hyperframes를 로컬로 벤더링할까 | 예 |
| 미디어 총량 상한 | 12 MB |
| 사진 포맷 | WebP q85 |
| 공급처 캡처 유효기간 | 7일 |
| 벽시계 목표 | 95분 |

**얼굴 정책에는 기본값이 없다.** 건너뛰면 다시 묻고, `--apply`에서 키가 없으면 exit 1이다.
조용히 `none`으로 떨어지면 결과가 2회차와 같아지는데, 그때는 그것이 내 판단이었는지
사용자 뜻이었는지 구분할 수 없다 ([ADR-0008](adr/0008-얼굴-정책은-init이-묻는다.md)).

**구동 호스트는 묻지 않는다.** 어느 쪽에서 시작해도 되고 중간에 바꿔도 된다.

프로젝트마다 달라지는 것(URL·사진)도 묻지 않는다. `start`의 입력이다 — init에 섞으면
두 번째 프로젝트에서 옛 답이 조용히 재사용된다.

### 4.4 세팅

1. `.skill-src/skills/*` → 두 호스트 경로. **junction 우선**, 인식 검증 후 실패하면 복사
2. 번들 의존 스킬 5개를 오케스트레이터 아래 **한 벌만**
3. `hyperframes` → `motion/` 로컬 벤더링 + `0.7.90` 핀
4. 폰트를 `runtime/fonts/`에 배치하거나 경로를 잠금 파일에 기록
5. `work/env.lock.json` 작성

### 4.5 정리 — `--prune`

**기본은 dry-run이고, 실행해도 삭제하지 않는다.** `.trash/<ISO>/`로 원래 경로 구조를
유지해 옮긴다. 워크스페이스 루트가 git 저장소가 아니라 되돌릴 지점이 없기 때문이다
([ADR-0010](adr/0010-init이-정리까지-한다.md)).

| 등급 | 처리 | 예 |
| --- | --- | --- |
| **A 자동** | 목록 출력 후 이동 | 죽은 스킬 사본, 옮긴 뒤의 루트 `work/*.mjs`, `build-all.mjs`, 빈 스켈레톤 |
| **B 확인** | **하나씩 묻는다** | 옛 프로젝트, `work/gen/`, `motion/out/` |
| **C 제외** | **건드리지 않는다** | `.skill-src` · 인증 · `projects/*/output/` · `docs/` |

정리 대상이 사용 중이면 건너뛰고 사유만 출력한다. **프로세스를 죽이지 않는다.**

### 4.6 출력

```text
$ node scripts/init.mjs
── 탐지 ──────────────────────────────
  OS            win32                        ○
  Node          22.15.0                      ○
  Python        python (PIL ○ fontTools ○)   ○
  ffmpeg        7.1                          ○
  브라우저 CDP  http://127.0.0.1:9223        ○
  한글 폰트     NotoSansKR-VF.ttf            ○
  god-tibo 인증 ~/.codex/auth.json 있음      ○
  호스트 오염   없음                          ○
── 인터뷰 ────────────────────────────
  설치 대상     Claude Code + Codex
  프로젝트 루트 ./projects
  모델 얼굴     crop-below-chin
  ChatGPT       로그인 확인됨
  hyperframes   로컬 벤더링 (0.7.90 핀)
── 세팅 ──────────────────────────────
  스킬 13개 → .claude/skills, .agents/skills   (junction, 인식 검증 통과)
  번들 의존 5개 → orchestrator 아래 한 벌
── 결과 ──────────────────────────────
  env.lock.json 작성. 다음: orchestrate start
```

### 4.7 다시 돌려야 할 때

| 상황 | 명령 |
| --- | --- |
| `env.lock.json`이 30일 초과 | `--recheck` (CDP·로그인은 만료된다) |
| `.skill-src`를 고쳤다 (복사 모드) | `--sync` |
| 호스트를 새로 깔았다 | `node scripts/init.mjs` 다시 |
| junction 모드인데 원본을 고쳤다 | 아무것도 안 한다. 즉시 반영된다 |

---

## 5. 제작

### 5.1 시작

```bash
node scripts/orchestrate.mjs start \
  --name 팔토시 \
  --supplier-url https://… \
  --coupang-url https://…
```

사진은 인자로 받지 않는다. `start` 가 만든 `input/photos/` 에 넣고 `orchestrate photos`
로 잠근다 — 사진은 회차 폴더 안에서만 산다. 다른 데 있는 것을 들여올 때만 `--photos <디렉터리>`.

`gates.json`과 `inputs.lock.json`을 만들고 게이트 표를 출력한다.
`env.lock.json`이 없거나, 설치 해시가 어긋나거나, **호스트 홈이 오염돼 있으면 거부한다.**

### 5.2 반복 루프

```text
gates                      → 첫 ✗ 게이트와 호출할 스킬 이름
  ↓
gate G2 --start            → 시작 시각 기록 (없으면 --pass 가 거부된다)
  ↓
detail-page-g2-reference   → 그 스킬을 부른다. 순서를 바꾸지 않는다
  ↓
gate G2 --check            → 부족한 것을 한 줄로
  ↓
gate G2 --pass             → 검사를 다시 돌린 뒤에만 통과 기록
```

**막혔을 때 `--force`는 없다.** 게이트가 틀렸으면 게이트를 고친다.

### 5.3 게이트마다 사용자가 실제로 하는 일

| 게이트 | 부르는 것 | 사용자가 하는 일 |
| ---: | --- | --- |
| INIT | `detail-page-init` | 질문 10개 답. **두 로그인** |
| G0 | `orchestrate start` | URL 2개, 사진 경로 |
| G1 | `g1-fact` | 사진 확인 요청에 한 번 답 |
| G2 | `g2-reference` | 없음. 브라우저가 살아 있어야 한다 |
| G3 | `g3-plan` | 카피를 읽고 사실 오류를 지적 |
| G4 | `g4-mockup` | **23분. ChatGPT 로그인이 유지돼야 한다.** 4장씩 4배치 |
| G5 | `g5-inject` | 없음 |
| G6 | `g6-stills` | **탈락 판정.** 컷을 원본 해상도로 본다 |
| G7 | `g7-layout` | 컴포넌트 수단 5택 확인 |
| G8 | `g8-motion` | brief별 GIF 생성 수단 확인 |
| G9 | `g9-build` | 없음 |
| G10 | `g10-qa` | 없음 |
| G11 | `g11-deliver` | **Studio에서 눈으로 확인** |

사용자 개입이 필요한 곳은 INIT·G4·G6·G11 넷이다. 나머지는 에이전트가 하거나 스크립트다
(주체 분류는 [`ARCHITECTURE.md`](ARCHITECTURE.md) §5).

### 5.4 병렬

```bash
node scripts/orchestrate.mjs run --parallel
```

**선행이 `○`인 게이트만** 동시에 띄운다. 실제로 겹치는 것은 `G1 ∥ G2`와 `G8 ∥ G9`
둘이다. `run`은 전부 자동이 아니라 **판단이 필요한 지점까지** 돌고 멈춘 뒤 부를 스킬
이름을 알려준다.

---

## 6. 진행 보기 — `track`

```bash
node scripts/orchestrate.mjs track     # → http://127.0.0.1:9310
```

```text
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

| 표시 | 뜻 |
| --- | --- |
| `✗` | 미착수 |
| `⟨⟨ ⟩⟩` | 진행 중 — 발광·맥동 |
| `○` | 통과 |
| `⚠` | 무효화됨. 상류 산출물이 바뀌었다 |
| `⛔` | 거부. 클릭하면 부족 항목 |

**예산 초과는 표시만 하고 막지 않는다.** 막으면 "시간 때문에 검사를 건너뛴다"가
정당화된다. 그리고 **트래커는 `gates.json`을 쓰지 않는다** — 읽기만 한다.

---

## 7. 완료

```bash
node scripts/orchestrate.mjs report
```

`✗`가 하나라도 있으면 **exit 1**이다. 그리고 규칙이 하나 있다 —
**`report`가 exit 0이 아니면 "완료"라는 단어를 쓰지 않고 게이트 표를 그대로 붙인다.**
2회차에 13개를 누락한 채 "전부 완료"라고 보고했기 때문에 넣은 규칙이다.

완료 후 공개되는 것은 `output/` 아래뿐이다. `work/`·`design-ref/`·목업은 기획자료이며
발행하지 않는다.

---

## 8. 막혔을 때

| 증상 | 원인 | 조치 |
| --- | --- | --- |
| `start`가 `env.lock.json 없음` | init을 안 돌렸다 | `detail-page-init` |
| `start`가 `호스트 홈 오염` | 홈에 detail-page 스킬이 있다 | `init --prune` |
| `start`가 `policy.model_face 결여` | 인터뷰를 건너뛰었다 | `init` 다시 — 기본값이 없다 |
| 단계 스킬이 `선행 게이트 미통과` | 순서를 건너뛰려 했다 | `gates`의 첫 `✗`부터 |
| 통과했던 게이트가 `⚠`로 돌아갔다 | 상류 산출물을 고쳤다 | 정상이다. 그 게이트부터 다시 |
| `--pass`가 `시작 시각 없음` | `--start`를 빼먹었다 | `gate <id> --start` 후 다시 |
| G4에서 목업이 콜라주로 나온다 | 한 이미지에 여러 섹션 | 섹션을 3장 이하로 나눠 재요청 |
| G6에서 이미지 생성이 인증 오류 | `~/.codex/auth.json` 만료 | `codex login` — **사용자만 한다** |
| G10에서 `ASSET_MISSING` | GIF 발행 단계가 빠졌다 | G8을 다시. 경로만 있고 파일이 없다 |
| G10에서 미디어 총량 초과 | 사진이 PNG거나 GIF가 크다 | WebP 전환, GIF 상위 3개 팔레트·프레임 축소 |
| 벽시계가 목표를 넘는다 | 도입 직후엔 정상 | 145 → 120 → 95 곡선 ([ADR-0007](adr/0007-벽시계-95분과-완화-규칙.md)) |

---

## 9. 하지 말 것

- **`.claude/skills`·`.agents/skills`를 직접 고치지 않는다.** 생성물이다. `.skill-src`를 고친다.
- **호스트 홈에 스킬을 깔지 않는다.** 깔면 `start`가 거부한다.
- **게이트를 통과시키려 산출물을 손으로 만들지 않는다.** 캡처는 수집 스크립트만
  `inputs.lock.json`에 등록할 수 있다.
- **목업을 발행하지 않는다.** 배경 크롭은 한글이 없는 영역만.
- **목업 비율을 발행 컷에 그대로 쓰지 않는다.** 발행 비율은 `assets.md`가 정한다.
- **`report`가 exit 0이 아닐 때 "완료"라고 말하지 않는다.**
- **시간이 없다고 검사를 건너뛰지 않는다.** 완화는 근거가 있을 때만
  (`relax <id> --evidence`, 3회 연속 통과 + 결함 0).

---

## 10. 두 호스트

어느 쪽에서 시작해도 되고 회차 중간에 바꿔도 된다. 공유 상태는 `gates.json` 하나뿐이다.

| | Claude Code | Codex |
| --- | --- | --- |
| 스킬 경로 | `.claude/skills` | `.agents/skills` |
| 게이트 순서·검사 | **같다** (`lib/gates.mjs`) | **같다** |
| 역할 배분 문서 | `references/claude-code.md` | `references/codex.md` |
| 이미지 생성 | 된다 | 된다 |

**이미지 생성 때문에 Codex가 필요한 것이 아니다.** `god-tibo-imagen`은
`~/.codex/auth.json`을 읽는 순수 node 라이브러리이고, Codex CLI는 그 파일을 만들기 위해
필요할 뿐이다 ([ADR-0004](adr/0004-인증만-호스트에-남긴다.md)).

게이트마다 `by_host`가 기록되므로 어느 단계를 누가 했는지 나중에 볼 수 있다.
