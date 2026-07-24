# Issue tracker: Local Markdown

Issues and specs for this repository live as Markdown files in `.scratch/`.

## Conventions

- Use one directory per feature: `.scratch/<feature-slug>/`.
- Store the specification at `.scratch/<feature-slug>/spec.md`.
- Store one implementation issue per file at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`.
- Record triage state as a `Status:` line near the top of each issue file. See `triage-labels.md` for the role strings.
- Append comments and conversation history under a `## Comments` heading at the bottom of the issue file.

## Publishing to the issue tracker

When a skill says to publish an artifact to the issue tracker, create a file under `.scratch/<feature-slug>/`, creating the directory when necessary.

## Fetching a ticket

Read the referenced file. The user will normally pass its path or issue number directly.

## Wayfinding operations

Wayfinder uses one map file with one child file per decision ticket.

- **Map**: `.scratch/<effort>/map.md` contains Destination, Notes, Decisions so far, Not yet specified, and Out of scope.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md` contains the question. A `Type:` line records `research`, `prototype`, `grilling`, or `task`; a `Status:` line records `open`, `claimed`, or `resolved`.
- **Blocking**: a `Blocked by: NN, NN` line appears near the top. A ticket is unblocked when every listed ticket is resolved.
- **Frontier**: scan `.scratch/<effort>/issues/` for open, unblocked, unclaimed tickets. The lowest number wins.
- **Claim**: set `Status: claimed` and save before starting work.
- **Resolve**: append the answer under `## Answer`, set `Status: resolved`, and add a gist with a relative link under the map's Decisions so far.
