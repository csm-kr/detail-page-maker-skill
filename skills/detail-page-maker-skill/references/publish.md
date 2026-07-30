# 공개 출력·QA·쿠팡 Wing

## 고객 화면 정책

고객 화면에는 제품 사실, 고객 효익, 사용법, 구성·규격, 허용된 주장의 직접 증거만
둔다. 다음은 제거한다.

- 프롬프트, 파일명, 로컬 경로, 해시
- pending·approved·rejected, QA 점수, 승인 상태
- 모델·생성기·재구성 방식
- 제조사 확인 과정과 내부 사실 분류
- 가짜 후기, 출처 없는 효능과 임의 수치

## 게시 하드 게이트

- 제품 동일성 하드 실패 0개
- 공개 주장과 `fact_id` 연결 누락 0개
- 핵심 주장과 직접 증거의 거리 `same-section` 또는 `next-section`
- pending·rejected·deprecated 자산 참조 0개
- 고객 화면 제작 메타데이터 0개
- 깨진 이미지, alt 누락, 중복 ID, 잘린 한글 0개
- 390px 저작 화면과 780px 전달 렌더 일치
- 숨은 320·360·390px 가로 오버플로 0개
- HyperFrames strict 오류·경고 0개
- detail-page-flow-v1 순서·count·1:1·motion coverage hard failure 0개
- 상용 QA 97점 이상
- G5 사용자 게시 승인

## 일반 전달본

`output/detail-page.html`을 단일 고객 진입점으로 만들고
`output/media/{images,gifs}/`와 manifest를 함께 관리한다. Studio의 편집 가능한
section model에서 생성하되 최신 Wing과 같은 CDN WebP stack을 표시해야 한다.
`deliverables/`와 공개 `index.html`은 금지한다.

## 쿠팡 Wing

Wing 출력은 일반 전달본과 분리한다.

1. G5, content-flow hard-0, 97점, 사용자 게시 승인과 승인 자산을 잠근다.
2. 매 실행마다 충돌 불가능한 새 `export_id`를 만든다.
3. CDN root 아래 `{project_key}/{export_id}/` namespace를 새로 만든다.
4. 각 섹션을 폭 780px 완성형 WebP로 평탄화한다.
5. 정적 PNG/JPEG/WebP는 정적 WebP, GIF는 애니메이션 WebP로 변환한다.
6. `<img>`만 세로로 연결한 Wing HTML을 만든다.
7. 로컬 preview와 CDN URL용 HTML을 분리한다.
8. CDN 업로드 manifest에 export ID, 순서, 파일명, 바이트, SHA-256, URL을 기록한다.
9. 원격 URL의 상태, MIME, 길이, 해시를 닫힌 검증으로 확인한다.
10. 기존 export namespace에 같은 경로가 있으면 덮어쓰지 않고 실패한다.
11. `output/detail-page.html`을 검증된 최신 CDN stack으로 갱신한다.

Wing 내보내기는 `scripts/runtime/studio-v1-server.mjs`가
`scripts/runtime/coupang-wing-export.py`를 호출한다. Studio 저장은 원격 CDN을
변경하지 않는다. 원격 업로드는 사용자가 `Wing Export`를 명시적으로 실행했을 때만
수행한다. 사용자는 CDN URL이나 API token을 Studio에 입력하지 않는다. 서버는
프로젝트의 `.detail-page/cloudflare-pages.json`을 읽어 Pages 프로젝트와 공개
기본 주소를 고정하고, 매 export의 `{project_key}/{export_id}` URL을 스스로 만든다.
이전 export는 삭제하지 않으며 rollback은 이전 manifest를 선택한다.

Cloudflare config에는 secret을 넣지 않는다.

```json
{
  "schema_version": "1.0",
  "provider": "cloudflare-pages",
  "pages_project": "<실제 Pages 프로젝트>",
  "public_base_url": "https://<실제 Pages 프로젝트>.pages.dev",
  "production_branch": "main",
  "wrangler_version": "<프로젝트에 설치한 정확한 버전>",
  "wrangler_entry_sha256": "<wrangler bin 실제 bytes의 64자리 sha256>",
  "wrangler_runtime_tree_sha256": "<전체 node_modules tree root sha256>",
  "wrangler_runtime_lock": "wrangler-runtime-lock.json",
  "publisher_id": "<표시용 논리 publisher ID>",
  "writer_owner_digest": "<이 머신과 target에서 파생해 고정한 HMAC digest>",
  "bootstrap_receipt_path": ".detail-page/cloudflare-pages-bootstrap.json"
}
```

Wrangler는 프로젝트 로컬 runtime을 검증한 뒤 Node 22.15+의 인라인 trusted
launcher가 자식 시작 시 봉인한 memory source의 pinned entrypoint만
Node argv와 `shell:false`로 실행한다. disk temp snapshot은 만들지 않는다.
production child는 `node --permission`이며 child process·worker thread·native
addon·WASI 권한을 열지 않는다. OAuth는 OS keyring을 사용하고 모든 호출에
`CLOUDFLARE_AUTH_USE_KEYRING=true`를 강제한다. API token·OAuth token·Authorization
값을 config, job, manifest, stdout/stderr에 기록하지 않는다. package version뿐
아니라 entrypoint 실제 파일 bytes의 SHA-256이 `wrangler_entry_sha256`과 정확히
같아야 하며, runtime 경로의 symlink는 허용하지 않는다. load hook은
manifest-pinned memory bytes를 반환하므로 parent 검증 뒤 import 직전 원본이
바뀌어도 변조 bytes를 실행하지 않는다. package `main`·`exports`·`imports`,
bare/self/relative specifier도 봉인한 metadata와 file set으로만 해석하고
Node resolver에는 builtin만 위임한다. CommonJS도 disk loader가 아닌 exact-byte
memory loader에서 실행하므로 package metadata 변조로 다른 pinned module을
선택할 수 없다.

