# 루즈핏 쿨토시 — Approval Ledger

## Source

- `supplier_url`: http://domeggook.com/55873582?affid=
- `product_name`: 루즈핏 쿨토시
- `manufacturer`: 살랑
- `revision_id`: rev-018
- `guide`: `detail-page-maker-skill/references/approval-guide.md`

## G0 SOURCE_SSOT

- `artifact_paths`: `product/product-manifest.json`, `planning/SSOT-REVIEW.md`, `planning/approval-review.html`
- `artifact_sha256`:
  - `product/product-manifest.json`: `db4157ea5248b67c9f5b4646d3c9424d64cd445baf2ab65113ced991b08eb73d`
  - `planning/SSOT-REVIEW.md`: `0182b2045b4b7d37f01965996ffdbb69da1c6a19f8f9f9de98670ad9cf97e28b`
  - `planning/approval-review.html`: `d5a20a80a1c3802abc54a79af1b1734fb98371ce1dd32560320644dcff4f492f`
- `preparation_status`: complete
- `reviewer_session`: human_user
- `decision`: approved
- `decided_at`: 2026-07-27T11:54:24.735Z
- `findings`:
  - 제품명은 `루즈핏 쿨토시`로 확정했다.
  - 제조사는 `살랑`으로 확정했다.
  - 사용자 고해상도 실물 원본 8장과 공급처 크롭 4장을 제품 SSOT로 잠갔다.
  - 입력 원본은 이동·삭제·재인코딩하지 않았고 프로젝트 복사본의 SHA-256이 일치한다.
  - 라벨 실물 문구 `HELLO / CUTE SLEEVE`는 제조사명과 별도로 그대로 유지한다.
- `required_changes`: 제품명·제조사 변경 적용 완료.
- `user_confirmation`: `제조사 살랑으로 하자. 제품명 루즈핏 쿨토시 - 그외에는 ㅇㅋ`

## G1 COMMERCIAL_PLAN

- `artifact_paths`: `planning/COMMERCIAL.md`, `planning/DESIGN.md`, `planning/BUYER-JOURNEY.md`, `planning/MODEL-IDENTITY.md`, `planning/GIF.md`, `planning/ASSET-PLAN.md`, `planning/commercial-roadmap.json`, `planning/approval-review.html`
- `artifact_sha256`:
  - `planning/COMMERCIAL.md`: `689de90d039a7603ea90d289b17b981d073137d86cf47db1881390347ddd2366`
  - `planning/DESIGN.md`: `b923c4659f909d9f0eaa09b8963cf812ae4a61c6fc8c35489d6b63bb224b4561`
  - `planning/BUYER-JOURNEY.md`: `718b9d7dbe26315f770cbdb94535c1d8ee50336617d89c3996a47b8e473ba2a7`
  - `planning/MODEL-IDENTITY.md`: `7f723202fa4c40a591ac87b75a6fd62791f7e7b98506ee578d3a976b940aed91`
  - `planning/GIF.md`: `565b1c62af04debc4dd5443969f26e033df5070e8a1eabcad5b0623c41d25817`
  - `planning/ASSET-PLAN.md`: `c98e155b0eb3ef40b97a8e074876e58f9782236b0566feca9a4803567bd12a2a`
  - `planning/commercial-roadmap.json`: `52383b8b16c131e2c577808a40060ea8fc1805b772d3514a82b747c5a2228bf2`
  - `planning/approval-review.html`: `d5a20a80a1c3802abc54a79af1b1734fb98371ce1dd32560320644dcff4f492f`
- `preparation_status`: complete
- `g0_dependency`: approved
- `reviewer_session`: human_user
- `decision`: approved
- `decided_at`: 2026-07-27T11:54:24.735Z
- `approved_generation`:
  - 캐릭터 시트 후보: 8장, 1536×1024, God Tibo 8-worker 1배치
  - G2A: 사용자 승인으로 후보 한 장을 모델 SSOT로 잠금
  - 본 제작: 40장, 8-worker 5배치, `16 + 16 + 8` 세 웨이브
  - 배경 전용: 6장, 2048×1152
  - 최종 GIF: 1개, 800×800, HyperFrames
  - 최종 상세 모듈: 12개, 800×2000
