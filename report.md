# Detail Page Maker Skill 구현 보고서

> 작성일: 2026-07-30
> 범위: Git으로 받는 단일 `detail-page-maker-skill`과 내부에 잠금된 연관 스킬
> 기준 문서: `plan.md`, `policies/detail-page-flow-v1.json`

## 1. 결과

기존의 느슨한 문서 모음을 공급처 URL부터 쿠팡 Wing 출력까지 이어지는
persistent 멀티에이전트 스킬로 재구성했다. 현재 스킬은 다음을 코드와 회귀
테스트로 강제한다.

- 같은 SKU 공급처 근거를 제품 동일성 SSOT와 ImageGen 참조로 사용
- 쿠팡·Behance 근거는 research-only로 격리
- 확정한 14개 콘텐츠·motion·Studio·Wing 규칙의 deterministic 검증
- 단계별 exact input, 실제 산출물 위치, 다음 consumer, 실행·검수 receipt
- 한 이미지 cut/한 motion module 단위 병렬 실행과 실패 branch만 부분 재시도
- 편집 가능한 390px Studio, `output/detail-page.html`, 780px Wing 자산
- 저장 시 전체 콘텐츠 높이 재계산, 덮어쓰기, 내부 복구본 20개
- export마다 새 CDN namespace를 쓰는 animated WebP Wing 출력
- 한 줄 Git 설치와 단일 스킬 내부 연관 스킬 14개의 dependency closure

## 2. 정본과 읽기 순서

기계 정본은
`skills/detail-page-maker-skill/policies/detail-page-flow-v1.json`, 사람용 정본은
`references/content-contract.md`다. `SKILL.md`는 모든 실행에서
`content-contract.md`와 `workflow.md`를 먼저 읽게 하며, 작업 종류에 맞는
reference만 추가로 읽는다.

외부 사례에서 가져온 것은 구매 흐름, 메시지 역할, 추상 디자인 원리와 평가
기준이다. 쿠팡·Behance의 원본 이미지, 고유 문구, 고유 레이아웃은 제작 입력으로
승격되지 않는다. 연구 후보가 공용 규칙이 되려면 sanitize, 독립 검수, 회귀 증거,
사용자 승인 절차를 모두 거쳐 다음 실행의 reference에 들어간다.

## 3. 실행 흐름과 산출물 연결

| Gate | 생산자·실행기 | 주요 산출물 | 실제 위치 | 다음 consumer·검증 |
| --- | --- | --- | --- | --- |
| G0A | `dmk-extractor` + adapter | 공급처 snapshot, media, importer receipt | `.detail-page/evidence/`와 immutable artifact record | G0 SSOT·권리·동일성 QA가 실제 member bytes 재해시 |
| G0B | 사용자 입력 판정 | 선택적 실제 제품 사진 set 또는 1회 누락 안내 | `input/product/`, `.detail-page/workflow/` | G0 identity source; 없으면 같은 SKU 공급처 media로 진행 |
| G1D/Q/A | `coupang-extractor` + adapter | 후보 집합, 선택 receipt, 시장·후기 research bundle | `.detail-page/research/`, immutable artifact record | G1 기획만 소비; G2 이미지 참조에서 차단 |
| G1B/C | knowledge freeze + plan compiler | KnowledgeSnapshot, ProductionPlan, 양방향 claim graph | `.detail-page/planning/` | 14개 flow validator 통과 후 G2/G3 |
| G2 | God Tibo, cut별 worker | 후보 이미지, identity/visual/evidence QA, 승인 asset | `.detail-page/generation/`, `output/media/images/` | 승인된 member만 G3·G4가 소비 |
| G3 | HyperFrames, module별 worker | preview, 승인 digest, render, GIF, motion QA | `.detail-page/generation/`, `output/media/gifs/` | 승인된 motion과 fallback만 G4가 소비 |
| G4 | HTML assembly + Studio | working HTML, immutable revision, capture, rubric receipt | `.detail-page/authoring/`, `.detail-page/studio/`, `.detail-page/qa/` | G5가 materialized bytes와 receipt 전체 재검증 |
| Save | Studio server | 편집 정본, 공개 HTML, 복구 snapshot | `.detail-page/authoring/detail-page.html`, `output/detail-page.html`, `.detail-page/backups/` | `wing_export_required=true`; 최근 20개 복구 |
| G5/Wing | publish gate + Cloudflare uploader | 780px section WebP, Wing HTML, export manifest | `output/wing/<export-id>/`, `output/export-manifest.json` | 원격 HTTP·MIME·크기·SHA·cache와 과거 URL 보존 검증 |

