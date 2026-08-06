---
name: detail-page-g8-motion
description: detail-page-orchestrator 가 G8 에서 호출한다. 발행된 스틸을 입력으로 컴포지션을 만들고 GIF 를 굽는다. 직접 호출하면 선행 게이트
  검사로 거부되므로 오케스트레이터를 통해 진입한다.
---

# G8 · 모션

**GIF 의 입력은 발행된 스틸이다.** 스틸에서 시작해 두 가지 방식으로 굽는다.

| 수단 | 무엇이 움직이는가 | 어떻게 |
| --- | --- | --- |
| `still-motion` | 제품은 고정, **설명이 움직인다** | 스틸 한 장 위에 마스크·푸시인·치수선·자막 |
| `tibo-sequence` | **장면이 움직인다** | 스틸을 레퍼런스로 다음 장면을 생성해 이어 붙인다 |

두 번째는 god-tibo 가 이미 갖고 있던 경로다 (`prompts` + `references`).
스틸이 Image 1 이므로 생성된 프레임이 같은 제품을 유지한다.

**GIF 조립은 두 수단 모두 `lib/gifasm.mjs` 가 한다.** 렌더러는 프레임까지만 만든다.

## 속도

GIF 는 **얼마나 오래 보이는가**가 내용의 일부다. 4회차 실측은 이랬다.

```
gif-01·02·03  12프레임 · 2.00초 · 프레임마다 0.167초 · 마지막에 머무름 없음
gif-04·05      3프레임 · 0.48초 · 프레임마다 0.16초
```

3장짜리 장면 전환이 0.48초에 끝난다. 읽기 전에 다시 시작한다.

옛 `references/motion.md` 는 이 규칙을 이미 갖고 있었다 — MR-006 "결과 상태를 최소
1초 유지한다", MR-018 "첫 프레임은 단독으로 1초 안에 이해돼야 한다". 12게이트
재작성에서 그 문서가 통째로 빠졌고, 속도를 재는 검사도 없었다.

이제 게이트가 **구운 GIF 를 열어** 잰다 (`lib/gifmeta.mjs` + `lib/pacing.mjs`).

| 하한 | 값 | 왜 |
| --- | --- | --- |
| 첫 프레임 | 800ms | 무엇을 보는지 읽을 시간 (MR-018) |
| 마지막 프레임 | 1000ms | 결과를 보여 주고 되감는다 (MR-006) |
| 한 바퀴 | 2500ms 이상 · 12000ms 이하 | 읽기 전에 되감기지도, 스크롤이 지나가지도 않게 |
| 장면 하나 | 900ms (`tibo-sequence` 만) | 장면이 바뀌면 읽을 시간을 준다 |

`still-motion` 의 보간 프레임에는 장면 하한을 대지 않는다 — 그건 움직임이지 장면이 아니다.

장면 수가 상한 안에 못 들어가면 **조립 전에 거부한다.** 빨리 돌려서 맞추지 않는다 —
그렇게 맞춘 것이 0.48초짜리 GIF 였다. 장면 수는 기획이 줄인다.

## 이 게이트가 없으면 무엇이 조용히 깨지는가

2회차에 brief 10개를 고쳤지만 컴포지션은 1회차 설계를 그대로 재렌더했다.

3회차에는 컴포지션 10개를 손으로 썼고 **10개 전부 `<img>` 가 0건이었다.** CSS 사각형에
애니메이션을 걸었다. 파일은 다 있었으므로 존재 검사도 신선도 검사도 통과했고,
결과만 "도형이 움직이는 화면" 이었다.

4회차에는 입력이 이미지로 바뀌었는데 **너무 빨리 지나가서 못 읽었다.** brief 에는
"천천히 드러난다" 라고 적혀 있었다. 계획을 읽는 검사로는 잡을 수 없다.

## 렌더 경로 — 굽기 전에 잰다

3회차에 hyperframes CLI 가 **240초에 타임아웃했다.** Chrome 스크린샷으로 갈아탔고
그 뒤로 다시 시도하지 않았다 — **우회가 굳었다.** 의존성은 계속 벤더링돼 있었고
문서는 계속 hyperframes 를 가리켰다. 아무도 다시 재지 않았기 때문이다.

이제 재는 것이 게이트다.

```bash
node scripts/run.mjs --probe
```

`work/comps/render-probe.json` 이 없거나, 하루가 지났거나, 살아 있는 경로가 하나도
없으면 거부한다. 4회차 실측은 `hyperframes doctor` 7.3초 · `chrome` 1프레임 0.9초다.
자세한 것은 [`references/render-path.md`](references/render-path.md).

## 용량 — 페이지 전체의 미디어 예산을 여기서 지킨다

5회차에 G10 이 미디어 총량 12.6MB 로 거부했는데 그중 **84%가 GIF** 였다. G10 은 스크립트
게이트라 스스로 줄이지 못하고, 거기까지 가면 앞 게이트를 전부 되돌려야 한다.
그래서 상한(정책값 `media_budget_mb`)을 굽는 자리에서 같이 본다.

줄이는 곳은 **조립기의 팔레트**다. 폭 780px 은 그대로 둔다 — 페이지 폭이 780px 이라
줄이면 그만큼 흐려진다. 실측과 왜 그 값인지는 [`references/render-path.md`](references/render-path.md).

## 진입

```bash
node scripts/run.mjs --probe      # 렌더 경로가 예산 안에 도는가
node scripts/run.mjs --scaffold   # brief 마다 컴포지션. 스틸이 이미 들어가 있다
node scripts/run.mjs --render     # 굽는다
node scripts/run.mjs --assemble   # 프레임은 그대로 두고 GIF 만 다시 굽는다
```

`--assemble` 은 조립 설정(팔레트·디더·지연)만 바뀌었을 때 쓴다. `--render` 를 다시 돌리면
`tibo-sequence` 프레임을 이미지 API 로 **다시 생성해서** 돈이 다시 들고 이미 승인된 장면이
다른 그림으로 바뀐다. 컴포지션이나 brief 를 고쳤으면 `--assemble` 이 아니라 `--render` 다.

첫 줄이 선행 게이트 검사다. 통과하지 않았으면 거부하고 부족한 게이트를 알려준다.
순서와 상태는 오케스트레이터가 소유하고 이 스킬은 **판정과 작업만** 소유한다.

## 해야 하는 것

- `--probe` 로 렌더 경로를 먼저 잰다. 죽은 경로 위에서 brief 를 아무리 잘 써도 못 굽는다
- `--scaffold` 로 컴포지션을 만든다. 손으로 처음부터 쓰지 않는다
- 컴포지션의 `<img>` 를 **지우지 않는다.** 지우면 게이트가 잡는다
- `pattern` 을 brief 에 맞게 고른다 (reveal / zoom / sequence / measure)
- 자막 용어를 `page-plan.md` 의 용어 집합에서만 고른다
- 인접한 GIF 가 같은 `pattern` 을 반복하지 않게 한다
- `method` 를 지켜 굽는다. 한 수단이 8개를 넘으면 편한 경로로 쏠린 것이다
- `tibo-sequence` 의 `frames` 는 장면 하나에 0.9초씩 든다. 12장을 넘기지 않는다
- `work/comps/index.json` 에 brief↔스틸↔컴포지션↔GIF 대응을 남긴다

## 통과

```bash
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G8 --check
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G8 --pass
```

`--pass` 는 언제나 `scripts/check.mjs` 를 다시 돌린다. 검사를 건너뛴 통과 기록은 남지 않는다.
