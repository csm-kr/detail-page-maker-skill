---
name: detail-page-g6-stills
description: detail-page-orchestrator 가 G6 에서 호출한다. 발행 플랜으로 스틸을 생성하고 원본 해상도로 선별해 selection.json 을 쓴다. 직접 호출하면 선행 게이트
  검사로 거부되므로 오케스트레이터를 통해 진입한다.
---

# G6 · 스틸

발행 플랜으로 스틸을 생성하고 원본 해상도로 선별해 selection.json 을 쓴다.

## 이 게이트가 없으면 무엇이 조용히 깨지는가

2회차에 30장을 만들어 30장을 그대로 발행했다. 탈락 0건, 원본 해상도로 검사한 컷 0장이었다.

## 진입

```bash
node scripts/run.mjs
```

첫 줄이 선행 게이트 검사다. 통과하지 않았으면 거부하고 부족한 게이트를 알려준다.
순서와 상태는 오케스트레이터가 소유하고 이 스킬은 **판정과 작업만** 소유한다.

## 해야 하는 것

- `scripts/run.mjs` 가 batch 를 돌려 `work/gen/` 에 생성한다
- **컷마다 원본 해상도로 열어** 제품 동일성을 본다. 썸네일로 판정하지 않는다
- 얼굴 정책과 어긋난 컷을 탈락시킨다
- `no_product` 컷에 착용 사진을 레퍼런스로 넣지 않는다
- `work/selection.json` 에 컷마다 채택·탈락과 이유, `checked_at_full_res` 를 남긴다
- 탈락 컷은 재생성 job 을 만든다

## 통과

```bash
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G6 --check
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G6 --pass
```

`--pass` 는 언제나 `scripts/check.mjs` 를 다시 돌린다. 검사를 건너뛴 통과 기록은 남지 않는다.
