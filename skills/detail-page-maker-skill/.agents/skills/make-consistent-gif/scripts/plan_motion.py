#!/usr/bin/env python3
from __future__ import annotations

import argparse
from copy import deepcopy
from typing import Any

from PIL import Image

from chroma import (
    DEFAULT_ALPHA_FLOOR,
    DEFAULT_KEY_COLOR,
    DEFAULT_OPAQUE_THRESHOLD,
    DEFAULT_TRANSPARENT_THRESHOLD,
    color_hex,
    parse_color,
)
from common import load_json, parse_size, require_file, sha256, write_json
from motion_templates import (
    CONTINUITY_SENSITIVE_MOTIONS,
    CONTINUITY_TEMPLATES,
    MOTION_GUIDANCE,
)


MOTION_TEMPLATES: dict[str, list[dict[str, Any]]] = {
    "idle": [
        {"phase": "start", "pose": "Neutral balanced idle pose.", "delta": "Canonical loop start; no displacement.", "contact": ["all grounded"]},
        {"phase": "inhale", "pose": "Torso rises subtly, neck lengthens slightly, and the face remains relaxed.", "delta": "Small upward breathing expansion with coordinated head counter-motion.", "contact": ["all grounded"]},
        {"phase": "peak", "pose": "Breath reaches its highest readable point with a brief natural blink.", "delta": "Complete the inhale and close the eyelids briefly without changing identity.", "contact": ["all grounded"]},
        {"phase": "exhale", "pose": "Torso settles toward neutral and the eyes reopen.", "delta": "Lower the body gently and reverse the previous secondary motion.", "contact": ["all grounded"]},
        {"phase": "recovery", "pose": "Nearly neutral idle pose, prepared to connect to the first frame.", "delta": "Finish settling without duplicating the first frame exactly.", "contact": ["all grounded"]},
    ],
    "jump": [
        {"phase": "start", "pose": "Neutral balanced stance with the full body ready to move.", "delta": "Canonical start pose.", "contact": ["all grounded"]},
        {"phase": "anticipation", "pose": "Body crouches, limbs compress, and the head lowers slightly in preparation.", "delta": "Lower the center of mass and store energy across the full body.", "contact": ["all grounded"]},
        {"phase": "takeoff", "pose": "Legs extend forcefully and the body leaves the ground with a readable upward silhouette.", "delta": "Release the crouch into coordinated full-body extension.", "contact": [], "event": "takeoff"},
        {"phase": "ascent", "pose": "Body travels upward; limbs begin to tuck and secondary parts lag naturally.", "delta": "Continue upward motion while transitioning from extension to tuck.", "contact": []},
        {"phase": "apex", "pose": "Body reaches the jump apex with the clearest airborne silhouette.", "delta": "Reduce vertical velocity and complete the airborne pose.", "contact": [], "event": "apex"},
        {"phase": "descent", "pose": "Body descends; landing limbs extend toward the ground and the torso prepares for impact.", "delta": "Reverse vertical direction and open the landing pose.", "contact": []},
        {"phase": "land", "pose": "Feet contact the ground and the body compresses to absorb impact.", "delta": "Make clear ground contact with a short controlled squash.", "contact": ["landing feet grounded"], "event": "land"},
        {"phase": "recovery", "pose": "Body rises from the landing compression toward the canonical start pose.", "delta": "Recover balance and prepare a seamless loop to frame zero.", "contact": ["all grounded"]},
    ],
    "generic": [
        {"phase": "start", "pose": "Readable canonical starting pose.", "delta": "Establish the start of the requested action.", "contact": []},
        {"phase": "anticipation", "pose": "Full body anticipates the requested action with clear weight shift.", "delta": "Prepare the action using coordinated body motion.", "contact": []},
        {"phase": "action", "pose": "The requested action is clearly underway with a readable silhouette.", "delta": "Advance the primary action and supporting secondary motion.", "contact": []},
        {"phase": "extreme", "pose": "The action reaches its clearest extreme pose.", "delta": "Complete the main action without changing character identity.", "contact": []},
        {"phase": "follow-through", "pose": "The full body follows through naturally after the action extreme.", "delta": "Carry momentum into a controlled follow-through.", "contact": []},
        {"phase": "recovery", "pose": "The body returns toward the requested ending or loop pose.", "delta": "Recover balance and connect cleanly to the next playback state.", "contact": []},
    ],
}
MOTION_TEMPLATES.update(CONTINUITY_TEMPLATES)


