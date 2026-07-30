# Detail Page Maker Skill 완성 계획

> 최종 갱신: 2026-07-30
> 상태: 구현·전체 회귀·독립 교차검수 완료
> 범위: 이 저장소의 프로젝트 로컬 `detail-page-maker-skill`과 연관 스킬

## 1. 목표

공급처 URL 하나에서 시작해 근거 수집, 상품·콘텐츠 기획, 이미지와 motion 제작,
편집 가능한 HTML, Studio 저장, 쿠팡 Wing 게시까지 이어지는 과정을 하나의
persistent 멀티에이전트 시스템으로 만든다.

각 단계는 다음 네 가지를 반드시 남긴다.

1. 정확히 소비한 입력 artifact와 SHA-256
2. 실제 생성된 산출물의 위치와 다음 consumer
3. 실행 adapter와 ExecutionReceipt
4. 생산자와 분리된 ValidationReceipt 및 필요한 사용자 승인

## 2. 확정 콘텐츠 계약

기계 정본은
`skills/detail-page-maker-skill/policies/detail-page-flow-v1.json`, 사람용 정본은
`references/content-contract.md`다.

1. 공급처 URL과 같은 SKU의 공급처 media는 필수이며 제품 동일성 SSOT와
   ImageGen 참조로 사용한다. 원본을 고객 광고에 직접 싣지 않는다.
2. 실제 제품 사진은 `input/product/`에만 받으며 선택 사항이다. 없으면 최초 한
   번만 안내하고 계속한다.
3. 쿠팡·Behance 원본은 research-only다. 메시지 의도, 구매 흐름, 반복되는 추상
   디자인 원리는 학습하되 고유 자산과 표현은 복제하지 않는다.
4. Hero는 정적이고 화려하며 제품이 가장 크고 핵심 장점은 정확히 하나다.
5. Hero 뒤에 소구점과 연결되는 비질문형 1인칭 불편 인용 3~5개를 먼저 둔다.
   작성자·별점·구매 인증·재구성 표시는 공개하지 않는다.
6. 문제 motion은 2개 이상이며 문제 그룹 뒤에 제품의 한 문장 답을 둔다.
7. 해결 장점은 3~5개이고 불편과 같은 순서로 1:1 연결한다. 각 장점에는 효익
   카피, still, 전용 motion, 검증 사실·조건, 무기명 체감 의견이 모두 필요하다.
8. 사용은 `준비 → 사용 → 결과`, 비교는 `기존 불편 → 검증된 제품 차이` 순서다.
9. 실제 후기 section은 검증된 같은 SKU 후기 receipt가 있을 때만 만든다.
10. motion hard floor는 5개지만 필수 역할 합산의 실제 최소는 7개다. 기본은
    7~9개이고 시간 변화가 더 명확하면 상한 없이 늘린다.
11. 일반 HTML은 화면에 보이는 GIF만 재생하고 이탈 시 poster, 재진입 시 첫
    프레임부터 재시작한다. reduced-motion은 항상 정지다. Wing은 animated WebP다.
12. Studio 저작 기준은 390 CSS px 하나이고 전달 자산은 390@2x, 즉 780px다.
    320·360은 숨은 overflow QA에만 쓴다.
13. Save는 current authoring과 `output/detail-page.html`을 덮어쓰고 높이를
    콘텐츠에 맞추며 최근 복구본 20개를 내부에 유지한다.
14. Wing Export마다 새 `{project_key}/{export_id}/section-NN.webp` 경로를
    사용한다. 실제 업로드와 원격 HTTP·MIME·크기·SHA·cache 검증이 끝난 뒤에만
    고객 HTML을 최신 CDN stack으로 바꾼다.

고객 화면에는 claim/fact/evidence ID, 프롬프트, 모델, agent, 로컬 경로, 파일명,
hash, QA·승인 상태, 생성·재구성 방식이 0건이어야 한다.

## 3. 전체 워크플로

```text
G0A dmk-extractor 공급처 bundle ─┐
G0B input/product 실제 사진(선택) ├─ G0 제품 SSOT·권리·동일성 승인
G1D coupang-extractor 시장 조사 ─┤
G1B commercial/taste/motion 동결 ┘
                    ↓
G1C ProductionPlan compiler
Hero → 불편 → 한 문장 답 → 해결 → 사용 → 비교 → 선택 → 사양/주의 → FAQ → recap
                    ↓
G2 이미지 cut별 멀티 worker → 독립 identity/visual/evidence QA → 승인
                    ↓
G3 motion module별 멀티 worker → HyperFrames preview/render/GIF QA → 승인
                    ↓
G4 editable HTML → Studio 편집/Save → immutable revision → 390@2x capture
                    ↓
Behance rubric + technical/commercial/visual/motion QA → 선택적 부분 repair
                    ↓
G5 97/90/85/hard-0 + exact 사용자 게시 승인
                    ↓
output/detail-page.html + Cloudflare Pages versioned Wing export
```

G0 준비 작업은 병렬로 진행할 수 있지만 승인은 G0→G1 순서를 지킨다. G2는 한
이미지 cut, G3는 한 motion module을 한 worker에 배정한다. Commercial, Evidence,
Identity, Visual, Motion, Technical QA는 생산자와 다른 session에서 수행한다.
실패한 member와 명시적 descendant만 다시 실행하고 통과한 형제는 보존한다.

## 4. 프로젝트 구조

```text
<project>/
├─ input/
│  └─ product/
├─ output/
│  ├─ detail-page.html
│  ├─ export-manifest.json
│  ├─ media/
│  │  ├─ images/
│  │  └─ gifs/
│  └─ wing/<export-id>/
└─ .detail-page/
   ├─ authoring/
   ├─ backups/
   ├─ evidence/
   ├─ research/
   ├─ planning/
   ├─ generation/
   ├─ workflow/
   ├─ studio/
   └─ qa/
```

