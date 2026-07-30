---
name: god-tibo-gpt-image2-skill
description: Tibo(god-tibo-imagen)와 ChatGPT-Images-2의 detail_level 규칙을 결합해 GPT Image 2 이미지를 기본 24장, 작업당 최대 64장, 동시에 최대 32장 생성·편집하고, 여러 reference 중 Image 1을 기준 이미지로 보존하며, 각기 다른 prompt·reference 작업, Size Invariant 원본 크기 복원 또는 목표 W×H를 정확히 만드는 Size Controllable 후처리와 선택적 GIF 조립을 수행한다. 사용자가 Tibo, GPT Image 2, 병렬 이미지 생성, reference 기반 변형, 출력 사이즈·비율 제어, detail 1/2/3, 자글거림·스펙클 감소, 연속 프레임 또는 GIF 제작을 요청할 때 사용한다.
---

# God Tibo GPT Image 2

Tibo의 비공개 Codex 이미지 경로로 동일 프롬프트 배치 또는 서로 다른 프롬프트 프레임을 기본 24장, 작업당 최대 64장 생성한다. 실제 동시 요청은 기본 24개, 검증된 최대 32개로 제한한다. `detail_level`로 불필요한 미세 노이즈를 제어하고, reference가 있으면 첫 이미지를 canonical base로 취급한다.

## 필수 사이즈 질문

모든 새 생성·편집 작업은 사이즈 확인으로 시작한다. 답을 받기 전에는 생성이나 dry-run을 실행하지 않는다.

- reference가 있으면 반드시 먼저 묻는다: **“이 레퍼런스 이미지의 사이즈와 똑같이 할까요? 아니면 원하시는 사이즈(W×H)가 있나요?”**
- reference가 없으면 반드시 묻는다: **“원하시는 출력 사이즈(W×H)는 무엇인가요?”**
- 사용자가 같은 요청에서 이미 W×H를 명시했어도 “말씀하신 W×H로 진행할까요?”라고 짧게 확인한다.
- “레퍼런스와 동일” 답변은 `size_mode: "invariant"`로, 명시한 W×H 답변은 `size_mode: "controllable"`과 `target_size`로 기록한다.
- reference가 없을 때는 `invariant`를 사용하지 않는다. 사이즈를 추측하거나 과거 기본값을 적용하지 않는다.

## 실행 순서

1. Skill 디렉터리에서 `npm install --omit=dev`가 완료됐는지 확인한다.
2. Node.js 20+, Codex ChatGPT 로그인 상태, 입력 이미지와 출력 경로를 확인한다. 인증 파일 내용은 출력하거나 manifest에 넣지 않는다.
3. 위의 필수 사이즈 질문으로 `size_mode`와 필요 시 `target_size`를 확정한다.
4. 작업 유형을 정한다.
   - 같은 프롬프트 N장: `prompt`, `batch_size`, `workers`를 사용한다.
   - 같은 reference set과 서로 다른 프롬프트 N개: `prompts` 배열과 `workers`를 사용한다.
   - 각기 다른 prompt·reference N개: `items` 배열과 `workers`를 사용한다.
5. reference가 있으면 각 reference 배열의 첫 이미지를 Image 1로 둔다. 두 번째 이후 이미지는 보조 reference다.
6. 사이즈 모드에 맞게 작업한다.
   - `invariant`: Image 1이 비정방형이면 평균 RGB의 보색으로 정방형 패딩하고, 생성 결과를 Image 1 원본 W×H로 복원한다.
   - `controllable`: 목표 W×H를 프롬프트에 주입하고 GPT Image 2를 `size: "auto"`로 호출한 뒤, 목표 비율로 최소 center crop하고 LANCZOS로 정확한 W×H를 만든다.
7. JSON 작업 파일을 만들고 아래 명령을 실행한다.

```bash
node scripts/tibo-batch.mjs --job /absolute/path/to/job.json
```

요청을 보내기 전에 인증·payload 구성만 확인하려면 `--dry-run`을 붙인다.

## 작업 계약

최소 예시는 다음과 같다. 작업 파일 안의 상대 경로는 작업 파일이 있는 디렉터리를 기준으로 해석한다.

