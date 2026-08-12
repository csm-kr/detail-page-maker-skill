#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

from analyze_frames import analyze
from assemble_gif import assemble_gif
from build_spritesheet import build_spritesheet
from chroma import (
    DEFAULT_ALPHA_FLOOR,
    DEFAULT_KEY_COLOR,
    DEFAULT_OPAQUE_THRESHOLD,
    DEFAULT_TRANSPARENT_THRESHOLD,
    parse_color,
    remove_chroma,
)
from common import bundle_relative, load_json, require_new_directory, sha256, write_json


def make_contact_sheet(paths: list[Path], output: Path, columns: int = 4) -> Path:
    frames = [Image.open(path).convert("RGBA") for path in paths]
    thumb_width = min(256, frames[0].width)
    thumb_height = max(1, round(frames[0].height * thumb_width / frames[0].width))
    label_height = 28
    rows = (len(frames) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * thumb_width, rows * (thumb_height + label_height)), (30, 30, 30, 255))
    draw = ImageDraw.Draw(sheet)
    for index, frame in enumerate(frames):
        x = (index % columns) * thumb_width
        y = (index // columns) * (thumb_height + label_height)
        backdrop = Image.new("RGBA", (thumb_width, thumb_height), (220, 220, 220, 255))
        backdrop.alpha_composite(frame.resize((thumb_width, thumb_height), Image.Resampling.LANCZOS))
        sheet.alpha_composite(backdrop, (x, y))
        draw.text((x + 8, y + thumb_height + 6), f"frame {index:03d}", fill=(255, 255, 255, 255))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, "PNG")
    return output


def selected_paths(selection: dict[str, Any]) -> list[Path]:
    frames = (selection.get("winner") or {}).get("frames")
    if not isinstance(frames, list) or not frames:
        raise ValueError("selection winner contains no frames")
    ordered = sorted(frames, key=lambda value: int(value["frame"]))
    if [int(item["frame"]) for item in ordered] != list(range(len(ordered))):
        raise ValueError("selected frame indexes must be contiguous from zero")
    paths = [Path(item["path"]).expanduser().resolve() for item in ordered]
    if any(not path.is_file() or path.stat().st_size == 0 for path in paths):
        raise ValueError("selection contains a missing or empty frame")
    return paths


def lower_body_pivot(alpha: Image.Image) -> tuple[float, float]:
    """Return a root pivot that ignores upper detached or connected effects."""
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("cannot find a pivot for an empty-alpha frame")
    left, top, right, bottom = bounds
    lower_top = top + round((bottom - top) * 0.55)
    lower_bounds = alpha.crop((0, lower_top, alpha.width, bottom)).getbbox()
    if lower_bounds is None:
        root_left, root_right = left, right
    else:
        root_left, root_right = lower_bounds[0], lower_bounds[2]
    return (root_left + root_right) / 2, float(bottom)


def path_free_selection_branch(branch: Any) -> dict[str, Any] | None:
    if not isinstance(branch, dict):
        return None
    return {
        "score": branch.get("score"),
        "hard_pass": branch.get("hard_pass"),
        "hard_failure_count": branch.get("hard_failure_count"),
        "frames": [
            {
                "frame": frame.get("frame"),
                "candidate": frame.get("candidate"),
                "hard_pass": frame.get("hard_pass"),
                "failures": frame.get("failures") or [],
                "individual_score": frame.get("individual_score"),
            }
            for frame in (branch.get("frames") or [])
        ],
    }


def align_to_planned_pivot(path: Path, pivot: dict[str, Any], root_delta: dict[str, Any]) -> dict[str, int]:
    with Image.open(path) as source:
        image = source.convert("RGBA")
    try:
        current_x, current_y = lower_body_pivot(image.getchannel("A"))
    except ValueError as error:
        raise ValueError(f"cannot align an empty-alpha frame: {path}") from error
    target_x = float(pivot.get("x", 0.5)) * image.width + int(root_delta.get("x", 0))
    target_y = float(pivot.get("y", 0.92)) * image.height + int(root_delta.get("y", 0))
    shift_x = round(target_x - current_x)
    shift_y = round(target_y - current_y)
    aligned = Image.new("RGBA", image.size, (0, 0, 0, 0))
    aligned.alpha_composite(image, (shift_x, shift_y))
    aligned_bounds = aligned.getchannel("A").getbbox()
    if aligned_bounds is None or (
        aligned_bounds[0] <= 1 or aligned_bounds[1] <= 1
        or aligned_bounds[2] >= image.width - 1 or aligned_bounds[3] >= image.height - 1
    ):
        raise ValueError(f"pivot alignment would clip frame: {path}")
    aligned.save(path, "PNG")
    return {"x": shift_x, "y": shift_y}


