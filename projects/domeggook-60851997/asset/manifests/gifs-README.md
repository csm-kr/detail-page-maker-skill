# 노바페이스 깔창 GIF 카탈로그

도매꾹 `60851997` 깔창 상세페이지에 실제로 삽입된 GIF 11개를 모션 방식별로 정리한다.
이 폴더의 `.gif`는 게시용 현재본이며, 제작 원본은
`hyperframes/projects/domeggook-60851997-motion/compositions/`에 있다.

## 현재본 기준

- 게시 위치: `asset/generated/approved/gif/`
- 상세페이지: `detail-page/index.html`
- 공통 규격: 800×800, 58프레임, 약 4.83초, 무음, 무한 반복
- 원본 형식: seek 가능한 HyperFrames HTML 컴포지션
- 상세 메타데이터·SHA-256: `gif-manifest.json`
- 사용 상태: 아래 11개 모두 현재 상세페이지에서 사용 중

## 모션 패턴 한눈에 보기

| 패턴 | 해당 GIF | 핵심 구현 | 가장 잘 맞는 용도 |
|---|---|---|---|
| 비교 슬라이더·와이프 | `material-cross-section.gif` | 같은 구도의 두 이미지를 겹치고 분할선과 노출 폭을 함께 이동 | 소재, 표면, 전후 상태 비교 |
| 물리적 뒤집기 | `top-bottom-reveal.gif` | 윗면을 Y축으로 접어 숨긴 뒤 아랫면을 반대 각도에서 펼침 | 상면·하면, 앞·뒤 공개 |
| 제품 추적 오버레이 | `air-cell.gif`, `arch-support.gif`, `flex-photo-sequence.gif` | 제품 위 SVG 선·스캔·곡선을 얹고 제품과 같은 그룹으로 확대·이동 | 실제 구조 외곽, 아치, 굽힘 경로 설명 |
| 국소 이펙트 오버레이 | `perforation-path.gif`, `cell-scan.gif`, `comfort-step.gif` | 실제 에어홀·접점·발밑 좌표에 펄스·리플·파동을 제한적으로 표시 | 시작점, 접촉점, 움직임 강조 |
| 선택 인터랙션 | `size-selector.gif` | 커서 이동 → 눌림 → 리플 → 활성 상태 → 선택 규칙 | 사이즈·옵션 선택법 |
| 사용 순서 가이드 | `shoe-insertion-guide.gif` | 방향 가이드와 단계 라벨을 실제 사용 장면 위에 순차 표시 | 삽입, 조립, 설치 순서 |
| 히어로 공개 | `one-pair-contents.gif` | 카메라 푸시, 링, 짧은 카피로 판매 구성을 공개 | 구성품·세트 수량 확인 |

## GIF별 역할

| 파일 | 패턴 ID | 화면에서 보여 주는 상태 변화 | 상세페이지 섹션 | HyperFrames 원본 |
|---|---|---|---|---|
| [`top-bottom-reveal.gif`](../generated/approved/gif/top-bottom-reveal.gif) | `MOTION-FACE-FLIP` | 에어메시 윗면 → 뒤집기 → PU 아랫면 | 제품 구조 도입 | `compositions/top-bottom.html` |
| [`material-cross-section.gif`](../generated/approved/gif/material-cross-section.gif) | `MOTION-COMPARE-WIPE` | 윗면 강조 → 아랫면 강조 → 50:50 정리 | 소재 비교 | `compositions/material-cross-section.html` |
| [`perforation-path.gif`](../generated/approved/gif/perforation-path.gif) | `MOTION-LOCAL-EFFECT` | 에어홀 위치 확인 → 에어홀에서만 펄스 시작 | 에어홀 | `compositions/perforation-path.html` |
| [`air-cell.gif`](../generated/approved/gif/air-cell.gif) | `MOTION-STRUCTURE-TRACE` | 흰 PU 셀 확대 → 실제 홈에 맞춘 여섯 외곽 순차 추적 | 에어셀 | `compositions/air-cell.html` |
| [`cell-scan.gif`](../generated/approved/gif/cell-scan.gif) | `MOTION-LOCAL-EFFECT` | 뒤꿈치 접점 → 블루쿠션 중심 리플 | 블루쿠션 | `compositions/cell-scan.html` |
| [`flex-photo-sequence.gif`](../generated/approved/gif/flex-photo-sequence.gif) | `MOTION-STRUCTURE-TRACE` | SSOT 기반 평평한 BEFORE → 중간 굽힘 → 사용자 제공 깊은 U자 AFTER → 제품 바깥 곡률 추적 → 평면 상태 복귀 | 유연함 | `compositions/flex-sequence-v23.html` |
| [`arch-support.gif`](../generated/approved/gif/arch-support.gif) | `MOTION-STRUCTURE-TRACE` | 뒤꿈치 포켓 → 눈에 보이는 측면 굴곡 추적 | 입체 아치 굴곡 | `compositions/arch-support.html` |
| [`size-selector.gif`](../generated/approved/gif/size-selector.gif) | `MOTION-SELECTION` | 255mm 입력 → 260 카드 클릭 → 선택 규칙 표시 | 사이즈 | `compositions/size-selector.html` |
| [`shoe-insertion-guide.gif`](../generated/approved/gif/shoe-insertion-guide.gif) | `MOTION-PROCEDURE` | 기존 깔창 제거 → 뒤꿈치 방향으로 삽입 | 사용법 | `compositions/shoe-insertion.html` |
| [`one-pair-contents.gif`](../generated/approved/gif/one-pair-contents.gif) | `MOTION-HERO-REVEAL` | 실제 좌우 한 켤레 공개 → 구성 확정 | 판매 구성 | `compositions/one-pair.html` |
| [`comfort-step.gif`](../generated/approved/gif/comfort-step.gif) | `MOTION-LOCAL-EFFECT` | 자연스러운 보행 → 발밑의 제한된 파동 | 마감 제안 | `compositions/comfort-step.html` |

