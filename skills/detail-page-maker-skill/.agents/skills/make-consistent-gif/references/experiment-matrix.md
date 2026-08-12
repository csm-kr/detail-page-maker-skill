# Controlled experiment matrix

Change one primary variable at a time. Store every run under a new versioned directory with prompts, references, manifests, metrics, contact sheets, selected paths, failures, and elapsed time.

| Stage | Question | Conditions |
|---|---|---|
| E0 | Can the baseline asset flow reproduce known outputs? | existing turtle two-frame run |
| E1 | Is adaptive chroma generation and connected removal game-ready? | key separation, thresholds, despill, edge contraction |
| E2 | Which prompt structure controls motion best? | short; absolute; absolute+delta; full spatial+secondary motion |
| E3 | How many references help independent generation? | R1 canonical Image 1; R2 canonical Image 1 + identity support; R3 canonical Image 1 + identity + motion-history support, four repeats each |
| E4 | Which size path is more stable? | invariant vs controllable at the same final W×H |
| E5 | What role should masks play? | QA silhouette mask; input mask; hard post-composite mask |
| E6 | Which generation strategy wins? | best chain vs parallel candidates |
| E7 | Does the winner generalize? | idle, walk-in-place, jump |
| E8 | Are outputs game-ready? | RGBA sequence, sheet, JSON, GIF, 128/256px preview |

## Selection rule

1. Generate one bounded pool: 8 frames × 4 candidates = 32 images, with up to 32 workers.
2. Mark hard-gate failures, but keep every existing, non-empty, decodable image selectable.
3. Rank complete paths by the fewest hard-failed frames, then by the highest weighted full-path score.
4. Review the winner and runner-up from the same pool at most twice. A second pass re-scores; it does not generate images.
5. Always return the best complete available path. If it contains failures, package it as best-effort with explicit warnings.
6. Never start another generation batch automatically. Chain or a new batch requires an explicit user request.
7. Compare mean, median, worst case, and failure rate when repetitions exist; label a single matched run as a v1 routing result that still needs robustness replication.
8. Use the QA weights as provisional values and prefer the simpler faster method when quality is materially tied.
