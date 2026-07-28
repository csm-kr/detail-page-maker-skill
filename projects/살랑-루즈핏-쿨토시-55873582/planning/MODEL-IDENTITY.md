# 루즈핏 쿨토시 — 20대 여성 모델 아이덴티티 계획

## 상태

- `status`: approved-g2a
- `sheet_generation_blocked`: no
- `sheet_approval_gate`: G2A MODEL_SHEET
- `lifestyle_generation_dependency`: approved character sheet
- `provider`: god-tibo-gpt-image2-skill
- `selected_candidate_id`: C00-03
- `selected_candidate_source`: model/candidates/c00-rev001/frame-002.png
- `approved_ssot`: asset/ssot/model-sheet-c00-03-v01.png
- `approved_sha256`: 476d751f07484de54dc7992c138beafcdf56565ed6fa3584fbf7c72e45bcaa64
- `approved_at`: 2026-07-27T12:13:47.592Z
- `user_confirmation`: 승인!

## 캐릭터 정의

- `model_id`: model-20f-airfit-01
- `person_type`: 실존 인물을 참조하지 않는 성인 AI 모델
- `age_presentation`: 20대 중후반
- `ethnicity_presentation`: 한국인 여성
- `build`: 슬림과 보통 사이의 자연스러운 체형
- `skin`: 뉴트럴 웜 계열의 자연스러운 피부톤
- `face`: 부드러운 타원형 얼굴, 자연스러운 눈매, 곧은 코선, 과하지 않은 입술
- `hair`: 짙은 흑갈색, 쇄골에 닿는 스트레이트 롱 보브, 가운데에 가까운 가르마
- `makeup`: 얇은 베이스, 자연스러운 눈썹과 로즈 베이지 립
- `nails`: 짧고 깨끗한 무광 내추럴 네일
- `jewelry`: 없음
- `expression`: 편안한 중립 표정과 작고 자연스러운 미소

## 캐릭터 시트

- `asset_id`: C00
- `candidate_count`: 8
- `candidate_batch`: 8-worker 1개 배치
- `target_wxh`: 1536×1024
- `detail_level`: high
- `background`: 균일한 밝은 웜그레이 스튜디오 배경
- `wardrobe`: 무지 아이보리 슬리브리스 크루넥 상의, 라이트 그레이 와이드 팬츠
- `product_on_sheet`: no
- `layout`: 한 장 안에 정면 얼굴, 3/4 얼굴, 좌측 프로필, 무릎 위 상반신, 전신 정면을 정돈된 편집 레이아웃으로 배치
- `text_policy`: 문자·이름·로고·치수표 없음
- `must_match_across_views`: 얼굴 비율, 눈·코·입, 헤어 길이·가르마·색, 피부톤, 체형
- `negative_constraints`: 다른 인물 혼입, 패널별 얼굴 변경, 헤어 길이 변경, 액세서리 추가, 과도한 보정, 비현실적인 피부, 손가락 오류

## 제작 순서

1. G0 제품 SSOT와 G1 전체 기획 승인
2. C00 캐릭터 시트 후보 8장을 1536×1024로 동시 생성
3. 얼굴·헤어·체형·손의 정상 여부를 QA하고 상위 후보를 정리
4. G2A에서 사용자가 캐릭터 시트 한 장 승인
5. 승인된 시트의 파일 경로와 SHA-256을 `model/model-manifest.json`에 잠금
6. 본 제작 40장을 8-worker 배치 5개로 나누고, 최대 두 배치씩 동시에 시작
7. 모델이 등장하는 모든 프롬프트에 C00만 인간 아이덴티티 참조로 전달

## 모델 사용 장면

- A05 엄지홀·손등 커버
- A07 팔 전체 루즈 드레이프
- A08 자연광 얇은 소재
- B01 정차 차량 운전
- B02 여름 산책
- B03 장보기 카트
- B06 손바닥 방향 구조
- B08 피날레 제품·실착 요약
- C01~C08 모델 에디토리얼·데일리 라이프스타일 8장
- D04·D05 좌우 엄지홀 손 근접
- E06 모델·제품 스플릿 히어로
- E08 엄지홀 절차 중간 프레임

얼굴이 보이는 장면은 A07, B02, B08을 우선한다. 손 중심 장면도 같은 캐릭터 시트를 참조해 피부톤·손톱·손의 인상을 통일한다.

## 아이덴티티 불변 조건

- 승인 시트와 다른 얼굴형·헤어 길이·가르마·머리색으로 변경하지 않는다.
- 나이를 10대 또는 30대 후반 이상으로 보이게 바꾸지 않는다.
- 피부를 비현실적으로 하얗게 만들거나 과도한 뷰티 필터를 적용하지 않는다.
- 장면마다 체형을 바꾸지 않는다.
- 쿨토시가 필요한 팔·손 구조를 가리는 소매, 시계, 팔찌, 반지를 추가하지 않는다.
- 최종 이미지에서 한 사람이 두 사람처럼 보이거나 얼굴이 중복되면 거절한다.
- 손가락 수, 엄지홀 위치, 손등/손바닥 방향 오류가 있으면 거절한다.

## 제조사 표기

- 사용자 확인 제조사: `살랑`
- 제조사명은 상품정보·하단 고지 영역에서 사용한다.
- 실물 라벨 문구 `HELLO / CUTE SLEEVE`를 제조사명으로 바꾸지 않는다.
