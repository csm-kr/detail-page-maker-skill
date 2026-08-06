---
name: detail-page-g4-mockup
description: detail-page-orchestrator 가 G4 에서 호출한다. templates.md 를 전량 조립해 목업을 받고 DESIGN-GUIDE.md 와 harvest.md 를 쓴다. 직접 호출하면 선행 게이트
  검사로 거부되므로 오케스트레이터를 통해 진입한다.
---

# G4 · 목업

templates.md 를 전량 조립해 목업을 받고 DESIGN-GUIDE.md 와 harvest.md 를 쓴다.

## 이 게이트가 없으면 무엇이 조용히 깨지는가

2회차에 templates.md 1,208줄을 열지 않고 2,754자 프롬프트를 써서 5개 블록이 빠졌다. 무드 레퍼런스를 한 장도 넣지 않았고, 콜라주 2장과 중복 1장을 개수 검사가 잡지 못했다.

3회차에는 `run.mjs` 가 체크리스트만 출력하고 끝났다 — **실행 경로가 아예 없었다.**
사람이 ChatGPT 대화로 가야 했고 23분 예산의 이 게이트가 가장 오래 걸렸다.
바로 옆 `.agents/skills/god-tibo-gpt-image2-skill` 을 아무도 부르지 않았다.

그리고 실제로 남은 것은 이것이었다.

```json
"origin": "self-rendered",
"origin_note": "ChatGPT 대화 산출물이 아니다. work/design-ref/mockup.html 을 headless Chrome 으로 렌더한 실물 픽셀이다."
```

**우리가 만든 HTML 을 찍은 스크린샷을 목업이라고 불렀다.** 그러면 디자인 목표가
곧 결과물이고, 목업은 아무것도 끌어올리지 못한다. G4 가 존재하는 이유가 사라진다.
그때 여섯 검사는 전부 통과했다 — 출처를 묻는 검사가 없었기 때문이다.

목업은 **밖에서** 와야 한다. `mockup-index.json` 의 `origin` 이 `god-tibo` 가 아니면
게이트가 거부한다.

## 진입

```bash
node scripts/run.mjs --generate
```

첫 줄이 선행 게이트 검사다. 통과하지 않았으면 거부하고 부족한 게이트를 알려준다.
순서와 상태는 오케스트레이터가 소유하고 이 스킬은 **판정과 작업만** 소유한다.

## 해야 하는 것

- `run.mjs --generate` 로 목업을 받는다. 프롬프트 조립은 스크립트가 한다 — 손으로 쓰지 않는다
- 우리 HTML 을 렌더해 목업 자리에 놓지 않는다. 목업은 밖에서 온다 — 게이트가 `origin` 으로 거부한다
- `work/design-ref/mood/` 에 무드 레퍼런스를 최소 1장 둔다. identity 사진만으로는 톤이 나오지 않는다
- 목업 픽셀에서 팔레트·타이포·구성 요소를 실측해 `DESIGN-GUIDE.md` 를 쓴다
- 가이드에는 `## 팔레트` 와 `## 배경` 절이 있어야 한다. G5 가 그 두 절을 읽는다
- `harvest.md` 에 **무엇을 가져오고 무엇을 안 가져오는지** 적는다
- 기준작 `benchmark/BENCHMARK.md` 의 팔레트·강조 장치와 대조한다. 저채도 단색은 상세페이지가 아니다

## 통과

```bash
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G4 --check
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G4 --pass
```

`--pass` 는 언제나 `scripts/check.mjs` 를 다시 돌린다. 검사를 건너뛴 통과 기록은 남지 않는다.
