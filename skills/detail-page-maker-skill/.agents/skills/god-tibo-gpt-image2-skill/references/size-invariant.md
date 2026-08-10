# 사이즈 모드

이 구현은 원본 크기를 복원하는 Size Invariant와 사용자가 지정한 W×H를 만드는 Size Controllable을 분리한다.

## Size Invariant

Image 1의 크기가 `W×H`일 때:

1. `side = max(W, H)`를 계산한다.
2. `x_offset = floor((side - W) / 2)`, `y_offset = floor((side - H) / 2)`를 계산한다.
3. Image 1을 1×1 bilinear 축소해 평균 RGB를 구한다.
4. `(255-R, 255-G, 255-B)` 보색으로 `side×side` 캔버스를 만들고 Image 1을 중앙에 둔다.
5. `side <= 1024`면 `1024x1024`, 아니면 `2048x2048`로 Tibo에 요청한다.
6. 결과를 LANCZOS로 `side×side` 정렬한다.
7. `(x_offset, y_offset, x_offset+W, y_offset+H)`를 crop해 정확히 `W×H`로 복원한다.

Image 1이 이미 정방형이면 padding은 생략하지만, 생성 결과를 원본 `side×side` 크기로 정렬한다. 두 번째 이후 reference는 패딩하지 않는다.

이 절차는 `ComfyUI-SMNodes-New/apiyi/apiyi_pixel_invariant.py`의 Pixel Invariant 좌표 규칙을 Tibo용 Node.js 전후처리로 이식한 것이다.

## Size Controllable

목표 크기가 `W×H`일 때:

1. 프롬프트에 정확한 목표 `W×H`와 목표 종횡비를 주입한다.
2. GPT Image 2 image tool을 `size: "auto"`로 호출한다.
3. 생성 원본 크기를 검사한다.
4. 목표 종횡비가 되는 가장 큰 중앙 영역을 계산해 최소 center crop한다.
5. crop 결과를 LANCZOS로 정확한 `W×H`로 resize한다.
6. 최종 파일을 다시 검사하고 W와 H가 모두 정확히 일치하지 않으면 작업을 실패 처리한다.

reference가 있으면 첫 reference의 실제 크기도 검사한다. manifest의 `size.target_matches_reference`로 목표 크기와 reference 크기가 같은지 생성 전에 확인하고, 각 `images[].size_check`로 생성 후 실제 크기를 확인한다.

## ffmpeg 실행

호스트의 `ffmpeg`와 `ffprobe`를 우선 사용한다. 둘이 없고 `comfyui_root`가 지정되면 실행 중인 `comfyui` 컨테이너로 fallback한다.

fallback 보안 경계상 파일은 `comfyui_root/input` 또는 `comfyui_root/output` 아래에 있어야 한다. 호스트 경로는 각각 컨테이너의 `/app/input`, `/app/output`으로만 변환한다.

## 보존 범위

Size Invariant는 출력 캔버스 크기와 crop 좌표를 정확히 보존한다. 생성 모델이 콘텐츠 내부 픽셀을 완전히 동일하게 유지한다는 수학적 보장은 아니므로, 프롬프트에도 zoom·reframe·camera 변경 금지를 함께 적용한다.

Size Controllable은 출력 픽셀 크기를 정확히 보장하지만, 목표 비율이 생성 원본이나 reference와 다르면 중앙 바깥 영역이 잘릴 수 있다. 프롬프트에 목표 비율과 center-crop-safe 구성을 함께 지시한다.
