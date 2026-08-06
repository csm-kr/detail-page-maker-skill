# detail-page — 쿠팡 상세페이지 제작 스킬

공급처 URL과 기준으로 삼을 쿠팡 URL 하나를 받아 **폭 780px 상세페이지 한 장**을
만든다. 이미지 약 30장과 GIF 약 10개를 포함하고, Studio 편집과 Coupang Wing
내보내기까지 간다.

**순서를 문서가 아니라 스크립트가 소유한다.** 게이트를 `lib/gates.mjs` 하나가
정의하고, 각 게이트는 산출물을 *존재*가 아니라 *내용*으로 검사한다. 상류 산출물을
고치면 하류가 자동으로 되돌아가고, `--force` 같은 우회 플래그는 만들지 않았다 —
게이트가 틀렸으면 게이트를 고친다.

앞선 회차에서 13개 단계를 누락한 채 "전부 완료"라고 보고한 일이 있었다. 그때
45개 테스트는 전부 통과했다 — 전부 존재 검사였기 때문이다. 이 저장소는 그 실패를
구조로 막으려는 것이다.

## 시작하기

### 1. 워크스페이스에 한 번 — 환경 잠금

```sh
node .skill-src/skills/detail-page-init/scripts/init.mjs
```

탐지(Node·Python·PIL·fontTools·ffmpeg·브라우저 CDP·한글 폰트)와 인터뷰를 거쳐
`work/env.lock.json` 을 쓰고, 스킬 13개를 `.claude/skills` 와 `.agents/skills` 에
junction 으로 건다. **호스트 홈에는 아무것도 설치하지 않는다** — 남아 있으면
제작 시작이 거부된다.

두 가지는 대신 할 수 없어서 확인만 하고 멈춘다: ChatGPT 로그인(목업 단계가 쓴다)과
`codex login`(이미지 생성이 `~/.codex/auth.json` 을 읽는다. Codex CLI 자체는
필요 없고 그 파일만 필요하다).

얼굴 정책(`none` / `crop-below-chin` / `allow`)에는 **기본값이 없다.** 답하지 않으면
멈춘다 — 조용히 기본값으로 떨어지면 그 결과가 판단이었는지 사고였는지 구분할 수 없다.

정리는 `--prune` 으로 한다. 기본은 dry-run 이고, `--apply` 를 붙여도 삭제하지 않고
`.trash/<타임스탬프>/` 로 옮긴다.

### 2. 회차마다 — 제작

```sh
node .skill-src/skills/detail-page-orchestrator/scripts/orchestrate.mjs start --name 팔토시 --supplier-url <공급처 URL> --coupang-url <기준 쿠팡 URL>
```

그다음은 `gates` 가 알려주는 대로 따라간다. 순서를 사람이 정하지 않는다.

```sh
orchestrate.mjs gates             # 표 · 첫 ✗ · 부를 스킬 이름
orchestrate.mjs gate G2 --start   # 시작 시각 기록 (없으면 --pass 가 거부된다)
#   → 알려준 단계 스킬을 부른다. 판단이 필요한 게이트는 에이전트가 읽는다
orchestrate.mjs gate G2 --check   # 부족한 것을 한 줄로
orchestrate.mjs gate G2 --pass    # 검사를 다시 돌린 뒤에만 통과가 기록된다
```

진행을 눈으로 보려면 트래커를 띄운다 — `node .../scripts/track.mjs` (포트 9310부터
탐색). 트래커는 상태를 **읽기만** 한다.

완료 선언은 `report` 만 할 수 있고 `✗` 가 하나라도 있으면 exit 1 이다.

## 무엇이 강제되는가

| 장치 | 내용 |
| --- | --- |
| 선행 게이트 거부 | 단계 스킬을 직접 불러도 선행이 통과하지 않았으면 거부된다 |
| 산출물 해시 체인 | 입력 없이 만든 산출물로는 통과 기록을 쓸 수 없다 |
| **무효화 전파** | 상류 산출물이 바뀌면 그 게이트와 **모든 하류**가 되돌아간다 |
| 우회 경로 제거 | 게이트를 거치지 않는 빌드 스크립트를 루트에 두지 않는다 |
| `--force` 없음 | 탈출구를 주면 그 길로 간다 |
| 완료 어휘 잠금 | `report` 가 exit 0 이 아니면 "완료"라고 쓰지 않는다 |
| 시간 기록 강제 | `--start` 없이 `--pass` 하면 거부된다 |

시간은 관찰 대상이고 게이트가 아니다. 예산 초과는 **표시만 하고 막지 않는다** —
막으면 "시간 때문에 검사를 건너뛴다"가 정당화된다.

## 폴더

```text
├── docs/                 문서 정본
├── .skill-src/skills/    ◆ 스킬 원본. 편집은 여기만
├── .claude/skills/       ○ init 이 건다 (Claude Code)
├── .agents/skills/       ○ init 이 건다 (Codex)
├── motion/               ○ hyperframes 로컬 벤더링
├── runtime/fonts/        ○ 한글 폰트
├── work/                 ○ env.lock.json · gates.history.json · active.json
└── projects/<이름>-<시각>/   ● 회차마다 하나. output/ 만 공개된다
    └── input/photos/     ★ 실물 제품 사진 (없어도 된다)
```

★ 사용자가 넣는다 · ◆ 사람이 편집 · ○ `init` 이 만든다 · ● 제작이 만든다

`.claude/skills` 와 `.agents/skills` 는 **생성물이다.** 직접 고치면 다음 `init` 에서
덮어써진다. `.skill-src` 를 고친다.

## 문서

**[`docs/`](docs/README.md) 가 정본이다.** 게이트 순서·산출물·거부 조건은
`ARCHITECTURE.md` 한 곳에만 있다 — 같은 표를 두 문서에 적으면 갈린다.

| 문서 | 무엇을 소유하는가 |
| --- | --- |
| [`docs/GUIDE.md`](docs/GUIDE.md) | **사용법**·폴더 구조·입력 위치·막혔을 때 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 구성 요소·상태 파일·**게이트 표**·강제 장치·트래커 |
| [`docs/PRD.md`](docs/PRD.md) | 문제·요구사항·성공 기준 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) · [`docs/TODO.md`](docs/TODO.md) | 작업 순서와 실행 상태 |
| [`docs/adr/`](docs/adr/README.md) | 결정 11개. 맥락·대안·결정·결과 |

## 검증

```sh
node --test ".skill-src/skills/detail-page-*/scripts/tests/*.test.mjs"
node .skill-src/skills/detail-page-orchestrator/scripts/e2e.mjs
node .skill-src/skills/detail-page-orchestrator/scripts/orchestrate.mjs doctor
```

테스트 234개. 그중 **게이트 판정 단위 테스트가 117개**이고, "전부 갖추면 통과"와
"하나만 무너뜨리면 정확히 1건"을 쌍으로 써서 존재 검사로 물러설 수 없게 했다.

`doctor` 는 잠금을 출력만 하지 않고 **실측과 대조한다** — 폰트가 사라졌거나
`motion/` 이 비었거나 node 메이저가 바뀌었으면 거부한다.

## 요구 사항

Node.js 22.15.0 이상, Python(PIL·fontTools), ffmpeg, 한글 폰트.
`hyperframes` 는 `motion/` 에 로컬로 벤더링하므로 **호스트 설치를 요구하지 않는다.**
브라우저는 전용 프로필로 CDP 를 열어 쓰던 창을 닫지 않는다.
