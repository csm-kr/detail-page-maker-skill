# Detail level

출처: [octopus7/ChatGPT-Images-2](https://github.com/octopus7/ChatGPT-Images-2), MIT License, Copyright (c) 2026 octopus7.

원본 프로젝트의 핵심은 별도 이미지 후처리기가 아니라 이미지 생성 프롬프트에 detail 강도를 명시하는 방식이다. 이 Skill은 그 개념을 Tibo 요청에 맞게 짧게 재구성한다.

## 단계

| `detail_level` | 목적 | 유지 | 억제 |
|---|---|---|---|
| 1 | Clean Simplified | 큰 형태, 깨끗한 경계, 부드러운 그라데이션 | speckle, glitter-like noise, micro-contrast, gritty grain, 우연한 작은 흔적 |
| 2 | Balanced Detail | 주제·재질을 설명하는 핵심 세부 | 의미 없는 micro-texture, 거친 grain, 불규칙한 반짝임 |
| 3 | Rich Detail | 의미 있는 미세 구조와 일관된 재질 단서 | 무작위 speckle, crunchy sharpening, 혼란스러운 micro-contrast |

단계가 높다고 노이즈를 허용하는 것은 아니다. `3`은 무작위 자글거림이 아니라 구조적으로 필요한 세부를 더 유지한다.

reference가 있으면 모든 단계에 다음 의미의 규칙을 덧붙인다.

- Image 1을 canonical base로 사용한다.
- Image 2 이후는 보조 reference다.
- 요청한 변경만 적용한다.
- zoom, crop, reframe, rotate, camera 변경을 금지한다.
- 수정 대상이 아닌 영역과 Size Invariant padding을 보존한다.