공개 `index.html`, `deliverables/`, 최상위 `asset/`, `planning/`, `html/`은 만들지
않는다. 내부 immutable Studio revision의 `index.html`은 검증 대상 artifact일
뿐 고객 진입점이 아니다.

## 5. Cloudflare Pages 게시

Studio는 사용자가 입력한 CDN URL을 신뢰하지 않는다. 프로젝트의 secret 없는
`.detail-page/cloudflare-pages.json`에서 Pages 프로젝트, 공개 base URL, pinned
Wrangler 버전을 읽고 URL을 파생한다.

```text
G5 gate
→ config·프로젝트 로컬 Wrangler·OS keyring preflight
→ 새 export ID
→ 780px static/animated WebP 생성
→ 기존 deploy-index의 모든 namespace를 누적 staging에 복원
→ Pages Direct Upload
→ 새·과거 URL 전체 원격 검증
→ output/detail-page.html과 Wing HTML 확정
```

새 namespace URL이 이미 존재하거나 과거 namespace 보존을 증명하지 못하면
배포하지 않는다. 인증·업로드·검증 실패는 job에 typed state로 남기고 현재 고객
HTML과 `wing_export_required`를 바꾸지 않는다.

## 6. Git 단일 스킬 배포

사용자는 macOS·Ubuntu·Windows의 대상 프로젝트에서 GitHub 원본의
`detail-page-maker-skill` 하나만 설치한다.

- `npx skills add ... --skill detail-page-maker-skill --agent codex --copy`
- `dmk-extractor`, `coupang-extractor`, Browser Harness skill, God Tibo,
  HyperFrames 계열 14개는 상위 스킬의 `.agents/skills/`에 내장
- 내장 스킬은 `skills-lock.json`의 `SKILL.md` SHA-256으로 고정
- sibling·전역 스킬 설치와 부분 네트워크 fallback은 사용하지 않음
- 설치·업데이트는 Git 원본의 상위 스킬 하나를 단위로 수행
- 핵심 실행·유지보수 진입점은 Node.js 22 이상으로 통일
- 운영체제별 PowerShell/Bash 설치 스크립트를 요구하지 않음

## 7. 구현 단계와 상태

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| 1 | 확정 대화 내용을 기계 정책과 사람용 계약으로 고정 | 완료 |
| 2 | dmk/coupang 포함 14개 내장 의존성의 단일 Git 스킬 배포 구현 | 완료 |
| 3 | ProductionPlan 콘텐츠 compiler와 negative gate 구현 | 완료 |
| 4 | persistent artifact graph·receipt·승인·부분 무효화 구현 | 완료 |
| 5 | G2/G3 실제 병렬 frontier와 CLI dispatcher 연결 | 완료 |
| 6 | Studio 390 Save·20 backup·복원·자동 높이 구현 | 완료 |
| 7 | visible-only GIF runtime과 Wing 780 animated WebP 구현 | 완료 |
| 8 | `output/detail-page.html` 단일 고객 진입점으로 정리 | 완료 |
| 9 | Cloudflare Pages 실제 uploader·누적 보존·검증 연결 | 완료 |
| 10 | 포터블·오케스트레이션·Studio·실브라우저 회귀 | 완료 |
| 11 | 독립 명세 및 코드·runtime 경계 교차검수 | 완료 |
| 12 | 최종 report와 구조 정리 | 완료 |
| 13 | macOS·Ubuntu·Windows 공통 Node 진입점과 한 줄 설치로 정리 | 완료 |

## 8. 완료 판정

스킬 코드는 다음 조건에서 완료다.

- 정책·설치·오케스트레이션·Studio 전체 회귀가 실패 0
- Git 설치 결과가 상위 스킬 1개와 내장 의존성 14개만 포함
- Ubuntu·macOS·Windows Node 22 CI가 같은 suite를 실행
- 실제 브라우저에서 390@2x→780 Wing 렌더가 통과
- quick validation, doctor, portable E2E가 통과
- 독립 감사에서 발견한 P0/P1과 명세 FAIL을 모두 수정
- plan과 report가 현재 경로·계약·테스트 결과와 일치

실제 상품 한 건의 완성은 별도 실행이다. 공급처 URL, 선택적 실제 사진, 시장 근거,
상업 기획 승인, 생성 비용, Cloudflare 연결이 준비된 뒤 이 스킬로 G0→G5를
실행해야 한다. 실 Cloudflare 계정 배포는 인증이 필요한 운영 작업이므로 자동
회귀에서는 mock adapter로 검증하고, 실제 게시 때 일회성 연결·bootstrap을 별도
확인한다.

## 9. 최종 검증

- 프로젝트 로컬 dependency doctor: 선언·lock·설치 14/14 PASS
- skill-creator quick validation: PASS
- Git 단일 스킬 실제 설치: 1개 설치·내장 14개·설치본 E2E PASS
- portable: 29/29 PASS
- persistent orchestration: 307/307 PASS
- Studio: 86 PASS, 0 FAIL, 실제 브라우저 선택 테스트 1건은 기본 실행에서 SKIP
- 실제 브라우저 animated Wing: 1/1 PASS
- G0→G5 fixture E2E: PASS
- 추적 JavaScript 249개, Python 17개, JSON 12개 구문·파싱: PASS
- GitHub Actions: Ubuntu·macOS·Windows Node 22 matrix 구성
- 독립 14개 명세 trace: PASS
- 최종 CDN runtime 계약 검토: 26/26 및 전체 PASS