CONTINUITY_GUARD = (
    "Track every visible wrist and foot as the same persistent point across frames. "
    "No hand or foot may jump from neutral to an extreme and back in one displayed frame. "
    "Reverse direction only at a named contact, impact, release, or other planned extreme, "
    "with adjacent frames visibly approaching and departing it. Never teleport a limb, "
    "swap anatomical sides, slide a planted foot, or change contact without the plan saying so."
)


def resolve_chroma(job: dict[str, Any], reference: Any) -> dict[str, Any]:
    raw = job.get("chroma")
    if raw is None:
        return {
            "mode": "legacy-fixed",
            "color": DEFAULT_KEY_COLOR,
            "name": "magenta",
            "transparent_threshold": DEFAULT_TRANSPARENT_THRESHOLD,
            "opaque_threshold": DEFAULT_OPAQUE_THRESHOLD,
            "alpha_floor": DEFAULT_ALPHA_FLOOR,
            "connected_only": True,
            "despill": True,
            "edge_spill_cleanup": True,
            "selection_path": None,
        }
    if not isinstance(raw, dict):
        raise ValueError("job.chroma must be an object")
    mode = str(raw.get("mode", "adaptive"))
    if mode not in {"adaptive", "manual", "legacy-fixed"}:
        raise ValueError("chroma.mode must be adaptive, manual, or legacy-fixed")
    selection_path = raw.get("selection") or raw.get("selection_path")
    selection = None
    selected_settings: dict[str, Any] = {}
    if mode == "adaptive":
        if not selection_path:
            raise ValueError("adaptive chroma requires chroma.selection from select_chroma_key.py")
        selection_file = require_file(selection_path, "chroma.selection")
        selection = load_json(selection_file)
        selected = selection.get("selected") or {}
        selected_settings = selection.get("chroma") or {}
        selected_color = selected.get("color")
        if not selected_color:
            raise ValueError("chroma selection contains no selected color")
        prepared = selection.get("prepared_reference") or {}
        if prepared.get("sha256") and sha256(reference) != prepared["sha256"]:
            raise ValueError("job.reference does not match the adaptive prepared reference")
        color = selected_color
        name = selected.get("name") or color
        selection_path = str(selection_file)
    else:
        if mode == "manual" and not raw.get("color"):
            raise ValueError("manual chroma requires chroma.color")
        color = raw.get("color", DEFAULT_KEY_COLOR)
        name = raw.get("name") or color
    normalized_color = color_hex(parse_color(str(color)))
    if raw.get("color") and color_hex(parse_color(str(raw["color"]))) != normalized_color:
        raise ValueError("job.chroma.color differs from the adaptive selection")
    transparent_threshold = float(raw.get(
        "transparent_threshold",
        selected_settings.get("transparent_threshold", DEFAULT_TRANSPARENT_THRESHOLD),
    ))
    opaque_threshold = float(raw.get(
        "opaque_threshold",
        selected_settings.get("opaque_threshold", DEFAULT_OPAQUE_THRESHOLD),
    ))
    alpha_floor = int(raw.get(
        "alpha_floor", selected_settings.get("alpha_floor", DEFAULT_ALPHA_FLOOR)
    ))
    if transparent_threshold < 0 or opaque_threshold <= transparent_threshold:
        raise ValueError("chroma opaque_threshold must be greater than transparent_threshold")
    if not 0 <= alpha_floor < 255:
        raise ValueError("chroma alpha_floor must be between 0 and 254")
    return {
        "mode": mode,
        "color": normalized_color,
        "name": str(name),
        "transparent_threshold": transparent_threshold,
        "opaque_threshold": opaque_threshold,
        "alpha_floor": alpha_floor,
        "connected_only": bool(raw.get(
            "connected_only", selected_settings.get("connected_only", True)
        )),
        "despill": bool(raw.get("despill", selected_settings.get("despill", True))),
        "edge_spill_cleanup": bool(raw.get(
            "edge_spill_cleanup", selected_settings.get("edge_spill_cleanup", True)
        )),
        "selection_path": selection_path,
    }