`dmk-extractor`와 `coupang-extractor` 결과는 agent의 요약 문자열로 대체할 수 없다.
portable bundle 전체와 importer receipt가 WorkOrder의 session, fencing token,
attempt, exact input digest에 결박된 뒤 persistent engine에 commit된다. 프로세스를
재시작해도 locator의 실제 bytes가 달라지면 다음 단계가 fail-closed된다.

## 4. 콘텐츠·표현 계약

최종 상세페이지 흐름은 다음 순서로 고정했다.

```text
화려한 정적 Hero(제품 최대·핵심 장점 1개)
→ 1인칭 불편 의견 3~5개 + 문제 motion 2개 이상
→ 제품의 한 문장 답
→ 같은 순서의 해결 장점 3~5개
→ 준비→사용→결과
→ 기존 불편→검증된 제품 차이
→ 선택 이유
→ 사양·주의
→ FAQ
→ 핵심 리마인드
```

각 해결 장점은 효익 카피, still, 전용 motion, 검증 사실·조건, 무기명 체감
의견을 모두 가진다. motion의 선언상 hard floor는 5지만 역할 합산 최소는 7이며
기본 계획은 7~9개다. 시간 변화로 설명하는 편이 더 정확하면 개수 상한 없이
늘린다. 실제 후기 section은 검증된 같은 SKU 후기 receipt가 있을 때만 생성한다.

고객 HTML에는 claim/evidence ID, 프롬프트, 모델, agent, 로컬 경로, 파일명, hash,
QA·승인·생성 방식 같은 내부 메타데이터가 남지 않는다.

## 5. 멀티에이전트 오케스트레이션

오케스트레이터는 준비된 frontier를 한 번에 계산하고 가용 slot 수만큼 lease한다.

- G0 공급처, 실제 사진 판정, G1 시장 discovery, knowledge 준비를 병렬화
- G2는 한 이미지 cut당 한 worker
- G3는 한 motion module당 한 worker
- 입력 이미지가 승인된 motion은 남은 이미지 작업과 교차 병렬화
- Commercial, Evidence, Identity, Visual, Motion, Technical QA는 생산자와 다른
  session에 배정
- 실패 receipt는 exact member를 고정하고, retry는 그 member와 명시된
  descendant만 재발급
- 통과한 sibling과 protected SSOT·시장·지식 artifact는 보존

각 worker는 staging에만 쓸 수 있다. 검증 후 state와 artifact graph에 commit할
권한은 오케스트레이터만 가진다. lease 만료, 중복 submit, stale input, 경로 이탈,
symlink, hash 변조는 commit 전에 차단된다.

## 6. Studio와 출력

공개 결과의 유일한 진입점은 `<project>/output/detail-page.html`이다.
`deliverables/`나 공개 `index.html`은 만들지 않는다. 사용자는 실제 사진이 있을
때만 `<project>/input/product/`에 추가하면 된다.

저작 viewport는 390 CSS px 하나이며 이미지·Wing 캡처는 2배인 780px다. 320px과
360px은 숨은 overflow 검수에만 쓴다. 일반 HTML의 GIF는 화면에 보일 때만
움직이고, 이탈하면 poster로 멈추며, 다시 들어오면 첫 프레임부터 재생한다.
`prefers-reduced-motion`에서는 항상 정지한다.

Save는 working authoring과 공개 HTML을 함께 덮어쓰고 저장된 전체 콘텐츠 높이에
맞춘다. 기존 공개본은 내부 snapshot으로 남기며 최근 20개만 보존한다. Wing은
GIF를 780px animated WebP로 변환하고 export마다
`{project_key}/{export_id}/section-NN.webp`라는 새 CDN 경로를 쓴다.

Studio의 편집 iframe은 opaque sandbox로 격리했다. child는 저장 API나
`localStorage`에 직접 접근하지 못하며, parent가 발급한 일회성 nonce와
`event.source`가 맞는 Save 요청만 relay된다. 공개 HTML sanitizer는 script,
event handler, 실행 URL, form navigation, SVG/MathML 동적 URL 표면을 제거한다.

