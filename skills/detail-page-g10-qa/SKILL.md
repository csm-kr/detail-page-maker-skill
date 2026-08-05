---
name: detail-page-g10-qa
description: detail-page-orchestrator 가 G10 에서 호출한다. strict-media QA 와 포맷·용량을 검사한다. 직접 호출하면 선행 게이트
  검사로 거부되므로 오케스트레이터를 통해 진입한다.
---

# G10 · QA

strict-media QA 와 포맷·용량을 검사한다.

## 이 게이트가 없으면 무엇이 조용히 깨지는가

2회차에 사진 31장을 PNG 21.3 MB 로, GIF 를 16.4 MB 로 발행해 합계 38 MB 였다. 압축 단계가 없었다.

## 진입

```bash
node scripts/run.mjs
```

첫 줄이 선행 게이트 검사다. 통과하지 않았으면 거부하고 부족한 게이트를 알려준다.
순서와 상태는 오케스트레이터가 소유하고 이 스킬은 **판정과 작업만** 소유한다.

## 해야 하는 것

- `scripts/run.mjs` 가 strict-media QA 와 용량·포맷 검사를 돌린다
- 사진은 `policy.photo_format` 을 따른다. PNG 로 남기지 않는다
- 미디어 총량이 `policy.media_budget_mb` 를 넘지 않게 한다

## 통과

```bash
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G10 --check
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G10 --pass
```

`--pass` 는 언제나 `scripts/check.mjs` 를 다시 돌린다. 검사를 건너뛴 통과 기록은 남지 않는다.
