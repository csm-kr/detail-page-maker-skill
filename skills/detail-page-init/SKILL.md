---
name: detail-page-init
description: 상세페이지 제작 환경을 인터뷰로 확인하고 스킬·런타임을 프로젝트-로컬로
  세팅하고 필요 없는 것을 정리한다. 제작을 시작하기 전에 워크스페이스마다 한 번 실행한다.
  사용자가 "$init" 이라고 부르는 단계다.
---

# detail-page-init

`$init` 이 이 스킬이다. Claude Code 에 `/init` 내장 명령(CLAUDE.md 생성)이 있어 그 이름을
쓸 수 없고 가릴 수도 없다.

**막힐 것은 앞에서 다 막는다.** 그것이 이 단계의 목적이다. 2회차에는 세팅 단계가 없어서
`hyperframes` 가 호스트 홈에서 해석되고 있었고, CDP·로그인·인증은 23분짜리 목업 구간 앞에서야
막혔다.

## 실행

```bash
node scripts/init.mjs                     # 대화형
node scripts/init.mjs --apply             # work/env.answers.json 을 읽어 무인
node scripts/init.mjs --prune             # 정리 dry-run
node scripts/init.mjs --prune --apply     # .trash/<타임스탬프>/ 로 옮긴다
node scripts/init.mjs --install-mode copy # 연결 대신 복사
```

**다른 기계에서 스킬만 받아도 여기서 시작한다.** 없는 디렉터리(`work/` `data/`
`projects/` `motion/` `runtime/fonts/` 두 호스트 경로)를 먼저 만든다.

## 1. 탐지 — 묻지 않는다

OS · Node(≥22.15.0) · Python(PIL·fontTools) · ffmpeg · 브라우저 CDP · 한글 폰트, 그리고 둘.

- **`~/.codex/auth.json` 존재 여부만.** 내용을 읽지도 출력하지도 않는다
- **호스트 홈 오염** — `~/.claude/skills` `~/.agents/skills` `~/.codex/skills` 에
  detail-page 계열이 있는지

하나라도 없으면 `env.lock.json` 의 `ready` 가 `false` 가 되고 **`orchestrate start` 가
거부한다.** init 은 기록하고 크게 알려 준다.

## 2. 인터뷰 — 탐지로 알 수 없는 것만

| 질문 | 기본값 |
| --- | --- |
| 어느 호스트에 설치하나 | 둘 다 |
| 프로젝트 루트 | `./projects` |
| **모델 얼굴** (`none` / `crop-below-chin` / `allow`) | **없음 — 반드시 답한다** |
| ChatGPT 로그인이 되어 있나 | 확인 요청 |
| hyperframes 를 로컬로 벤더링할까 | 예 |
| 미디어 총량 상한 | 12 MB |
| 사진 포맷 | webp-q85 |
| 공급처 캡처 유효기간 | 7일 |
| 벽시계 목표 | 95분 |

**얼굴 정책에 기본값을 두지 않는다.** 건너뛰면 다시 묻고, `--apply` 에서 키가 없으면
exit 1 이다. 조용히 `none` 으로 떨어지면 결과가 2회차와 같아지는데, 그때는 그것이 내
판단이었는지 사용자 뜻이었는지 구분할 수 없다.

**프로젝트마다 달라지는 것(두 URL·실물 사진)은 묻지 않는다.** `orchestrate start` 의
입력이다. 워크스페이스 1회인 이 단계에 섞으면 두 번째 프로젝트에서 옛 답이 재사용된다.

답은 `work/env.answers.json` 에 저장해 두 번 묻지 않는다.

## 3. 세팅 — 전부 프로젝트-로컬

1. `.skill-src/skills/*` → 두 호스트 경로. **junction 우선**, 인식 검증 후 실패하면 복사
2. `hyperframes` → `motion/` 프로젝트-로컬 + 버전 핀
3. 폰트를 `runtime/fonts/` 에 두거나 경로를 잠근다
4. `work/env.lock.json` 작성

두 호스트 경로에 `GENERATED.md` 를 둔다. **그 디렉터리를 직접 고치면 다음 init 에서
덮어써진다.** 원본은 `.skill-src/skills` 한 벌이다.

**로컬로 옮길 수 없는 것은 인증뿐이다.** `~/.codex/auth.json` 은 Codex CLI 가 소유한다.
없으면 멈추고 **사용자에게 `codex login` 을 요청한다.**

## 4. 정리 — 삭제하지 않는다

워크스페이스 루트는 git 저장소가 아니다. 되돌릴 지점이 없으므로 `.trash/<타임스탬프>/` 로
원래 경로 구조를 유지해 **옮긴다.**

| 등급 | 처리 | 대상 |
| --- | --- | --- |
| **A 자동** | 목록 출력 후 이동 | 루트 `work/` 의 빌드 스크립트, 빈 스켈레톤, 원본에 없는 스킬 사본, 호스트 홈 오염 |
| **B 확인** | **대화형으로 하나씩 묻는다.** `--apply` 는 건드리지 않는다 | 옛 프로젝트, `work/gen/`, `motion/out/` |
| **C 제외** | 건드리지 않는다 | `.skill-src` · `docs` · `data` · `projects/*/output` · `projects/*/work` 의 근거 · `work/env.*` · 인증 |

**정리 대상이 사용 중이면 건너뛰고 사유만 출력한다. 프로세스를 죽이지 않는다.**
2회차에 `rm -rf` 를 통과시키려 서버를 죽이고 되살리지 않은 전례가 있다.

`.trash/` 는 init 이 지우지 않는다. 사용자가 지운다.

## 다시 돌려야 할 때

| 상황 | 명령 |
| --- | --- |
| `.skill-src` 를 고쳤다 (복사 모드) | `--install-mode copy` 로 다시 |
| junction 모드에서 원본을 고쳤다 | 아무것도 안 한다. 즉시 반영된다 |
| 호스트를 새로 깔았다 | 다시 실행 |

## 다음

```bash
node ../detail-page-orchestrator/scripts/orchestrate.mjs start \
  --name <이름> --supplier-url <공급처> --coupang-url <기준 쿠팡>
```
