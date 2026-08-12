---
name: make-consistent-gif
description: Create consistent, game-ready character animation assets from a reference image, a motion description, and a frame count, including idle, walk, run, jump, throw, kick, and turn actions. Use when Codex must plan continuous frame-by-frame poses, generate or edit frames with God Tibo/GPT Image 2, prevent one-frame hand or foot pops, choose a foreground-safe adaptive chroma key, compare chain versus parallel candidates, select a coherent sequence, and package validated RGBA PNG frames, a spritesheet, engine-neutral animation metadata, a contact sheet, and a GIF preview.
---

# Make Consistent GIF

Build one animation clip at a time from a canonical character reference. Treat the transparent PNG sequence and spritesheet as the production assets; treat GIF as a preview.

## Required inputs

Confirm these before generation:

1. Canonical reference image.
2. Motion description.
3. Frame count.
4. Output size.
   - With a reference, ask: “이 레퍼런스 이미지와 같은 크기로 할까요, 아니면 목표 W×H가 있나요?”
   - Record same-size work as `size_mode: invariant`.
   - Record an explicit W×H as `size_mode: controllable` with `target_size`.
5. Loop mode when it cannot be inferred: `closed`, `ping-pong`, or `one-shot`.

Infer or offer defaults for FPS, bottom-center pivot, in-place motion, and adaptive chroma-key removal. Select the best complete path automatically; do not ask the user to break a close score tie unless they explicitly request alternatives.
For throw and kick, infer or confirm anatomical `acting_side` and `action_direction`; do not leave “forward” ambiguous between a screen direction and camera depth.

## Dependencies

- Reuse the sibling `god-tibo-gpt-image2-skill` for GPT Image 2 generation. Do not copy its authentication code.
- A host embedding this skill may point at its own pinned runtime instead: `GOD_TIBO_SKILL_ROOT` selects the God Tibo skill directory and `GOD_TIBO_NODE` selects the Node binary. Both are optional; unset means the sibling directory and `node` on `PATH`. A `GOD_TIBO_SKILL_ROOT` that holds no runner fails loudly rather than falling back, so a misconfigured host cannot silently call a different God Tibo.
- Require Node.js 20+, Python 3 with Pillow, `ffmpeg`, `ffprobe`, and an active Codex ChatGPT login.
- Keep tokens and authentication files out of jobs, logs, manifests, and final reports.

## Workflow

### 1. Inspect and prepare the adaptive chroma reference

- Inspect dimensions, format, padding, facing direction, character bounds, ground contact, alpha, and the provisional background.
- After all foreground character references for the clip are approved, run `scripts/select_chroma_key.py` on them. Choose the candidate color with the largest minimum distance from the combined interior foreground palette; fail closed when no candidate meets `minimum_separation`.
- Let the selector replace only the provisional border-connected background of Image 1 and save `chroma-selection.json` plus a prepared canonical reference. When an approved reference already has a transparent border, preserve its existing alpha directly instead of keying a synthetic black border color. Record the source-normalization mode, detected source color when applicable, and thresholds in the manifest. Use that prepared reference as Image 1 for every animation candidate.
- Lock the selected key color for the whole clip. Never select a different key per frame. Tell generation to keep that exact flat color out of every foreground character, costume, prop, and effect.
- Treat a border sample as key background when its RGB Euclidean distance from the selected color is at most `transparent_threshold` (default `50`), and require `border_key_fraction >= 0.90`. Do not require exact pixel equality.
- Normalize or regenerate only when the threshold contract or post-key edge QA fails. Use border-connected removal by default so an isolated key-like foreground detail is preserved. Clean dark saturated key mixtures only inside the narrow border-connected edge band; never apply that spill rule globally.
- Use the same canvas and pivot for every production frame.

### 2. Plan the motion

Create `motion-plan.json` from the user description. Read [references/prompt-patterns.md](references/prompt-patterns.md) for pose-writing rules.

For every frame specify:

- absolute pose;
- delta from the previous frame;
- previous and next adjacent pose targets, wrapping last-to-first for a closed loop;
- explicit positions and travel direction for every visible wrist and foot;
- anatomical and screen-relative sides;
- body, head, limb, contact, expression, silhouette, and secondary motion;
- normalized phase progress;
- optional event such as `footstep`, `takeoff`, `apex`, `land`, or `hit`.

