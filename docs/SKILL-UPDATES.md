# SKILL-UPDATES — 파일 단위 변경

무엇을 **신설·이동·삭제**하는지. 게이트 정의는 [`ARCHITECTURE.md`](ARCHITECTURE.md),
순서는 [`ROADMAP.md`](ROADMAP.md).

> **2026-08-05 진행 상황.** §2·§3·§4·§6 은 실행됐다. 계획과 달라진 두 곳을 아래
> 표시했다 — 스크립트를 쪼개지 않고 통째로 옮긴 것(§3)과, `detail-page.mjs` 를 해체가
> 아니라 `.trash/` 로 보낸 것(§5). 남은 것은 단계 스킬의 `run.mjs` 다 (§8).

## 1. 재구성 전 상태 (실측)

```text
.skill-src/skills/detail-page-maker-skill/       109개 파일
├── SKILL.md                    87줄. 진입점이자 12개 일의 목차
├── dependencies.json           runtimes / bundled_skills / host_skills
├── assets/image-prompt-template.md
├── references/                 10개
│   art-direction.md  assets.md  claude-code.md  commercial.md
│   coupang-wing-detail-780.html  design-reference.md  install.md
│   pipeline.md  studio.md  workflow.md
├── scripts/
│   ├── detail-page.mjs         서브커맨드: doctor · new · validate-plan · qa · studio · wing
│   ├── e2e.mjs
│   ├── lean-contract.mjs       lean-page-plan-v1 계약
│   ├── lean-html-qa.mjs        strict-media QA
│   ├── lean-studio-server.mjs  편집 서버 (트래커의 참고 패턴)
│   ├── lean-wing-export.mjs
│   ├── lib/{cdp.mjs, new-project.mjs}
│   ├── runtime/{cloudflare-pages-uploader.mjs, cloudflare-setup.mjs}
│   └── tests/                  19개 (cdp 5 · contract 7 · html-qa 2 · studio-wing 5)
└── .agents/skills/             번들 5개: browser-harness · coupang-extractor ·
                                design-taste-frontend · dmk-extractor ·
                                god-tibo-gpt-image2-skill

<워크스페이스>/work/                          ← 게이트 밖 우회 경로
├── build-all.mjs               6단계 파이프라인
├── build-plan.mjs              30 CUTS + SLUG + job 버킷
├── build-mockup-prompt.mjs     목업 배치 프롬프트 생성
├── build-page.mjs              HTML 조립 (한글 문자열 약 100개 내장)
├── build-motion.mjs            GIF 컴포지션
├── render-motion.mjs           HyperFrames 렌더
├── publish-assets.mjs          스틸 → slug 발행
├── publish-gifs.mjs            GIF 발행
├── crop-bg.py                  목업 배경 크롭
├── embed-font.py               폰트 임베드
├── verify-gifs.py              GIF 검증
└── tests/                      45개 (_project.mjs + plan · mockup-prompt · page)

docs/reference/templates.md      1,208줄. 2회차에 열지 않았다
```

## 2. 신설