## 대표 구현법

### 1. 비교 슬라이더·와이프

두 이미지를 같은 좌표와 크기로 포개고 한쪽의 `width` 또는 마스크를 움직인다.
분할선과 이동 표시도 같은 타임라인 값으로 움직여야 한다.

이 프로젝트의 소재 비교는 `50:50 → 22:78 → 50:50` 순서다. 가운데에서 짧게
흔드는 장식이 아니라 한쪽 상태를 충분히 보여 준 뒤 화면 절반 이상을 이동해 반대
상태를 보여 준다.

### 2. 물리적 뒤집기

윗면 레이어를 `rotationY: 0 → 88`로 접어 숨기고, 아랫면 레이어를
`rotationY: -88 → 0`으로 펼친다. 전환 중간에 상태 라벨도 `윗면 → 아랫면`으로
바뀐다. 단순 교차 용해보다 회전축과 앞뒤 관계가 명확하다.

### 3. 제품 위에 이펙트 올리기

제품 이미지 위에 SVG 선, 스캔, 리플, 펄스 또는 파동을 올린다. 이때 제품과
오버레이를 같은 `product-scene` 그룹에 넣어 확대·이동·회전을 함께 적용한다.
제품만 움직이고 선이 원래 좌표에 남으면 구조에서 미끄러져 보이므로 실패다.

오버레이는 한 GIF에서 한 부품만 강조한다.

- 에어셀: 흰 PU의 실제 비정형 셀 외곽만 추적
- 블루쿠션: 실제 뒤꿈치 접점에만 리플
- 에어홀: 실제 구멍 안에서만 펄스 시작
- 아치: 윗면의 뒤꿈치 둘레와 안쪽 곡률만 추적
- 굽힘: 제품의 실제 휘어지는 윤곽을 따라 선 그리기

### 4. 선택 인터랙션

커서가 목표 카드 안으로 들어온 뒤 눌림, 클릭 리플, 활성색, 결과 규칙 순으로
보여 준다. 이 프로젝트에서는 `255mm → 260`의 관계를 설명하며, 포인터와 리플의
중심이 모두 `260` 카드 안에 있다.

### 5. 사용 순서와 히어로 공개

사용 순서는 한 번에 한 단계만 보여 주고 방향 가이드를 실제 움직임과 맞춘다.
판매 구성 공개는 기능 증명처럼 꾸미지 않고 실제 좌우 수량과 제품 정체성을 크게
보여 주는 데 집중한다.

## 파일 보관 규칙

- `asset/generated/approved/gif/*.gif`: 상세페이지가 참조하는 게시용 현재본
- `asset/manifests/gif-manifest.json`: 현재본의 역할·크기·해시·QA
- `hyperframes/projects/domeggook-60851997-motion/compositions/*.html`: 편집 가능한 모션 원본
- `hyperframes/projects/domeggook-60851997-motion/public/gifs/*-v*.gif`: 렌더 이력
- `hyperframes/projects/domeggook-60851997-motion/renders/*.mp4`: QA·마스터 렌더
- `asset/output/gif/posters/*.jpg`: 정지 포스터와 모션 축소 대체용

게시 HTML은 `asset/generated/approved/gif/`의 버전 없는 파일만 참조한다. `*-v13.gif`,
`*-v16.gif` 같은 파일은 제작 이력이며 현재본으로 직접 연결하지 않는다.

## 공통 QA

- 한 GIF는 하나의 주장과 하나의 주요 부품만 맡는다.
- 첫 프레임부터 제품·주장·상태가 포스터처럼 읽힌다.
- 중간 프레임에서 변화의 원인이 보이고 마지막 프레임에서 결과 상태가 보인다.
- 제품 로고·인쇄·부품 위치·실루엣이 첫·중간·마지막에서 유지된다.
- 비교 슬라이더의 분할선, 구조선, 리플, 커서가 실제 대상 좌표와 함께 움직인다.
- 빛·파동·공기 효과를 제품 성능 수치나 의료 효능의 증거처럼 사용하지 않는다.
- 상세페이지에서 정적 사진으로 충분한 정보는 GIF를 추가하지 않는다.
