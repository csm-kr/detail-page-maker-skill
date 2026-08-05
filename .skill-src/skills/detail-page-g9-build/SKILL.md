---
name: detail-page-g9-build
description: detail-page-orchestrator 가 G9 에서 호출한다. 발행 플랜과 page-plan 으로 폭 780px HTML 과 앵커 스냅샷을 만든다. 직접 호출하면 선행 게이트
  검사로 거부되므로 오케스트레이터를 통해 진입한다.
---

# G9 · 조립

발행 플랜과 page-plan 으로 폭 780px HTML 과 앵커 스냅샷을 만든다.

## 이 게이트가 없으면 무엇이 조용히 깨지는가

2회차에 빌더에 한글 문자열 약 100개가 박혀 있었고, 콜아웃·지시선 좌표가 비결정적 생성 이미지에 하드코딩돼 조용히 깨질 구조였다.

## 진입

```bash
node scripts/run.mjs
```

첫 줄이 선행 게이트 검사다. 통과하지 않았으면 거부하고 부족한 게이트를 알려준다.
순서와 상태는 오케스트레이터가 소유하고 이 스킬은 **판정과 작업만** 소유한다.

## 해야 하는 것

- **모든 문자열을 `flow-plan.json` 에서 읽는다.** 빌더에 한글을 박지 않는다
- `page-plan.md` 의 수단대로 컴포넌트를 만든다
- 좌표를 붙인 이미지의 해시를 `work/anchors.json` 에 남긴다
- 색은 토큰 한 곳에서만 온다. CSS 선택자 안에 hex 를 흘리지 않는다

## 통과

```bash
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G9 --check
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G9 --pass
```

`--pass` 는 언제나 `scripts/check.mjs` 를 다시 돌린다. 검사를 건너뛴 통과 기록은 남지 않는다.
