# 쿠팡 상세페이지 제작 방법 — 움직이는 이미지 넣기

저작 HTML(텍스트가 살아 있는 상태)을 **섹션 단위 780px WebP**로 평탄화해서
쿠팡 Wing에 올리는 방법. 애니메이션이 유지된다.

---

## 1. 왜 이 방식이 필요한가

### 쿠팡은 GIF를 정지 이미지로 바꾼다

GIF를 올리면 쿠팡이 **첫 프레임만 뽑아 정지 PNG로 변환**한다.

이 프로젝트에서 실제로 확인한 내용:

- 쿠팡에 저장된 이미지 19장을 받아 형식을 검사했다.
- 정적 섹션 8장 → WebP (정상)
- **모션 섹션 11장 → 전부 PNG** (애니메이션 소실)
- 그 PNG들을 원본 애니메이션 48프레임과 하나씩 대조한 결과,
  **첫 프레임(#0, #1)과 가장 일치**했다.

즉 GIF는 쿠팡에서 구조적으로 움직일 수 없다. **애니메이션 WebP로 올려야 한다.**

### 이미지 주소는 반드시 https

상세설명 HTML이 `http://image1.coupangcdn.com/...`을 참조하면
쿠팡 상품 페이지(HTTPS)에서 **혼합 콘텐츠로 차단되어 이미지가 아예 안 뜬다.**
같은 주소를 `https://`로 바꾸면 정상 표시된다.

### 텍스트가 HTML에 살아 있으면 안 된다

저작 HTML은 섹션마다 `<h1>`, `<h2>` 텍스트를 CSS로 그린다.
여기 쓰인 이미지 파일만 그대로 올리면 **카피가 통째로 사라진다.**
반드시 텍스트까지 이미지에 구워서(평탄화) 올려야 한다.

---

## 2. 쿠팡 규격

| 항목 | 기준 |
| --- | --- |
| 형식 | WebP (애니메이션 지원). GIF 불가 |
| 가로 | 780px |
| 세로 | 5,000px 이하 |
| 개별 용량 | 10MB 이하 |
| 업로드 경로 | 상품관리 → 상품조회/수정 → 상세설명 → **이미지 업로드** |

`HTML 작성` 모드가 아니라 `이미지 업로드` 모드를 쓴다.
반영에 2~30분 걸릴 수 있다.

---

## 3. 필요한 것

- Node.js 22 이상 (내장 WebSocket 사용, 별도 패키지 불필요)
- Python 3 + Pillow
- Google Chrome

```sh
node --version
python3 -c "import PIL; print(PIL.__version__)"
```

---

## 4. 폴더 구조

```
깔창-편집본.html        저작 원본. 텍스트·레이아웃을 여기서 고친다
wing-upload/            원본 미디어 (애니메이션 WebP 등)
scripts/
  capture.mjs           Chrome 으로 섹션별 스크린샷
  composite.py          애니메이션 자리에 프레임 합성
  build.py              인코딩 + 단독 실행 HTML 생성
wing-sections/          결과물. 쿠팡에 올릴 780px WebP 19장
```

---

## 5. 제작 순서

### 5-1. 저작 HTML 준비

- 이미지 경로를 로컬(`wing-upload/`)로 맞춘다.
- Studio 편집 속성(`data-edit`, `spellcheck` 등)은 제거한다.
- **`data-section` 속성은 반드시 남긴다.** 캡처 스크립트가 섹션을 찾는 기준이다.

### 5-2. 섹션 캡처

```sh
export ANIMATED_JSON=$(python3 -c "
import glob,os,json
print(json.dumps([os.path.basename(p) for p in sorted(glob.glob('wing-upload/*.webp'))
                  if b'ANIM' in open(p,'rb').read()[:60]]))")

node scripts/capture.mjs 깔창-편집본.html sections
```

각 섹션을 780px 폭으로 캡처한다.
애니메이션이 있는 섹션은 `#FF00FF`와 `#00FF00` 두 색으로 두 번 찍는다.

### 5-3. 합성 + 빌드

```sh
python3 scripts/build.py sections wing-upload 깔창-쿠팡전용.html 48 84 wing-sections
#                        ^캡처   ^원본미디어  ^출력 HTML        ^  ^  ^결과 폴더
#                                                    애니 품질  정적 품질
```

`wing-sections/`에 섹션별 WebP가, 지정한 경로에 이미지를 전부 내장한
단독 실행 HTML이 만들어진다.

### 5-4. 확인

```sh
open 미리보기.html
```

로컬에서 움직이는지 먼저 본다.
**Wing 편집기 안의 미리보기는 첫 프레임만 보여주는 경우가 많아 판단 기준이 아니다.**
최종 확인은 실제 상품 페이지에서 한다.

### 5-5. 업로드

`wing-sections/`의 파일을 `01`부터 순서대로 이미지 업로드에 올린다.
파일명이 번호순이라 한 번에 드래그해도 순서가 맞는다.

---

## 6. 핵심 기법 — 두 배경색 매팅

애니메이션 자리를 정확히 찾아내는 방법.

애니메이션 `<img>`를 서로 다른 두 단색으로 칠해 각각 캡처하면

```
A = α·C1 + rest
B = α·C2 + rest
```

이므로 다음처럼 알파와 배경을 정확히 분리할 수 있다.

```
α    = (A - B) / (C1 - C2)
rest = A - α·C1
```

여기에 프레임을 넣어 `α·frame + rest`로 합성한다.

이렇게 하면 **둥근 모서리, 안티앨리어싱 경계, 위에 겹친 반투명 요소가 전부 보존된다.**
단색 하나로 마스크를 만들면 경계에 색 번짐이 남으므로 반드시 두 색을 쓴다.

교체할 단색은 **원본과 같은 intrinsic 크기**여야 한다.
크기가 다르면 레이아웃이 바뀌어 좌표가 어긋난다. canvas로 만들면 된다.

---

## 7. 빠지기 쉬운 함정

**렌더 폭을 임의로 정하지 말 것.**
이 디자인은 360px 기준을 2.166667배 확대한 것이라 **자연 폭이 780px**다.
390px로 렌더하면 줄바꿈이 깨지고 텍스트가 넘친다.
확인 방법: 여러 폭으로 렌더해 `.detail-page` 실제 폭과 넘침 요소 개수를 센다.
넘침 0개인 폭이 정답이다.

**DPR 이중 적용 주의.**
`Emulation.setDeviceMetricsOverride`의 `deviceScaleFactor`가 이미 배율을 적용한다.
여기에 `Page.captureScreenshot`의 `clip.scale`까지 주면 2중으로 곱해진다.
780px 자연 폭이면 `deviceScaleFactor: 1`, `clip.scale: 1`이다.

**ffmpeg로 애니메이션 WebP를 못 읽는다.**
ffmpeg의 webp 디코더는 애니메이션을 지원하지 않는다. Pillow를 쓴다.

**용량은 `minimize_size`가 좌우한다.**
`save(..., minimize_size=True)`를 주면 프레임 차분이 적용된다.
움직이는 영역이 화면 일부일 때 용량이 몇 배 줄어든다.
동일 프레임은 병합되며 duration이 합산되어 총 재생시간은 유지된다.

**헤드리스 Chrome 이 사용자의 Chrome 에 붙는다.**
`--user-data-dir` 없이 띄우면 이미 실행 중인 Chrome 인스턴스에 신호만 보내고
프로세스가 끝나 디버그 포트가 열리지 않는다. 전용 프로필로 독립 인스턴스를 띄운다.
경로가 길면 AF_UNIX 소켓 생성이 실패하므로 `/tmp/wingcap` 처럼 짧은 경로를 쓴다.

**탭 목록에서 첫 페이지를 고르면 안 된다.**
다른 작업의 탭이 남아 있으면 엉뚱한 문서를 캡처한다.
`PUT /json/new?about:blank` 로 자기 탭을 만들어 그 탭에만 붙는다.

**애니메이션 WebP 는 `img.decode()` 가 끝나지 않는다.**
`Promise.all([...document.images].map(i=>i.decode()))` 를 그대로 await 하면
캡처가 첫 페이지에서 영원히 멈춘다. `Promise.race` 로 8초 제한을 건다.

**GIF 변환은 답이 아니다.**
같은 애니메이션을 GIF로 만들면 12~60배 커진다.
가장 작은 섹션조차 10MB를 넘어 쿠팡 제한에 걸린다.

---

## 8. 검증 체크리스트

```sh
# 형식·프레임·루프 확인
python3 - <<'EOF'
import struct, glob, os
for p in sorted(glob.glob('wing-sections/*.webp')):
    d = open(p,'rb').read(); i = 12; durs = []; loop = None; anim = False; w = h = 0
    while i+8 <= len(d):
        fc = d[i:i+4].decode('latin1'); size = struct.unpack('<I', d[i+4:i+8])[0]
        pl = d[i+8:i+8+size]
        if fc == 'VP8X':
            anim = bool(pl[0] & 0x02)
            w = int.from_bytes(pl[4:7],'little')+1
            h = int.from_bytes(pl[7:10],'little')+1
        elif fc == 'ANMF':
            durs.append(int.from_bytes(pl[12:15],'little'))
        i += 8 + size + (size & 1)
    print(f"{os.path.basename(p):26} {w}x{h} "
          f"{'ANIM %df %.1fs loop=%s' % (len(durs), sum(durs)/1000, loop) if anim else '정지'} "
          f"{os.path.getsize(p)/1048576:.2f}MB")
EOF
```

통과 기준:

- 가로 전부 780px
- 세로 5,000px 이하
- 개별 10MB 이하
- 움직여야 할 섹션이 `ANIM`이고 `loop=0`
- 마젠타(255,0,255) 잔여 0px

---

## 9. 참고

- 쿠팡은 GIF 직접 업로드 불가, WebP 애니메이션은 지원
  - https://www.mangoboard.net/guide/547
  - https://sellernow.co.kr/post/507114
- 상세페이지 규격 (780px, 세로 5,000px, 10MB)
  - https://blog.gencystudio.com/coupang-detailpage-guide
