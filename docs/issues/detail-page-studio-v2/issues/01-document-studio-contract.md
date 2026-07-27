# 01. Studio 제품 명세와 상태 계약 고정

- Type: task
- Status: resolved
- Triage: ready-for-agent
- Created: 2026-07-26

## Question

사용자와 확정한 에셋 승인, 프롬프트 수정, 조립 잠금, 개정판, HTML 편집과 게시 QA 흐름을 구현 가능한 문서 계약으로 고정할 수 있는가?

## Acceptance criteria

- 유저 플로우와 화면별 허용 동작이 명시돼 있다.
- 에셋·작업·승인·조립·개정판 상태가 명시돼 있다.
- 제품 동일성 하드 실패와 디자인 경고의 권한이 구분돼 있다.
- 조립 뒤 읽기 전용 감사 화면과 새 개정판 규칙이 명시돼 있다.
- 제디터·Framer·Webflow·Canva·HyperFrames에서 채택한 UI 원칙과 복제하지 않을 한계가 기록돼 있다.

## Answer

`docs/studio/product-spec.md`와 `docs/studio/architecture.md`에 역할, 작업면, 상태, 승인·조립·개정판 불변식, 프롬프트 범위, 내보내기와 참고 UI 원칙을 고정했다.

## Comments

- 2026-07-26: 사용자가 질문을 하나씩 답해 단방향 잠금과 영향 범위 재승인을 확정했다.
- 2026-07-26: ImageGen은 생성만 담당하고 Studio·Codex·사용자가 검사와 승인을 분담하는 계약을 문서화했다.
