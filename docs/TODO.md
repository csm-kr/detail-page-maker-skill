# TODO

[`ROADMAP.md`](ROADMAP.md)의 실행 상태. 순서는 로드맵을 따른다 —
**2·5·6(init·엔진·전파)을 건너뛰고 검사부터 붙이지 않는다.**

## 0 — 되돌릴 지점

- [x] `.skill-src` 미커밋 변경 10건 커밋 (브랜치 `assets-default-square`)
  - 수정 5: `SKILL.md`, `dependencies.json`, `references/workflow.md`, `scripts/detail-page.mjs`, `scripts/tests/lean-studio-wing.test.mjs`
  - 신규 5: `assets/image-prompt-template.md`, `references/design-reference.md`, `references/pipeline.md`, `scripts/lib/cdp.mjs`, `scripts/tests/cdp.test.mjs`
- [x] `projects/팔토시-1785892814672` 보존 확인 (21번 검증 사례)

## 1 — 순서 강제 테스트 (먼저 쓴다, 전부 RED)

- [x] `env.lock.json` 없이 `start` → exit 1
- [x] 호스트 홈에 detail-page 스킬 있으면 `start` → exit 1
- [x] `ready: false` 인 `env.lock.json` 으로 `start` → exit 1 (`ENV_NOT_READY`)
- [x] `policy.model_face` 없이 `start` → exit 1
- [x] 설치 사본 해시 불일치 → exit 1 (`INSTALL_HASH_MISMATCH`)
- [x] G2 미통과에서 `g3-plan` → exit 1
- [x] G5 미통과에서 `g6-stills` → exit 1
- [x] `flow-map.md` 수정 후 → G3~G11 `✗`
- [x] `DESIGN-GUIDE.md` 수정 후 → G5~G11 `✗`
- [x] `env.lock.json` 해시 불일치 → G0~G11 `✗`
- [x] `gates.json` 없이 `gate --pass` → exit 1
- [x] `--start` 없이 `--pass` → exit 1
- [x] `--pass`가 항상 `check.mjs`를 다시 돌린다
- [x] `agent`·`mixed` 게이트에서 `run` → 스킬 이름 출력 후 정지
- [x] `✗` 상태에서 `report` → exit 1
- [x] 게이트 순서가 `gates.mjs` 밖에 목록으로 존재 → 실패

## 2 — detail-page-init 골격

- [x] `scripts/init.mjs` + `lib/detect.mjs`
- [x] 탐지: OS·Node·Python·PIL·fontTools·ffmpeg·CDP·폰트·디스크
- [x] 탐지: `~/.codex/auth.json` **존재 여부만** (내용 읽지 않음)
- [x] 탐지: 호스트 홈 3경로 오염
- [x] `lib/interview.mjs` — 답을 `env.answers.json`에 저장
- [x] **`model_face` 필수.** 미응답 → exit 1, 코드에 기본값 없음
- [x] `capture_max_age_days`·`media_budget_mb`·`photo_format`·`wallclock_target_min`
- [x] 프로젝트별 질문(URL·사진)은 묻지 않는다 — `start`의 입력이다
- [x] `work/env.lock.json` 작성

## 3 — init 설치

- [x] `lib/install.mjs` — junction(`mklink /J`) 우선
- [x] **junction 후 두 호스트가 실제로 인식하는지 검증**
- [x] 실패 시 복사 폴백 + `install.mode` 기록
- [x] `lib/vendor.mjs` — `hyperframes` → `motion/` 로컬 벤더링 + `0.7.90` 핀
- [x] 폰트를 `runtime/fonts/`에 배치하거나 경로 잠금
- [x] `.claude/skills`·`.agents/skills`에 `GENERATED.md` 한 줄
- [x] `host_skills` 제거 — `dependencies.json:17`, `detail-page.mjs:68`, `claude-code.md:17` **세 곳 동시에**

## 4 — init 정리

- [x] `lib/prune.mjs` — 기본 dry-run
- [x] 3등급 분류 (A 자동 / B 확인 / C 제외)
- [x] `--apply`가 삭제 대신 `.trash/<ISO>/`로 이동 (경로 구조 유지)
- [x] 사용 중인 대상은 건너뛰고 사유 출력 — **프로세스를 죽이지 않는다**
- [x] `env.lock.json.pruned` 기록
- [x] 보호 목록 테스트: `.skill-src`·인증·`projects/*/output/`·`docs/`·근거 문서 제외

## 5 — 오케스트레이터 엔진

- [x] `lib/gates.mjs` — 게이트 정의·순서·`actor`·예산의 **유일한 출처**
- [x] `lib/project.mjs`·`lib/env.mjs`
- [x] `orchestrate.mjs start` — `gates.json`·`inputs.lock.json` + 표
- [x] `gates` — 표 + 첫 `✗` + 호출할 스킬 이름
- [x] `gate <id> --start` / `--check` / `--pass`
- [x] `requireEnv()` / `requireGates()` 공용 헬퍼
- [x] `--force` 플래그를 **만들지 않는다**

