# HyperFrames 모션 계약

## 원본

완성 GIF만 보존하지 말고 HyperFrames HTML 원본과 다음 레이어를 보존한다.

- 제품
- 배경
- 텍스트
- 말풍선·선·화살표·도형
- 빛·입자·기능 효과
- 키프레임·타이밍·이징

## 편집

프롬프트 범위:

- 레이어
- 그룹
- 장면 전체

기본은 선택 레이어다. 선택 범위 밖 요소는 잠근다. 제품 레이어는 제품 동일성 계약을 따른다.

Studio에서 직접 조정할 수 있도록 각 레이어 manifest에 다음 속성을 둔다.

- 공통: `id`, `name`, `type`, `group`, `start`, `end`, `x`, `y`, `scale`, `opacity`
- 텍스트: `text`, `fontSize`, `color`
- 제품: `locked: true`와 제품 동일성 참조 ID

속성 편집은 완성 GIF를 덮어쓰지 않는다. 선택 레이어와 변경 속성을 `hyperframes.edit` 작업으로 등록하고 새 후보를 렌더한 뒤 다시 QA와 사용자 승인을 받는다.

## 렌더

- seek 가능한 paused timeline을 사용한다.
- 한 컴포지션에 하나의 결정적 timeline을 둔다.
- 네트워크·실시간 시계·무작위 렌더를 사용하지 않는다.
- `npx hyperframes check --strict`를 통과한다.
- 사용자 최종 컴포지션 승인 뒤 렌더한다.
- QA용 MP4와 게시용 무음 무한 반복 GIF를 보존한다.

## 가독성

800×800 정보형 GIF의 상태 라벨과 보조 문구는 18px 이상, 700 이상을 기본으로 한다. 바깥 HTML과 같은 한글 폰트 계열·굵기·색을 사용한다.
