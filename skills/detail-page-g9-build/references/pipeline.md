# 빌드 파이프라인 안정화

G4 에서 페이지를 조립할 때 지킨다. 한 번 만들고 끝내는 스크립트가 아니라 **다시 돌려도 같은
결과가 나오는 파이프라인**을 만든다.

## 색은 한 곳에서만 온다

프로젝트에 토큰 파일 하나를 두고 페이지와 GIF 가 그 파일만 본다.

```json
{
  "_source": "work/design-ref/DESIGN-GUIDE.md",
  "color": { "navy": "#001651", "brand": "#4BA4FD", "tint": "#F4F8FD", "wave": "#F9FBFE" },
  "_derived": ["gray", "line"],
  "radius": "16px"
}
```

- 값의 출처는 `DESIGN-GUIDE.md` 다. 가이드에 없어 파생한 중립색은 `_derived` 로 표시한다.
- CSS 는 `:root` 에서만 색을 선언한다. 선택자 안에 hex 를 흘리면 다음 사람이 못 찾는다.
- **그라디언트에는 `color-mix` 를 쓰지 않는다.** `color-mix(in srgb, X 0%, transparent)` 는
  투명 **검정**으로 풀려 0% 스톱에 회색 끼가 생긴다. 토큰에서 rgb 삼중값을 뽑아 `rgba()` 로 쓴다.
- 공개 HTML 은 여러 브라우저에서 열린다. 최신 CSS 함수보다 `rgba()` 가 안전하다.

## 경로를 사용자에 묶지 않는다

스크립트 위치에서 프로젝트 루트를 잡는다. 절대 경로 리터럴을 두면 다른 기계에서 죽는다.

```js
const WORK = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const ROOT = path.resolve(WORK, "..");
```

Python 은 `os.path.dirname(os.path.abspath(__file__))` 를 쓴다.

**프로젝트 이름도 박지 않는다.** `projects/` 아래가 하나면 그것을 쓰고, 여러 개면
`DETAIL_PAGE_PROJECT` 로 고르게 한다. 이름을 기본값으로 박아 두면 다음 프로젝트에서
조용히 옛 프로젝트를 빌드한다.

```js
function resolveProject() {
  const base = path.join(ROOT, "projects");
  if (process.env.DETAIL_PAGE_PROJECT) return path.join(base, process.env.DETAIL_PAGE_PROJECT);
  const dirs = readdirSync(base).filter((d) => statSync(path.join(base, d)).isDirectory());
  if (dirs.length !== 1) throw new Error(`projects/ 아래 프로젝트가 ${dirs.length}개다`);
  return path.join(base, dirs[0]);
}
```

## 생성물과 발행물을 분리한다

이미지 생성기는 `frame-000.png` 처럼 job 순서로만 파일을 내놓는다. 그 이름을 그대로
발행하면 HTML 을 읽을 수 없다. **플랜의 컷마다 발행 파일명(slug)을 정해 두고** 생성 순서
파일로 매핑해 옮긴다.

```text
work/gen/<bucket>/frame-NNN.png  →  output/media/images/<slug>.png
work/gen/job-<bucket>.order.json   순서 → {id, slug}
```

slug 는 플랜에서 **고유성을 테스트로 고정한다.** 겹치면 컷이 조용히 덮어써진다.
모션 컴포지션도 같은 발행 이미지를 보게 한다. 두 곳이 갈리면 GIF 와 정지컷의 제품이
달라 보인다.

## 완성본은 한 명령으로 만든다

빌드만 돌리면 폰트 자리표시자가 남는 식으로 단계가 흩어지면, 사람이 순서를 기억해야 하고
반쪽 완성본이 남는다. 단계를 한 스크립트로 묶고 **하나라도 실패하면 즉시 멈춘다.**

```text
stills → crop → [comps → gifs → gifqa] → gifpub → page → font → qa
(대괄호 안은 GIF 를 다시 구울 때만)
```

- `stills` 생성 컷을 발행 파일명으로 옮긴다. 플랜의 컷이 하나라도 빠지면 멈춘다
- `crop` 가이드가 허용한 목업 배경 크롭을 발행한다
- `gifpub` 구운 GIF 를 `output/media/gifs` 로 옮긴다. **이 단계를 빼면 QA 가
  `ASSET_MISSING` 으로 막힌다.** HTML 이 GIF 를 참조하는데 파일이 없기 때문이다

마지막 단계는 항상 스킬의 `qa --strict-media` 다.

## 회귀 테스트로 고정한다

문서로 적은 규칙은 지켜지지 않는다. 테스트로 막는다.

- 스크립트에 사용자 절대 경로도, 프로젝트 이름 리터럴도 없다
- 토큰 파일이 가이드의 팔레트를 담는다
- CSS 의 색이 `:root` 에만 있다
- 공개 HTML 에 폐기된 팔레트가 없고 브랜드 컬러를 쓴다
- 공개 HTML 에 자리표시자가 남지 않는다
- 플랜의 섹션 수와 HTML 의 섹션 수가 같다
- **DESIGN-GUIDE 의 구성 요소가 HTML 에 실제로 있다** — 인라인 SVG 개수, 정보 카드와 행
  개수, 번호 지시선 개수, pill·인셋·비교카드·칩·치수선·점선·정보표·3칸요약·웨이브·눈송이
  클래스의 존재. 이것을 빼면 팔레트만 옮기고 끝난다
- 목업이 틀린 부위명·표현을 HTML 에서 바로잡았다
- 컷마다 발행 파일명이 고유하다
- 근거 없는 표현이 공개 HTML 에 없다
- **GIF 가 컴포지션보다 오래되지 않았다** — 컴포지션을 고치고 GIF 를 다시 굽지 않으면
  HTML 은 새 팔레트, GIF 는 옛 팔레트로 갈린다
- 스킬 QA 를 `--strict-media` 로 통과한다

## 자산 검증에서 틀리기 쉬운 것

| 함정 | 대응 |
| --- | --- |
| **GIF 프레임을 인덱스로 건너뛰며 읽지 않는다** | PIL 의 GIF 디코더는 순차 접근이 전제다. 델타 프레임은 앞 프레임 위에 합성되므로 `frames[24]` 처럼 임의 접근하면 깨진 프레임을 읽는다. 이 때문에 정상 GIF 를 "정지 GIF" 로 오판하고 멀쩡한 렌더 경로를 갈아치우려 한 일이 있다. `ImageSequence.Iterator` 로 처음부터 읽는다 |
| MP4 프레임 diff 로 애니메이션 여부를 판정하지 않는다 | 손실 압축이라 같은 화면도 프레임마다 미세하게 달라져 항상 "다르다" 가 나온다 |
| 움직임은 프레임 내용 해시로 센다 | "특정 색 픽셀 수" 는 하드컷 색 순환을 정지로 오판한다 |
| 옅은 오버레이는 특정 시각에만 보인다 | 화면 밖에서 시작하는 스윕은 앞쪽 프레임에 안 보이는 게 정상이다. 효과가 화면 중앙에 오는 프레임을 골라 재야 한다 |
| 액센트 컬러 존재를 전 자산에 강제하지 않는다 | 그늘 마스크나 흰 그라디언트처럼 설계상 액센트를 안 쓰는 모션이 있다. 폐기 팔레트 부재만 강제한다 |
