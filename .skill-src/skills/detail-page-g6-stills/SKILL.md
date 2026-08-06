---
name: detail-page-g6-stills
description: detail-page-orchestrator 가 G6 에서 호출한다. 기준 컷 한 장을 먼저 만들고 그것을 레퍼런스로 나머지를 생성한 뒤 원본 해상도로 선별해 selection.json 을 쓴다. 직접 호출하면 선행 게이트
  검사로 거부되므로 오케스트레이터를 통해 진입한다.
---

# G6 · 스틸

기준 컷으로 제품 정체성을 고정하고, 나머지를 그 레퍼런스로 생성해 원본 해상도로 선별한다.

## 이 게이트가 없으면 무엇이 조용히 깨지는가

2회차에 30장을 만들어 30장을 그대로 발행했다. 탈락 0건, 원본 해상도로 검사한 컷 0장이었다.

3회차에는 선별을 제대로 했더니 30장 중 18장이 탈락했다. 원인은 판정이 아니라 생성이었다 —
`items[].references` 가 30개 전부 비어 있어 컷마다 따로 생성됐고, 프롬프트에 문자 금지가
없어 PUREHABIT·LeafShield 같은 없는 브랜드와 NON-TOXIC 배지가 이미지에 구워졌다.

## 진입

```bash
node scripts/run.mjs --base      # 기준 컷 한 장
node scripts/run.mjs             # 나머지. 기준 컷을 레퍼런스로 쓴다
node scripts/run.mjs --regen     # 탈락한 컷만 다시. 채택분은 건드리지 않는다
node scripts/run.mjs --publish   # 채택분만 780px 발행
```

첫 줄이 선행 게이트 검사다. 통과하지 않았으면 거부하고 부족한 게이트를 알려준다.
순서와 상태는 오케스트레이터가 소유하고 이 스킬은 **판정과 작업만** 소유한다.

## 해야 하는 것

- `--base` 로 **기준 컷 한 장을 먼저** 만든다. 이 한 장이 나머지 전부의 제품 정체성을 정한다
- 기준 컷을 **원본 해상도로 보고** 마음에 들 때까지 다시 만든다. 여기서 타협하면 29장이 따라간다
- 나머지 생성은 기준 컷을 `references[0]` 로 받는다. `scripts/lib/prompt.mjs` 가 자동으로 붙인다
- 프롬프트에는 문자·로고·브랜드 금지가 자동으로 붙는다. **지우지 않는다**
- **컷마다 원본 해상도로 열어** 제품 동일성을 본다. 썸네일로 판정하지 않는다
- 얼굴 정책과 어긋난 컷을 탈락시킨다
- `no_product` 컷에 착용 사진을 레퍼런스로 넣지 않는다
- `work/selection.json` 에 컷마다 채택·탈락과 이유, `checked_at_full_res`, `file` 을 남긴다
- 탈락 컷에는 `regen_job` 을 적고 `--regen` 으로 **그것만** 다시 굽는다. 전체를 다시 굽지 않는다

## 통과

```bash
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G6 --check
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G6 --pass
```

`--pass` 는 언제나 `scripts/check.mjs` 를 다시 돌린다. 검사를 건너뛴 통과 기록은 남지 않는다.
