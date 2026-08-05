---
name: detail-page-g3-plan
description: detail-page-orchestrator 가 G3 에서 호출한다. SSOT 와 flow-map 으로 Lean Page Plan 초안을 쓴다. 화면 문자열을 전량 담는다. 직접 호출하면 선행 게이트
  검사로 거부되므로 오케스트레이터를 통해 진입한다.
---

# G3 · 플랜

SSOT 와 flow-map 으로 Lean Page Plan 초안을 쓴다. 화면 문자열을 전량 담는다.

## 이 게이트가 없으면 무엇이 조용히 깨지는가

2회차에 화면 문자열 약 100개가 빌더 안에 박혀 있어 플랜 밖에서 카피가 바뀌었다. 섹션 순서는 공급처 페이지 순서를 상속했다.

## 진입

```bash
node scripts/run.mjs
```

첫 줄이 선행 게이트 검사다. 통과하지 않았으면 거부하고 부족한 게이트를 알려준다.
순서와 상태는 오케스트레이터가 소유하고 이 스킬은 **판정과 작업만** 소유한다.

## 해야 하는 것

- 섹션 집합을 **flow-map 의 `## 섹션 순서` 와 일치**시킨다. 공급처 순서를 베끼지 않는다
- **화면에 보이는 모든 문자열**을 플랜에 넣는다. 빌더에 한글을 박지 않는다
- 약 30개 still job 과 약 10개 GIF brief 를 함께 확정한다
- GIF brief 마다 `method` 를 고른다 (hyperframes / god-tibo / ffmpeg / mockup-overlay)
- 출처 없는 성능·효능·인증·수치·후기·판매량을 만들지 않는다

## 통과

```bash
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G3 --check
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G3 --pass
```

`--pass` 는 언제나 `scripts/check.mjs` 를 다시 돌린다. 검사를 건너뛴 통과 기록은 남지 않는다.
