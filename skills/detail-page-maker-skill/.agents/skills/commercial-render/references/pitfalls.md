# 반복 실패 패턴

실제 제작에서 관측된 것만 적는다. 각 항목은 증상 → 원인 → 해결 순이다.

## 1. 한글 폰트가 `lint`를 막는다

```
error font_family_without_font_face
Font families used without @font-face declaration: apple sd gothic neo, noto sans kr
```

시스템 폰트를 `font-family`로만 쓰면 렌더러가 공급하지 못한다고 판단한다.
OS 번들 폰트는 파일이 없어도 **`src: local()` 선언만으로** 통과한다.

```css
@font-face { font-family:"DetailKR"; font-weight:100 900;
  src: local("Pretendard"), local("Apple SD Gothic Neo"),
       local("AppleSDGothicNeo-Regular"), local("Noto Sans KR"), local("Malgun Gothic"); }
```

한 패밀리로 묶어 선언하고 그 이름만 쓴다.

## 2. 밝은 제품 위 밝은 텍스트가 `check`를 막는다

```
error contrast_aa_failure  Contrast is 2.63:1; WCAG AA requires 3:1.     ← 큰 텍스트
error contrast_aa_failure  Contrast is 4.45:1; WCAG AA requires 4.5:1.   ← 작은 텍스트
```

기준이 두 개다. 큰 텍스트·그래픽은 **3:1**, 작은 텍스트(대략 24px 미만)는 **4.5:1**이다.
정보 카드의 각주나 보조 라벨처럼 작은 글씨는 흰 카드 위 중간 회색·중간 초록으로는 통과하지 못한다.
`#6B7A63`(4.4:1)은 실패하고 `#41503A`는 통과한다. 헤드라인 기준으로 고른 색을 각주에 그대로 쓰지 않는다.

노란 제품 위 흰 캡션은 `text-shadow`로 해결되지 않는다. 명암비 계산에 그림자는 안 들어간다.
캡션은 **불투명 배경 pill**을 깔고, 상단 헤드라인은 스크림 그라디언트를 강화한다.

```css
.cap b { background: rgba(7,20,5,.90); border-radius:16px; padding:14px 30px; }
.scrim-top { background: linear-gradient(180deg,
  rgba(6,14,4,.94) 0%, rgba(6,14,4,.78) 40%, rgba(6,14,4,.42) 70%, rgba(6,14,4,0) 100%); }
```

## 3. 전면 줌이 GIF를 10배로 만든다

`scale 1 → 1.07` 하나로 4.7MB가 됐다가, 제거 후 0.67MB가 됐다.
카메라 이동은 팔레트 diff 최적화를 무력화한다. [`gif-budget.md`](gif-budget.md).

카메라 인상이 필요하면 오버레이 스케일 펄스로 대체한다.
카메라 축을 인접 모션과의 차별화에 쓰고 있었다면, 핵심 변화·강조 그래픽 축으로 옮겨 2축 차이를 다시 만든다.

## 4. GIF에 헤드라인을 구우면 페이지에서 제목이 두 번 나온다

GIF는 첫 프레임 계약 때문에 자체 헤드라인이 **필요하다**.
그런데 HTML 섹션에도 `h2`를 넣으면 한 화면에 48px 제목이 연속으로 두 번 나온다.

**GIF가 헤드라인을 갖는다. HTML은 라벨 칩만 둔다.**
하단 캡션도 마찬가지다. GIF 하단 pill과 HTML `.fact`가 같은 문장이면 GIF 쪽을 뺀다.

## 5. 오버레이가 아무것도 가리키지 않으면 QA 전까지 안 보인다

렌더는 성공하고 `check`도 통과하는데, 사람이 보면 의미 없는 도형이 떠 있다.

- 부채꼴로 겹쳐 놓은 제품 위에 그은 직선 치수선 → 아무것도 측정하지 않음
- 접착면과 무관한 위치의 사각 링 → 그냥 떠 있는 상자
- 숫자 배지를 헤드라인 y좌표에 두어 글자와 겹침

