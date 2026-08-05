---
name: detail-page-maker-skill
description: 이 스킬은 detail-page-orchestrator 로 대체됐다. 상세페이지·쿠팡 상세설명
  제작 요청은 detail-page-init 으로 환경을 잠근 뒤 detail-page-orchestrator 로 진입한다.
  여기에는 실행부가 없다.
---

# 대체됨

한 스킬이 조사·기획·목업·생성·모션·조립·QA·납품을 다 하던 구조를 게이트 엔진과
단계 스킬로 쪼갰다. 이유와 근거는 `docs/adr/0002-단계를-개별-스킬로-분리한다.md`.

## 어디로 가나

| 하려는 것 | 부를 것 |
| --- | --- |
| 처음 세팅 (환경 인터뷰·로컬 설치·정리) | `detail-page-init` — 사용자가 `$init` 이라 부르는 단계 |
| 상세페이지 제작 | `detail-page-orchestrator` |
| 어디까지 왔는지 보기 | `detail-page-orchestrator` 의 `track` |

게이트 정의는 `detail-page-orchestrator/scripts/lib/gates.mjs` 한 곳에만 있다.
단계 스킬을 직접 부르면 선행 게이트 검사로 거부된다.

## 실행부가 없다

스크립트와 참고 문서는 전부 오케스트레이터와 단계 스킬로 옮겼다. 여기에 남겨 두면
게이트를 거치지 않는 우회 경로가 된다.