| 경로 | 내용 |
| --- | --- |
| `detail-page-init/SKILL.md` | 환경 인터뷰·세팅·정리 |
| `detail-page-init/scripts/init.mjs` | `--apply` · `--recheck` · `--sync` · `--prune` |
| `detail-page-init/scripts/lib/detect.mjs` | 런타임·CDP·폰트·인증 존재·호스트 오염 |
| `detail-page-init/scripts/lib/interview.mjs` | `env.answers.json`. **`model_face` 필수** |
| `detail-page-init/scripts/lib/install.mjs` | junction 우선, 복사 폴백, 인식 검증 |
| `detail-page-init/scripts/lib/vendor.mjs` | `hyperframes` → `motion/` 로컬 |
| `detail-page-init/scripts/lib/prune.mjs` | 3등급 분류 + `.trash/` 이동 |
| `detail-page-orchestrator/SKILL.md` | 제작 진입점 5줄 |
| `detail-page-orchestrator/scripts/orchestrate.mjs` | `start` `gates` `gate` `lock` `run` `report` `doctor` `relax` |
| `detail-page-orchestrator/scripts/track.mjs` | 트래커 서버 (§ARCHITECTURE 7) |
| `…/scripts/lib/gates.mjs` | **게이트 정의·순서·`actor`·예산의 유일한 출처** |
| `…/scripts/lib/hashchain.mjs` | 해시 체인 + 무효화 전파 |
| `…/scripts/lib/timing.mjs` | `started_at`/`ended_at`/`by_host` |
| `…/scripts/lib/env.mjs` | `requireEnv()` |
| `…/references/codex.md` | **신설.** `claude-code.md`와 대칭 |
| `detail-page-g1-fact/` … `g11-deliver/` | 11개. 각각 `SKILL.md` + `run.mjs` + `check.mjs` + 테스트 |
| `detail-page-g2-reference/references/flow-map-guide.md` | 기준작 판독 방법 (4개 절 + 분위기 실측) |
| `detail-page-g7-layout/references/layout.md` | 섹션별 레이아웃 기획 + 컴포넌트 수단 5택 |

## 3. 이동

### 스킬 안에서

| 현재 | 이후 | 비고 |
| --- | --- | --- |
| `scripts/detail-page.mjs` | **`.trash/pre-restructure/`** | 게이트를 안 거치는 CLI 다. 해체 대신 옮겼다 — 서브커맨드는 오케스트레이터와 단계 스킬이 각각 다시 구현한다 |
| `scripts/lean-*.mjs` · `scripts/e2e.mjs` · `scripts/runtime/` · `scripts/lib/*` · `scripts/tests/*` | **`orchestrator/scripts/` 로 구조 유지해 통째로** | ↓ 아래 이유 |
| `agents/openai.yaml` | `orchestrator/agents/` | Codex 카탈로그 |
| `assets/project-template/` | `orchestrator/assets/` | `start` 가 쓴다 |
| `policies/lean-page-plan-v1.json` | `orchestrator/policies/` | 계약 |
| `references/commercial.md` | `g1-fact/references/` | |
| `references/design-reference.md` | `g4-mockup/references/` | |
| `assets/image-prompt-template.md` | `g4-mockup/assets/` | |
| `references/assets.md` | `g6-stills/references/` | |
| `references/art-direction.md` | `g9-build/references/` | G3도 읽으므로 orchestrator가 경로를 안내 |
| `references/pipeline.md` | `g9-build/references/` | |
| `references/studio.md` | `g11-deliver/references/` | |
| `references/coupang-wing-detail-780.html` | `g11-deliver/references/` | |
| `references/workflow.md` | `orchestrator/references/` | **게이트 순서 목록을 지운다** |
| `references/claude-code.md` | `orchestrator/references/` | `host_skills` 문장 삭제 |
| `references/install.md` | `orchestrator/references/` | init으로 상당 부분 이동 |
| `.agents/skills/` (번들 5개) | `orchestrator/.agents/skills/` | **한 벌만.** 13번 복제 금지 |

**계획을 바꾼 이유 — 스크립트를 쪼개지 않았다.** `lean-html-qa.mjs` 를 `g10-qa` 로,
`lean-wing-export.mjs` 를 `g11-deliver` 로 나누려 했는데 실제 의존을 보니

- `lean-wing-export.mjs` → `./runtime/cloudflare-pages-uploader.mjs`, `./lean-studio-server.mjs`
- `scripts/tests/*.test.mjs` → `../lean-*.mjs`, `../lib/cdp.mjs`

쪼개면 상대 import 가 전부 깨진다. **공용 배관은 오케스트레이터에 한곳으로 두고 단계
스킬이 경유해 쓴다.** 단위 테스트도 모듈과 함께 남긴다 — 모듈이 있는 곳에서 검사한다.