- `blocked_claims`: `UV 차단율`, `UPF`, `냉감 수치`, `흡한속건`, `통풍 성능`, `논슬립`, `흘러내림 방지`, `시험·인증·내구`
- `required_changes`: 없음.
- `user_confirmation`: `제조사 살랑으로 하자. 제품명 루즈핏 쿨토시 - 그외에는 ㅇㅋ`

## G2A MODEL_SHEET

- `artifact_paths`: `model/jobs/c00-character-sheet-candidates-rev001.json`, `model/candidates/c00-rev001/manifest.json`, `planning/model-sheet-review.html`, `qa/evidence/model-sheet-rev001/candidates-contact.jpg`, `qa/evidence/model-sheet-rev001/desktop-1200-top.png`, `qa/evidence/model-sheet-rev001/mobile-390-top.png`, `qa/reports/model-sheet-rev001.md`
- `artifact_sha256`:
  - `model/jobs/c00-character-sheet-candidates-rev001.json`: `884b65daea0f47960741acf4f54822ffe17eb21132334cc2221dcd84be0ac4ec`
  - `model/candidates/c00-rev001/manifest.json`: `7fc94ad78080ca7c622ea1e04c8c688e00367d41ec38bba9ed852a5550a29ad2`
  - `planning/model-sheet-review.html`: `264d15acc184d2984950a18863611214957ce4b31ade3bd79c0f976f4986b24b`
  - `qa/evidence/model-sheet-rev001/candidates-contact.jpg`: `269e4256b4aae9889ac0b26ca93935a90ff8fd516afd7f3b7cba199c3367ffcf`
  - `qa/evidence/model-sheet-rev001/desktop-1200-top.png`: `a8494a932ccb6982e85b8e054f80443bd89d9ae7ea219f6d6b4efc212da7125c`
  - `qa/evidence/model-sheet-rev001/mobile-390-top.png`: `35c9e700486b8fdf4a119d4122bad414eb84ab6bc65f64cdc2045b68fa8d3670`
  - `qa/reports/model-sheet-rev001.md`: `b92fd29e2e465a44b390f748212a95ecf34c96fdc6c48bf781abb03ecfae41ad`
- `preparation_status`: ready_for_user_selection
- `candidate_count`: 8
- `candidate_wxh`: 1536×1024
- `workers`: 8
- `approved_count_required`: 1
- `decision`: approved
- `decided_at`: 2026-07-27T12:13:47.592Z
- `findings`:
  - 8장 모두 1536×1024 크기 검사를 통과했다.
  - 얼굴·헤어·체형·손의 수동 QA 후 추천 순서는 C00-03, C00-01, C00-02다.
  - 데스크톱·모바일 브라우저 QA에서 깨진 이미지와 가로 오버플로가 없었고, 포커스 안전 검사를 통과했다.
- `required_changes`: 없음.
- `selected_candidate_id`: C00-03
- `approved_ssot_path`: `asset/ssot/model-sheet-c00-03-v01.png`
- `approved_ssot_sha256`: `476d751f07484de54dc7992c138beafcdf56565ed6fa3584fbf7c72e45bcaa64`
- `user_confirmation`: `승인!`

## G2 IMAGE_ASSETS

