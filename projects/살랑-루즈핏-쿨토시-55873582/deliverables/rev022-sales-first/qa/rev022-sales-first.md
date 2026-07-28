# rev022-sales-first QA

- Result: PASS
- Date: 2026-07-28
- Entry: `../index.html`
- Browser recording: `sallang-rev022-browser-qa-v5`
- Isolated visual recording: `sallang-rev022-isolated-visual-v2`
- Visual evidence: `visual-hero-360.jpg`

## 상세페이지

- 320·360·390·768·800px 가로 오버플로: 0
- 깨진 이미지·GIF: 0
- 최상위 섹션: 11
- 이미지: 21
- GIF: 10
- pending·rejected 참조: 0
- 정량 근거 없는 냉감 그래프·SVG·canvas: 0
- 공개 금지 제작자 문구: 0
- 라벨 소구 문구: 0
- 첫 화면 제품 이미지 로드와 직접 핵심 문안: PASS
- `47cm` 치수 위치 GIF의 규격표 직전 배치: PASS

## Studio

- `T 텍스트 변환`에서 텍스트 직접 편집: PASS
- 왼쪽·가운데·오른쪽·양쪽 정렬 계약: PASS
- 텍스트 모드에서 요소 드래그 차단: PASS
- `V 요소 배치`에서 드래그·위치 변경: PASS
- 좌우 안전선·캔버스 중심·섹션 중심 보조선 표시: PASS
- 가까운 보조선 스냅 활성화: PASS
- 선택 요소 삭제: PASS
- 실행 취소로 삭제 복원: PASS
- 상태 schema v4 저장·이전 v1~v3 마이그레이션: PASS

## 자동 검사

- `node --check` Studio 런타임 4개: PASS
- `node --test tests/studio-v1/runtime-contract.test.mjs`: 4/4 PASS
- Skill Creator `quick_validate.py`: PASS
- 현재 rev022 HTML 상대 참조 검사: PASS

프로젝트 전체 portable validator는 rev018~rev021의 과거 manifest·브라우저 보고서에
남은 절대 경로를 별도 레거시 이슈로 보고한다. rev022 산출물의 상대 참조와 게시
경로에는 해당 문제가 없다.