Treat each wrist and foot as a persistent tracked point. Do not allow a limb to move from neutral to an extreme and back in one displayed frame. At a planned contact, impact, release, or direction-change extreme, make both adjacent frames visibly approach and depart that extreme. Read [references/motion-continuity.md](references/motion-continuity.md) for walk, run, throw, kick, and turn phase contracts.

Use the same original reference for independent candidates. In anchored chain mode, frame 0 uses the canonical as Image 1; frames 1 onward use the previous generated frame as Image 1 and the canonical as Image 2.

### 3. Use the bounded generation strategy

- Default to one `parallel-candidates` batch: 8 frames × 4 candidates = 32 images, with up to 32 workers.
- `auto` resolves to this bounded parallel strategy for every built-in motion, including walk, run, throw, kick, and turn.
- Generate only one candidate pool. Review the same pool at most twice and never trigger another generation batch automatically.
- Keep `chain` (`pure`, `anchored`, or `history`) as explicit opt-in only when the user specifically requests sequence-dependent generation.
- Preserve the per-frame previous/current/next wrist, foot, prop, contact, and direction contracts even though the candidate images are generated independently.

Read [references/experiment-matrix.md](references/experiment-matrix.md) when comparing strategies, reference counts, masks, detail levels, or size modes.

### 4. Build and validate God Tibo jobs

- Keep Image 1 canonical. Images 2 and later are supporting references.
- Require `chroma.mode: adaptive`, the selector manifest, and the prepared-reference hash for new jobs. Carry the selected key name, hex color, thresholds, and connected-removal policy into the motion plan, every generation prompt, QA, and the final manifest. Keep legacy fixed-magenta jobs readable, but do not create new ones by default.
- Use `size_mode: invariant` only with Image 1.
- Use `size_mode: controllable` only with a confirmed `target_size`, and send `size_prompt: "size-only"` with it. God Tibo's default (`aspect-guided`) writes the target aspect ratio and center-crop-safe composition into the prompt, which makes a frame sequence recompose itself frame by frame.
- A controllable canonical-creation step may set an explicit supported `backend_size`. Once the completed canonical already equals the confirmed target W×H, build every animation candidate job as `size_mode: invariant`; do not keep sending it as controllable.
- Run God Tibo with `--dry-run` before live generation.
- Preserve input order in candidate indexes and frame mapping.
- Treat missing frames, connection failures, invalid manifests, or size mismatches as failures.
- Reject `partial-fallback` image results and missing or hash-mismatched backend originals; production candidates require a completed `final` result.

### 5. Generate candidates

- For chain mode, wait for each frame before creating the next job.
- For parallel mode, issue distinct `items` entries for every frame/candidate pair.
- Save raw candidates and the God Tibo manifest. Candidate jobs set `preserve_backend_raw: true` so the backend original can be compared with the center-cropped/resized output. Never overwrite earlier experiment outputs.
- Let God Tibo retry transient network aborts per item inside the one batch. If any frame ends with no usable image, preserve the partial run and report the structural blocker; do not start another batch without an explicit user request.
- Keep unsupported-private-backend warnings in the run manifest.

### 6. Apply technical and visual QA

Read [references/qa-contract.md](references/qa-contract.md).

- Run hard gates first: file, size, canvas, clipping, selected-key background, alpha, and manifest integrity.
- Save per-transition silhouette change masks and cumulative frame-0 drift diagnostics; use them to find unexpectedly broad or missing motion, not to certify anatomy.
- Score motion accuracy, identity and silhouette, temporal continuity, pivot/grounding/bounds, loop seam, and edge quality.
- Record required visual `motion`, `identity`, `anatomy_pass`, and `pose_pass` ratings before sequence selection; automated geometry metrics cannot certify anatomy or semantic pose on their own.
- Inspect every adjacent transition and the loop seam for per-limb direction, planted-foot stability, contact order, and near/far-side consistency. Flag a one-frame hand/foot extreme as a hard failure even if silhouette IoU is high; use it only when the same 32-image pool contains no better complete path.
- Use RGB differences and SSIM only as diagnostics, not as success criteria.
- Create a contact sheet for visual scoring.
- Pass 1 scores the entire pool and selects winner plus runner-up. Pass 2, when useful, re-checks those complete paths and failed adjacent triples from the same pool. Stop after two review passes.

### 7. Select the full sequence