`coupang-extractor` 디렉터리 하나가 잠겨 옛 스킬 아래 빈 껍데기로 남았다. **프로세스를
죽여 치우지 않았다.** `init --prune` 이 A등급으로 잡고, 사용 중이면 사유를 출력한다.

### 워크스페이스에서 스킬로 — **아직 하지 않았다**

> 이 표는 "옮긴다" 로 적혀 있었지만 실제로는 **일반화**다. 아래 스크립트는 팔토시
> 전용이다 — `build-plan.mjs` 에 이 상품의 30개 컷과 SLUG 가, `build-page.mjs` 에 이
> 상품의 섹션과 문자열 약 100개가 박혀 있다. 그대로 옮기면 스킬에 팔토시가 굳는다.
>
> 단계 스킬의 `run.mjs` 는 **`flow-plan.json` 과 `page-plan.md` 만 보고 도는 일반
> 구현**이어야 한다. 옛 스크립트는 참고 자료로 쓰고 옮기지 않는다.

| 현재 | 이후 | 게이트 |
| --- | --- | --- |
| `work/build-plan.mjs` | `g3-plan/scripts/` | G3 |
| `work/build-mockup-prompt.mjs` | `g4-mockup/scripts/` | G4 |
| `work/crop-bg.py` | `g4-mockup/scripts/` | G4 (수확) |
| `work/publish-assets.mjs` | `g6-stills/scripts/` | G6 |
| `work/build-motion.mjs` | `g8-motion/scripts/` | G8 |
| `work/render-motion.mjs` | `g8-motion/scripts/` | G8. **10개 병렬 렌더로 고친다** |
| `work/verify-gifs.py` | `g8-motion/scripts/` | G8 |
| `work/publish-gifs.mjs` | `g8-motion/scripts/` | G8 |
| `work/build-page.mjs` | `g9-build/scripts/` | G9. **한글 문자열 약 100개를 플랜으로 옮긴다** |
| `work/embed-font.py` | `g9-build/scripts/` | G9 |
| `work/tests/*` | 해당 단계 스킬 `tests/` | 점진 이관 |
| `docs/reference/templates.md` (1,208줄) | `g4-mockup/references/templates.md` | G4가 **전량 블록 검사**를 한다 |

## 4. 수정

| 파일 | 변경 |
| --- | --- |
| `dependencies.json` | **`host_skills` 삭제.** `runtimes.hyperframes`는 이미 `project-local-runtime-for-motion`이므로 파일 내 모순이 사라진다 |
| `scripts/detail-page.mjs:68` | `manifest.host_skills.map(...)` 제거 → orchestrator `doctor`로 대체 |
| `references/claude-code.md:17` | "`doctor`의 `host_skills.hyperframes`는 호스트 설치본을 찾는다" 삭제 |
| `SKILL.md` (옛 스킬) | 한 화면으로 축소 (§5) |
| `work/build-page.mjs` → `g9-build` | 화면 문자열을 `flow-plan.json`에서 읽는다. 빌더에 한글 리터럴 금지 테스트 |
| `work/render-motion.mjs` → `g8-motion` | 순차 → 10개 동시 렌더 |
| `work/build-motion.mjs` → `g8-motion` | 컴포지션이 brief 해시에 묶인다. brief 변경 시 재작성 강제 |

**`host_skills`는 세 곳을 동시에 지운다.** 하나라도 남으면 `doctor`가 계속 호스트 홈을
보고 통과시킨다 ([ADR-0004](adr/0004-인증만-호스트에-남긴다.md)).

## 5. 삭제 (= `.trash/`로 이동)

[ADR-0010](adr/0010-init이-정리까지-한다.md)에 따라 삭제가 아니라 이동이다.

