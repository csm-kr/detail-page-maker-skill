#!/usr/bin/env python3
from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path
from typing import Any

from PIL import Image

from analyze_frames import foreground_mask, mask_iou
from common import load_json, write_json
from chroma import DEFAULT_KEY_COLOR, DEFAULT_TRANSPARENT_THRESHOLD, parse_color


WEIGHTS = {
    "motion": 0.30,
    "identity": 0.25,
    "edge": 0.05,
    "continuity": 0.20,
    "pivot": 0.10,
    "loop": 0.10,
}

EXPECTED_CHANGE = {
    "idle": 0.025,
    "walk-in-place": 0.10,
    "run-in-place": 0.13,
    "jump": 0.11,
    "throw": 0.10,
    "kick": 0.12,
    "turn": 0.12,
    "generic": 0.08,
}


def clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def require_visual(visual: dict[str, Any], frame: int, candidate: int) -> dict[str, Any]:
    for item in visual.get("candidates", []):
        if int(item["frame"]) == frame and int(item["candidate"]) == candidate:
            return item
    raise ValueError(f"visual score missing for frame {frame}, candidate {candidate}")


def inspect(path: Path, key: tuple[int, int, int], tolerance: float, expected_size: tuple[int, int] | None) -> dict[str, Any]:
    image = Image.open(path).convert("RGBA")
    mask = foreground_mask(image, key, tolerance)
    bounds = mask.getbbox()
    pixels = list(mask.get_flattened_data())
    coverage = sum(value > 0 for value in pixels) / len(pixels)
    if bounds:
        left, top, right, bottom = bounds
        clipped = left <= 1 or top <= 1 or right >= image.width - 1 or bottom >= image.height - 1
        pivot = ((left + right) / (2 * image.width), bottom / image.height)
    else:
        clipped = True
        pivot = None
    border_values = []
    rgb = image.convert("RGB")
    for x in range(image.width):
        border_values.extend((rgb.getpixel((x, 0)), rgb.getpixel((x, image.height - 1))))
    for y in range(1, image.height - 1):
        border_values.extend((rgb.getpixel((0, y)), rgb.getpixel((image.width - 1, y))))
    def is_key(value: tuple[int, int, int]) -> bool:
        return sum((value[index] - key[index]) ** 2 for index in range(3)) ** 0.5 <= tolerance
    border_key = sum(is_key(value) for value in border_values) / max(1, len(border_values))
    hard_pass = bool(
        (expected_size is None or image.size == expected_size)
        and bounds
        and 0.001 < coverage < 0.98
        and border_key >= 0.90
        and not clipped
    )
    return {
        "image": image,
        "mask": mask,
        "size": image.size,
        "bounds": bounds,
        "coverage": coverage,
        "pivot": pivot,
        "border_key_fraction": border_key,
        "clipped": clipped,
        "hard_pass": hard_pass,
    }


