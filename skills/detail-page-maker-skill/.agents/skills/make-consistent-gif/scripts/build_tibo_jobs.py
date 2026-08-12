#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from PIL import Image

from common import load_json, parse_size, require_file, write_json


def identity_block(plan: dict[str, Any]) -> str:
    chroma = plan.get("chroma") or {}
    color = str(chroma.get("color", "#ff00ff")).lower()
    name = str(chroma.get("name", "selected chroma key"))
    return (
        "Preserve every canonical foreground subject: exact subject count, left-to-right order, "
        "distinct identity, body proportions, face, shell or costume design, palette, material, "
        "rendering style, camera, framing, relative scale, spacing, and canvas. "
        f"Use a perfectly flat solid {name} background ({color}) with no gradient, texture, "
        "floor plane, reflection, or background shadow. "
        f"Do not use {color} or a visually similar color anywhere in the foreground subjects. "
        "Keep all subjects fully inside the canvas with stable bottom-center pivot and generous "
        "safety padding."
    )


def reference_role(chain_mode: str | None, frame_index: int, loop: str) -> str:
    if not chain_mode or frame_index == 0:
        if not chain_mode:
            return "Image 1 is the original canonical identity, pose, and canvas reference."
        boundary = (
            "Honor the closed-loop predecessor target written below."
            if loop == "closed"
            else "This playback boundary has no predecessor target; do not invent one."
        )
        return (
            "Image 1 is the original canonical identity, pose, and canvas reference. "
            "For frame 0 of a chain there is no generated predecessor yet; establish the planned "
            f"first pose. {boundary}"
        )
    if chain_mode == "pure":
        return (
            "Image 1 is the immediately previous generated frame. Continue its exact limb identities, "
            "attachment points, screen sides, contact state, scale, and camera into the next pose."
        )
    if chain_mode == "anchored":
        return (
            "Image 1 is the immediately previous generated frame. Image 2 is the original canonical "
            "identity and canvas anchor. Continue motion from Image 1 while preserving Image 2's design."
        )
    if chain_mode == "history":
        return (
            "Image 1 is the immediately previous generated frame. Image 2 is the original canonical "
            "identity anchor. Image 3 is an earlier generated motion-history frame. Continue the same "
            "limb trajectories without averaging poses or reversing direction."
        )
    raise ValueError(f"unsupported chain mode: {chain_mode}")


def adjacent_text(label: str, target: dict[str, Any] | None) -> str:
    if not target:
        return f"{label}: no adjacent target at this one-shot boundary."
    return (
        f"{label}: frame {target['index']}, phase {target['phase']}; "
        f"pose: {target['absolute_pose']}; limbs: {target.get('limb_pose', '')}"
    )


def frame_prompt(plan: dict[str, Any], frame: dict[str, Any], chain_mode: str | None = None) -> str:
    role = reference_role(chain_mode, int(frame["index"]), str(plan.get("loop", "closed")))
    root_rule = (
        "Use the explicit root movement described by the pose and keep it inside the canvas."
        if plan.get("root_motion")
        else "This is an in-place game animation: preserve the bottom-center pivot and do not translate the root across the canvas."
    )
    contact = ", ".join(frame.get("contact") or []) or "airborne or no required contact"
    event = frame.get("event") or "none"
    adjacent = frame.get("adjacent_targets") or {}
    return "\n\n".join(part for part in [
        role,
        identity_block(plan),
        root_rule,
        (
            f"Animation frame {frame['index']}/{plan['frame_count'] - 1}, phase {frame['phase']}, "
            f"normalized progress {frame['progress']}.\n"
            f"Overall motion: {plan['description']}\n"
            f"Absolute pose: {frame['absolute_pose']}\n"
            f"Change from previous frame: {frame['delta']}\n"
            f"Current limb positions: {frame.get('limb_pose', '')}\n"
            f"Per-limb trajectory: {frame.get('limb_trajectory', '')}\n"
            f"{adjacent_text('Previous frame target', adjacent.get('previous'))}\n"
            f"{adjacent_text('Next frame target', adjacent.get('next'))}\n"
            f"Continuity guard: {frame.get('continuity_guard', '')}\n"
            f"Ground contact: {contact}\n"
            f"Secondary motion: {frame.get('secondary_motion', '')}\n"
            f"Expression: {frame.get('expression', '')}\n"
            f"Silhouette goal: {frame.get('silhouette', '')}\n"
            f"Side and direction convention: {frame.get('spatial_sides', '')}\n"
            f"Game event: {event}\n"
            "Apply the complete body response needed for believable balance. Avoid extra or missing limbs, anatomy changes, identity drift, camera movement, crop, reframe, motion blur, text, watermark, selected chroma-key contamination, and clipped silhouette."
        ),
    ] if part)


def validate_inputs(job: dict[str, Any], plan: dict[str, Any]) -> tuple[Path, dict[str, Any]]:
    reference = require_file(job.get("reference", ""), "reference")
    generation = job.get("generation")
    if not isinstance(generation, dict):
        raise ValueError("job.generation must be an object")
    if int(plan.get("frame_count", 0)) != len(plan.get("frames", [])):
        raise ValueError("motion plan frame_count does not match frames")
    return reference, generation


