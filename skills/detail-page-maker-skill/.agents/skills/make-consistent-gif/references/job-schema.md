# Job and motion-plan schema

## High-level job

```json
{
  "schema_version": 1,
  "reference": "/absolute/path/character.png",
  "motion": {
    "description": "The turtle jumps and lands in its starting pose.",
    "type": "jump",
    "frame_count": 8,
    "fps": 8,
    "loop": "closed",
    "root_motion": false,
    "facing": "screen-left",
    "acting_side": "right",
    "action_direction": "screen-right",
    "pivot": { "mode": "bottom-center" }
  },
  "generation": {
    "strategy": "parallel-candidates",
    "candidates_per_frame": 4,
    "chain_mode": "anchored",
    "detail_level": 3,
    "size_mode": "invariant",
    "workers": 32
  },
  "chroma": {
    "mode": "adaptive",
    "selection": "/absolute/path/chroma-selection.json",
    "transparent_threshold": 50,
    "opaque_threshold": 110,
    "alpha_floor": 40,
    "connected_only": true,
    "despill": true,
    "edge_spill_cleanup": true
  },
  "output_dir": "/absolute/path/output/jump-v001"
}
```

### Required constraints

- `schema_version`: `1`.
- `reference`: existing non-empty image.
- `motion.frame_count`: `2..64`.
- `motion.type`: built-ins are `idle`, `walk-in-place`, `run-in-place`, `jump`, `throw`, `kick`, `turn`, and `generic`.
- `motion.acting_side`: optional `left` or `right` for `throw` and `kick`; inferred from the description and otherwise defaults to anatomical right.
- `motion.action_direction`: optional `screen-left`, `screen-right`, `toward-camera`, or `away-from-camera` for `throw` and `kick`; infer it from explicit wording and otherwise default to `screen-right`. Confirm it with the user when the visual direction materially matters.
- `motion.loop`: `closed`, `ping-pong`, or `one-shot`.
- `generation.strategy`: `chain`, `parallel-candidates`, or `auto`.
- `generation.resolved_strategy`: normally required when `strategy` is `auto`. A generated motion plan may resolve it from `generation_guidance` for continuity-sensitive built-ins. Explicit `generation.strategy` always wins.
- `generation.candidates_per_frame`: `1..8`; total generated images must not exceed 64.
- `generation.chain_mode`: `pure`, `anchored`, or `history`.
- `generation.detail_level`: `1`, `2`, or `3`.
- `generation.size_mode`: `invariant` or `controllable`.
- `generation.target_size`: required only for `controllable`, formatted `WIDTHxHEIGHT`.
- `generation.backend_size`: optional for controllable canonical creation; one of `1024x1024`, `1536x1024`, or `1024x1536`. Omit it to select the closest supported aspect ratio.
- A `controllable` God Tibo job additionally carries `size_prompt: "size-only"`. God Tibo's default (`aspect-guided`) writes the target aspect ratio and a center-crop-safe composition instruction into the prompt; a frame sequence must not be told to recompose itself. Aspect alignment belongs to the post-generation centre crop, not to the prompt.
- If the completed canonical reference dimensions already equal `generation.target_size`, candidate job construction replaces the controllable fields with `size_mode: "invariant"`. Candidate jobs always set `preserve_backend_raw: true`.
- `generation.workers`: `1..32`.
- Run `scripts/select_chroma_key.py` after canonical foreground approval and before motion planning. Pass every approved foreground reference, save the prepared canonical, then set `reference` to that prepared file.
- `chroma.mode`: use `adaptive` for new jobs. `manual` is an explicit override; `legacy-fixed` only preserves old jobs.
- `chroma.selection`: required for `adaptive`. Its prepared-reference SHA-256 must match `reference`; the selected color is read from the manifest and copied into the motion plan.
- Use one selected key for the complete clip. Do not choose per-frame colors.
- `connected_only`: default `true`. Remove only key-like pixels connected to the canvas border; preserve isolated foreground pixels even when their RGB value resembles the key.
- `edge_spill_cleanup`: default `true`. Correct dark saturated key mixtures only within the narrow band adjacent to border-connected background. This handles black-outline fringe without globally deleting foreground colors.
- The selector records `source_normalization` separately from the final clip `chroma` settings. Opaque input records the detected provisional color and thresholds; an RGBA input with at least 90% transparent border records `mode: existing-alpha` and is composited directly without re-keying black outlines.
- `output_dir`: versioned; never overwrite an accepted run.

## Motion plan