- `artifact_paths`: `production/production-plan.json`, `production/user-feedback-correction-report.json`, `production/d08-nonoverlap-candidates-report.json`, `qa/reports/g2-image-assets-rev004.json`, `qa/reports/g2-image-assets-rev004.md`, `qa/evidence/g2-image-assets/contact-A-rev004.jpg`, `qa/evidence/g2-image-assets/contact-B-rev004.jpg`, `qa/evidence/g2-image-assets/contact-C-rev004.jpg`, `qa/evidence/g2-image-assets/contact-D-rev004.jpg`, `qa/evidence/g2-image-assets/contact-E-rev004.jpg`, `qa/evidence/g2-image-assets/d08-rev004-candidates-8up.jpg`, `qa/evidence/g2-image-assets/d08-rev004-rejected-selected.jpg`
- `artifact_sha256`:
  - `production/production-plan.json`: `c4b9c85533e8e64d37dcc98df6acf071cacf1dd1d1361556388d58f24bcb7490`
  - `production/user-feedback-correction-report.json`: `4ceaab9c1f1b1bc08b954ac110090bc604ddb4ef28dec68caf218a4834de3d7b`
  - `production/d08-nonoverlap-candidates-report.json`: `d257aaf79d43858ab4ed137cb5fa8bba4303b1e73320d443ade7248b8bebc6f3`
  - `qa/reports/g2-image-assets-rev004.json`: `53f28a4028e24a7b070ca282aa570cf858570bdd671f52709836612e6ff19bd4`
  - `qa/reports/g2-image-assets-rev004.md`: `6623bcfc4d67e19347111684dcdc2307438e9375185e18caa99159caf3218c16`
  - `qa/evidence/g2-image-assets/contact-A-rev004.jpg`: `62a413791eb93918cb1d8c234a24b34caf32b7b229557faa6525482f6e48c733`
  - `qa/evidence/g2-image-assets/contact-B-rev004.jpg`: `7009288a75f0de23343c6820aaa7586ecf2530f5f49f6748b418abbfd0c723df`
  - `qa/evidence/g2-image-assets/contact-C-rev004.jpg`: `42c14912149666483ba035a199fc9abde8af4d2489581f7a8c24ff24741b3f7a`
  - `qa/evidence/g2-image-assets/contact-D-rev004.jpg`: `abcfe15383cd50350447be89db61e4aa0ab80f7bff84f98d43bf49322ccacf94`
  - `qa/evidence/g2-image-assets/contact-E-rev004.jpg`: `fd1008db490d98e7d4a7239c3233d90be89ce56eba303a334aefe1c8496953b7`
  - `qa/evidence/g2-image-assets/d08-rev004-candidates-8up.jpg`: `47e04a5c703a14eb8712abf9c294e4fd8101cf84e2a104aee8ae776a2d536783`
  - `qa/evidence/g2-image-assets/d08-rev004-rejected-selected.jpg`: `d7eeda7a9f12290a1cd064785cc71fada9ccbb7beca87b72b2e4935ec67801b7`
- `preparation_status`: approved_after_rev004
- `required_approved_count`: 40
- `generated_count`: 40
- `current_candidate_count`: 8
- `selected_candidate`: D08-C03 / frame-002 / D08 v04
- `total_generated_with_corrections`: 61
- `total_generated_including_model_candidates`: 69
- `first_pass_count`: 37
- `corrected_pass_count`: 10
- `current_feedback_asset_count`: 1
- `decision`: approved
- `decided_at`: 2026-07-27T13:43:27.450Z
- `findings`:
  - 사용자가 D08 v04를 포함한 현재 선택본 40개를 승인했다.
  - 선택본 40개는 모두 지정 W×H, SHA-256, 내부 QA PASS를 다시 확인했다.
  - D08-C03은 제품 두 개가 접촉·교차·겹침 없이 독립된 전체 외곽을 유지한다.
  - D08 v01~v03과 다른 반려본은 changes_requested 상태로 비파괴 보존한다.
- `required_changes`: 없음. G3 GIF_MOTION 진행 가능.
- `user_confirmation`: `승인`
## G3 GIF_MOTION