def size_fields(generation: dict[str, Any]) -> dict[str, Any]:
    mode = generation.get("size_mode")
    if mode not in {"invariant", "controllable"}:
        raise ValueError("generation.size_mode must be invariant or controllable")
    fields: dict[str, Any] = {"size_mode": mode}
    if mode == "controllable":
        target = generation.get("target_size")
        if not target:
            raise ValueError("generation.target_size is required for controllable")
        fields["target_size"] = target
        backend_size = generation.get("backend_size")
        if backend_size:
            fields["backend_size"] = backend_size
        # God Tibo 의 controllable 기본값(`aspect-guided`)은 목표 비율과
        # center-crop-safe 구성까지 프롬프트에 싣는다. 한 장을 목표 캔버스에 맞춰
        # 다시 구성하는 편집에는 맞지만, 프레임 시퀀스에서는 프레임마다 구도를
        # 다시 잡으려 들어 정체성과 연속성이 흔들린다. 크기만 말하고 비율 정렬은
        # 생성 후 중앙 crop 과 resize 에 맡긴다.
        fields["size_prompt"] = "size-only"
    return fields


def candidate_size_fields(generation: dict[str, Any], reference: Path) -> dict[str, Any]:
    """Use invariant once the canonical reference already has the target canvas.

    A controllable pass is useful while creating a canonical at an explicit target
    size. Reusing that mode for animation candidates sends the image backend through
    another target-size normalization pass. Once Image 1 is the approved canonical
    and already matches the target, the candidate job must derive its request size
    from Image 1 instead.
    """
    fields = size_fields(generation)
    if fields["size_mode"] != "controllable":
        return fields
    target = parse_size(str(fields["target_size"]))
    with Image.open(reference) as image:
        reference_size = image.size
    if reference_size == target:
        return {"size_mode": "invariant"}
    return fields


def resolve_strategy(generation: dict[str, Any], plan: dict[str, Any] | None = None) -> str:
    guidance = (plan or {}).get("generation_guidance") or {}
    if "strategy" not in generation:
        return str(guidance.get("preferred_strategy", "parallel-candidates"))
    strategy = str(generation["strategy"])
    if strategy != "auto":
        return strategy
    resolved = generation.get("resolved_strategy")
    if not resolved:
        resolved = guidance.get("preferred_strategy")
    if resolved not in {"chain", "parallel-candidates"}:
        raise ValueError(
            "generation.strategy auto requires generation.resolved_strategy from an accepted strategy experiment"
        )
    return str(resolved)


def build_parallel(job: dict[str, Any], plan: dict[str, Any], reference: Path, generation: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    candidates = int(generation.get("candidates_per_frame", 4))
    if candidates < 1 or candidates > 8:
        raise ValueError("candidates_per_frame must be between 1 and 8")
    total = len(plan["frames"]) * candidates
    if total > 64:
        raise ValueError("frame_count × candidates_per_frame must not exceed 64")
    items = []
    mapping = []
    for frame in plan["frames"]:
        prompt = frame_prompt(plan, frame)
        for candidate in range(candidates):
            index = len(items)
            items.append({"prompt": prompt, "references": [str(reference)]})
            mapping.append({"generated_index": index, "frame": frame["index"], "candidate": candidate})
    tibo_job = {
        "items": items,
        "detail_level": int(generation.get("detail_level", 3)),
        "workers": min(int(generation.get("workers", 32)), total, 32),
        "output_dir": "raw",
        "preserve_backend_raw": True,
        **candidate_size_fields(generation, reference),
    }
    return tibo_job, {"strategy": "parallel-candidates", "mapping": mapping}


def build_chain(job: dict[str, Any], plan: dict[str, Any], reference: Path, generation: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    guidance = plan.get("generation_guidance") or {}
    mode = str(generation.get("chain_mode", guidance.get("chain_mode", "anchored")))
    if mode not in {"pure", "anchored", "history"}:
        raise ValueError("chain_mode must be pure, anchored, or history")
    steps = []
    for frame in plan["frames"]:
        steps.append({
            "frame": frame["index"],
            "prompt": frame_prompt(plan, frame, mode),
            "reference_policy": mode,
            "original_reference": str(reference),
        })
    chain = {
        "strategy": "chain",
        "chain_mode": mode,
        "detail_level": int(generation.get("detail_level", 3)),
        "workers": 1,
        "preserve_backend_raw": True,
        "size": candidate_size_fields(generation, reference),
        "steps": steps,
    }
    return chain, {"strategy": "chain", "mapping": [{"frame": step["frame"], "candidate": 0} for step in steps]}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build God Tibo generation jobs from a motion plan.")
    parser.add_argument("--job", required=True)
    parser.add_argument("--motion-plan", required=True)
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()
    job = load_json(args.job)
    plan = load_json(args.motion_plan)
    reference, generation = validate_inputs(job, plan)
    strategy = resolve_strategy(generation, plan)
    out_dir = Path(args.out_dir).expanduser().resolve()
    if strategy == "parallel-candidates":
        payload, mapping = build_parallel(job, plan, reference, generation)
        payload_path = write_json(out_dir / "tibo-parallel-job.json", payload)
    elif strategy == "chain":
        payload, mapping = build_chain(job, plan, reference, generation)
        payload_path = write_json(out_dir / "tibo-chain-plan.json", payload)
    else:
        raise ValueError("generation.strategy must be chain or parallel-candidates for job building")
    write_json(out_dir / "candidate-mapping.json", mapping)
    print(payload_path)


if __name__ == "__main__":
    main()
