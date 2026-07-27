# HyperFrames에서 GIF까지의 공식 제작 계약 조사

Type: research
Status: resolved
Blocked by:

## Question

HyperFrames 공식 문서와 소스가 규정하는 HTML 컴포지션, seek 가능한 애니메이션, 렌더링·검증·프레임 추출 계약을 제품 효과 GIF 제작에 어떻게 적용할 것인가?

## Answer

[`HyperFrames 제품 효과 GIF 파이프라인 조사`](../../../research/hyperframes-gif-pipeline.md)에서 HeyGen HyperFrames와 FFmpeg의 공식 문서·소스를 검증했다.

- 제품 본체는 승인된 컷아웃 SSOT의 동일한 DOM 이미지 한 개로 유지하고, ImageGen 자산은 배경·효과 레이어에 사용한다.
- 모든 애니메이션은 paused timeline과 canonical time으로 seek 가능하고 결정적이어야 한다.
- 기본 게시물은 HyperFrames가 직접 렌더한 15fps·무음·무한 루프·불투명 GIF다.
- 30fps MP4는 QA 보존물이고, PNG sequence와 FFmpeg 두 단계 팔레트 후처리는 용량 예산을 넘을 때만 사용한다.
- `lint`, `check --snapshots --strict`, keyframe 진단, 핵심 snapshot, GIF 메타데이터와 실제 3회 루프 재생을 모두 검수한다.
- 현재 HyperFrames GIF 경로가 JPEG 중간 프레임을 사용하므로 투명 GIF에 의존하지 않는다.

## Comments

- 2026-07-24: HyperFrames `0.7.70` 소스와 공식 FFmpeg 문서 기반 조사를 완료했다.
