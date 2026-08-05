---
name: detail-page-g11-deliver
description: detail-page-orchestrator 가 G11 에서 호출한다. authoring 반영·Studio 세션·Wing 산출물·보고까지 끝낸다. 직접 호출하면 선행 게이트
  검사로 거부되므로 오케스트레이터를 통해 진입한다.
---

# G11 · 납품

authoring 반영·Studio 세션·Wing 산출물·보고까지 끝낸다.

## 이 게이트가 없으면 무엇이 조용히 깨지는가

2회차에 Studio 와 Wing 을 한 번도 열지 않았고, `rm -rf` 를 통과시키려 죽인 studio 서버(PID 7312)를 되살리지 않았다.

## 진입

```bash
node scripts/run.mjs
```

첫 줄이 선행 게이트 검사다. 통과하지 않았으면 거부하고 부족한 게이트를 알려준다.
순서와 상태는 오케스트레이터가 소유하고 이 스킬은 **판정과 작업만** 소유한다.

## 해야 하는 것

- Studio 를 띄워 **눈으로** 본다
- Wing 산출물을 새 namespace 로 내보낸다
- `work/killed.json` 의 프로세스를 전량 되살린다
- `orchestrate report` 로 확정한다. exit 0 이 아니면 완료라고 말하지 않는다

## 통과

```bash
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G11 --check
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G11 --pass
```

`--pass` 는 언제나 `scripts/check.mjs` 를 다시 돌린다. 검사를 건너뛴 통과 기록은 남지 않는다.