```json
{
  "prompts": [
    "The ceramic fox bends its knees before jumping.",
    "The ceramic fox reaches the jump apex.",
    "The ceramic fox lands softly."
  ],
  "detail_level": 2,
  "references": ["reference.png"],
  "workers": 3,
  "size_mode": "controllable",
  "target_size": "800x1200",
  "output_dir": "output/jump",
  "gif": {
    "filename": "jump.gif",
    "fps": 6,
    "width": 768
  }
}
```

필드 전체 계약은 [references/job-schema.md](references/job-schema.md)를 읽는다. detail 단계 문구를 수정하거나 품질 차이를 설명할 때만 [references/detail-levels.md](references/detail-levels.md)를 읽는다. Size Invariant 좌표·보색·ComfyUI fallback을 다룰 때는 [references/size-invariant.md](references/size-invariant.md)를 읽는다.

## 생성 규칙

- 같은 프롬프트에서 생성 수를 생략하면 `batch_size: 24`, `workers: 24`를 사용한다.
- 24장보다 작은 `batch_size` 또는 `prompts`·`items` 배열을 사용하면 `workers` 기본값도 그 생성 수와 같아진다.
- 24장보다 큰 작업은 기본 `workers: 24`로 실행한다. `workers`는 1~32, 작업의 전체 생성 수는 1~64다.
- 실제 64개 동시 요청 테스트에서는 62개 완료 후 연결이 종료됐으므로 64장 작업은 기본 24 workers 또는 명시적 최대 32 workers로 나눠 처리한다.
- `prompt`, `prompts`, `items` 중 하나만 사용한다.
- `prompts`의 순서가 `frame-000.png` 이후의 프레임 순서와 GIF 순서다.
- `items`의 각 항목은 자체 `prompt`와 `references`를 가지며 입력 순서대로 작업당 최대 64개, 동시에 최대 32개를 처리한다.
- `size_mode`는 반드시 `invariant` 또는 `controllable`로 명시한다. `controllable`은 `target_size`가 필수다.
- `invariant` reference 편집에서는 Image 1의 정체성·구도·카메라·프레이밍을 우선하고 zoom·crop·reframe을 금지한다.
- `controllable` reference 편집에서는 Image 1의 정체성을 보존하되 목표 비율에 맞춰 구성하고 핵심 피사체를 center-crop-safe 영역에 둔다.
- `detail_level: 1`은 강한 단순화, `2`는 균형, `3`은 의미 있는 세부 보존이다. 모든 단계에서 임의 speckle, glitter-like noise, gritty grain, 과한 micro-contrast를 억제한다.
- `invariant`에서만 비정방형 Image 1을 패딩한다. 보조 reference는 원본 그대로 전달한다.
- Tibo의 private Codex backend는 비공식 경로이므로 계약이 바뀔 수 있다는 warning을 결과에 보존한다.

## 검증

완료 보고 전에 `manifest.json`을 확인한다.

- 모든 `images[].path`가 존재하고 0바이트가 아니어야 한다.
- `images[].sha256`, `response_id`, 프롬프트와 생성 시간이 기록되어야 한다.
- `manifest.size.reference`, `manifest.size.target`, `target_matches_reference`로 Image 1과 선택한 목표 크기의 관계를 확인한다. `items` 모드는 `manifest.size.items[]`를 확인한다.
- `invariant`에서는 `target_matches_reference`와 모든 `images[].size_check.matches_reference`가 `true`여야 한다.
- `controllable`에서는 `api_size`가 `auto`이고 모든 `images[].size_check.matches_expected`가 `true`여야 한다.
- GIF 요청 시 `gif_path`가 존재하고 프레임 순서가 `prompts` 순서와 같아야 한다.
- 일부 프레임이 실패하면 성공으로 보고하지 말고 같은 작업을 재실행하기 전에 실패 원인을 제시한다.

## 스크립트

- `scripts/tibo-batch.mjs`: 작업 검증, 병렬 orchestration, manifest 작성의 진입점
- `scripts/private-codex-client.mjs`: Tibo 인증·요청·SSE/JSON 응답 처리
- `scripts/media-tools.mjs`: Size Invariant·Controllable 전후처리와 GIF 조립