- `artifact_paths`: `planning/GIF.md`, `asset/asset-manifest.json`, `hyperframes/projects/gif-001-thumbhole-direction/index.html`, `hyperframes/projects/gif-001-thumbhole-direction/index.motion.json`, `hyperframes/projects/gif-001-thumbhole-direction/shot-plan.json`, `asset/generated/approved/gif/gif-001-thumbhole-direction-hybrid-v01.gif`, `hyperframes/renders/gif-001-thumbhole-direction-hybrid-v01.mp4`, `asset/generated/approved/gif/gif-001-thumbhole-direction-hybrid-v01.manifest.json`, `qa/reports/g3-gif-motion-rev002.json`, `qa/reports/g3-gif-motion-rev002.md`, `qa/evidence/g3-gif-motion/rev001/rendered-v01/rendered-contact-start-worn-palm-loop-v01.png`
- `artifact_sha256`:
  - `planning/GIF.md`: `95437886c165fcf1ceed768be6b7800279ccc4fd080f963ad800b75b7e847cd5`
  - `asset/asset-manifest.json`: `5b7981b7db398f925766a3ce6cf12435e6758fee9b5b982560eecd486a533100`
  - `hyperframes/projects/gif-001-thumbhole-direction/index.html`: `d1ab35a63ab966ebb3fe5258dbe8054dc644bd5f297e6db7e281bf61634edb0d`
  - `hyperframes/projects/gif-001-thumbhole-direction/index.motion.json`: `29bfa164816d4417727113c93f44dde5c3a005d1a1733417cb2548a1fd754329`
  - `hyperframes/projects/gif-001-thumbhole-direction/shot-plan.json`: `8584fdf4ae2549796b3aa4c4c9ce8a9879a289c013b552721dc9ef7309c16ac1`
  - `asset/generated/approved/gif/gif-001-thumbhole-direction-hybrid-v01.gif`: `1bf5be35e5c0c73fb531750051b3e5415bc3c23efb35c9a5cc7450a87a7db8aa`
  - `hyperframes/renders/gif-001-thumbhole-direction-hybrid-v01.mp4`: `6cecc938938f2c74621b676e18ebcae6c0d0273a45a38309c3d6ca295c0263c0`
  - `asset/generated/approved/gif/gif-001-thumbhole-direction-hybrid-v01.manifest.json`: `fba0b0a35d7d2b15a5a0390ae0c9fbee1be3b687a0e6f7770a2ae670f96f9b66`
  - `qa/reports/g3-gif-motion-rev002.json`: `27f9976ffa8ee82850823d719b901bd1d9daeb6bd924d897e903eec08828cd96`
  - `qa/reports/g3-gif-motion-rev002.md`: `fc9a5d94108a3a24e8f2bc8beee0b08e53e4a6c6f91617080c5ae93eec7decc7`
  - `qa/evidence/g3-gif-motion/rev001/rendered-v01/rendered-contact-start-worn-palm-loop-v01.png`: `f80cd6dbe28886e55f2221f6c262727d6374540a53cca6750f2681faea7e0776`
- `preparation_status`: complete
- `g2_dependency`: approved
- `reviewer_session`: human_user
- `requested_decision`: none
- `decision`: approved
- `decided_at`: 2026-07-27T20:46:16.590Z
- `findings`:
  - G2 승인본 A05 v01, E08 v03, B06 v02만 사용했다.
  - HyperFrames 0.7.76 strict 검사에서 lint·runtime·layout·motion·contrast 오류와 경고가 모두 0이다.
  - 800×800, 30fps, 3.2초, 96프레임의 MP4와 무한 반복 GIF 렌더를 완료했다.
  - 실제 GIF 홀드 프레임 0·41·71·95와 전환 프레임 26·56·84를 추출해 제품 동일성·손 해부학·이중 노출 여부를 검사했다.
  - 실제 GIF의 첫 프레임과 마지막 프레임은 같은 SHA-256으로 바이트 단위까지 동일하다.
  - 냉감·UV 차단·통풍·신축 복원·흘러내림 방지 성능을 암시하는 텍스트나 효과를 사용하지 않았다.
  - GIF 원본 SHA-256을 유지한 채 `asset/generated/approved/gif`로 승격했다.
- `required_changes`: 없음. G4 ASSEMBLED_HTML 진행 가능.
- `render_authorization`: `gif 렌더하자`
- `user_confirmation`: `승인`

## G3 EXTENSION GIF-002~010