| 대상 | 등급 | 이유 |
| --- | --- | --- |
| `work/build-all.mjs` | A | `orchestrator run`이 대체 |
| `work/*.mjs`·`*.py` (이동 후 원본) | A | 남기면 게이트를 안 거치는 실행 경로 |
| 옛 `detail-page-maker-skill/scripts/` | A | 같은 이유 |
| junction 전환 후 남은 스킬 복사본 | A | 죽은 사본 |
| `.detail-page/authoring` 빈 스켈레톤 | A | 2회차에 만들고 쓰지 않았다 |
| `docs/reference/templates.md` | B | G4로 이동 확인 후 |
| 옛 프로젝트 디렉터리 | B | 발행물 포함. 하나씩 묻는다 |
| `work/gen/` · `motion/out/` | B | 재생성 가능하나 렌더 비용 |

**제외(C):** `.skill-src` · `~/.codex/auth.json` · `projects/*/output/` ·
`projects/*/work/{SSOT.md, flow-plan.json, design-ref/}` · `docs/`.

`docs/`는 제외지만 `docs/reference/templates.md` 하나만 예외다 — 12단계에서 G4 스킬로
옮긴 뒤에야 B등급이 된다. 사본을 두 곳에 남기지 않기 위한 것이다.

## 6. 옛 스킬 처리

`detail-page-maker-skill`을 지우지 않고 **얇은 안내 스킬로 남긴다.**

```markdown
---
name: detail-page-maker-skill
description: 이 스킬은 detail-page-orchestrator 로 대체됐다. 상세페이지 제작 요청은
  detail-page-init 다음 detail-page-orchestrator 로 진입한다.
---

# 대체됨

1. 처음이면 `detail-page-init` (사용자가 `$init` 이라 부르는 단계)
2. 제작은 `detail-page-orchestrator`
3. 게이트 정의는 orchestrator 의 `lib/gates.mjs`
```

스크립트는 이동 후 제거한다. 남기면 우회 경로가 된다.

## 7. 테스트 이관

| 현재 | 개수 | 이후 |
| --- | ---: | --- |
| `scripts/tests/cdp.test.mjs` | 5 | `orchestrator/scripts/tests/` |
| `scripts/tests/lean-contract.test.mjs` | 7 | `orchestrator/scripts/tests/` |
| `scripts/tests/lean-html-qa.test.mjs` | 2 | `g10-qa/tests/` |
| `scripts/tests/lean-studio-wing.test.mjs` | 5 | `g11-deliver/tests/` |
| `work/tests/build-plan.test.mjs` | | `g3-plan/tests/` |
| `work/tests/build-mockup-prompt.test.mjs` | | `g4-mockup/tests/` |
| `work/tests/build-page.test.mjs` | 28 | `g9-build/tests/` |
| 계 | 64 | 점진 이관. 신규 약 45개 추가 |

**신규 테스트의 과반은 존재 검사가 아니라 일치 검사여야 한다.** 2회차에 45개가 전부
통과한 채 6개 결함이 남은 이유가 전부 존재 검사였기 때문이다.

## 8. 남은 것 — 단계 스킬의 `run.mjs`

`SKILL.md` · `check.mjs` · 판단 게이트의 `run.mjs`(체크리스트)는 다 있다.
남은 것은 **작업을 실제로 하는 `run.mjs`** 다.

| 게이트 | 주체 | `run.mjs` 상태 | 무엇을 만들어야 하나 |
| ---: | --- | --- | --- |
| G1 G2 G3 G4 G7 | 에이전트 | **완료** | 체크리스트 출력이 최종 형태다 |
| G5 | 혼합 | **완료** | 가이드의 무드를 초안에 주입해 발행 플랜을 쓴다 |
| G6 | 혼합 | **완료** | 생성 → (사람 선별) → `--publish` 로 채택분만 780px 발행 |
| G8 | 혼합 | **완료** | brief 펼치기 → (사람 작성) → `--render` 로 병렬 렌더 + `comps/index.json` |
| G9 | 스크립트 | **완료** | **일반 조립기.** 플랜과 page-plan 만 보고 HTML + `anchors.json` |
| G10 | 스크립트 | **완료** | `lean-html-qa.mjs` 를 항상 strict 로 돌려 `qa-report.json` 을 쓴다 |
| G11 | 혼합 | **완료** | `killed.json` 되살리기 → (사람 확인) → `--record` 로 `delivery.json` |