def boundary_continuity_guard(previous: dict[str, Any] | None, following: dict[str, Any] | None) -> str:
    if previous and following:
        boundary = "The current position must lie on the path between the previous and next targets. "
    elif following:
        boundary = (
            "This one-shot start has no predecessor. Establish the current tracked points once, "
            "then move them only toward the next target; do not invent a loop predecessor. "
        )
    elif previous:
        boundary = (
            "This one-shot ending has no next target. Finish the trajectory arriving from the "
            "previous target; do not invent a return toward frame 0. "
        )
    else:
        boundary = "Hold a self-contained pose without inventing adjacent motion. "
    return boundary + CONTINUITY_GUARD


def normalize_motion_type(value: str | None, description: str) -> str:
    raw = (value or "").strip().lower().replace("_", "-")
    aliases = {
        "walk": "walk-in-place",
        "walking": "walk-in-place",
        "run": "run-in-place",
        "running": "run-in-place",
        "throwing": "throw",
        "kick-in-place": "kick",
        "kicking": "kick",
        "turn-in-place": "turn",
        "turning": "turn",
        "idle-loop": "idle",
    }
    raw = aliases.get(raw, raw)
    if raw in MOTION_TEMPLATES:
        return raw
    lowered = description.lower()
    if "jump" in lowered or "점프" in lowered or "도약" in lowered:
        return "jump"
    if "run" in lowered or "달리" in lowered:
        return "run-in-place"
    if "walk" in lowered or "걷" in lowered:
        return "walk-in-place"
    if "throw" in lowered or "던지" in lowered or "투척" in lowered:
        return "throw"
    if "kick" in lowered or "발차기" in lowered or "발로 차" in lowered or "킥" in lowered:
        return "kick"
    if "turn" in lowered or "턴" in lowered or "회전" in lowered:
        return "turn"
    if "idle" in lowered or "대기" in lowered or "숨" in lowered:
        return "idle"
    return "generic"


def sample_template(template: list[dict[str, Any]], count: int) -> list[dict[str, Any]]:
    if count < 2 or count > 64:
        raise ValueError("frame_count must be between 2 and 64")
    if count == len(template):
        return deepcopy(template)
    result: list[dict[str, Any]] = []
    for index in range(count):
        position = index * (len(template) - 1) / (count - 1)
        lower = int(position)
        upper = min(lower + 1, len(template) - 1)
        fraction = position - lower
        if fraction < 1e-9 or lower == upper:
            selected = deepcopy(template[lower])
        else:
            before = template[lower]
            after = template[upper]
            selected = {
                "phase": f"{before['phase']}-to-{after['phase']}",
                "pose": (
                    f"At {fraction:.2f} through the transition from ({before['pose']}) "
                    f"toward ({after['pose']})."
                ),
                "delta": f"Continue from {before['delta']} into {after['delta']}",
                "contact": deepcopy(before.get("contact", [])) if fraction < 0.5 else deepcopy(after.get("contact", [])),
            }
            for field in ("limbs", "trajectory"):
                before_text = str(before.get(field, "")).strip()
                after_text = str(after.get(field, "")).strip()
                if before_text or after_text:
                    selected[field] = (
                        f"At {fraction:.2f} through the transition from ({before_text}) "
                        f"toward ({after_text})."
                    )
            if fraction >= 0.5 and after.get("event"):
                selected["event"] = after["event"]
        result.append(selected)
    return result


def jump_root_y(index: int, count: int, canvas_height: int) -> int:
    """Interpolate an eight-beat jump track while keeping anticipation and landing grounded."""
    beats = [0.0, 0.0, -0.08, -0.14, -0.18, -0.12, 0.0, 0.0]
    position = (index / max(1, count - 1)) * (len(beats) - 1)
    lower = int(position)
    upper = min(lower + 1, len(beats) - 1)
    fraction = position - lower
    value = beats[lower] * (1 - fraction) + beats[upper] * fraction
    return round(canvas_height * value)