- `artifact_paths`: `planning/gif-batch-002-010-plan.json`, `hyperframes/projects/gif-batch-002-010/index.html`, `hyperframes/projects/gif-batch-002-010/rows.json`, `hyperframes/projects/gif-batch-002-010/renders/manifest.json`, `asset/generated/pending/gif/gif-batch-002-010-manifest.json`, `qa/reports/g3-gif-batch-002-010-rev001.json`, `qa/reports/g3-gif-batch-002-010-rev001.md`, `qa/evidence/g3-gif-motion/batch-002-010-rev001/gif-002-010-review-contact-9x5.png`
- `artifact_sha256`:
  - `planning/gif-batch-002-010-plan.json`: `d16823f1d6afa963877e202be4cbf35b71d3257a21f39b5241bd382302704839`
  - `hyperframes/projects/gif-batch-002-010/index.html`: `38e1dd6fd32f74a0b01a1e3852f862512d666c90ccd72c4196ff624ad69aee05`
  - `hyperframes/projects/gif-batch-002-010/rows.json`: `497839543e7b319045107c394e87bc0e41c2d1668d9a8b1b007236da3543b3b1`
  - `hyperframes/projects/gif-batch-002-010/renders/manifest.json`: `be8497d0e974e8bcba6794c4f9c6cceb68045c0965476bce1255a636ff6c04f9`
  - `asset/generated/pending/gif/gif-batch-002-010-manifest.json`: `34c5e9f20bf1df0e8fcf732d1560f6c2521d1c3fbd18dc025ec0d6a8d76a97c6`
  - `qa/reports/g3-gif-batch-002-010-rev001.json`: `41231940624ee8257deca104313966413fbedf1b7f3f48cc24aae19b4b691b56`
  - `qa/reports/g3-gif-batch-002-010-rev001.md`: `9fbe4be5febf2f6f06639b2ae625f19bebec327505315ab6d9ce29a592545f02`
  - `qa/evidence/g3-gif-motion/batch-002-010-rev001/gif-002-010-review-contact-9x5.png`: `2a056cef92f28f1a022fe03f038dda9e43ee7f6a31a5beba32e0cf1b44414920`
- `preparation_status`: approved
- `rendered_count`: 9
- `failed_count`: 0
- `total_gif_count`: 10
- `approved_image_count`: 40
- `decision`: approved
- `decided_at`: 2026-07-27T23:42:04.483Z
- `findings`:
  - HyperFrames 0.7.76 strict 검사에서 오류·경고 0으로 통과했다.
  - 추가 9개는 모두 800×800, 3.2초, 96프레임, 무한 반복 GIF다.
  - 실제 디코딩 첫 프레임과 마지막 프레임이 9개 모두 바이트 단위로 동일하다.
  - 승인된 G2 이미지 17개만 사용했고 제품·모델을 새로 생성하거나 변형하지 않았다.
  - 사용자가 수정 3종을 포함한 현재 10개 세트의 상세페이지 조립을 요청했다.
  - 선택된 9개는 `asset/generated/approved/gif`로 승격하고 교체 전 3개는 `asset/generated/rejected/gif`에 보존했다.
- `required_changes`: 없음. G4 ASSEMBLED_HTML 진행 가능.
- `render_authorization`: `gif 는 내 승인 받지말고 다 만든후에 나에게 알려 그때 검토해줄게`
- `user_confirmation`: `응 이제 만들어줘`

### G3 EXTENSION FEEDBACK rev002