**G9 를 새로 썼다.** 옛 `build-page.mjs` 는 이 상품 전용이라 옮기지 않았다. 조립기에는
화면에 나갈 한글이 하나도 없고, 모든 문자열이 `say()` 를 지나간다 — 플랜에 없는 한글은
게이트가 아니라 **조립 시점에** 터진다. 고칠 곳이 플랜임을 바로 알 수 있게 하려는 것이다.

혼합 게이트 세 개(G6·G8·G11)는 전부 **두 번 멈추는** 모양으로 만들었다. 스크립트가
기계적인 부분을 하고, 판단 지점에서 멈추고, 사람이 기록을 남긴 뒤 두 번째 명령으로
발행한다. 2회차에 건너뛴 것이 정확히 그 판단들이었기 때문이다.

| 게이트 | 1차 (스크립트) | 사람 | 2차 (스크립트) |
| ---: | --- | --- | --- |
| G6 | 후보 생성 | `selection.json` 판정 | `--publish` 채택분만 발행 |
| G8 | brief·용어 집합 펼치기 | 컴포지션 + `meta.json` 작성 | `--render` 병렬 렌더 + 색인 |
| G11 | `killed.json` 되살리기 | Studio 확인 · Wing 내보내기 | `--record` 로 `delivery.json` |

`--reviewed` 같은 플래그를 사람이 붙인다. 스크립트가 대신 참으로 만들지 않는다 —
그러면 "봤다" 가 아무 뜻도 없는 값이 된다. 대신 Wing 산출물의 **존재**는 스크립트가
파일로 확인한다. 말이 아니라 사실로 검사할 수 있는 것은 사실로 검사한다.

## 9. 수집 경로 — 3회차 실테스트로 바뀐 것

기준작 수집이 막힌 원인을 찾다가 `coupang-extractor` 와 `dmk-extractor` 가 이미 번들에
있는 것을 발견했다. 2회차를 통과한 것들이고, 내장 캡처는 그것의 열등한 사본이었다.
[ADR-0011](adr/0011-검증된-추출기를-1급-수집-경로로-쓴다.md) 로 정리했다.

| 파일 | 상태 | 내용 |
| --- | --- | --- |
| `orchestrator/scripts/lib/extract.mjs` | 신설 | 호스트 → 추출기 라우터. 정확 일치만. 요청 최소화 인자 고정 |
| `orchestrator/scripts/lib/capture.mjs` | 재작성 | 브라우저 수준 세션 + `flatten` 부착, 짧은 페이지 거부 |
| `orchestrator/scripts/orchestrate.mjs` | 수정 | `capture` 가 라우터를 먼저 본다. 번들은 `manifest.json` 해시로 등록 |
| `orchestrator/scripts/tests/extract.test.mjs` | 신설 | 7개 — 호스트 선택·부분 일치 방지·번들 존재 |
| `orchestrator/scripts/tests/capture.test.mjs` | 신설 | 8개 — flatten 부착·남의 타깃 크래시 견딤·짧은 페이지 거부 |

실테스트가 가르친 두 가지를 코드 주석과 테스트 이름에 그대로 남겼다.

1. 페이지 소켓은 쿠팡의 `shared_worker` 크래시에 함께 죽는다. 브라우저 수준 + `flatten`
   부착은 견딘다. 진단으로 `Inspector.targetCrashed` 두 번을 확인했고 페이지 타깃은
   멀쩡했다.
2. 없는 상품이 HTTP 200 + 스크린샷 성공으로 온다. 높이 1028px, 본문 "상품을 찾을 수
   없습니다". 높이 2000px 미만은 `CAPTURE_TOO_SHORT` 로 거부한다.

`browser-harness` 는 호스트 설치이므로 없는 기계에서는 내장 캡처로 내려가고 그 사실을
알린다. 조용히 실패하지 않는다.
