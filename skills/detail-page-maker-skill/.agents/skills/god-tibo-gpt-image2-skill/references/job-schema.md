# 작업 JSON 계약

## 공통 필드

| 필드 | 형식 | 기본값 | 설명 |
|---|---|---|---|
| `prompt` | string | 없음 | 동일 프롬프트 배치에 사용 |
| `prompts` | string[] | 없음 | 서로 다른 프롬프트를 입력 순서로 생성, 최대 64개 |
| `items` | object[] | 없음 | 각자 다른 `prompt`·`references`를 입력 순서로 병렬 생성, 최대 64개 |
| `detail_level` | 1·2·3 | 2 | 단순화와 세부 보존 강도 |
| `references` | string[] | `[]` | 최대 16개, 첫 항목이 canonical base |
| `workers` | 1~32 | `min(24, 생성 수)` | 동시 실행 수. 생성 수보다 크게 지정해도 실제 값은 생성 수로 축소 |
| `batch_size` | 1~64 | 24 | `prompt` 모드의 생성 장수 |
| `output_dir` | string | 없음 | 필수, 작업 JSON 위치 기준 상대 경로 또는 절대 경로 |
| `size_mode` | `invariant`·`controllable` | 없음 | 필수, 사용자에게 사이즈를 확인한 뒤 기록 |
| `target_size` | `WIDTHxHEIGHT` | 없음 | `controllable`에서 필수, 최종 출력의 정확한 픽셀 크기 |
| `comfyui_root` | string | 없음 | 호스트에 ffmpeg가 없을 때 `comfyui` 컨테이너 mount 기준 저장소 |
| `gif` | boolean/object | `false` | GIF 조립 설정 |

`prompt`, `prompts`, `items`는 상호 배타적이다. `prompts`·`items` 모드에서는 배열 길이가 `batch_size`가 된다.

## items 객체

```json
{
  "items": [
    {
      "prompt": "Turn the fox to the left.",
      "references": ["fox.png", "fox-pose.png"]
    },
    {
      "prompt": "Make the dog wave.",
      "references": ["dog.png"]
    }
  ],
  "workers": 2,
  "size_mode": "invariant",
  "output_dir": "output/mixed"
}
```

각 항목의 `references`는 독립적이며 첫 이미지가 해당 항목의 canonical Image 1이다. `size_mode`와 `target_size`는 작업 전체에 공통이다. `invariant`에서는 각 항목이 자기 Image 1의 원본 W×H로 복원되므로 서로 다른 결과 크기를 가질 수 있다.

## 사이즈 모드

### `invariant`

- 첫 reference가 필수다.
- `target_size`를 지정하지 않는다.
- 첫 reference의 실제 W×H를 목표 크기로 사용한다.
- manifest의 `size.target_matches_reference`와 각 결과의 `size_check.matches_reference`가 `true`인지 확인한다.

### `controllable`

- reference 유무와 관계없이 사용할 수 있다.
- `target_size`를 `800x1200`처럼 지정한다. `800×1200` 표기도 허용한다.
- 목표 W×H를 프롬프트에 넣고 backend의 image tool을 `size: "auto"`로 호출한다.
- 생성 결과에서 목표 비율을 유지하는 가장 큰 중앙 영역을 crop한 뒤 LANCZOS로 정확한 W×H로 변환한다.

`size_invariant`와 `api_size`는 기존 작업 파일 호환용으로만 읽는다. 새 작업에는 사용하지 않는다. `size_invariant: true`는 `invariant`, `size_invariant: false`와 `api_size` 조합은 `controllable`과 `target_size`로 마이그레이션된다.

## GIF 객체

| 필드 | 형식 | 기본값 |
|---|---|---|
| `filename` | string | `animation.gif` |
| `fps` | number | 8 |
| `width` | number | 768 |

## 경로

- 작업 JSON 안의 상대 경로는 JSON 파일이 있는 디렉터리를 기준으로 한다.
- `comfyui_root` fallback을 쓰면 reference와 output이 해당 저장소의 `input/` 또는 `output/` 아래에 있어야 한다.
- 인증 파일이나 token을 작업 JSON에 넣지 않는다.

## 병렬 의미

- `prompt` 모드: 하나의 작업을 `batch_size`개의 backend 생성으로 나누고 최대 `workers`개를 동시에 실행한다.
- `prompts` 모드: 각 프롬프트가 `batch_size: 1`, `workers: 1`인 독립 생성이며 바깥 worker pool이 전체 동시 실행 수를 제한한다.
- `items` 모드: 각 prompt·reference set이 독립 생성이며 바깥 worker pool이 최대 32개의 전체 동시 실행 수를 제한한다.
- 생성 수를 생략한 `prompt` 모드는 24장·24 workers가 기본이다.
- 24장 미만은 생성 수와 workers 기본값이 같고, 24장 초과는 기본 24 workers로 나눠 처리한다.
- 실제 64개 동시 요청은 62개 완료 후 연결 종료가 관찰됐으므로 64 workers는 허용하지 않는다.
- 결과 배열과 파일 번호는 완료 순서가 아니라 입력 순서를 유지한다.

## manifest 사이즈 검증

- `size.reference`: 첫 reference의 실제 W×H 또는 `null`
- `size.target`: 최종 목표 W×H
- `size.target_matches_reference`: 목표와 첫 reference 크기의 일치 여부 또는 `null`
- `size.backend_request_size`: `controllable`이면 `auto`
- `size.items[]`: `items` 모드의 항목별 reference·target·backend 요청 크기
- `images[].raw_size`: backend 생성 원본 크기
- `images[].final_size`: 후처리된 최종 크기
- `images[].size_check.matches_expected`: 최종 크기가 목표 W×H와 정확히 같은지 여부
- `images[].size_check.matches_reference`: 최종 크기가 첫 reference와 정확히 같은지 여부 또는 `null`
