---
name: commercial-render
description: 상세페이지 상업 증명 모션을 만든다. 제품 사실과 승인된 자산에서 증명 동사 슬롯을 뽑고, 제품 픽셀이 고정이면 HyperFrames로 780 결정론 MP4를, 제품이 실제로 변해야 하면 make-consistent-gif로 프레임 생성 시퀀스를 돌린 뒤 FFmpeg로 GIF·animated WebP·poster를 파생한다. 상세페이지 GIF 기획·모션 슬롯 배정·엔진 선택·루프와 용량 QA·회전 턴어라운드·전후 비교·치수 공개·설치 단계 모션이 필요할 때 사용한다.
---

# Commercial Render

상세페이지 모션은 예쁜 움직임이 아니라 **정지 이미지로는 전달되지 않는 정보 하나**를 추가하는 증명이다.
이 스킬은 증명 동사를 고르고, 엔진을 고르고, 결과를 게이트로 막는다.

## 실행

1. [`references/proof-verbs.md`](references/proof-verbs.md)에서 이 제품이 **실제로 증명 가능한** 동사만 고른다.
   감각·성능처럼 사진으로 안 보이는 주장은 [`references/claim-visuals.md`](references/claim-visuals.md)에서
   시각 은유를 먼저 고르고 근거 등급을 확인한다.
2. 동사마다 근거를 확인한다. 근거가 약하면 대체 동사를 검토하되, 슬롯 발급을 막지는 않는다.
3. [`references/engine-routing.md`](references/engine-routing.md)로 동사별 엔진을 확정한다.
4. `motions.json` 슬롯 스펙을 쓴다. 스키마는 `scripts/build_motions.py --schema`.
5. HyperFrames 슬롯을 생성하고 렌더한다.
6. make-consistent-gif 슬롯은 해당 스킬의 워크플로를 그대로 따른다.
7. `scripts/qa_motion.py`로 게이트를 통과시킨다. 실패 슬롯만 다시 만든다.

```sh
python3 scripts/build_motions.py --spec motions.json --out <projects-dir>
bash scripts/render.sh --projects <projects-dir> --out <renders-dir> --spec motions.json
python3 scripts/qa_motion.py --spec motions.json --renders <renders-dir>
```

## 엔진 선택 — 단 하나의 질문

> **제품 픽셀이 프레임 사이에 바뀌어야 하는가?**

| 답 | 엔진 | 근거 |
| --- | --- | --- |
| 아니오. 제품은 고정이고 카메라·오버레이·레이어만 움직인다 | **HyperFrames** | 결정론 렌더라 제품 동일성이 구조적으로 100% 보장된다. 780×780 3.5초에 약 6초 렌더 |
| 예. 회전·접힘·개봉·결합·변형처럼 제품 자체가 달라진다 | **make-consistent-gif** | 프레임별 생성 + 실루엣 드리프트·정체성 QA + 시퀀스 선택으로 생성형 모핑을 막는다 |

HyperFrames로 제품을 바꾸려 하지 않는다. CSS 변환으로는 불가능하고, 억지로 흉내 내면 형상이 깨진다.
make-consistent-gif로 오버레이 정보 모션을 만들지 않는다. 결정론이 없어 치수선·라벨이 프레임마다 흔들린다.

## 슬롯 계약

각 슬롯은 다음을 모두 가진다. 하나라도 없으면 슬롯이 아니다.

- `verb` — 증명 동사 하나
- `customer_question` — 이 모션이 답하는 구매 질문 하나
- `visible_delta` — 첫 프레임과 중간 프레임 사이에 **눈으로 확인되는 정보 차이**
- `evidence` — 그 delta를 뒷받침하는 제품 사실 또는 관찰 (선택. 없으면 경고만)
- `engine` + `template`
- `first_frame_claim` — 첫 프레임만 봐도 이해되는 한 줄

`visible_delta`를 쓸 수 없으면 그 모션은 장식이다. 정지 이미지로 내린다.

## 커버리지

문제 2+ · 해결 장점별 1+ · 사용 1+ · 비교 1+ · **치수 1+**.
치수는 상품 종류와 무관하게 항상 만든다. 수치 근거가 없으면 `재기` 대신
`대보기`(기준물 비교)로 바꾸되 슬롯 자체를 빼지 않는다.

## 하드 게이트 — 이것만 실패로 막는다

- 첫 프레임에 제품 또는 문제 · 한 줄 메시지 · 시각 근거가 **모두** 보인다.
- 제품 색·형태·부품 수·비율·구성은 모든 프레임에서 고정된다.
- 한글을 쓰는 컴포지션은 `@font-face` + `src: local(...)`을 선언한다. 없으면 `lint` 실패.
- 밝은 제품 위 밝은 텍스트는 스크림 또는 배경 pill을 깐다. 없으면 `check` 명암비 실패.

## 경고 — 기록만 하고 렌더를 막지 않는다

- 마지막 프레임의 첫 프레임 복귀. 루프 경계에서 밝기·속도·위치가 튀는지.
- 인접 슬롯이 `카메라 · 핵심 변화 · 전환 · 강조 그래픽` 4축 중 2축 이상 다른지.
- GIF 총합 용량. **상한 없음.** 합계만 출력한다. [`references/gif-budget.md`](references/gif-budget.md).
- 새 정보를 주지 않는 팬·줌·흔들기·광선·입자만의 움직임은 coverage로 세지 않는다.

## 오버레이 신뢰도

| confidence | 표현 |
| ---: | --- |
| 0.85 이상 | 정규화 anchor point · ring · trace line |
| 0.60~0.85 | 넓은 bbox glow · spotlight |
| 0.60 미만 | 제품 위 표기를 포기하고 별도 detail 컷 |

한 모션의 포인트 수에 상한은 없다. 동시에 3개를 넘기지 않도록 순차로 밝히고 각 0.8~1.2초 유지한다.
포인트가 많으면 모션 길이를 늘린다. 포인트를 지우지 않는다.

## reference 라우팅

| 상황 | 문서 |
| --- | --- |
| 동사 고르기·근거 게이트·카테고리별 기본 세트 | [`proof-verbs.md`](references/proof-verbs.md) |
| 안 보이는 주장을 무엇으로 보이게 할지 | [`claim-visuals.md`](references/claim-visuals.md) |
| 엔진 결정·fallback·두 엔진 혼용 | [`engine-routing.md`](references/engine-routing.md) |
| 780 컴포지션 뼈대·오버레이 종류·결정론 허용 속성 | [`composition.md`](references/composition.md) |
| fps·팔레트·디더·용량 예산 | [`gif-budget.md`](references/gif-budget.md) |
| 첫 프레임·루프·다양성 검사 | [`loop-qa.md`](references/loop-qa.md) |
| 반복 실패 패턴과 해결책 | [`pitfalls.md`](references/pitfalls.md) |

애니메이션 규칙·블루프린트·전환 카탈로그는 형제 `hyperframes-animation`을 인용한다.
컴포지션 문법은 `hyperframes-core`, 렌더 명령은 `hyperframes-cli`를 따른다.
정지 자산 생성은 `god-tibo-gpt-image2-skill`, 프레임 시퀀스는 `make-consistent-gif`가 담당한다.

## 중단 조건

- 증명 동사에 필요한 자산이 없는데 생성으로 지어내야 하는 경우
- 두 엔진 모두 제품 동일성을 보장하지 못하는 경우
