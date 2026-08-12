#!/usr/bin/env python3
from __future__ import annotations

import argparse
from collections import defaultdict
from typing import Any

from common import load_json, write_json


def component_score(scores: dict[str, Any], weights: dict[str, float], names: tuple[str, ...]) -> float:
    total = 0.0
    for name in names:
        value = float(scores.get(name, 0.0))
        if not 0.0 <= value <= 1.0:
            raise ValueError(f"score {name} must be in [0,1]")
        total += weights.get(name, 0.0) * value
    return total


def select_sequence(data: dict[str, Any]) -> dict[str, Any]:
    frame_count = int(data.get("frame_count", 0))
    if frame_count < 2:
        raise ValueError("frame_count must be at least 2")
    weights = {name: float(value) for name, value in data.get("weights", {}).items()}
    candidates_by_frame: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for candidate in data.get("candidates", []):
        if candidate.get("selectable", True) is False:
            continue
        frame = int(candidate["frame"])
        item = dict(candidate)
        item["hard_failure_count"] = 0 if item.get("hard_pass", False) else 1
        item["individual_score"] = component_score(
            item.get("scores", {}), weights, ("motion", "identity", "edge")
        ) / frame_count
        candidates_by_frame[frame].append(item)
    for frame in range(frame_count):
        if not candidates_by_frame[frame]:
            raise ValueError(f"frame {frame} has no selectable candidates")

    transition: dict[tuple[int, int, int], float] = {}
    for item in data.get("transitions", []):
        from_frame = int(item["from_frame"])
        to_frame = int(item.get("to_frame", from_frame + 1))
        if to_frame != from_frame + 1:
            raise ValueError("transitions must connect adjacent frames")
        key = (from_frame, int(item["from_candidate"]), int(item["to_candidate"]))
        transition[key] = component_score(
            item.get("scores", {}), weights, ("continuity", "pivot")
        ) / (frame_count - 1)
    loops = {}
    for item in data.get("loops", []):
        value = float(item.get("score", 0.0))
        if not 0.0 <= value <= 1.0:
            raise ValueError("loop score must be in [0,1]")
        loops[(int(item["last_candidate"]), int(item["first_candidate"]))] = weights.get("loop", 0.0) * value
    for frame in range(1, frame_count):
        for previous in candidates_by_frame[frame - 1]:
            for current in candidates_by_frame[frame]:
                key = (frame - 1, int(previous["candidate"]), int(current["candidate"]))
                if key not in transition:
                    raise ValueError(f"missing transition score: {key}")
    if weights.get("loop", 0.0) > 0:
        for last in candidates_by_frame[frame_count - 1]:
            for first in candidates_by_frame[0]:
                key = (int(last["candidate"]), int(first["candidate"]))
                if key not in loops:
                    raise ValueError(f"missing loop score: {key}")

    completed: list[dict[str, Any]] = []
    for start in candidates_by_frame[0]:
        start_id = int(start["candidate"])
        states: dict[int, list[tuple[int, float, list[dict[str, Any]]]]] = {
            start_id: [(int(start["hard_failure_count"]), float(start["individual_score"]), [start])]
        }
        for frame in range(1, frame_count):
            next_states: dict[int, list[tuple[int, float, list[dict[str, Any]]]]] = {}
            for current in candidates_by_frame[frame]:
                current_id = int(current["candidate"])
                options: list[tuple[int, float, list[dict[str, Any]]]] = []
                for previous_id, previous_states in states.items():
                    for previous_failures, previous_score, previous_path in previous_states:
                        step = transition[(frame - 1, previous_id, current_id)]
                        total = previous_score + step + float(current["individual_score"])
                        failures = previous_failures + int(current["hard_failure_count"])
                        options.append((failures, total, previous_path + [current]))
                options.sort(key=lambda value: (value[0], -value[1]))
                seen_options = set()
                kept = []
                for option in options:
                    signature = tuple(int(candidate["candidate"]) for candidate in option[2])
                    if signature in seen_options:
                        continue
                    seen_options.add(signature)
                    kept.append(option)
                    if len(kept) == 2:
                        break
                if kept:
                    next_states[current_id] = kept
            states = next_states
        for last_id, terminal_states in states.items():
            for hard_failures, score, path in terminal_states:
                completed.append({
                    "hard_failure_count": hard_failures,
                    "score": score + loops.get((last_id, start_id), 0.0),
                    "path": path,
                })

    if not completed:
        raise ValueError("no complete sequence path exists")
    completed.sort(key=lambda item: (item["hard_failure_count"], -item["score"]))
    unique = []
    seen = set()
    for item in completed:
        signature = tuple(int(candidate["candidate"]) for candidate in item["path"])
        if signature in seen:
            continue
        seen.add(signature)
        unique.append(item)
    winner = unique[0]
    runner_up = unique[1] if len(unique) > 1 else None
    score_margin = None if runner_up is None else float(winner["score"]) - float(runner_up["score"])
    minimum_margin = float(data.get("minimum_score_margin", 0.03))

    def serialize(item: dict[str, Any] | None) -> dict[str, Any] | None:
        if item is None:
            return None
        return {
            "score": round(float(item["score"]), 8),
            "hard_pass": int(item["hard_failure_count"]) == 0,
            "hard_failure_count": int(item["hard_failure_count"]),
            "frames": [
                {
                    "frame": int(candidate["frame"]),
                    "candidate": int(candidate["candidate"]),
                    "path": candidate["path"],
                    "hard_pass": bool(candidate.get("hard_pass", False)),
                    "failures": list(candidate.get("failures") or []),
                    "individual_score": round(float(candidate["individual_score"]), 8),
                }
                for candidate in item["path"]
            ],
        }

    hard_pass = int(winner["hard_failure_count"]) == 0
    failed_frames = [
        {
            "frame": int(candidate["frame"]),
            "candidate": int(candidate["candidate"]),
            "failures": list(candidate.get("failures") or []),
        }
        for candidate in winner["path"]
        if not candidate.get("hard_pass", False)
    ]
    same_tier_margin_is_small = (
        runner_up is not None
        and int(runner_up["hard_failure_count"]) == int(winner["hard_failure_count"])
        and score_margin is not None
        and score_margin < minimum_margin
    )
    return {
        "schema_version": 2,
        "frame_count": frame_count,
        "selection_mode": "hard-pass" if hard_pass else "best-effort",
        "hard_pass": hard_pass,
        "winner": serialize(winner),
        "runner_up": serialize(runner_up),
        "score_margin": None if score_margin is None else round(score_margin, 8),
        "failed_frames": failed_frames,
        "warnings": [] if hard_pass else [
            "No all-hard-pass path existed in the candidate pool; selected the path with the fewest failed frames and highest score."
        ],
        "review_policy": {
            "max_passes": 2,
            "candidate_pool": "same-generation-batch",
            "automatic_regeneration": False,
            "must_select_best_available": True,
        },
        "needs_visual_review": not hard_pass or runner_up is None or same_tier_margin_is_small,
        "evaluated_terminal_paths": len(completed),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Select the globally coherent animation candidate path.")
    parser.add_argument("--scores", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    path = write_json(args.out, select_sequence(load_json(args.scores)))
    print(path)


if __name__ == "__main__":
    main()