- Combine per-candidate quality with adjacent transition and loop-closure scores.
- Rank complete paths by the fewest hard-failed frames first, then the highest weighted sequence score.
- Always select the best complete available path when every frame index has at least one existing usable image.
- Do not greedily choose the highest independent candidate for every frame.
- Save the winning and runner-up paths with their score breakdowns.
- When no all-hard-pass path exists, set `selection_mode: best-effort`, retain failed-frame details, and continue to GIF packaging with visible warnings. Do not regenerate automatically.

### 8. Remove the selected chroma background and package game assets

- Convert selected frames to RGBA PNG with border-connected soft matte, key-specific despill, and narrow-band saturated spill cleanup. Do not apply a global magenta-family deletion rule.
- Preserve one canvas size and one pivot for all frames. Derive root alignment from the lower support region of the subject so detached projectiles, sparks, and other upper effects do not drag the character root.
- Build a fixed-cell spritesheet, engine-neutral `animation.json`, contact sheet, GIF preview, and manifest.
- Mark a package whose selected path contains hard failures as `best-effort-with-warnings`. It is a usable preview but cannot be promoted to production `passed` without a clean re-score and approval.
- Copy the motion plan, selection, canonical reference, generation run, job, and upstream manifests into `provenance/`; all manifest file paths must remain bundle-relative.
- Put per-frame duration, loop mode, pivot, alpha bounds, optional root-motion delta, and events in `animation.json`.
- Read [references/game-asset-contract.md](references/game-asset-contract.md) for the exact bundle.

### 9. Validate and report

- Run the animation validator and inspect the final contact sheet/GIF.
- Verify frame count, dimensions, durations/FPS, loop policy, transparency, pivot, bounds, hashes, and output paths.
- Write a passed visual review only after inspection, run `approve_animation.py`, then run the validator again. Approval must fail if the current manifest has no matching passed technical validation.
- A passed visual review must explicitly pass `motion`, `identity`, `anatomy`, `pose`, `limb_continuity`, `contact_continuity`, `prop_continuity`, `loop_seam`, and `edge_and_transparency`. Mark `prop_continuity` passed with a not-applicable note when the clip has no prop.
- Report a complete best-effort GIF as the selected result with its warnings. Report failure only when a frame index has no usable image and therefore no complete path can exist.
- Keep every accepted GIF and its source frames under a versioned experiment/output directory.

## Script map

- `scripts/plan_motion.py`: create or validate a motion plan.
- `scripts/motion_templates.py`: define explicit eight-phase limb trajectories for continuity-sensitive actions.
- `scripts/build_tibo_jobs.py`: build parallel or chain God Tibo jobs.
- `scripts/run_generation.py`: execute God Tibo jobs and preserve candidate mapping.
- `scripts/analyze_frames.py`: measure technical, silhouette, pivot, bounds, and transition metrics.
- `scripts/score_candidates.py`: combine automated metrics with required visual action, identity, and anatomy ratings.
- `scripts/select_sequence.py`: choose the globally coherent candidate path.
- `scripts/select_chroma_key.py`: choose a foreground-safe clip key and prepare Image 1.
- `scripts/chroma.py`: provide adaptive key selection helpers, connected masks, replacement, and RGBA conversion.
- `scripts/remove_chroma.py`: create RGBA PNG frames from the selected clip key.
- `scripts/build_spritesheet.py`: build a fixed-cell atlas and metadata.
- `scripts/assemble_gif.py`: create a palette-optimized GIF preview.
- `scripts/package_animation.py`: assemble the complete game-asset bundle.
- `scripts/validate_animation.py`: enforce the final technical contract.
- `scripts/approve_animation.py`: attach a passed visual review and promote the bundle manifest to `passed`.

## Reference routing

- Read [references/job-schema.md](references/job-schema.md) when authoring a high-level job or motion plan.
- Read [references/prompt-patterns.md](references/prompt-patterns.md) when decomposing a new motion.
- Read [references/motion-continuity.md](references/motion-continuity.md) for walk, run, throw, kick, or turn planning and QA.
- Read [references/experiment-matrix.md](references/experiment-matrix.md) only for controlled comparisons.
- Read [references/defaults.json](references/defaults.json) before applying any evidence-backed default or resolving `auto`; never promote an unresolved strategy.
- Read [references/qa-contract.md](references/qa-contract.md) when scoring or rejecting candidates.
- Read [references/game-asset-contract.md](references/game-asset-contract.md) when packaging or validating outputs.
