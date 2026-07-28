# 살랑 rev022 판매 우선 상세페이지와 Studio 편집 UX Wayfinder

## Destination

구매자가 첫 화면에서 제품과 차이를 이해하고, Studio에서는 배치와 텍스트 편집을
혼동 없이 수행할 수 있는 `rev022-sales-first`를 완성한다.

## Frontier

완료. 열린 frontier가 없다.

## Resolved

- [01. 판매형 카피·라우팅 계약](issues/01-sales-copy-and-routing.md)
- [02. Studio 모드·정렬·가이드·삭제](issues/02-studio-modes-guides-and-delete.md)
- [03. rev022 판매형 상세페이지 조립](issues/03-rebuild-sales-first-detail-page.md)
- [04. 브라우저·자동 QA](issues/04-run-browser-and-regression-qa.md)
- [05. 선별 커밋·푸시](issues/05-commit-and-push.md)

## Decisions so far

- 짧아진 스킬 설명은 분류 힌트만 맡고 실제 실행은 `SKILL.md` 라우팅 표와
  `guide.md` 필수 문서 합집합이 맡는다.
- Studio는 배치와 텍스트 변환을 상호 배타적 도구로 구현한다.
- rev022는 rev021 승인 미디어를 그대로 재패키징하며 제품 우선·판매 정보 우선
  HTML만 새로 조립한다.

## Out of scope

- 기존 승인 이미지·GIF 픽셀 수정
- 확인되지 않은 소재 혼용률·신축 범위·모델 팔둘레·세탁법·원산지 생성
- `rev021-commercial` 덮어쓰기