def package_animation(
    selection_path: str | Path,
    motion_plan_path: str | Path,
    output_dir: str | Path,
    *,
    name: str = "animation",
    chroma_key: str | None = None,
    transparent_threshold: float | None = None,
    opaque_threshold: float | None = None,
    alpha_floor: int | None = None,
    connected_only: bool | None = None,
    despill: bool | None = None,
    edge_spill_cleanup: bool | None = None,
    columns: int | None = None,
    generation_run_path: str | Path | None = None,
) -> Path:
    if not name or Path(name).name != name or name in {".", ".."}:
        raise ValueError("animation name must be a plain filename component")
    selection_source = Path(selection_path).expanduser().resolve()
    motion_plan_source = Path(motion_plan_path).expanduser().resolve()
    selection = load_json(selection_source)
    plan = load_json(motion_plan_source)
    plan_chroma = plan.get("chroma") or {}
    chroma_key = str(chroma_key or plan_chroma.get("color") or DEFAULT_KEY_COLOR).lower()
    transparent_threshold = float(
        transparent_threshold
        if transparent_threshold is not None
        else plan_chroma.get("transparent_threshold", DEFAULT_TRANSPARENT_THRESHOLD)
    )
    opaque_threshold = float(
        opaque_threshold
        if opaque_threshold is not None
        else plan_chroma.get("opaque_threshold", DEFAULT_OPAQUE_THRESHOLD)
    )
    alpha_floor = int(
        alpha_floor if alpha_floor is not None else plan_chroma.get("alpha_floor", DEFAULT_ALPHA_FLOOR)
    )
    connected_only = bool(
        connected_only if connected_only is not None else plan_chroma.get("connected_only", True)
    )
    despill = bool(despill if despill is not None else plan_chroma.get("despill", True))
    edge_spill_cleanup = bool(
        edge_spill_cleanup
        if edge_spill_cleanup is not None
        else plan_chroma.get("edge_spill_cleanup", True)
    )
    sources = selected_paths(selection)
    winner = selection.get("winner") or {}
    best_effort = (
        selection.get("selection_mode") == "best-effort"
        or winner.get("hard_pass") is False
    )
    packaging_warnings = list(selection.get("warnings") or [])
    if len(sources) != int(plan.get("frame_count", 0)):
        raise ValueError("selection and motion plan frame counts differ")
    destination = require_new_directory(output_dir, "animation bundle directory")
    selected_dir = destination / "selected"
    frames_dir = destination / "frames"
    provenance_dir = destination / "provenance"
    selected_dir.mkdir(parents=True, exist_ok=True)
    frames_dir.mkdir(parents=True, exist_ok=True)
    provenance_dir.mkdir(parents=True, exist_ok=True)
    bundled_selection = provenance_dir / "selection.json"
    bundled_motion_plan = provenance_dir / "motion-plan.json"
    shutil.copy2(selection_source, bundled_selection)
    shutil.copy2(motion_plan_source, bundled_motion_plan)
    bundled_chroma_selection = None
    chroma_selection_source = plan_chroma.get("selection_path")
    if chroma_selection_source:
        source = Path(chroma_selection_source).expanduser().resolve()
        if not source.is_file() or source.stat().st_size == 0:
            raise ValueError(f"missing chroma selection: {source}")
        bundled_chroma_selection = provenance_dir / "chroma-selection.json"
        shutil.copy2(source, bundled_chroma_selection)
    raw_selected: list[Path] = []
    rgba_frames: list[Path] = []
    key = parse_color(chroma_key)
    for index, source in enumerate(sources):
        raw = selected_dir / f"frame-{index:03d}{source.suffix.lower() or '.png'}"
        shutil.copy2(source, raw)
        raw_selected.append(raw)
        rgba = frames_dir / f"frame-{index:03d}.png"
        remove_chroma(
            raw, rgba, key=key,
            transparent_threshold=transparent_threshold,
            opaque_threshold=opaque_threshold,
            alpha_floor=alpha_floor,
            connected_only=connected_only,
            despill=despill,
            edge_spill_cleanup=edge_spill_cleanup,
        )
        plan_frame = plan["frames"][index]
        try:
            plan_frame["alignment_offset"] = align_to_planned_pivot(
                rgba,
                plan.get("pivot") or {"mode": "bottom-center", "x": 0.5, "y": 0.92},
                plan_frame.get("root_delta") or {"x": 0, "y": 0},
            )
        except ValueError as error:
            if not best_effort:
                raise
            plan_frame["alignment_offset"] = {"x": 0, "y": 0}
            packaging_warnings.append(f"frame {index} kept without pivot alignment: {error}")
        rgba_frames.append(rgba)
    canvas = plan.get("canvas") or {}
    expected_size = None
    if canvas.get("width") and canvas.get("height"):
        expected_size = (int(canvas["width"]), int(canvas["height"]))
    # Pre-key acceptance must use the same boundary that becomes fully transparent.
    # Pixels between transparent_threshold and opaque_threshold are edge matte, not
    # guaranteed background, so they cannot relax the source-frame hard gate.
    raw_qa = analyze(raw_selected, key, transparent_threshold, safe_margin=1, expected_size=expected_size)
    write_json(destination / "qa-raw.json", raw_qa)
    if not raw_qa["hard_pass"] and not best_effort:
        failed = [frame["index"] for frame in raw_qa["frames"] if not frame["hard_pass"]]
        raise ValueError(f"selected frames failed pre-key technical QA: {failed}")
    if not raw_qa["hard_pass"]:
        failed = [frame["index"] for frame in raw_qa["frames"] if not frame["hard_pass"]]
        packaging_warnings.append(f"best-effort source frames failed pre-key technical QA: {failed}")
    sheet_path, metadata = build_spritesheet(
        rgba_frames,
        destination / "spritesheet.png",
        columns=columns,
        motion_plan=plan,
        name=name,
    )
    write_json(destination / "animation.json", metadata)
    source_durations = [int(frame.get("duration_ms", round(1000 / float(plan.get("fps", 8))))) for frame in plan["frames"]]
    playback = metadata["playback"]
    gif_frames = [rgba_frames[index] for index in playback]
    durations = [source_durations[index] for index in playback]
    loop = None if plan.get("loop") == "one-shot" else 0
    gif_path = assemble_gif(gif_frames, destination / f"{name}.gif", fps=float(plan.get("fps", 8)), durations_ms=durations, loop=loop)
    contact_path = make_contact_sheet(rgba_frames, destination / "contact-sheet.png", columns=min(columns or 4, len(rgba_frames)))
    provenance: dict[str, Any] | None = None
    if generation_run_path:
        generation_run_file = Path(generation_run_path).expanduser().resolve()
        generation_run = load_json(generation_run_file)
        job_file = Path(generation_run.get("job", "")).expanduser().resolve()
        job = load_json(job_file)
        bundled_generation_run = provenance_dir / "generation-run.json"
        bundled_job = provenance_dir / "job.json"
        shutil.copy2(generation_run_file, bundled_generation_run)
        shutil.copy2(job_file, bundled_job)
        tibo_paths = []
        if generation_run.get("tibo_manifest"):
            tibo_paths.append(Path(generation_run["tibo_manifest"]).expanduser().resolve())
        tibo_paths.extend(Path(path).expanduser().resolve() for path in generation_run.get("tibo_manifests", []))
        reference = Path(job.get("reference", "")).expanduser().resolve()
        bundled_reference = provenance_dir / f"reference{reference.suffix.lower() or '.png'}"
        shutil.copy2(reference, bundled_reference)
        bundled_tibo_manifests = []
        for index, path in enumerate(tibo_paths):
            bundled = provenance_dir / f"tibo-manifest-{index:03d}.json"
            shutil.copy2(path, bundled)
            bundled_tibo_manifests.append(bundled)
        failure_records = []
        for index, failure_path in enumerate(sorted(generation_run_file.parent.glob("failure*.json"))):
            bundled = provenance_dir / f"failure-{index:03d}.json"
            shutil.copy2(failure_path, bundled)
            failure_records.append({"path": bundle_relative(bundled, destination), "sha256": sha256(bundled)})
        provenance = {
            "generation_run": {"path": bundle_relative(bundled_generation_run, destination), "sha256": sha256(bundled_generation_run)},
            "job": {"path": bundle_relative(bundled_job, destination), "sha256": sha256(bundled_job)},
            "reference": {"path": bundle_relative(bundled_reference, destination), "sha256": sha256(bundled_reference)},
            "generation_settings": job.get("generation"),
            "motion_request": job.get("motion"),
            "tibo_manifests": [
                {"path": bundle_relative(path, destination), "sha256": sha256(path)}
                for path in bundled_tibo_manifests
            ],
            "failure_records": failure_records,
        }
    manifest = {
        "schema_version": 1,
        "status": "best-effort-with-warnings" if best_effort else "technical-pass-visual-pending",
        "warnings": packaging_warnings,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "name": name,
        "frame_count": len(rgba_frames),
        "inputs": {
            "motion_plan": {
                "path": bundle_relative(bundled_motion_plan, destination),
                "sha256": sha256(bundled_motion_plan),
                "description": plan.get("description"),
            },
            "selection": {
                "path": bundle_relative(bundled_selection, destination),
                "sha256": sha256(bundled_selection),
                "winner": path_free_selection_branch(selection.get("winner")),
                "runner_up": path_free_selection_branch(selection.get("runner_up")),
                "score_margin": selection.get("score_margin"),
                "selection_mode": selection.get("selection_mode", "hard-pass"),
                "hard_pass": selection.get("hard_pass", winner.get("hard_pass", True)),
                "failed_frames": selection.get("failed_frames") or [],
                "review_policy": selection.get("review_policy"),
            },
            "source_frames": [
                {"path": bundle_relative(path, destination), "sha256": sha256(path)}
                for path in raw_selected
            ],
            "generation": provenance,
            "chroma_selection": None if bundled_chroma_selection is None else {
                "path": bundle_relative(bundled_chroma_selection, destination),
                "sha256": sha256(bundled_chroma_selection),
            },
        },
        "chroma": {
            "mode": plan_chroma.get("mode", "legacy-fixed"),
            "key": chroma_key.lower(),
            "name": plan_chroma.get("name"),
            "transparent_threshold": transparent_threshold,
            "opaque_threshold": opaque_threshold,
            "alpha_floor": alpha_floor,
            "connected_only": connected_only,
            "despill": despill,
            "edge_spill_cleanup": edge_spill_cleanup,
        },
        "outputs": {
            "gif": {"path": gif_path.name, "sha256": sha256(gif_path)},
            "spritesheet": {"path": sheet_path.name, "sha256": sha256(sheet_path)},
            "metadata": {"path": "animation.json", "sha256": sha256(destination / "animation.json")},
            "contact_sheet": {"path": contact_path.name, "sha256": sha256(contact_path)},
            "frames": [{"path": bundle_relative(path, destination), "sha256": sha256(path)} for path in rgba_frames],
            "qa": {
                "path": "qa-raw.json",
                "sha256": sha256(destination / "qa-raw.json"),
                "hard_pass": raw_qa["hard_pass"],
                "selection_hard_pass": not best_effort,
            },
        },
    }
    return write_json(destination / "manifest.json", manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description="Package selected chroma-key frames into game-ready animation assets.")
    parser.add_argument("--selection", required=True)
    parser.add_argument("--motion-plan", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--name", default="animation")
    parser.add_argument("--key")
    parser.add_argument("--transparent-threshold", type=float)
    parser.add_argument("--opaque-threshold", type=float)
    parser.add_argument("--alpha-floor", type=int)
    parser.add_argument("--global-key-removal", action="store_true")
    parser.add_argument("--no-despill", action="store_true")
    parser.add_argument("--no-edge-spill-cleanup", action="store_true")
    parser.add_argument("--columns", type=int)
    parser.add_argument("--generation-run")
    args = parser.parse_args()
    print(package_animation(
        args.selection, args.motion_plan, args.out_dir,
        name=args.name, chroma_key=args.key,
        transparent_threshold=args.transparent_threshold,
        opaque_threshold=args.opaque_threshold,
        alpha_floor=args.alpha_floor,
        connected_only=False if args.global_key_removal else None,
        despill=False if args.no_despill else None,
        edge_spill_cleanup=False if args.no_edge_spill_cleanup else None,
        columns=args.columns,
        generation_run_path=args.generation_run,
    ))


if __name__ == "__main__":
    main()