- `affected_gif_ids`: GIF-003, GIF-005, GIF-009
- `preserved_gif_ids`: GIF-001, GIF-002, GIF-004, GIF-006, GIF-007, GIF-008, GIF-010
- `artifact_paths`: `planning/gif-feedback-rev002-plan.json`, `hyperframes/projects/gif-batch-002-010/rows-rev002-feedback.json`, `hyperframes/projects/gif-batch-002-010/renders-rev002/manifest.json`, `asset/generated/pending/gif/gif-feedback-rev002-manifest.json`, `qa/reports/g3-gif-feedback-rev002.json`, `qa/reports/g3-gif-feedback-rev002.md`, `qa/evidence/g3-gif-motion/batch-002-010-rev002-feedback/gif-003-005-009-review-contact-v02.png`, `qa/evidence/g3-gif-motion/batch-002-010-rev002-feedback/gif-002-010-current-review-contact-9x5.png`
- `artifact_sha256`:
  - `planning/gif-feedback-rev002-plan.json`: `78783d9ededb86a51414daace64a60f59ac083d4aa0b0f32668b7cb94f5056a3`
  - `hyperframes/projects/gif-batch-002-010/rows-rev002-feedback.json`: `5d60612f013aa2620823f2a9cb5c4764443be8e6b2cb3ee4789500cd1918e232`
  - `hyperframes/projects/gif-batch-002-010/renders-rev002/manifest.json`: `74485e441df729d32e2750d3a6e10fc4997f41a8ea2eef1ac27622517d43339a`
  - `asset/generated/pending/gif/gif-feedback-rev002-manifest.json`: `3a8810815492bef625affb6a8f3ee25fda19b60bedbf1ce9f0531770a8701556`
  - `qa/reports/g3-gif-feedback-rev002.json`: `8b88f7af929f4fa7da391f0fecc60fce024aa2c00f9dc5478c4f96639edf7c65`
  - `qa/reports/g3-gif-feedback-rev002.md`: `4bc7302243e34dd7ab6f159af0ee4c2b7060cce15be8ef633bcd651817055c08`
  - `qa/evidence/g3-gif-motion/batch-002-010-rev002-feedback/gif-003-005-009-review-contact-v02.png`: `ea875a5fd725a5138cae5c0797062baf748afea02cbd1ae38f6e2612b3cf725f`
  - `qa/evidence/g3-gif-motion/batch-002-010-rev002-feedback/gif-002-010-current-review-contact-9x5.png`: `ad8f4a489359cc5ad8138448f0acb5af899654736b5b74e4ddb0ba7d656b38d7`
- `preparation_status`: approved
- `decision`: approved
- `decided_at`: 2026-07-27T23:42:04.483Z
- `findings`:
  - GIF-003 v02는 동일 D01 v02 한 쌍의 개별 크롭으로 크기를 맞추고 큰 엄지홀 노출을 제거했다.
  - GIF-005 v02는 왼쪽 보조 제품이 포함되지 않은 밴드·봉제 크롭을 사용했다.
  - GIF-009 v02는 B02 v01과 C07 v01에서 라벨이 손등 커프에 자연스럽게 놓인 장면을 연결했다.
  - 세 파일 모두 800×800, 3.2초, 96프레임, 무한 반복이며 첫·마지막 디코딩 프레임이 동일하다.
- `required_changes`: 없음. v02 세 파일을 현재 세트로 확정.
- `user_confirmation`: `응 이제 만들어줘`

## G4 ASSEMBLED_HTML

- `artifact_paths`: `html/index.html`, `html/styles.css`, `html/app.js`, `assembly/assets-lock-rev016.json`, `qa/reports/g4-assembled-html-rev016.json`, `qa/reports/g4-assembled-html-rev016.md`, `qa/evidence/g4-assembled-html/rev016/viewport-320-top.png`, `qa/evidence/g4-assembled-html/rev016/viewport-390-contact.png`, `qa/evidence/g4-assembled-html/rev016/viewport-390-construction.png`, `qa/evidence/g4-assembled-html/rev016/viewport-390-finale.png`
- `artifact_sha256`:
  - `html/index.html`: `75d2fa3ac8ceeefcf37d83284fc0953b072a4710441cddf4721ea75a97a9b919`
  - `html/styles.css`: `2d3985d9df7cf9c351009fc91d669a80cd301dda36f1db925a44730d7ec507b1`
  - `html/app.js`: `59241df50a7ad39aa7b0fe9db7a7ccc32bc40a5e870005455d1a70fab2e2fd8f`
  - `asset/asset-manifest.json`: `67e7e974bc01e5f4155dd8bc369fdb99a4fa9efa8eda4c1c6f236d3752e798bf`
  - `assembly/assets-lock-rev016.json`: `ca5805fc6787e2de1929f5627625412182de7c0274f2e7798cfb2e45c21faeb9`
  - `qa/reports/g4-assembled-html-rev016.json`: `baccb58931a20dd313f9a71042c637246c15024ffafb9622c64332ce5b19f347`
  - `qa/reports/g4-assembled-html-rev016.md`: `25f00b127c32f19c1df003ee61f34d4219d5b20177ef5020a7f6020efde5ba3d`
