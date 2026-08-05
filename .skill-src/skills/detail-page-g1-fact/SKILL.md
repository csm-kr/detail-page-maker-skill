---
name: detail-page-g1-fact
description: detail-page-orchestrator 가 G1 에서 호출한다. 공급처와 실물 사진에서 공개에 필요한 사실만 잠가 SSOT.md 를 쓴다. 직접 호출하면 선행 게이트
  검사로 거부되므로 오케스트레이터를 통해 진입한다.
---

# G1 · 사실 잠금

공급처와 실물 사진에서 공개에 필요한 사실만 잠가 SSOT.md 를 쓴다.

## 이 게이트가 없으면 무엇이 조용히 깨지는가

2회차에 공급처를 다시 받지 않고 하루 지난 캡처를 무경고로 재사용했고, 사진을 원본 해상도로 열지 않았다.

## 진입

```bash
node scripts/run.mjs
```

첫 줄이 선행 게이트 검사다. 통과하지 않았으면 거부하고 부족한 게이트를 알려준다.
순서와 상태는 오케스트레이터가 소유하고 이 스킬은 **판정과 작업만** 소유한다.

## 해야 하는 것

- 공급처 페이지를 **다시** 받고 `orchestrate lock --read <캡처> --url <공급처>` 로 등록한다
- 실물 사진을 **원본 해상도로** 열어 실루엣·색·부품·수량·방향을 확인한다
- 부품의 가동 범위, 분리 가능 여부, 결합 방향, 사용 자세 제약을 함께 적는다
- `work/SSOT.md` 에 **공개 가능한 사실만** 쓴다. 근거 없는 제약을 규칙으로 적지 않는다
- 사진 확인을 `확인: 원본 해상도` 한 줄로 SSOT.md 에 남긴다

## 통과

```bash
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G1 --check
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G1 --pass
```

`--pass` 는 언제나 `scripts/check.mjs` 를 다시 돌린다. 검사를 건너뛴 통과 기록은 남지 않는다.
