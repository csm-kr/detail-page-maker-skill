# GIF 용량

**총합 상한은 없다.** 모션 수와 길이는 필요한 만큼 늘린다. 아래는 용량을 줄여야 할 때 쓰는 실측 자료다.
`qa_motion.py`는 합계를 출력만 하고, `--budget-mb`를 명시적으로 줬을 때만 초과를 경고한다.

## 파생 명령

정본 MP4에서만 파생한다. HyperFrames 직접 GIF 렌더는 기본 경로가 아니다.

```sh
ffmpeg -v error -y -i in.mp4 \
  -vf "fps=$FPS,scale=780:-1:flags=lanczos,palettegen=max_colors=$COLORS:stats_mode=diff" pal.png

ffmpeg -v error -y -i in.mp4 -i pal.png \
  -lavfi "fps=$FPS,scale=780:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 out.gif

ffmpeg -v error -y -i in.mp4 -vcodec libwebp -filter:v "fps=$FPS" \
  -lossless 0 -compression_level 5 -q:v 68 -loop 0 -preset picture -an -vsync 0 out.webp

ffmpeg -v error -y -i in.mp4 -frames:v 1 poster.png
```

## 용량을 지배하는 것은 fps가 아니라 변하는 픽셀 수

`palettegen=stats_mode=diff` + `paletteuse=diff_mode=rectangle`은 **프레임 간 바뀌지 않은 영역**을 재사용한다.
따라서 화면 전체가 매 프레임 바뀌면 이 최적화가 통째로 무력화된다.

| 모션 성격 | 780×780 3.5초 실측 | 비고 |
| --- | ---: | --- |
| 고정 배경 + 작은 오버레이만 이동 | 0.3~0.8 MB | 가장 저렴 |
| 고정 배경 + 넓은 반투명 오버레이 | 1.2~1.7 MB | 반투명이 전 영역을 미세하게 바꿈 |
| 고정 배경 + 물줄기·입자 다수 | 1.0~1.2 MB | |
| 컷 전환 (서로 다른 사진 3장) | 1.8~2.0 MB | 컷마다 전면 갱신 |
| 전면 와이프·슬라이드 비교 | 1.5~3.4 MB | 길이에 정비례 |
| **전면 줌·팬 (카메라 이동)** | **4.7~9.9 MB** | 모든 픽셀이 매 프레임 이동 |

전면 줌은 한 슬롯이 10MB에 근접할 수 있다. 그래도 쓰고 싶으면 쓴다. 다만 비용을 알고 쓴다.
용량을 낮춰야 하는 상황이면 오버레이 스케일 펄스나 스포트라이트 이동으로 같은 인상을 낼 수 있다.
실측에서 줌 하나를 빼자 9.9MB → 0.67MB가 됐다.

## 파라미터 기본값과 조정 순서

| 파라미터 | 기본 | 조정 범위 |
| --- | --- | --- |
| `fps` | 12 | 무거운 슬롯 10, 정보 카드류 14 |
| `max_colors` | 128 | 192(고품질) ~ 96(절감) |
| `dither` | `bayer:bayer_scale=4` | `sierra2_4a`(고품질·큼) |
| `scale` | `780:-1` | 낮추지 않는다. 폭을 줄이면 텍스트가 뭉갠다 |

용량을 줄여야 할 때의 조정 순서(자발적 최적화. 게이트가 아니다):

1. **animated WebP로 전달 형식을 바꾼다.** 슬롯을 건드리지 않고 가장 크게 줄어든다.
2. 전면 카메라 이동을 제거한다. 효과가 압도적이다.
3. 길이를 줄인다. 와이프는 왕복 3회 → 2회.
4. 무거운 슬롯만 `fps` 12 → 10.
5. `max_colors` 128 → 96.

폭을 줄이거나 슬롯을 빼지 않는다. coverage가 먼저다.

## 형식 선택

| 채널 | 형식 | 이유 |
| --- | --- | --- |
| 일반 HTML | GIF | 호환성. `<img src>` 하나로 끝 |
| 쿠팡 Wing | animated WebP | viewport 제어가 없어 지속 재생이 필요하고 GIF보다 작다 |
| 내부 정본 | MP4 | 모든 파생의 출처. 디제스트로 연결 |

WebP는 같은 fps에서 보통 GIF의 60~90% 크기이며, 색이 많은 실사에서 특히 유리하다.

## 검증

```sh
python3 -c "from PIL import Image;im=Image.open('out.gif');print(im.n_frames, im.size)"
```

- 프레임 2개 미만은 poster-only 실패다.
- 공개 DOM의 animation 참조 수 = 파일 수 = 매니페스트 항목 수가 1:1로 닫혀야 한다.
