# Issue tracker

이슈, 명세와 Wayfinder 지도는 `docs/issues/` 아래의 Markdown 파일이다.

## Conventions

- 기능 단위 디렉터리: `docs/issues/<feature-slug>/`
- 명세: `docs/issues/<feature-slug>/spec.md`
- 구현 이슈: `docs/issues/<feature-slug>/issues/<NN>-<slug>.md`
- 지도: `docs/issues/<feature-slug>/map.md`
- 이슈 번호는 `01`부터 증가시킨다.
- `Type:`은 `research`, `prototype`, `grilling`, `task` 중 하나를 사용한다.
- `Status:`는 `open`, `claimed`, `resolved` 중 하나를 사용한다.
- triage 역할은 [`RULES.md`](RULES.md)의 다섯 canonical label을 사용한다.
- Append comments and conversation history under a `## Comments` heading at the bottom of the issue file.

## Publishing to the issue tracker

스킬이 이슈 트래커에 산출물을 게시하라고 하면
`docs/issues/<feature-slug>/` 아래에 파일을 만든다.

## Fetching a ticket

Read the referenced file. The user will normally pass its path or issue number directly.

## Wayfinding operations

Wayfinder uses one map file with one child file per decision ticket.

- **Map**: `docs/issues/<effort>/map.md` contains Destination, Notes, Decisions so far, Not yet specified, and Out of scope.
- **Child ticket**: `docs/issues/<effort>/issues/NN-<slug>.md` contains the question.
- **Blocking**: a `Blocked by: NN, NN` line appears near the top. A ticket is unblocked when every listed ticket is resolved.
- **Frontier**: scan `docs/issues/<effort>/issues/` for open, unblocked, unclaimed tickets. The lowest number wins.
- **Claim**: set `Status: claimed` and save before starting work.
- **Resolve**: append the answer under `## Answer`, set `Status: resolved`, and add a gist with a relative link under the map's Decisions so far.

## Current trackers

- [`editable-html-detail-page-maker`](issues/editable-html-detail-page-maker/map.md)
- [`detail-page-studio-v2`](issues/detail-page-studio-v2/map.md)
