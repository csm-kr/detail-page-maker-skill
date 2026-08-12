# QA contract

## Hard-gate flags

Mark a candidate `hard_pass: false` when any of these is true:

- missing or zero-byte file;
- wrong width, height, or frame cell;
- broken or missing manifest mapping;
- a God Tibo result whose `result_source` is not `final`;
- missing or hash-mismatched backend original when `preserve_backend_raw` is required;
- clipped foreground when clipping was not requested;
- empty foreground or nearly full-frame foreground caused by failed keying;
- fewer than 90% of border samples fall within the configured RGB-distance `transparent_threshold` from the chroma key before removal;
- background variation outside that threshold is classified as foreground and causes clipping, excessive coverage, or a dirty post-key edge;
- opaque selected-key fringe, dark saturated key mixtures along the silhouette, or holes through the subject after key removal;
- missing or hash-mismatched adaptive chroma selection, or a frame that uses a different key from the clip manifest;
- severe anatomy failure, missing/extra parts, wrong character, or wrong pose;
- a one-frame wrist or foot pop, anatomical side swap, unplanned direction reversal, planted-foot slide, or contact-state jump in the selected sequence;
- a projectile that appears before `release`, separates on multiple frames, moves back toward the hand, or disappears before exiting the canvas;
- authentication data in a job, manifest, or log.

A hard-gate flag blocks production approval, but it does not by itself remove an existing image from best-effort sequence selection. Only a missing, empty, or unreadable image is unselectable. Security-sensitive output must still be redacted and excluded.

## Candidate scoring

Use normalized `[0,1]` values and the initial weights below:

| Component | Weight | Scope |
|---|---:|---|
| Motion and prompt accuracy | 0.30 | candidate |
| Identity and silhouette | 0.25 | candidate |
| Edge and alpha quality | 0.05 | candidate |
| Adjacent continuity | 0.20 | transition |
| Pivot, grounding, and bounds stability | 0.10 | transition |
| Loop closure | 0.10 | last-to-first |

Penalize motion that is materially smaller than requested. Do not reward an almost-static sequence merely for identity stability.

## Technical measurements

- dimensions and mode;
- backend request size, backend original size, and final postprocessed size;
- adaptive key separation from every approved foreground reference, plus recorded source-normalization color and thresholds;
- pre-key background keyability: selected key, RGB-distance threshold, border-key fraction, foreground coverage, and clipping; do not fail exact-RGB inequality by itself;
- post-key transparent corners and alpha coverage;
- foreground alpha bounds, centroid, bottom contact, and clipping flags;
- adjacent bounds/pivot deltas;
- per-transition silhouette change-mask bounds/fraction and cumulative frame-0 drift;
- duplicate or near-duplicate frames;
- frame count, duration, loop mode, GIF metadata, spritesheet cell mapping, and hashes.

RGB pixel differences, silhouette change masks, and SSIM are diagnostic only. They do not determine anatomy, semantic pose, limb trajectory, or contact continuity pass/fail. Never label a visible hand/foot pop as an intentional limb swap based only on acceptable silhouette IoU.

When diagnosing checkerboard, grain, or texture drift, inspect the preserved backend original before blaming resize or center crop. If the artifact is already present there, treat it as a generation/re-synthesis defect; postprocessing may soften or accentuate it but did not originate it.

## Visual review

Inspect candidate contact sheets and the final animation. Score anatomy, identity, exact pose, silhouette readability, temporal direction, contact, secondary motion, and loop seam. For walk, run, throw, kick, and turn, trace every visible wrist and foot through all adjacent triples and through last-to-first. A named extreme passes only when the preceding frame approaches it and the following frame departs it gradually. When two paths are close, select the higher-ranked path automatically and retain the runner-up for the second review pass.

Before approval, write `checks` entries for `motion`, `identity`, `anatomy`, `pose`, `limb_continuity`, `contact_continuity`, `prop_continuity`, `loop_seam`, and `edge_and_transparency`. Every entry must be `"passed"`, `true`, or an object with `passed: true`. Mark `prop_continuity` passed with a not-applicable note when no prop exists. `approve_animation.py` fails closed when any required check is missing or failed.

## Bounded two-pass selection

1. Generate exactly one default pool of 8 frames × 4 candidates = 32 images.
2. Review pass 1 scores every usable candidate and transition, then selects the winning and runner-up complete paths.
3. Review pass 2 is optional and uses only the same 32 images. Re-check failed adjacent triples, wrist/foot/prop traces, and the winner-versus-runner-up comparison; do not generate replacement images.
4. Stop after at most two review passes and always choose the best complete available path. Rank fewer hard-failed frames ahead of weighted path score.
5. Do not ask the user to choose merely because the margin is small, and do not regenerate automatically.
6. If the winner has hard-gate flags, package the GIF as `best-effort-with-warnings`; list the failed frames and checks. It is a usable preview, not a production-approved asset.

The only selection failure is structural: a frame index has no existing, non-empty, decodable image, so no complete path can be assembled.

## Completion gate

Always report and package the best complete available path. Report it as production `passed` only when all selected frames pass hard gates, RGBA frames and spritesheet validate, GIF metadata matches, and manifests contain no failed item. Otherwise report `best-effort-with-warnings` and keep production approval blocked without discarding the GIF.
