# BRIEF — 60851997 Actual Product Insole Motion System

## Purpose

도매꾹 60851997 기능성 깔창 상세페이지에 넣을 정사각형 모션 소재를 만든다. 모든 제품 형상은 사용자 제공 실제품 사진·누끼를 사용하고, ImageGen 자산은 제품이 없는 배경과 장식에만 사용한다.

## Audience

운동화·작업화·군화용 교체 깔창을 찾지만 두께, 신발 내부 공간, 호수 선택이 걱정되는 성인 구매자.

## Look

- clean athletic / cold luxury / evidence-led
- pure white, graphite, cobalt blue
- 실제품 표면 질감은 선명하게, 배경은 절제
- 큰 한국어 정보 계층, 짧은 근거 문장

## Required clips

1. `top-bottom-reveal` — 실제 상면과 하면 교차 전환
2. `cell-scan` — 실제 입체 셀을 스캔 라인으로 강조
3. `perforation-path` — ImageGen 셀 배경 위 실제 하면과 타공 포인트
4. `flex-photo-sequence` — 실제 손 굽힘 사진의 단계 전환
5. `size-selector` — 230–280, 255→260 규칙
6. `shoe-insertion-guide` — ImageGen 신발 배경 + 실제품 누끼 삽입 안내
7. `one-pair-contents` — ImageGen 코발트 스테이지 + 실제 한 켤레
8. `material-cross-section` — ImageGen 재질 배경 + 공급처 재질 표기

## Truth constraints

- 제품 픽셀을 생성 모델로 재구성하지 않는다.
- 충격 완화, 피로 감소, 통풍, 항균, 탈취, 통증·질환 개선을 표현하지 않는다.
- 타공의 존재와 물리적 위치만 강조하며 공기 흐름 성능 실증처럼 연출하지 않는다.
- ImageGen 배경이 들어간 장면은 `연출 이미지`로 표시한다.
- 공급처가 제공하지 않은 두께·무게·높이 수치를 만들지 않는다.

## Timing

- 800 × 800
- 15 fps
- 클립당 4.8초
- 첫 프레임은 포스터로도 읽혀야 한다.
- 모든 모션은 seek-safe하고 마지막 프레임이 루프 시작점으로 자연스럽게 돌아간다.

## Output

- `public/gifs/*.gif`
- `public/posters/*.jpg`
- `public/renders/*.mp4`
- 상세페이지 프로젝트의 `assets/gifs`와 `assets/posters`로 복사