```json
{
  "schema_version": 1,
  "description": "The turtle jumps and lands in its starting pose.",
  "motion_type": "jump",
  "frame_count": 8,
  "fps": 8,
  "loop": "closed",
  "root_motion": false,
  "facing": "screen-left",
  "acting_side": null,
  "action_direction": null,
  "continuity_sensitive": false,
  "generation_guidance": {},
  "review_policy": {
    "max_passes": 2,
    "candidate_pool": "same-generation-batch",
    "automatic_regeneration": false,
    "must_select_best_available": true
  },
  "pivot": { "mode": "bottom-center", "x": 0.5, "y": 0.92 },
  "chroma": {
    "mode": "adaptive",
    "color": "#00ff00",
    "name": "chroma-green",
    "transparent_threshold": 50,
    "opaque_threshold": 110,
    "alpha_floor": 40,
    "connected_only": true,
    "despill": true,
    "edge_spill_cleanup": true,
    "selection_path": "/absolute/path/chroma-selection.json"
  },
  "frames": [
    {
      "index": 0,
      "phase": "start",
      "progress": 0.0,
      "absolute_pose": "Neutral standing pose with all four feet grounded.",
      "delta": "No motion; canonical loop start.",
      "limb_pose": "All persistent limbs retain their canonical side and attachment.",
      "limb_trajectory": "Move progressively from the previous pose toward the next pose.",
      "continuity_guard": "No wrist or foot may make an unplanned one-frame excursion.",
      "adjacent_targets": {
        "previous": {"index": 7, "phase": "recovery", "absolute_pose": "...", "limb_pose": "..."},
        "next": {"index": 1, "phase": "anticipation", "absolute_pose": "...", "limb_pose": "..."}
      },
      "contact": ["front-left", "front-right", "rear-left", "rear-right"],
      "event": null,
      "duration_ms": 125
    }
  ]
}
```

Every frame requires `index`, `phase`, `progress`, `absolute_pose`, `delta`, `limb_pose`, `limb_trajectory`, `continuity_guard`, `adjacent_targets`, and `duration_ms`. Indexes must be contiguous from zero. `progress` must be in `[0,1]` and non-decreasing. A closed loop wraps frame 0's previous target to the final frame and the final frame's next target to frame 0.

`walk-in-place`, `run-in-place`, `throw`, `kick`, and `turn` plans set `continuity_sensitive: true` and recommend one `parallel-candidates` batch with four candidates per frame. Their prompts must include both adjacent targets so the selector can compare complete paths without a one-frame hand/foot pop. `chain` remains explicit opt-in only.

## Candidate score file

Create the score file with `score_candidates.py`. It requires a separate visual score file so anatomy and semantic pose are never inferred from silhouette geometry alone:

```json
{
  "schema_version": 1,
  "reviewer": "codex-vision-or-user",
  "default_pose_pass": true,
  "candidates": [
    {"frame": 0, "candidate": 0, "motion": 0.9, "identity": 0.92, "anatomy_pass": true, "pose_pass": true}
  ],
  "transitions": [
    {"from_frame": 0, "from_candidate": 0, "to_candidate": 1, "continuity": 0.88, "pivot": 0.96}
  ],
  "loops": [
    {"last_candidate": 1, "first_candidate": 0, "score": 0.91}
  ]
}
```

Candidate visual entries are mandatory. `pose_pass` may be set per candidate or inherited from an explicit top-level `default_pose_pass`; a clearly wrong phase pose must set it to false. Transition and loop visual overrides are optional; when absent, the scorer uses silhouette and pivot diagnostics.

```json
{
  "schema_version": 1,
  "frame_count": 8,
  "candidates_per_frame": 4,
  "weights": {
    "motion": 0.30,
    "identity": 0.25,
    "edge": 0.05,
    "continuity": 0.20,
    "pivot": 0.10,
    "loop": 0.10
  },
  "candidates": [
    {
      "frame": 0,
      "candidate": 0,
      "path": "candidates/frame-000/candidate-00.png",
      "selectable": true,
      "hard_pass": true,
      "scores": { "motion": 0.9, "identity": 0.92, "edge": 0.95 }
    }
  ],
  "transitions": [
    {
      "from_frame": 0,
      "from_candidate": 0,
      "to_frame": 1,
      "to_candidate": 2,
      "scores": { "continuity": 0.88, "pivot": 0.96 }
    }
  ],
  "loops": [
    { "last_candidate": 1, "first_candidate": 0, "score": 0.91 }
  ]
}
```

Scores are normalized to `[0,1]`. Existing, non-empty, decodable candidates remain selectable even when `hard_pass` is false. The selector minimizes the number of failed frames first and maximizes the weighted complete-path score second. It always emits a winner when every frame index has at least one selectable image, and records `selection_mode: best-effort`, failed frames, and warnings when no all-pass path exists.
