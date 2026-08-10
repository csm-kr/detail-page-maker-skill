# Cloudflare 게시 소유권·runtime integrity

이 문서는 `publish.md`의 Cloudflare Pages 절차에 필수로 결합된다. 여기의
bootstrap, owner, runtime integrity 검증은 선택 사항이 아니다.

## Machine-local writer owner

`publisher_id`는 표시용 논리 ID일 뿐 배포 소유권 증거가 아니다. uploader는
사용자·머신 로컬 secure owner store에 `writer_id`와 256-bit secret을 만들고,
다음 target 문맥을 HMAC-SHA256으로 결합한 `writer_owner_digest`만 원격
`deploy-index.json`에 기록한다.

- `pages_project`
- `public_base_url`
- `production_branch`
- `publisher_id`
- `wrangler_version`
- `wrangler_entry_sha256`
- `wrangler_runtime_tree_sha256`
- canonical `runtime_root`, `wrangler_runtime_lock`, `bootstrap_receipt_path`
- `node-permission-register-hooks-memory-v1` execution policy
- machine-local `writer_id`

secret과 writer ID 원문은 config, receipt, manifest, 결과, stdout/stderr에 기록하지
않는다. 같은 머신의 모든 process는 Windows `LOCALAPPDATA`, POSIX
`XDG_STATE_HOME` 또는 `~/.local/state` 아래의 동일 owner store와 lock root를
사용한다. process마다 달라질 수 있는 `TMP`/`TEMP`는 publish lock root로 쓰지
않는다. config의 `writer_owner_digest` pin도 이 값과 같아야 하므로 다른 머신은
같은 `publisher_id`와 프로젝트 파일을 복사해도 preflight를 통과할 수 없다.

## Config

`.detail-page/cloudflare-pages.json`의 필수 보안 필드는 다음과 같다.

```json
{
  "schema_version": "1.0",
  "provider": "cloudflare-pages",
  "pages_project": "detail-page-assets",
  "public_base_url": "https://detail-page-assets.pages.dev",
  "production_branch": "main",
  "wrangler_version": "4.123.0",
  "wrangler_entry_sha256": "<64자리 sha256>",
  "wrangler_runtime_tree_sha256": "<전체 node_modules tree root sha256>",
  "wrangler_runtime_lock": "wrangler-runtime-lock.json",
  "publisher_id": "studio-publisher",
  "writer_owner_digest": "<이 머신과 target에서 파생한 64자리 HMAC digest>",
  "bootstrap_receipt_path": ".detail-page/cloudflare-pages-bootstrap.json"
}
```

secret이나 token은 config에 넣지 않는다.

## Wrangler runtime tree 고정

`runtime_root/node_modules` 아래의 모든 항목은 재귀 integrity lock에 들어간다.
lock은 canonical 상대 경로, byte 길이, 파일 SHA-256, 정렬된 전체 tree root
SHA-256을 가진다. symlink, junction/reparse, socket 등 일반 파일·디렉터리가 아닌
항목은 모두 거부한다. npm이 symlink 기반 `.bin`을 만드는 환경에서는 전용 runtime을
`--no-bin-links`로 설치한다.

uploader는 config pin, lock root hash, 실제 전체 file set과 bytes를 비교한다.
production runner는 검증한 가변 `node_modules` 경로를 그대로 실행하지 않는다.
Node 22.15 이상(운영 기준 Node 24)의 `module.registerHooks`를 쓰는 인라인 trusted
launcher가 자식 process 시작 시 tree를 다시 읽고 검증한 exact bytes를 메모리에
봉인한다. disk temp snapshot은 만들지 않는다. module resolution은 pinned
runtime 안으로 제한된다. `package.json`의 `main`·`exports`·`imports`, bare
specifier, self reference, relative/file specifier는 시작 시 봉인한 package
metadata와 file set만으로 해석한다. Node의 다음 resolver에는 builtin만 위임하며
disk package metadata를 module 선택에 사용하지 않는다. ESM·JSON load hook은
manifest-pinned memory bytes만 Node에 반환하고 CommonJS는 같은 exact bytes를
전용 memory loader에서 실행한다.
원본 module이 parent preflight 뒤 또는 실제 import 직전에 바뀌면 load 시점의
재검증에서 중단되며 변조 bytes는 실행되지 않는다. 봉인 뒤 package
`main`·`exports`·`imports`가 바뀌어도 다른 pinned module로 우회하지 못하고
side effect 전에 fail-closed한다. symlink·junction/reparse, manifest 밖
module도 fail-closed다.