**포스터(첫 프레임) 컨택트 시트를 반드시 눈으로 본다.**
치수선을 그을 정렬된 기준면이 없으면 치수선을 포기하고 비례 바나 정보 카드로 바꾼다.
배지는 헤드라인 블록과 세로 영역이 겹치지 않게 배치하거나 캡션 안으로 접는다.

## 6. macOS에서 브라우저 수집이 Chrome을 못 찾는다

```
FileNotFoundError: Chrome/Edge 실행 파일을 찾지 못했습니다. CHROME_PATH를 지정하세요.
```

extractor가 non-Windows 분기에서 `shutil.which()`만 조회해 `.app` 번들을 못 본다.

```sh
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## 7. 대기 스크립트가 자기 자신을 감지해 무한 대기한다

```sh
while pgrep -f "render.sh" >/dev/null; do sleep 5; done   # 이 셸의 명령줄에도 "render.sh"가 있다
```

`pgrep -f`는 대기 프로세스 자신의 명령줄까지 매칭한다. 렌더가 끝나도 영원히 기다린다.
백그라운드 작업 완료는 러너의 완료 통지로 받고, 폴링이 꼭 필요하면 산출물 파일의 존재·mtime을 검사한다.

## 8. `items` 모드는 사이즈가 job 공통이다

God Tibo `items` 배열에서 `size_mode`·`target_size`는 항목별이 아니라 **작업 전체 공통**이다.
정방형·가로형·세로형을 섞으려면 종횡비별로 job을 나누되, 순차가 아니라 **동시에 실행**해
단일 배치의 벽시계 시간을 유지한다. worker 합계는 32를 넘기지 않는다.

## 9. 프레임 시퀀스 배치는 규모가 커질수록 한 장씩 떨어진다

관측값 세 개.

| items | workers | 결과 |
| ---: | ---: | --- |
| 32 | 32 | 31/32 — 매니페스트 미생성, 배치 실패 |
| 32 | 16 | 25/32 — **더 나빠짐** |
| 2 | 2 | 2/2 성공 |

**동시성이 아니라 배치 규모와 지속 부하가 원인이다.** workers를 낮추면 벽시계 시간이 길어져
노출 구간이 늘고 오히려 유실이 커진다. 같은 세션에서 이미 100장 이상 생성한 뒤라면 더 심하다.

God Tibo는 전량 성공했을 때만 매니페스트를 쓰므로 한 장 실패 = 배치 실패다.
프레임 시퀀스는 한 장이 빠지면 시퀀스 전체가 무의미하므로 정지 이미지 배치와 다르게 다뤄야 한다.

대응 순서:

1. `candidates_per_frame`를 낮춰 **총 item 수**를 줄인다. 8프레임이면 2후보 = 16 items부터 시작한다.
2. 그래도 실패하면 프레임 수를 줄이거나 세션을 나눠 실행한다.
3. 원인 판정이 필요하면 2 items 프로브를 먼저 돌린다. 성공하면 파이프라인·레퍼런스·인증은 정상이고
   규모 문제로 확정된다.

부분 결과는 선별에 섞지 않는다. 실패 런은 보존하고 **새 버전 경로**로 전체를 다시 돌린다.
`work-dir`이 비어 있지 않으면 러너가 거부하는 것도 같은 이유다.

## 10. 러너가 하위 프로세스 stdout을 삼켜 원인이 남지 않는다

`run_generation.py`는 God Tibo를 `stdout=subprocess.DEVNULL`로 호출한다.
실패하면 `CalledProcessError`만 남고 어떤 item이 왜 죽었는지 알 수 없다.

원인을 봐야 할 때는 러너를 거치지 말고 생성된 job을 직접 실행한다.

```sh
node <god-tibo>/scripts/tibo-batch.mjs --job <work-dir>/tibo-parallel-job.json
```