- `preparation_status`: approved
- `qa_score`: 98
- `section_count`: 12
- `approved_image_count`: 40
- `approved_gif_count`: 10
- `public_asset_count`: 50
- `reviewer_session`: human_user
- `decision`: approved
- `decided_at`: 2026-07-28T00:42:54.727Z
- `findings`:
  - 승인 이미지 40개와 승인 GIF 10개를 각각 한 번씩 사용해 12개 구매 여정 섹션으로 조립했다.
  - GIF-003, GIF-005, GIF-009는 사용자 피드백을 반영한 v02를 사용했다.
  - 320, 360, 390, 768, 800px CSS 뷰포트에서 가로 넘침, 깨진 자산, 외부 이탈 텍스트가 0건이다.
  - 공개 화면에는 pending/rejected 경로와 제작자 메타데이터가 노출되지 않는다.
  - 사용 자산 50개와 HTML/CSS/편집 런타임의 SHA-256을 `assembly/assets-lock-rev016.json`에 고정했다.
- `required_changes`: 없음. G5 최종 QA 진행 가능
- `user_confirmation`: `승인`

## G5 PUBLISH

- `artifact_paths`: `asset/output/page/rev017/preview-local.html`, `asset/output/page/rev017/sallang-loosefit-coolsleeve-rev017-standalone.html`, `asset/output/page/rev017/package-manifest.json`, `assembly/publish-lock-rev017.json`, `qa/reports/g5-publish-rev017.json`, `qa/reports/g5-publish-rev017.md`, `qa/evidence/g5-publish/rev017/public-preview-390-top.png`, `qa/evidence/g5-publish/rev017/public-preview-390-finale.png`, `planning/LEARNINGS.md`
- `artifact_sha256`:
  - `asset/output/page/rev017/preview-local.html`: `e4e3a2ed710fdb2d640f7ebdcf496ba69657866581796474df4ec7bc4289b8ac`
  - `asset/output/page/rev017/sallang-loosefit-coolsleeve-rev017-standalone.html`: `535afc7e76b182d03c8cd29acdefd3c533d738e2522be9d0713c68412d6091ca`
  - `asset/output/page/rev017/package-manifest.json`: `7119f0c585858c4b4c6466d7bc5a812ad11ff888257b84861642d8ea9203dcf3`
  - `assembly/publish-lock-rev017.json`: `d1d0c4a3a1c89f43455a3876a599b4a2a1aff8280e724e87c8a8b4c49163ad0c`
  - `qa/reports/g5-publish-rev017.json`: `2183bbd3ed744acdb7b313084c60217d6fb40e59e4efdf4cd8e99f2cb5e688a6`
  - `qa/reports/g5-publish-rev017.md`: `f162c5e212f15d7517515f11073c372422a1d5682332e024f484b104812177db`
  - `qa/evidence/g5-publish/rev017/public-preview-390-top.png`: `45e6f85d278815017b4539ee842c50fda4c4e07615b7d4c0d0a2bea114afb687`
  - `qa/evidence/g5-publish/rev017/public-preview-390-finale.png`: `469535116fa37fce5a6b58ad46ccc2187af069d87ef07768918279598cfe235f`
  - `planning/LEARNINGS.md`: `242df6c2b532adf1b98210fbdc3cf2e8e1d87e1ba49d756b47d6df68effecfec`
- `preparation_status`: qa_passed_pending_user_publish_approval
- `qa_score`: 98
- `static_webp_count`: 40
- `animated_webp_count`: 10
- `public_asset_count`: 50
- `standalone_bytes`: 51905372
- `external_deployment`: not_started
- `wing_publication`: not_started
- `decision`: pending
- `decided_at`:
- `findings`:
  - 승인 자산 50개를 정적 WebP 40개와 애니메이션 WebP 10개로 최적화했다.
  - 애니메이션 10개의 총 재생시간 3,200ms와 무한 반복 설정을 유지했다.
  - 모든 개별 출력 자산은 10MiB 미만이며 SHA-256 불일치가 0건이다.
  - 독립 실행 HTML은 CSS와 WebP 50개를 모두 내장하고 스크립트·외부 스타일시트·상대 자산 경로가 0건이다.
  - 320, 360, 390, 768, 800px 브라우저 검사에서 가로 넘침·깨진 자산·외부 이탈 텍스트가 0건이다.
  - 브라우저에서 독립 실행 HTML을 다시 열어 내장 자산 50개가 모두 로드되는 것을 확인했다.