## 6 — 무효화 전파

- [x] `lib/hashchain.mjs`
- [x] 입력 해시 불일치 → 그 게이트 + 모든 하류 `✗`
- [x] 해시 대상을 의미 있는 산출물로 제한 (플랜·가이드·앵커 이미지·brief)
- [x] 캡처는 **수집 스크립트만** `inputs.lock.json`에 등록 가능

## 7 — 시간 기록

- [x] `lib/timing.mjs` — `started_at`/`ended_at`/`by_host`
- [x] `--start` 없이 `--pass` 거부
- [x] `gates.history.json` 누적 — `lib/history.mjs`. `report` 가 회차마다 upsert 한다
  - 회차 키는 프로젝트 디렉터리 이름. 같은 회차를 다시 `report` 해도 줄이 늘지 않는다
  - **막힌 회차도 남긴다.** 재작업량은 완주한 회차가 아니라 막힌 회차에서 나온다
  - `recordReject` 가 `rejections` 를 누적한다 — 그 게이트가 **잡은 결함의 수**이고 완화의 근거다

## 8 — 트래커

- [x] `track.mjs` — node `http`, 포트 9310부터 탐색
- [x] `fs.watch` → SSE. 폴링 없음
- [x] 맵 렌더 + 상태 5종 (`✗` `⟨⟨ ⟩⟩` `○` `⚠` `⛔`)
- [x] 진행 중 노드 `@keyframes` 발광·맥동
- [x] 상단 경과/목표/진행 수
- [x] 노드 클릭 → `check.mjs` 마지막 결과의 부족 항목
- [x] 예산 초과 `⚠` 표시 — **막지 않는다**
- [x] 트래커는 `gates.json`을 **쓰지 않는다**

## 9~18 — 단계 스킬

11개 전부 `SKILL.md` + `scripts/run.mjs`(선행 게이트 검사) + `scripts/check.mjs`(판정)가
있고 `description` 에 "오케스트레이터가 호출한다 / 직접 호출하면 거부된다"가 있다.

- [x] `lock --read` + 11개 스킬 골격 + 판정 로직 (`check.mjs`)
- [x] 판단 게이트(G1 G2 G3 G4 G7)의 `run.mjs` — 체크리스트 출력이 최종 형태다
- [x] **G5 `run.mjs`** — 가이드의 무드를 초안에 주입해 발행 플랜을 쓴다
- [x] **G6 `run.mjs`** — `tibo-batch.mjs` 호출 + slug 발행
- [x] **G8 `run.mjs`** — 컴포지션 → 10개 병렬 렌더 → 발행 → `comps/index.json`
- [x] **G9 `run.mjs`** — 일반 조립기. 플랜과 page-plan 만 보고 HTML 을 만든다 (가장 큼)
- [x] **G10 `run.mjs`** — `lean-html-qa.mjs` + 포맷·용량 → `qa-report.json`
- [x] **G11 `run.mjs`** — Studio · Wing · `killed.json` 복구 → `delivery.json`
- [x] 단계별 `check.mjs` 단위 테스트 — **11개 게이트 전부, 117개**
  - 각 스킬 `scripts/tests/check.test.mjs`. 모듈이 있는 곳에서 검사한다
  - 픽스처는 `makeCheckbed()` — `start` 를 돌리지 않고 `check` 만 부른다. 판정 테스트가
    게이트 엔진 전체에 묶이면 무엇이 깨졌는지 흐려진다
  - **"전부 갖추면 통과" + "하나만 무너뜨리면 정확히 1건"** 쌍으로 썼다. 다른 사유가
    섞이면 실패하므로 존재 검사로 물러설 수 없다
  - 뮤테이션 4건(G1 캡처 나이 · G4 목업 중복 · G6 원본 해상도 · G9 앵커 해시)을
    무력화해 **전부 테스트가 잡는 것을 확인**했다

**옛 `work/*.mjs` 를 옮기지 않는다.** 팔토시 전용이라 그대로 옮기면 스킬에 이 상품이
굳는다. 참고만 하고 플랜을 읽는 일반 구현을 새로 쓴다 — [SKILL-UPDATES §3](SKILL-UPDATES.md).

## 19 — 문서

- [x] `references/codex.md` 신설 (비대칭 제거)
- [x] `SKILL.md`의 "호스트가 Codex가 아니면 …" 조건문 제거
- [x] 호스트 문서에서 게이트 순서 목록 제거
- [x] 옛 `detail-page-maker-skill`을 안내 한 화면으로 축소, 스크립트 제거

## 20 — 재설치와 전체 검증

