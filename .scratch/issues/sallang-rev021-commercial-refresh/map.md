# 살랑 rev021 커머셜 리프레시 Wayfinder

## Destination

Behance 상용 사례 50개 이상의 카피·배치·모션 문법을 근거로 살랑 루즈핏 쿨토시
상세페이지를 고객 언어 우선, 세 가지 불편, 소구 직후 증명 GIF 구조로 개편한다.

## Notes

- 정본 요구사항은 [`spec.md`](spec.md)에 기록한다.
- 실제 촬영 원본은 동일성 SSOT이며 공개 픽셀에 직접 사용하지 않는다.
- 생성 이미지는 God Tibo, 비교·강조·GIF는 HyperFrames만 사용한다.
- 현재 스타일 섹션과 규격 테이블의 좋은 방향은 유지한다.
- 기존 rev020과 프로토타입은 삭제하지 않고 rev021을 새 개정판으로 만든다.
- 사용자가 여는 결과는 `deliverables/rev021-commercial/index.html` 하나로 고정하고
  작업용 `asset/` 경로를 검토 링크로 안내하지 않는다.

## Frontier

없음.

## Planned

없음.

## Decisions so far

- [01. Behance 상세페이지 55개 조사](issues/01-research-50-plus-behance-commercial-language.md)
  — 고유 프로젝트 55개의 실제 페이지 구조를 확인하고 상용 언어 연구 원장을 만들었다.
- [02. 커머셜 카피·말투 가이드](issues/02-write-commercial-copy-tone-guide.md)
  — 고객 장면·감정·비유, 말풍선, 제조사 기능 번역, 배경 이미지, 즉시 증명과
  적극적 이펙트 규칙을 정본 문서로 만들었다.
- [03. 고객 화면 우선 워크플로우·스킬·문서 갱신](issues/03-update-user-first-workflow-and-skill.md)
  — 세 불편, 소구 직후 GIF, 내부 제작 문구 금지, 상용 FX 패턴과 deliverables
  단일 진입점을 스킬·프로젝트 문서에 반영하고 스킬 검증을 통과했다.
- [04. 꼬임 없는 착용 컷·배경·피날레 이미지 재생성](issues/04-regenerate-commercial-product-images.md)
  — 8장 단위 3개 작업으로 24장을 생성하고 23장을 동일성 QA 통과시켰다.
- [05. 즉시 증명형 비교·그래프·상품 구성 GIF 재구성](issues/05-rebuild-claim-proof-hyperframes.md)
  — 전용 모션 5개를 새로 만들고 기존 5개와 합쳐 10개 세트를 완성했다.
- [06. rev021 상세페이지 흐름과 카피 개편](issues/06-restructure-rev021-detail-page.md)
  — 세 불편과 소구 직후 증명 구조의 독립 deliverables 패키지를 조립했다.
- [07. 공개 언어·제품 동일성·모션·반응형 최종 QA](issues/07-run-rev021-commercial-qa.md)
  — 다섯 뷰포트와 미디어·카피·모션 검사를 통과하고 검토 보고서를 만들었다.
- [08. 워크트리 병합과 비활성 자산 보존 이관](issues/08-merge-worktree-and-archive-assets.md)
  — 병합 전 변경을 복구 참조로 보존하고 단일 `asset/` 루트와 체크섬 archive로
  안전하게 통합했다.
- [09. 쿠팡 참고 광고와 쿨토시 학습 감사](issues/09-audit-coupang-reference-and-learnings.md)
  — 참고 광고의 주장 직후 증명·생활 장면·규격 안내 문법을 기록하고 살랑
  학습 원장을 갱신했다.
- [10. Studio 전체 요소 편집 도구](issues/10-build-studio-element-controls.md)
  — 전체 요소 선택·위치·실행 취소·텍스트 비우기·6개 글꼴·색상 변경과
  저장·내보내기를 구현했다.
- [11. 주장 연관 FX와 47 cm 측정 GIF](issues/11-rebuild-claim-fx-and-size-proof.md)
  — 그래프 없는 냉감 FX와 핵심 치수 측정 GIF를 포함한 신규 6개 GIF를 만들고
  strict QA를 통과했다.
- [12. 스킬·학습·Markdown 라우팅 지도](issues/12-update-skill-learnings-and-doc-map.md)
  — 검증된 규칙을 공용 스킬에 승격하고 `docs/map.md`로 문서 경로를 연결했다.
- [13. Studio·GIF·반응형·자산 최종 QA](issues/13-run-followup-qa.md)
  — 브라우저·자동 테스트·체크섬·사본 해시 검사를 모두 통과했다.
- [14. 최신 main 통합·선별 커밋·푸시](issues/14-integrate-commit-and-push.md)
  — 원격 최신 main을 확인하고 이번 요청 경로만 선별해 통합했다.

## Out of scope

- 기존 rev020·원본·프로토타입 삭제
- 근거 없는 온도·비율·시간·자외선 차단 수치 생성
- Behance 작품의 카피·레이아웃·이미지 직접 복제
- 쿠팡 Wing 실제 게시