production child는 `node --permission`으로 시작하고 pinned runtime과 현재
project의 read만 허용한다. `--allow-child-process`, `--allow-worker`,
`--allow-addons`, `--allow-wasi`는 주지 않는다. 따라서 pinned module이어도
child process·worker thread·native addon·WASI helper를 시작하려 하면 side
effect 전에 권한 오류로 중단한다.

아래 명령은 프로젝트 module의 동일 canonicalization·hash 알고리즘으로 lock을
재현한다. `<version>`은 config와 정확히 같아야 한다.

```sh
npm install --prefix .agents/runtime/cloudflare-pages --save-exact --no-bin-links "wrangler@<version>"
node .agents/skills/detail-page-maker-skill/scripts/runtime/cloudflare-setup.mjs runtime-lock --runtime-root .agents/runtime/cloudflare-pages
```

출력된 `tree_sha256`을 config의 `wrangler_runtime_tree_sha256`에 복사한다.
entrypoint 자체의 SHA-256도 `wrangler_entry_sha256`에 별도로 고정한다. runtime을
다시 설치하거나 갱신하면 기존 lock을 지운 뒤 lock과 config pin을 함께
명시적으로 재생성한다. 생성 후 preflight가 두 pin과 실제 tree를 다시 검증해야
Wing Export를 열 수 있다.

같은 machine-local owner provider에서 config pin을 계산한다.

```sh
node .agents/skills/detail-page-maker-skill/scripts/runtime/cloudflare-setup.mjs owner-digest --config .detail-page/cloudflare-pages.json
```

출력 digest를 config의 `writer_owner_digest`에 고정한다. 다른 머신에서 다른
digest를 덮어써서 기존 target을 인수하면 안 된다. runtime bytes와 lock·config
hash를 함께 다시 작성해도 machine secret으로 새 digest를 명시적으로 만들지
않는 한 기존 owner pin은 재사용할 수 없고 process spawn 전에 중단된다.

## 첫 bootstrap

첫 게시도 자동 bootstrap하지 않는다. 원격 `deploy-index.json`이 404이고 Pages
deployment가 0개여도 아래 typed receipt가 없으면
`PAGES_BOOTSTRAP_AUTHORIZATION_REQUIRED`로 중단한다.

```json
{
  "schema_version": "1.0",
  "receipt_type": "cloudflare-pages-bootstrap",
  "pages_project": "detail-page-assets",
  "public_base_url": "https://detail-page-assets.pages.dev",
  "publisher_id": "studio-publisher",
  "writer_owner_digest": "<config에 고정한 이 머신의 digest>",
  "expected_remote_index_status": 404,
  "expected_generation": 0,
  "expected_deployment_count": 0,
  "authorized_by": "user:<승인자>",
  "authorized_at": "<ISO-8601>",
  "owner_hmac_sha256": "<아래 canonical receipt HMAC>"
}
```

이 파일은 config의 `bootstrap_receipt_path`에 저장한다. target, owner digest,
404, generation 0, deployment count 0 중 하나라도 다르면 무효다.
`authorized_by` 문자열만 적은 self-asserted receipt도 무효다. 위 필드를 모두
채운 뒤 같은 machine-local secret으로 `owner_hmac_sha256`을 만든다.

아래처럼 같은 machine-local secret으로 receipt를 서명한다.

```sh
node .agents/skills/detail-page-maker-skill/scripts/runtime/cloudflare-setup.mjs sign-receipt --receipt .detail-page/cloudflare-pages-bootstrap.json
```

## Owner transfer 금지

정상 uploader에는 owner migration 경로가 없다. 원격 index가 ownerless
legacy이거나 `publisher_id`/`writer_owner_digest`가 다르면 receipt 유무와
관계없이 중단한다. config에 `owner_migration_receipt_path`를 넣거나 API에
`migrationReceipt`를 전달하는 것도 오류다.

배포 머신을 바꿔야 하면 기존 target을 인수하지 말고 새 Cloudflare Pages
project와 새 `public_base_url`을 만든다. 새 target 문맥으로 owner digest를
다시 pin하고, deployment 0·index 404를 확인한 HMAC-signed bootstrap receipt로
시작한다. 기존 URL은 기존 writer가 관리하는 immutable history로 남긴다.