def score_candidates(
    generation_run: dict[str, Any],
    plan: dict[str, Any],
    visual: dict[str, Any],
    *,
    key: tuple[int, int, int] | None = None,
    tolerance: float | None = None,
) -> dict[str, Any]:
    raw_candidates = generation_run.get("candidates") or []
    if not raw_candidates:
        raise ValueError("generation run has no candidates; a dry-run cannot be scored")
    chroma = plan.get("chroma") or {}
    key = key or parse_color(str(chroma.get("color", DEFAULT_KEY_COLOR)))
    tolerance = float(
        tolerance
        if tolerance is not None
        else chroma.get("transparent_threshold", DEFAULT_TRANSPARENT_THRESHOLD)
    )
    canvas = plan.get("canvas") or {}
    expected_size = (
        (int(canvas["width"]), int(canvas["height"]))
        if canvas.get("width") and canvas.get("height")
        else None
    )
    analyzed: dict[tuple[int, int], dict[str, Any]] = {}
    by_frame: dict[int, list[int]] = defaultdict(list)
    candidates = []
    for raw in raw_candidates:
        frame = int(raw["frame"])
        candidate = int(raw["candidate"])
        path = Path(raw["path"]).expanduser().resolve()
        selectable = path.is_file() and path.stat().st_size > 0
        if not selectable:
            metrics = {"hard_pass": False, "missing": True}
        else:
            metrics = inspect(path, key, tolerance, expected_size)
            expected_size = expected_size or metrics["size"]
        rating = require_visual(visual, frame, candidate)
        anatomy_pass = bool(rating.get("anatomy_pass", False))
        pose_pass = bool(rating.get("pose_pass", visual.get("default_pose_pass", False)))
        hard_pass = bool(metrics.get("hard_pass", False) and anatomy_pass and pose_pass)
        edge_score = clamp(float(metrics.get("border_key_fraction", 0.0)))
        candidates.append({
            "frame": frame,
            "candidate": candidate,
            "path": str(path),
            "selectable": selectable,
            "hard_pass": hard_pass,
            "failures": (
                (["TECHNICAL_GATE"] if not metrics.get("hard_pass", False) else [])
                + (["ANATOMY_GATE"] if not anatomy_pass else [])
                + (["POSE_GATE"] if not pose_pass else [])
            ),
            "scores": {
                "motion": clamp(float(rating["motion"])),
                "identity": clamp(float(rating["identity"])),
                "edge": edge_score,
            },
            "evidence": {
                "visual": rating,
                "coverage": metrics.get("coverage"),
                "bounds": metrics.get("bounds"),
                "pivot": metrics.get("pivot"),
                "border_key_fraction": metrics.get("border_key_fraction"),
                "clipped": metrics.get("clipped"),
            },
        })
        if selectable:
            analyzed[(frame, candidate)] = metrics
            by_frame[frame].append(candidate)
    frame_count = int(plan["frame_count"])
    if sorted(by_frame) != list(range(frame_count)):
        raise ValueError("candidate frames are not contiguous or complete")
    expected_change = EXPECTED_CHANGE.get(str(plan.get("motion_type")), EXPECTED_CHANGE["generic"])
    visual_transitions = {
        (int(item["from_frame"]), int(item["from_candidate"]), int(item["to_candidate"])): item
        for item in visual.get("transitions", [])
    }
    transitions = []
    for frame in range(1, frame_count):
        for previous_candidate in by_frame[frame - 1]:
            for current_candidate in by_frame[frame]:
                previous = analyzed[(frame - 1, previous_candidate)]
                current = analyzed[(frame, current_candidate)]
                iou = mask_iou(previous["mask"], current["mask"])
                observed_change = 1.0 - iou
                auto_continuity = clamp(1.0 - abs(observed_change - expected_change) / max(expected_change, 0.05))
                if previous.get("pivot") and current.get("pivot"):
                    dx = abs(previous["pivot"][0] - current["pivot"][0])
                    auto_pivot = clamp(1.0 - dx / 0.05)
                else:
                    auto_pivot = 0.0
                override = visual_transitions.get((frame - 1, previous_candidate, current_candidate), {})
                transitions.append({
                    "from_frame": frame - 1,
                    "from_candidate": previous_candidate,
                    "to_frame": frame,
                    "to_candidate": current_candidate,
                    "scores": {
                        "continuity": clamp(float(override.get("continuity", auto_continuity))),
                        "pivot": clamp(float(override.get("pivot", auto_pivot))),
                    },
                    "evidence": {"silhouette_iou": round(iou, 6), "observed_change": round(observed_change, 6)},
                })
    visual_loops = {
        (int(item["last_candidate"]), int(item["first_candidate"])): float(item["score"])
        for item in visual.get("loops", [])
    }
    loops = []
    for last_candidate in by_frame[frame_count - 1]:
        for first_candidate in by_frame[0]:
            last = analyzed[(frame_count - 1, last_candidate)]
            first = analyzed[(0, first_candidate)]
            auto = mask_iou(last["mask"], first["mask"])
            loops.append({
                "last_candidate": last_candidate,
                "first_candidate": first_candidate,
                "score": clamp(visual_loops.get((last_candidate, first_candidate), auto)),
                "evidence": {"silhouette_iou": round(auto, 6)},
            })
    return {
        "schema_version": 1,
        "frame_count": frame_count,
        "candidates_per_frame": max(len(value) for value in by_frame.values()),
        "weights": WEIGHTS,
        "candidates": candidates,
        "transitions": transitions,
        "loops": loops,
        "visual_review": {"reviewer": visual.get("reviewer"), "required_fields": ["motion", "identity", "anatomy_pass", "pose_pass"]},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Combine automated candidate metrics with required visual scores.")
    parser.add_argument("--generation-run", required=True)
    parser.add_argument("--motion-plan", required=True)
    parser.add_argument("--visual-scores", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--key")
    parser.add_argument("--tolerance", type=float)
    args = parser.parse_args()
    result = score_candidates(
        load_json(args.generation_run), load_json(args.motion_plan), load_json(args.visual_scores),
        key=parse_color(args.key) if args.key else None, tolerance=args.tolerance,
    )
    print(write_json(args.out, result))


if __name__ == "__main__":
    main()
