# G3 GIF-002~010 Batch QA

- 결과: `PASS_RENDERED_PENDING_USER_REVIEW`
- 추가 렌더: 9개
- 기존 승인 GIF: 1개
- 전체 GIF: 10개
- 승인 이미지: 40개

## 전수 검사

- 9개 모두 800×800, 3.2초, 96프레임, 무음이다.
- 9개 모두 `NETSCAPE2.0` 무한 반복 메타데이터를 포함한다.
- 실제 GIF를 디코딩한 frame 0과 frame 95의 SHA-256이 9개 모두 동일하다.
- 45개 증거 프레임에서 제품 길이·한 쌍 구성·라벨·플리츠·엄지홀·모델 정체성을 확인했다.
- 제품을 새로 그리거나 워핑하지 않았고 승인된 G2 이미지 17개만 사용했다.
- 냉감·UV·통풍·신축·흘러내림 방지·내구 등 미검증 성능 표현은 추가하지 않았다.

## 검토 자료

- 일괄 검토 시트: `qa/evidence/g3-gif-motion/batch-002-010-rev001/gif-002-010-review-contact-9x5.png`
- 원본 GIF: `asset/generated/pending/gif/gif-002-*.gif`부터 `gif-010-*.gif`
- 사용자 검토 전이므로 9개는 `pending`에 유지한다.