최초 연결은 소비 프로젝트 루트에서 사용자가 명시적으로 수행한다. 아래 `<version>`과
config의 `wrangler_version`은 정확히 같아야 한다.

```powershell
npm install --prefix .agents/runtime/cloudflare-pages `
  --save-exact "wrangler@<version>"

$wranglerEntry = `
  ".agents/runtime/cloudflare-pages/node_modules/wrangler/bin/wrangler.js"
(Get-FileHash -Algorithm SHA256 -LiteralPath $wranglerEntry).Hash.ToLowerInvariant()

$env:CLOUDFLARE_AUTH_USE_KEYRING = "true"
node .agents/runtime/cloudflare-pages/node_modules/wrangler/bin/wrangler.js `
  login --use-keyring
```

Studio는 로그인이나 Pages 프로젝트 생성을 대신 수행하지 않는다. config에 적은 실제
Pages 프로젝트가 OAuth 계정에 이미 있어야 하며, 연결 상태 API가 project list까지
확인한 뒤에만 Wing Export 버튼을 연다. `publisher_id`는 secret이 아닌 표시용
논리 ID다. 실제 소유권은 secure owner provider의 machine-local identity/secret으로
만든 `writer_owner_digest`가 증명한다. 이 HMAC은 target·branch·Wrangler
version·entry/tree hash·canonical runtime/lock 경로·permission execution
policy까지 결박하므로 runtime과 lock·config pin을 함께 재작성해도 기존 owner
digest를 재사용할 수 없다. 최초 게시에도 typed bootstrap receipt가
필요하고 bootstrap receipt에는 machine-local secret의 HMAC 서명이 있어야 한다.
기존 원격 `deploy-index.json`의 owner가 다르거나 owner가 없는 레거시 index는
receipt와 관계없이 fail-closed한다. writer를 바꿀 때는 새 Pages project/base
URL을 만든다. 전체 config, runtime integrity lock 생성, bootstrap 형식은
[`cloudflare-security.md`](cloudflare-security.md)를 필수로 따른다.

Studio Wing Export의 서버 상태는
`preparing → generated → uploading → verifying → completed`다. 인증·config·
runtime·namespace·보존·업로드·검증 실패는 typed failure state와 code를 job에
남긴다. 실패한 로컬 export는 진단용으로 남길 수 있지만 현재
`output/detail-page.html`과 `wing_export_required`는 바꾸지 않는다.

Pages Direct Upload는 전체 directory snapshot이므로 원격 `deploy-index.json`의
과거 namespace를 모두 다음 staging에 복원한다. 로컬 과거 bytes가 없으면 기존
공개 URL에서 다시 받아 HTTP·MIME·크기·SHA-256·immutable cache를 검증한다.
기존 deployment가 있는데 deploy-index가 없거나 새 namespace의 URL이 이미 200이면
덮어쓰지 않고 중단한다. 배포 후에는 새 자산과 과거 자산 전부를 다시 검증하고,
그 뒤 기존 `verifyCdnWingExport`가 최신 manifest와 고객 HTML을 확정한다.

동일 머신에서는 `pages_project + public_base_url` hash로 만든 stable
machine-local state root의 좁은 exclusive lock을 잡은 동안 원격 index read→과거 자산 staging→배포 직전
bytes/generation CAS→Pages deploy→전체 자산·own generation 검증을 수행한다.
lock은 heartbeat를 기록하며 기본 30초 획득 timeout과 15분 stale 정책을 쓴다.
동시에 시작된 로컬 process와 서로 다른 소비 프로젝트도 직렬화되므로 다음
generation은 직전 generation의 모든 namespace를 포함한다. CAS가 바뀐 index를
발견하면 `DEPLOY_INDEX_CONFLICT`로 명시적으로 재시도를 요구한다.

publish lock은 process마다 달라질 수 있는 OS temp가 아니라 stable machine-local
state root를 사용하므로 같은 머신의 모든 process가 공유한다. 다른 머신은 같은
`publisher_id`만으로 owner digest를 재현할 수 없어 게시가 차단된다. 정상 uploader는
owner 이전을 허용하지 않는다. 머신을 바꿀 때는 새 Pages project/base URL을 만든다.
Pages Direct Upload에는 원격 조건부 갱신 원자성이 없으므로 배포 직전 CAS와 배포 후
exact generation 검증은 경쟁을 탐지하지만 원격 원자적 lock을 대체하지 않는다.

## 공통 서버 publish gate

일반 HTML과 Coupang Wing은 같은 서버 gate helper를 사용한다. 브라우저 iframe이나 client flag는 export 권한을 만들지 못한다.

- sealed workflow state와 현재 graph digest가 일치해야 한다.
- `G5_PUBLISH_QA`가 만든 fresh `qa.validation_receipt`의 실제 ArtifactRecord bytes를 다시 읽는다.
- QA verdict `PASS`, publish score 97 이상, Behance quality 90 이상, critical dimension 85 이상, deterministic hard failure 0을 모두 요구한다.
- `G5U_APPROVAL`의 exact approval receipt가 현재 G5 subject artifact-set digest와 일치해야 한다.
- 일반 HTML은 `POST /api/v1/exports/html`에서 승인된
  `studio.committed_revision`을 다시 해시한 뒤에만
  `output/detail-page.html`을 원자적으로 덮어쓴다. 이전 bytes는 내부 backup에
  보존한다.
- gate 검사와 파일 생성 사이 graph·approval·QA proof가 바뀌면 staging 결과를 폐기하고 export를 차단한다.