Cloudflare 기본 runner는 프로젝트 config만을 신뢰 루트로 쓰지 않는다. 머신
로컬 비밀키의 HMAC subject에 Pages target, branch, Wrangler version,
entry/full-tree SHA, runtime·lock·bootstrap 경로와 실행 정책을 함께 결박한다.
non-builtin module은 `detail-page-sealed:` URL의 메모리 package graph에서
`main`·`exports`·`imports`, bare/self/relative/file 경로와 CommonJS source를
해석한다. Node 기본 resolver·loader는 builtin에만 사용한다. child는 Node
permission 경계에서 프로젝트와 pinned runtime 읽기만 허용받고 child process,
worker, native addon, WASI 권한은 받지 않는다.

## 7. 설치와 재사용

사용자는 다음 Git 기반 명령으로 본 스킬 하나만 프로젝트 로컬에 설치한다.

```sh
npx skills add https://github.com/csm-kr/detail-page-maker-skill --skill detail-page-maker-skill --agent codex --yes --copy
```

다음 연관 스킬 14개는 설치된 상위 스킬 내부의 `.agents/skills/`에 포함된다.

```text
browser-harness
coupang-extractor
design-taste-frontend
dmk-extractor
god-tibo-gpt-image2-skill
hyperframes
hyperframes-animation
hyperframes-cli
hyperframes-core
hyperframes-creative
hyperframes-keyframes
hyperframes-registry
media-use
motion-graphics
```

내장 스킬은 `skills-lock.json` hash로 검증하며 하나라도 누락·변조되면
fail-closed한다. sibling·전역 스킬이나 부분 네트워크 fallback을 사용하지 않는다.
설치와 업데이트는 상위 스킬 하나를 Git 원본에서 다시 받는 방식이다. 핵심
실행과 Behance·HyperFrames 학습 유지보수는 Node.js 22.15.0 이상으로 통일해
macOS·Ubuntu·Windows에서 같은 argv를 사용한다.

## 8. 검증 결과

| 검증 | 결과 |
| --- | --- |
| 프로젝트 로컬 dependency doctor | PASS — 선언·lock·설치 14/14 |
| skill-creator quick validation | PASS |
| Git 단일 스킬 실제 설치 스모크 | PASS — 설치 1개, 내장 의존성 14개, 설치본 E2E |
| portable 설치·정책 회귀 | PASS — 30/30 |
| persistent orchestration 회귀 | PASS — 307/307 |
| G0→G5 fixture E2E | PASS |
| Studio·Wing·runtime 경계 회귀 | PASS — 86/86, 기본 스위트의 브라우저 선택 1건 SKIP |
| 실제 브라우저 390@2x→780 animated Wing | PASS — 1/1 |
| JavaScript·Python·JSON 구문·파싱 | PASS — 추적 JS 249, Python 17, JSON 12 |
| GitHub Actions OS matrix | PASS — Node 22.15.0 Ubuntu·macOS·Windows에서 세 기본 suite와 실제 Git 설치·업데이트 실행 |
| 독립 명세 교차검수 | PASS — 14개 기준과 실제 G0A/G1A 경로 포함 |
| 최종 CDN runtime 계약 검토 | PASS — uploader 26/26, 명확한 결함 0 |

회귀 fixture는 supplier/Coupang portable bundle 가져오기, 재시작 후 검증, 실제
member bytes 변조, 잘못된 상품 ID, privacy 미처리, research-only 제작 참조,
가짜 Hero hash, 누락 receipt, stale writer, partial retry, public metadata와
Studio 저장 경계를 포함한다.

## 9. 운영 시 남은 일

이번 작업은 스킬 시스템의 구현과 자동 검증 범위다. 사용자가 준 도매꾹 상품
`56328525`의 최종 광고 상세페이지 생성은 이 시스템을 이용해 별도의 G0→G5 실행,
기획 승인, 이미지·motion 생성 비용 집행을 거쳐야 한다.

Cloudflare Pages 코드는 실제 uploader, 누적 namespace, 원격 검증까지 연결했지만
실계정 배포는 유효한 프로젝트 설정과 OS keyring 인증이 필요한 외부 운영
작업이므로 자동 회귀에서는 adapter로 검증한다. 다른 머신으로 writer를 옮길 때는
기존 target을 인수하지 않고 새 Pages project와 새 public base URL을 사용한다.
