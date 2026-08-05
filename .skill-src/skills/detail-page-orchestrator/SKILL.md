---
name: detail-page-orchestrator
description: 공급처 URL과 지정 쿠팡 URL로 폭 780px 상세페이지를 만든다. 상세페이지·쿠팡
  상세설명 제작 요청의 유일한 진입점이며 게이트를 순서대로 관리한다. 처음이면
  detail-page-init 을 먼저 실행한다.
---

# Detail Page Orchestrator

지정한 쿠팡 상세페이지의 판매 흐름을 읽어 현재 상품의 사실과 자산으로 재구성한다.
**이 스킬은 일을 하지 않는다.** 순서·상태·검사·보고만 소유하고 실제 작업은 단계 스킬이 한다.

## 시작

1. `work/env.lock.json` 이 없으면 **`detail-page-init` 을 먼저 실행한다.**
   사용자가 `$init` 이라 부르는 단계다.
2. 제작을 시작한다.

   ```bash
   node scripts/orchestrate.mjs start --name <이름> \
     --supplier-url <공급처> --coupang-url <기준 쿠팡> [--photos data]
   ```

3. 출력된 표에서 **첫 번째 미통과 게이트의 스킬을 부른다.** 순서를 바꾸지 않는다.

   ```bash
   node scripts/orchestrate.mjs gates
   ```

4. 막히면 `gate <id> --check` 가 부족한 것을 한 줄로 알려준다.
5. `report` 가 exit 0 이 되기 전에는 **"완료" 라고 말하지 않는다.** 표를 그대로 붙인다.
6. 호스트별 역할 배분은 [`references/claude-code.md`](references/claude-code.md) 또는
   [`references/codex.md`](references/codex.md). **순서는 양쪽이 같다.**

## 명령

| 명령 | 내용 |
| --- | --- |
| `start` | 프로젝트 생성 + 상태 파일 + 표 |
| `gates` | 표, 첫 미통과 게이트와 부를 스킬 이름 |
| `gate <id> --start` | 시작 시각 기록. 이것이 없으면 `--pass` 가 거부된다 |
| `gate <id> --check` | 부족한 것을 출력 |
| `gate <id> --pass` | **검사를 다시 돌린 뒤에만** 통과 기록 |
| `lock --read <경로> --url <url>` | 캡처를 해시와 함께 잠근다. 손으로 놓은 파일은 등록되지 않는다 |
| `run [--parallel]` | 판단이 필요한 지점까지 자동으로 걸어간다 |
| `report` | `work/report.md` 생성. 미통과가 있으면 exit 1 |
| `doctor` | 런타임·설치·정책 확인 |

트래커는 `node scripts/track.mjs`.

## 규칙

- **우회 플래그가 없다.** `--force` 를 만들지 않는다. 게이트가 틀렸으면 게이트를 고친다.
- 게이트 정의·순서·예산은 [`scripts/lib/gates.mjs`](scripts/lib/gates.mjs) 한 곳에만 있다.
  다른 문서에 다시 적지 않는다 — 적으면 갈린다.
- 상류 산출물이 바뀌면 하류 게이트가 **자동으로 되돌아간다.** 정상 동작이다.
- 단계 스킬을 직접 부르면 선행 게이트 검사로 거부된다.
- 실행 원칙과 안전선은 [`references/workflow.md`](references/workflow.md).