def acting_side(description: str, explicit: Any) -> str:
    raw = str(explicit or "").strip().lower()
    if raw in {"left", "right"}:
        return raw
    lowered = description.lower()
    if "left" in lowered or "왼" in lowered:
        return "left"
    if "right" in lowered or "오른" in lowered:
        return "right"
    return "right"


def action_direction(description: str, explicit: Any) -> str:
    raw = str(explicit or "").strip().lower().replace("_", "-")
    aliases = {
        "left": "screen-left",
        "right": "screen-right",
        "forward": "screen-right",
        "toward-camera": "toward-camera",
        "away-from-camera": "away-from-camera",
    }
    if raw in {"screen-left", "screen-right", "toward-camera", "away-from-camera"}:
        return raw
    if raw in aliases:
        return aliases[raw]
    lowered = description.lower()
    if "screen-left" in lowered or "화면 왼" in lowered or "왼쪽으로" in lowered:
        return "screen-left"
    if "screen-right" in lowered or "화면 오른" in lowered or "오른쪽으로" in lowered:
        return "screen-right"
    if "toward camera" in lowered or "카메라 쪽" in lowered or "정면으로" in lowered:
        return "toward-camera"
    if "away from camera" in lowered or "카메라 반대" in lowered:
        return "away-from-camera"
    return "screen-right"


def apply_side_tokens(state: dict[str, Any], side: str, direction: str) -> dict[str, Any]:
    support = "left" if side == "right" else "right"
    replacements = {
        "{action_side}": f"anatomical {side}",
        "{support_side}": f"anatomical {support}",
        "{lead_side}": f"anatomical {support}",
        "{rear_side}": f"anatomical {side}",
        "{action_screen_side}": "screen-left in a front view" if side == "right" else "screen-right in a front view",
        "{support_screen_side}": "screen-right in a front view" if side == "right" else "screen-left in a front view",
        "{lead_screen_side}": "screen-right in a front view" if side == "right" else "screen-left in a front view",
        "{rear_screen_side}": "screen-left in a front view" if side == "right" else "screen-right in a front view",
        "{action_direction}": direction,
    }
    def replace(value: Any) -> Any:
        if isinstance(value, list):
            return [replace(item) for item in value]
        if isinstance(value, dict):
            return {key: replace(item) for key, item in value.items()}
        if not isinstance(value, str):
            return value
        for token, replacement in replacements.items():
            value = value.replace(token, replacement)
        return value
    return replace(deepcopy(state))


def adjacent_target(frame: dict[str, Any]) -> dict[str, Any]:
    return {
        "index": frame["index"],
        "phase": frame["phase"],
        "absolute_pose": frame["absolute_pose"],
        "limb_pose": frame.get("limb_pose", ""),
    }