- [x] `doctor` — **잠금과 실측을 대조한다.** 잠금을 출력만 하는 것은 진단이 아니었다
  - 폰트·`motion/node_modules/hyperframes` 존재, node 메이저 드리프트 → `RUNTIME_MISSING` / `RUNTIME_DRIFT`
  - 잠금의 경로가 워크스페이스 밖이면 `PATH_OUTSIDE_WORKSPACE`
  - **CDP 는 표시만 한다.** 브라우저는 제작할 때 띄우는 것이라 진단이 그것으로 막으면
    `doctor` 를 부를 때마다 브라우저가 필요해진다
- [x] `e2e` PASS
- [x] 전체 테스트 GREEN (**234개**)
- [x] 홈 3경로에 detail-page 계열 0개
- [x] 루트에 `build-*.mjs` 0개
- [x] `--prune` dry-run 이 **오케스트레이터 상태 파일을 건드리지 않는다**
  - `active.json` 이 B등급으로 잡히고 있었다. 옮기면 프로젝트가 둘 이상일 때
    `AMBIGUOUS_PROJECT` 로 회차가 막힌다 → 보호 목록에 넣었다
- [ ] `init` 재실행 + `--prune --apply` — **지금 돌리지 않는다.** 남은 B등급 2개가
  2회차(보존 대상)와 3회차(진행 중)다. 스킬을 지웠다 다시 까는 시점의 일이다

## 21 — 2회차 산출물 검증

`projects/팔토시-1785892814672` 에 대해 각 게이트의 `runCheck` 를 돌렸다 (2026-08-05).

- [x] **필수 거부 7개(G2·G4·G5·G6·G7·G8·G11)가 전부 거부됐다.** 11개 전부 거부, 통과 0개
- [x] 통과한 게이트가 없으므로 고칠 검사도 없다
- [x] 재작업량 **99분**을 `gates.history.json` 에 기록
- [x] `gates.json` 소급 생성은 **하지 않았다.** `runCheck` 를 직접 돌려 같은 답을 얻었고,
  11개 전부 거부라 이어받을 것이 없다. 소급 파일을 두면 3회차와 헷갈린다

가장 강한 증거 셋 — 전부 2회차에 **존재 검사가 통과시킨** 것들이다.

| 게이트 | 무엇을 잡았나 |
| --- | --- |
| G9 | **HTML 에 플랜 밖의 문자열 70건.** 화면 문자열이 빌더에 박혀 있던 것 |
| G4 | `templates.md` 블록 **12/12 전부** 프롬프트에 없음. 문서를 열지 않았다 |
| G5 | 팔레트에 이름 붙은 색이 없어 주입할 대상을 정할 수 없음 |

2회차 HTML 이 폭 선언으로 거부되는 것은 **거짓 거부가 아니다.** 옛 빌더는 `--w:780px`
변수를 썼고 우리 조립기는 `max-width: 780px; width: 780px` 를 쓴다 (`lib/render.mjs`).
조립기와 검사가 한 쌍이므로 검사를 넓히지 않는다 — 넓히면 780이 아닌 페이지가 샌다.

## 남은 결정

- [x] **미디어 12 MB — 도달한다.** 2회차 산출물로 실측 (2026-08-05)

  | 구성 | 사진 | GIF | 합계 |
  | --- | ---: | ---: | ---: |
  | 현재 (PNG + 원본 GIF) | 20.76 | 16.38 | 37.14 MB |
  | WebP q85 + GIF 64색·12fps | 0.95 | 10.86 | **11.81 MB** |
  | WebP q85 + GIF 48색·10fps | 0.95 | 9.30 | **10.25 MB** |
  | JPEG q88 + GIF 48색·10fps | 2.00 | 9.30 | **11.30 MB** |

  사진 WebP q85 는 **95% 절감**으로 추정(4–5 MB)보다 훨씬 작다. 큰 3개만 깎으면 되고
  나머지 7개(4.40 MB)는 그대로 둔다. **폭 780은 계약이므로 영역은 줄이지 않는다.**

- [ ] **사진 포맷 WebP q85 — 쿠팡·Wing 지원은 확정하지 못했다.** 3자 가이드는 Wing
  상세설명에 WebP 업로드가 된다고 하지만 공식 확장자 목록은 찾지 못했다. 확정은
  **사용자가 Wing 에 실제로 올려 봐야** 된다 (로그인이 필요하므로 대신 할 수 없다).
  막히면 `photo_format` 을 `jpeg-q88` 로 바꾸고 GIF 를 48색·10fps 로 내리면 11.30 MB 로
  들어간다 — G10 이 정책값을 그대로 따르므로 코드는 고치지 않는다

- [x] **junction 을 Claude Code 는 따른다.** `.claude/skills` 가 junction 인 상태에서
  13개 스킬이 이 세션의 스킬 목록에 보이고 `INSTALL_HASH_MISMATCH` 도 나지 않는다.
  **Codex 쪽은 이 세션에서 확인할 수 없다** — Codex 에서 한 번 띄워 봐야 한다
