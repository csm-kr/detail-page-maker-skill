# 설치·진단

설치, 업데이트 또는 실행 오류를 다룰 때만 읽는다.

## 설치와 업데이트

```sh
npx skills add https://github.com/csm-kr/detail-page-maker-skill --skill detail-page-maker-skill --agent codex --yes --copy
npx skills update detail-page-maker-skill --project --yes
```

상위 스킬 하나만 설치한다. 도매꾹·쿠팡 추출기, 디자인 도구, God Tibo와
Browser Harness 지침은 번들에 포함된다. HyperFrames 지침은 호스트 설치본,
실행 패키지는 motion 프로젝트의 로컬 runtime을 사용한다.

## 진단

설치된 스킬 폴더에서 실행한다.

```sh
node scripts/detail-page.mjs doctor
node scripts/e2e.mjs
node scripts/detail-page.mjs agent-capacity
```

Node.js 22.15.0 이상, FFmpeg, Browser Harness와 HyperFrames 지침이 필요하다.
`doctor`가 누락 항목을 보고하면 해당 runtime이나 호스트 스킬을 준비한다.

Windows에서 job JSON을 만들 때 PowerShell의 `Set-Content -Encoding utf8`과
`Out-File`은 BOM을 붙인다. Node의 `JSON.parse`가 `Unexpected token '﻿'`로
실패하므로 BOM 없이 저장하거나 편집기로 직접 작성한다.

## 새 프로젝트

```sh
node scripts/detail-page.mjs new \
  --name "상품명" \
  --supplier-url "https://supplier.example/item/123456" \
  --coupang-url "https://www.coupang.com/vp/products/123456" \
  --photos no
```

사용자 사진은 생성된 프로젝트의 `input/product/`에 둔다. 공개 결과는
`output/detail-page.html`, `output/media/`, `output/wing/` 아래에만 만든다.

```sh
node scripts/detail-page.mjs validate-plan --file "<flow-plan.json>"
node scripts/detail-page.mjs qa --project "<project>" --strict-media
node scripts/detail-page.mjs studio --project "<project>"
node scripts/detail-page.mjs wing --project "<project>" --mode dry-run
```

## 멀티에이전트

호스트가 session을 제공하면 실제 고유 session만 사용한다. ID를 추측하거나 가짜
session을 만들지 않는다. Orchestrator 자리를 남겨 두고 나머지 slot을 Evidence,
Flow, Planning/Production, QA에 배정한다. 브라우저 lane과 이미지 provider worker
수는 agent slot과 별도로 관리한다.