def build_motion_plan(job: dict[str, Any]) -> dict[str, Any]:
    if job.get("schema_version") != 1:
        raise ValueError("job.schema_version must be 1")
    motion = job.get("motion")
    if not isinstance(motion, dict):
        raise ValueError("job.motion must be an object")
    description = str(motion.get("description", "")).strip()
    if not description:
        raise ValueError("motion.description is required")
    frame_count = int(motion.get("frame_count", 0))
    fps = float(motion.get("fps", 8))
    if fps <= 0:
        raise ValueError("motion.fps must be positive")
    loop = str(motion.get("loop", "closed"))
    if loop not in {"closed", "ping-pong", "one-shot"}:
        raise ValueError("motion.loop must be closed, ping-pong, or one-shot")
    motion_type = normalize_motion_type(motion.get("type"), description)
    reference = require_file(job.get("reference", ""), "reference")
    chroma = resolve_chroma(job, reference)
    generation = job.get("generation") or {}
    if generation.get("size_mode", "invariant") == "controllable":
        canvas_width, canvas_height = parse_size(str(generation.get("target_size", "")))
    else:
        with Image.open(reference) as reference_image:
            canvas_width, canvas_height = reference_image.size
    sampled = sample_template(MOTION_TEMPLATES[motion_type], frame_count)
    selected_side = acting_side(description, motion.get("acting_side"))
    selected_direction = action_direction(description, motion.get("action_direction"))
    if motion_type in {"throw", "kick"}:
        sampled = [apply_side_tokens(state, selected_side, selected_direction) for state in sampled]
    if motion_type == "generic":
        for state in sampled:
            action = f"the action described as: {description}"
            state["pose"] = state["pose"].replace("the requested action", action).replace("The requested action", action.capitalize())
            state["delta"] = state["delta"].replace("the requested action", action).replace("The requested action", action.capitalize())
    duration_ms = max(1, round(1000 / fps))
    denominator = frame_count if loop == "closed" else max(1, frame_count - 1)
    frames = []
    for index, state in enumerate(sampled):
        event = state.get("event")
        if motion_type == "jump":
            root_delta = {"x": 0, "y": jump_root_y(index, frame_count, canvas_height)}
        else:
            root_delta = {"x": 0, "y": 0}
        frames.append({
            "index": index,
            "phase": state["phase"],
            "progress": round(index / denominator, 6),
            "absolute_pose": state["pose"],
            "delta": state["delta"],
            "contact": state.get("contact", []),
            "limb_pose": state.get("limbs", "Keep all persistent limbs attached and anatomically consistent."),
            "limb_trajectory": state.get("trajectory", "Move all visible limbs progressively from the previous pose."),
            "continuity_guard": CONTINUITY_GUARD,
            "secondary_motion": "Use coordinated whole-body balance and physically plausible follow-through.",
            "expression": "Preserve the character's identity while matching the action intensity.",
            "silhouette": "Keep the action readable at game scale with no clipped parts.",
            "spatial_sides": (
                f"Preserve facing {motion.get('facing', 'from the reference')}; distinguish anatomical left/right "
                "from screen-left/screen-right and never mirror asymmetric design details."
            ),
            "event": event,
            "root_delta": root_delta,
            "duration_ms": duration_ms,
        })
    for index, frame in enumerate(frames):
        previous = frames[index - 1] if index > 0 else (frames[-1] if loop == "closed" else None)
        following = frames[index + 1] if index + 1 < frame_count else (frames[0] if loop == "closed" else None)
        frame["adjacent_targets"] = {
            "previous": adjacent_target(previous) if previous else None,
            "next": adjacent_target(following) if following else None,
        }
        frame["continuity_guard"] = boundary_continuity_guard(previous, following)
    pivot = {"mode": "bottom-center", "x": 0.5, "y": 0.92, **(motion.get("pivot") or {})}
    if pivot["mode"] != "bottom-center" or not 0 <= float(pivot["x"]) <= 1 or not 0 <= float(pivot["y"]) <= 1:
        raise ValueError("motion.pivot must be a normalized bottom-center pivot")
    return {
        "schema_version": 1,
        "description": description,
        "motion_type": motion_type,
        "frame_count": frame_count,
        "fps": fps,
        "loop": loop,
        "root_motion": bool(motion.get("root_motion", False)),
        "facing": motion.get("facing", "preserve-reference"),
        "acting_side": selected_side if motion_type in {"throw", "kick"} else None,
        "action_direction": selected_direction if motion_type in {"throw", "kick"} else None,
        "continuity_sensitive": motion_type in CONTINUITY_SENSITIVE_MOTIONS,
        "generation_guidance": deepcopy(MOTION_GUIDANCE.get(motion_type, {})),
        "review_policy": {
            "max_passes": 2,
            "candidate_pool": "same-generation-batch",
            "automatic_regeneration": False,
            "must_select_best_available": True,
        },
        "pivot": pivot,
        "canvas": {"width": canvas_width, "height": canvas_height},
        "chroma": chroma,
        "frames": frames,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a baseline frame-by-frame motion plan.")
    parser.add_argument("--job", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    path = write_json(args.out, build_motion_plan(load_json(args.job)))
    print(path)


if __name__ == "__main__":
    main()
