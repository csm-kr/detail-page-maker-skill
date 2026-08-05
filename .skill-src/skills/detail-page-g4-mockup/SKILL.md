---
name: detail-page-g4-mockup
description: detail-page-orchestrator 가 G4 에서 호출한다. templates.md 를 전량 조립해 목업을 받고 DESIGN-GUIDE.md 와 harvest.md 를 쓴다. 직접 호출하면 선행 게이트
  검사로 거부되므로 오케스트레이터를 통해 진입한다.
---

# G4 · 목업

templates.md 를 전량 조립해 목업을 받고 DESIGN-GUIDE.md 와 harvest.md 를 쓴다.

## 이 게이트가 없으면 무엇이 조용히 깨지는가

2회차에 templates.md 1,208줄을 열지 않고 2,754자 프롬프트를 써서 5개 블록이 빠졌다. 무드 레퍼런스를 한 장도 넣지 않았고, 콜라주 2장과 중복 1장을 개수 검사가 잡지 못했다.

## 진입

```bash
node scripts/run.mjs
```

첫 줄이 선행 게이트 검사다. 통과하지 않았으면 거부하고 부족한 게이트를 알려준다.
순서와 상태는 오케스트레이터가 소유하고 이 스킬은 **판정과 작업만** 소유한다.

## 해야 하는 것

- `references/templates.md` 를 **전량** 읽고 블록을 빠뜨리지 않고 조립한다
- 컷마다 **무드 레퍼런스를 최소 1장** 붙인다. identity 사진만으로는 톤이 나오지 않는다
- 얼굴 정책(`policy.model_face`)을 프롬프트에 문자로 주입한다
- **한 대화에서 4장씩** 받는다. 병렬 탭은 다른 대화가 되어 톤이 갈린다
- 받은 파일을 섹션과 **1:1로 분류해 기록**한다. 개수만 세면 콜라주와 중복을 놓친다
- 목업 픽셀에서 팔레트·타이포·구성 요소를 실측해 `DESIGN-GUIDE.md` 를 쓴다
- `harvest.md` 에 **무엇을 가져오고 무엇을 안 가져오는지** 적는다

## 통과

```bash
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G4 --check
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G4 --pass
```

`--pass` 는 언제나 `scripts/check.mjs` 를 다시 돌린다. 검사를 건너뛴 통과 기록은 남지 않는다.
