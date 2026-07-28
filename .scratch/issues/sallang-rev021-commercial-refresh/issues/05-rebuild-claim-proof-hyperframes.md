# 05. 즉시 증명형 비교·그래프·상품 구성 GIF 재구성

- Type: task
- Status: resolved
- Label: ready-for-agent
- Blocked by: 04
- Created: 2026-07-28

## 할 일

- HyperFrames로 소구별 전용 GIF를 만든다.
- 타이트한 팔토시와 루즈핏의 차이를 슬라이드 분할 비교로 보여 준다.
- 스포티한 인상과 데일리 스타일의 차이를 같은 모델·같은 구도로 전환한다.
- 쿨링은 근거 없는 숫자 없이 착용 전·후 하강형 막대그래프로 표현한다.
- 손등까지 이어지는 길이는 착용 전·중·후가 읽히는 짧은 동작으로 증명한다.
- 상품 구성은 가장 좋은 한 쌍 이미지에 카운트·하이라이트·빛 스윕 FX를 사용한다.
- 각 GIF는 한 주장만 보여 주며 첫·중간·마지막 접촉판을 만든다.

## 수락 기준

- 슬라이드 비교의 양쪽 상태가 충분히 홀드된다.
- 막대그래프의 방향과 변화가 1초 안에 이해되며 임의 수치가 없다.
- 제품 실루엣과 카피가 겹치지 않는다.
- HyperFrames `check --strict --at-transitions` 오류·경고가 0건이다.
- GIF는 관련 소구 바로 다음 섹션에 배치할 수 있는 역할명이 있다.

## Answer

HyperFrames로 비교 와이프, 하강형 쿨링 막대·꺾은선, 스타일 매치컷,
꼬임 없는 착용 순서, 한 쌍 리빌의 전용 GIF 5개를 새로 제작했다. 기존 적합
GIF 5개와 함께 최종 10개 세트를 구성했다.

`check --strict --at-transitions --samples 15 --snapshots`는 런타임·레이아웃·
모션·대비 오류와 경고 0건으로 통과했다. 결과는
`qa/reports/rev021-gif-motion.md`, 접촉판은
`qa/evidence/rev021-gif-v03/gif-016-020-review-contact.png`에 저장했다.
