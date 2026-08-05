# Claude Code 에서 실행

**순서는 여기 없다.** 게이트 순서·예산·거부 조건은 `scripts/lib/gates.mjs` 하나가
정의한다. 이 문서는 호스트 차이에서만 생기는 것 — 역할 배분과 lane — 만 다룬다.
Codex 쪽은 [`codex.md`](codex.md) 이고 **두 문서의 결과는 같아야 한다.**

## 스킬 접근

Claude Code 는 `.claude/skills/` 를 읽는다. `detail-page-init` 이 `.skill-src/skills/`
원본을 여기로 연결한다 (junction 우선, 실패 시 복사).

`.claude/skills/` 를 직접 고치지 않는다. **생성물이다.** 다음 `init` 에서 덮어써진다.

`agents/*.yaml` 은 Codex UI 카탈로그 항목이다. 이 호스트에서는 읽지 않아도 된다.

## 역할 배분

오케스트레이터가 순서와 판정을 쥐고, 판단이 필요한 단계를 sub-agent 에 위임하고,
검수만 독립 세션으로 내보낸다.

| 역할 | 무엇을 받나 | 무엇을 돌려주나 |
| --- | --- | --- |
| **사실** | 공급처 캡처 · 실물 사진 | `work/SSOT.md` |
| **판독** | 기준작 캡처 | `work/flow-map.md` |
| **기획** | 위 둘 | 플랜 초안. **쪼개지 않는다** — 쪼개면 섹션 간 흐름이 끊긴다 |
| **목업** | 플랜 · 실물 사진 · 무드 레퍼런스 | 목업 · 가이드 · 수확 계획 |
| **제작** | 발행 플랜 | 스틸 · 컴포지션 · GIF |
| **검수** | 완성물 | 판정. **생산자와 다른 세션에서** |

`Task` 로 sub-agent 를 띄울 때 그 단계의 `SKILL.md` 와 `references/` 만 물려 보낸다.
단계를 스킬로 쪼갠 이유가 이 컨텍스트 격리다.

## lane

```text
브라우저 lane = 1       (직렬 강제)
  공급처 수집 · 기준작 수집 · 목업 대화 · CDP 캡처
분석 lane   = 다수      (병렬)
  저장된 캡처 읽기 · 카피 · 프롬프트 · 컴포지션 설계
생성 lane   = provider 동시성 그대로
  이미지 32 workers · GIF 렌더
```

브라우저 lane 을 늘리면 탭이 바뀐다. 2회차에 활성 탭이 다른 ChatGPT 대화로 옮겨간 것을
"DOM 가상화" 로 오진했다. **한 lane 이 규칙인 이유가 그것이다.**

## 이 호스트에서 조심할 것

| 함정 | 대응 |
| --- | --- |
| browser-harness 스크립트에 한글 주석을 넣으면 `UnicodeEncodeError: surrogates not allowed` | 스크립트는 ASCII 로만 쓴다. 2회차에 세 번 걸렸다 |
| `Input.insertText` 가 TimeoutError 를 던져도 텍스트는 들어가 있다 | 재시도 전에 composer 상태를 확인한다. 맹목 재시도는 중복 전송이 된다 |
| `Page.captureScreenshot` 이 IPC timeout | `capture_screenshot(path)` 헬퍼를 쓴다 |
| `new_tab()` 으로 연 탭은 harness 프로세스가 끝나면 죽는다 | 열기·대기·캡처를 한 번의 호출 안에서 끝낸다 |
| `cdp()` 가 활성 세션을 옮긴다 | 호출 후 URL 을 확인한다 |
| 780px 에뮬레이션을 사용자 탭에 걸어 두면 그대로 남는다 | 캡처 후 되돌린다 |

자세한 것은
[`design-reference.md`](../../detail-page-g4-mockup/references/design-reference.md).

## 완료 어휘

`orchestrate report` 가 exit 0 이 아니면 **"완료" 라는 단어를 쓰지 않는다.**
게이트 표를 그대로 붙인다. 2회차에 13개를 누락한 채 "전부 완료" 라고 보고했다.