- `required_changes`: 사용자 G5 게시 승인
- `user_confirmation`: pending

## REV-018 COMMERCIAL FLOW REOPEN

- `requested_at`: 2026-07-28
- `requested_by`: human_user
- `user_direction`: `루즈핏, 손등 커버, 시원한 쿨 소재, 어떤 스타일에도 잘 붙는 팔토시를 네 가지 주장 및 장점으로 두고 각각 이미지와 GIF로 증거 제출. 이후 사용법, 실제 후기, 문제 해결, 사이즈 및 상세 스펙, 마지막 리마인드 순서. 쿨링은 온도가 낮아지는 방향을 그래프로 표현.`
- `manufacturer_claim`: MFR-CLAIM-COOL-MATERIAL
- `manufacturer_claim_policy`: 제조사 살랑을 대표한 사용자 확인을 제품 사실로 기록하고 정성적 쿨링 카피·이미지·GIF에 사용한다. 미제공 수치는 만들지 않는다.
- `artifact_sha256`:
  - `product/product-manifest.json`: `c69b7fc4616e810f215b8c49dc954e59b0c43c9314dd5cb14fcff968abbfa277`
  - `planning/COMMERCIAL.md`: `3bbdc471357f54598dcb2f916f33ce4701bd210aa484e7ac95b80e97186d37b5`
  - `planning/BUYER-JOURNEY.md`: `af19a0c630c49173cfc9cc28095675f7c32d3e27a522c38ef8985dcd3a63497d`
  - `planning/GIF.md`: `104d8509387e30ca23058d78f97e32fd4cbc89d0fd09132cf85e93b6f8a5e221`
  - `planning/ASSET-PLAN.md`: `a1e3107bd6b08cc2f3891e3fb9aed05a07e9a28316ea2367e6b9d52b70fc9287`
- `g0_claim_extension`: 제품 실루엣·색·수량·라벨·치수 SSOT는 바꾸지 않고 `MFR-CLAIM-COOL-MATERIAL` 메타데이터만 사용자 확인으로 추가했다.
- `preserved_approvals`: G0 물리 제품 동일성, G2A 모델 시트, 기존 G2 이미지와 기존 G3 GIF 파일 승인 자체는 보존한다.
- `reopened_gates`: G1 COMMERCIAL_PLAN, 신규 G2 이미지 COOL-01·STYLE-01·HOWTO-01, 신규 G3 GIF-011·GIF-012·GIF-013, G4 ASSEMBLED_HTML, G5 PUBLISH
- `invalidated_output`: rev016 조립본과 rev017 게시 후보는 이력으로 보존하지만 현재 게시 후보로 사용하지 않는다.
- `current_decision`: held
- `required_changes`: Rev-018 기획 검토 뒤 신규 증거 에셋 제작과 새 HTML 조립
- `user_confirmation`: 현재 메시지로 방향 확정, 신규 시각 자산과 조립본은 별도 게이트

## REV-021 COMMERCIAL REVIEW PACKAGE

- `prepared_at`: 2026-07-28
- `status`: qa_passed_pending_user_visual_review
- `entrypoint`: `deliverables/rev021-commercial/index.html`
- `manifest`: `deliverables/rev021-commercial/manifest.json`
- `final_report`: `deliverables/rev021-commercial/qa/final-report.md`
- `browser_report`: `deliverables/rev021-commercial/qa/browser-harness-report.json`
- `image_count`: 16
- `gif_count`: 10
- `new_god_tibo_candidates`: 24
- `candidate_qa_result`: pass 23 / rejected 1
- `viewport_result`: 320·360·390·768·800px 모두 깨진 미디어·가로 넘침·대체문자 0건
- `output_contract`: 사용자에게는 `deliverables/<revision>/index.html`만 안내
- `decision`: pending
- `requested_decision`: approve_or_request_changes
- `external_deployment`: not_started
- `wing_publication`: not_started
