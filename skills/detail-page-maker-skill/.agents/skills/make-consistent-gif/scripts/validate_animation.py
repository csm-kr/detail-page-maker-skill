#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageFilter, ImageSequence

from chroma import color_distance, parse_color
from common import load_json, sha256, write_json
from package_animation import lower_body_pivot


def bundle_file(root: Path, value: Any, label: str, errors: list[str]) -> Path | None:
    raw = str(value or "")
    relative = Path(raw)
    if not raw or relative.is_absolute():
        errors.append(f"{label} must be a non-empty bundle-relative path")
        return None
    resolved = (root / relative).resolve()
    try:
        resolved.relative_to(root)
    except ValueError:
        errors.append(f"{label} escapes the bundle directory")
        return None
    if resolved == root:
        errors.append(f"{label} must point to a file")
        return None
    return resolved


def verify_record(root: Path, value: Any, label: str, errors: list[str]) -> None:
    if not isinstance(value, dict):
        errors.append(f"missing manifest record: {label}")
        return
    path = bundle_file(root, value.get("path"), label, errors)
    if path is None:
        return
    if not path.is_file() or path.stat().st_size == 0:
        errors.append(f"manifest file missing: {label}")
    elif value.get("sha256") and sha256(path) != value["sha256"]:
        errors.append(f"manifest hash mismatch: {label}")


def edge_key_residue_count(
    image: Image.Image,
    key: tuple[int, int, int],
    threshold: float,
) -> int:
    rgba = image.convert("RGBA")
    key_like = Image.new("L", rgba.size)
    key_like.putdata([
        255
        if alpha > 40 and color_distance((red, green, blue), key) <= threshold
        else 0
        for red, green, blue, alpha in rgba.get_flattened_data()
    ])
    transparent_or_matte = rgba.getchannel("A").point(lambda alpha: 255 if alpha < 250 else 0)
    near_edge = transparent_or_matte.filter(ImageFilter.MaxFilter(5))
    residue = ImageChops.multiply(key_like, near_edge)
    return sum(value > 0 for value in residue.get_flattened_data())


def validate_bundle(bundle: str | Path) -> dict[str, Any]:
    root = Path(bundle).expanduser().resolve()
    errors: list[str] = []
    checks: dict[str, Any] = {}
    try:
        metadata = load_json(root / "animation.json")
        manifest = load_json(root / "manifest.json")
    except (OSError, ValueError) as error:
        return {"schema_version": 1, "valid": False, "errors": [str(error)], "checks": {}}
    chroma = manifest.get("chroma") or {}
    try:
        chroma_key = parse_color(str(chroma.get("key", "#ff00ff")))
        chroma_threshold = float(chroma.get("transparent_threshold", 50))
    except (TypeError, ValueError) as error:
        errors.append(f"invalid manifest chroma contract: {error}")
        chroma_key = (255, 0, 255)
        chroma_threshold = 50.0
    frames_meta = metadata.get("frames") or []
    canvas = metadata.get("canvas") or {}
    expected_size = (int(canvas.get("width", 0)), int(canvas.get("height", 0)))
    frame_paths = [
        bundle_file(root, frame.get("path"), f"animation frame {index}", errors)
        for index, frame in enumerate(frames_meta)
    ]
    checks["frame_count"] = len(frame_paths)
    if not frame_paths:
        errors.append("animation.json has no frames")
    if [frame.get("index") for frame in frames_meta] != list(range(len(frames_meta))):
        errors.append("animation frame indexes are not contiguous from zero")
    if int(metadata.get("frame_count", len(frames_meta))) != len(frames_meta):
        errors.append("animation frame_count differs from frames length")
    if any(int(frame.get("duration_ms", 0)) <= 0 for frame in frames_meta):
        errors.append("animation contains a non-positive frame duration")
    loop_mode = metadata.get("loop", "closed")
    if loop_mode not in {"closed", "ping-pong", "one-shot"}:
        errors.append(f"invalid loop mode: {loop_mode}")
    playback = metadata.get("playback") or list(range(len(frame_paths)))
    if not playback or any(not isinstance(index, int) or index < 0 or index >= len(frame_paths) for index in playback):
        errors.append("animation playback contains an invalid frame index")
    pivot = metadata.get("pivot") or {}
    if pivot.get("mode") != "bottom-center" or any(
        not 0.0 <= float(pivot.get(axis, -1)) <= 1.0 for axis in ("x", "y")
    ):
        errors.append("animation pivot is not a valid normalized bottom-center pivot")
    sizes = []
    alpha_extrema = []
    for index, path in enumerate(frame_paths):
        if path is None:
            continue
        if not path.is_file() or path.stat().st_size == 0:
            errors.append(f"missing frame {index}: {path}")
            continue
        with Image.open(path) as image:
            if image.mode != "RGBA":
                errors.append(f"frame {index} is not RGBA: {image.mode}")
            else:
                key_residue_pixels = edge_key_residue_count(image, chroma_key, chroma_threshold)
                if key_residue_pixels > max(32, round(image.width * image.height * 0.00001)):
                    errors.append(
                        f"frame {index} edge contains {key_residue_pixels} visible selected-key pixels"
                    )
            sizes.append(image.size)
            if image.mode == "RGBA":
                alpha_range = image.getchannel("A").getextrema()
                alpha_extrema.append(alpha_range)
                if alpha_range[1] == 0:
                    errors.append(f"frame {index} has no visible foreground")
                if alpha_range[0] == 255:
                    errors.append(f"frame {index} has no transparent background")
            if image.size != expected_size:
                errors.append(f"frame {index} size {image.size} differs from canvas {expected_size}")
            expected_bounds = image.getchannel("A").getbbox() if image.mode == "RGBA" else None
            declared_bounds = frames_meta[index].get("alpha_bounds")
            normalized_bounds = None if expected_bounds is None else {
                "x": expected_bounds[0], "y": expected_bounds[1],
                "width": expected_bounds[2] - expected_bounds[0],
                "height": expected_bounds[3] - expected_bounds[1],
            }
            if declared_bounds != normalized_bounds:
                errors.append(f"frame {index} alpha_bounds differ from PNG alpha")
            if normalized_bounds:
                root_delta = frames_meta[index].get("root_delta") or {"x": 0, "y": 0}
                actual_root_x, actual_root_y = lower_body_pivot(image.getchannel("A"))
                expected_root_x = float(pivot["x"]) * expected_size[0] + int(root_delta.get("x", 0))
                expected_root_y = float(pivot["y"]) * expected_size[1] + int(root_delta.get("y", 0))
                if abs(actual_root_x - expected_root_x) > 1 or abs(actual_root_y - expected_root_y) > 1:
                    errors.append(f"frame {index} root anchor differs from pivot plus root_delta")
                if (
                    normalized_bounds["x"] <= 1 or normalized_bounds["y"] <= 1
                    or normalized_bounds["x"] + normalized_bounds["width"] >= expected_size[0] - 1
                    or normalized_bounds["y"] + normalized_bounds["height"] >= expected_size[1] - 1
                ):
                    errors.append(f"frame {index} foreground violates the safe canvas margin")
            if frames_meta[index].get("sha256") and sha256(path) != frames_meta[index]["sha256"]:
                errors.append(f"frame {index} metadata hash mismatch")
    checks["frame_sizes"] = [list(size) for size in sizes]
    checks["alpha_extrema"] = [list(value) for value in alpha_extrema]
    sheet_info = metadata.get("sheet") or {}
    sheet_path = bundle_file(root, sheet_info.get("path", "spritesheet.png"), "spritesheet", errors)
    if sheet_path is None:
        pass
    elif not sheet_path.is_file():
        errors.append(f"missing spritesheet: {sheet_path}")
    else:
        with Image.open(sheet_path) as sheet:
            columns = int(sheet_info.get("columns", 0))
            rows = int(sheet_info.get("rows", 0))
            expected_sheet = (columns * expected_size[0], rows * expected_size[1])
            checks["spritesheet_size"] = list(sheet.size)
            if sheet.size != expected_sheet:
                errors.append(f"spritesheet size {sheet.size} differs from expected {expected_sheet}")
            if sheet.size == expected_sheet:
                for index, frame_path in enumerate(frame_paths):
                    if frame_path is None or not frame_path.is_file():
                        continue
                    column = index % columns
                    row = index // columns
                    expected_rect = {
                        "x": column * expected_size[0], "y": row * expected_size[1],
                        "width": expected_size[0], "height": expected_size[1],
                    }
                    if frames_meta[index].get("rect") != expected_rect:
                        errors.append(f"frame {index} rect differs from fixed-cell layout")
                        continue
                    cell = sheet.crop((
                        expected_rect["x"], expected_rect["y"],
                        expected_rect["x"] + expected_rect["width"],
                        expected_rect["y"] + expected_rect["height"],
                    )).convert("RGBA")
                    with Image.open(frame_path) as frame_image:
                        if ImageChops.difference(cell, frame_image.convert("RGBA")).getbbox() is not None:
                            errors.append(f"spritesheet cell {index} differs from source frame")
    name = str(metadata.get("name", "animation"))
    gif_path = bundle_file(root, f"{name}.gif", "GIF", errors)
    if gif_path is None:
        pass
    elif not gif_path.is_file():
        errors.append(f"missing GIF: {gif_path}")
    else:
        with Image.open(gif_path) as gif:
            gif_frames = list(ImageSequence.Iterator(gif))
            expected_durations = [int(frames_meta[int(index)]["duration_ms"]) for index in playback]
            actual_durations = []
            for frame_index in range(gif.n_frames):
                gif.seek(frame_index)
                actual_durations.append(int(gif.info.get("duration", 0)))
            checks["gif_frame_count"] = len(gif_frames)
            checks["gif_size"] = list(gif.size)
            checks["gif_loop"] = gif.info.get("loop")
            checks["gif_durations_ms"] = actual_durations
            if len(gif_frames) != len(playback):
                errors.append(f"GIF frame count {len(gif_frames)} differs from playback {len(playback)}")
            if gif.size != expected_size:
                errors.append(f"GIF size {gif.size} differs from canvas {expected_size}")
            if len(actual_durations) == len(expected_durations) and any(
                abs(actual - expected) > 10 for actual, expected in zip(actual_durations, expected_durations)
            ):
                errors.append("GIF durations differ from animation metadata")
            if abs(sum(actual_durations) - sum(expected_durations)) > 10:
                errors.append("GIF total duration differs from animation metadata")
            if loop_mode == "one-shot" and gif.info.get("loop") is not None:
                errors.append("one-shot GIF unexpectedly contains a loop extension")
            if loop_mode in {"closed", "ping-pong"} and gif.info.get("loop") != 0:
                errors.append(f"{loop_mode} GIF is not configured for infinite repeat")
        ffprobe = shutil.which("ffprobe")
        if not ffprobe:
            errors.append("ffprobe is required but was not found")
        else:
            completed = subprocess.run(
                [
                    ffprobe, "-v", "error", "-count_frames", "-select_streams", "v:0",
                    "-show_entries", "stream=width,height,nb_read_frames,avg_frame_rate:format=duration",
                    "-of", "json", str(gif_path),
                ],
                check=False, capture_output=True, text=True,
            )
            if completed.returncode != 0:
                errors.append("ffprobe could not inspect the GIF")
            else:
                probe = json.loads(completed.stdout)
                checks["ffprobe"] = probe
                streams = probe.get("streams") or []
                if not streams:
                    errors.append("ffprobe reported no GIF video stream")
                else:
                    stream = streams[0]
                    if (int(stream.get("width", 0)), int(stream.get("height", 0))) != expected_size:
                        errors.append("ffprobe GIF dimensions differ from canvas")
                    count = stream.get("nb_read_frames")
                    if count not in (None, "N/A") and int(count) != len(metadata.get("playback") or frame_paths):
                        errors.append("ffprobe GIF frame count differs from playback")
                    duration = float((probe.get("format") or {}).get("duration", 0.0))
                    if count not in (None, "N/A") and duration > 0:
                        effective_fps = int(count) / duration
                        checks["ffprobe_effective_fps"] = effective_fps
                        if abs(effective_fps - float(metadata.get("fps", 0))) > 0.01:
                            errors.append("ffprobe effective GIF FPS differs from animation metadata")
    declared_outputs = manifest.get("outputs") or {}
    for label in ("gif", "spritesheet", "metadata", "contact_sheet", "qa"):
        value = declared_outputs.get(label) or {}
        verify_record(root, value, f"output {label}", errors)
    if not (declared_outputs.get("qa") or {}).get("hard_pass", False):
        errors.append("manifest QA is not hard-pass")
    if manifest.get("status") == "passed":
        review_value = declared_outputs.get("visual_review") or {}
        review_path = bundle_file(root, review_value.get("path"), "visual review", errors)
        if review_path is None:
            pass
        elif not review_path.is_file():
            errors.append("passed manifest is missing visual review")
        else:
            review = load_json(review_path)
            if review.get("status") != "passed":
                errors.append("visual review did not pass")
            if review_value.get("sha256") and sha256(review_path) != review_value["sha256"]:
                errors.append("visual review hash mismatch")
        approval = manifest.get("approval") or {}
        verify_record(root, approval.get("technical_validation"), "pre-approval technical validation", errors)
        approval_review = approval.get("visual_review") or {}
        verify_record(root, approval_review, "approval visual review", errors)
        if approval_review.get("status") != "passed":
            errors.append("approval visual review status did not pass")
    for index, value in enumerate(declared_outputs.get("frames") or []):
        verify_record(root, value, f"output frame {index}", errors)
    inputs = manifest.get("inputs") or {}
    for label in ("motion_plan", "selection"):
        verify_record(root, inputs.get(label), f"input {label}", errors)
    for index, value in enumerate(inputs.get("source_frames") or []):
        verify_record(root, value, f"source frame {index}", errors)
    chroma_selection = inputs.get("chroma_selection")
    if chroma.get("mode") == "adaptive":
        verify_record(root, chroma_selection, "adaptive chroma selection", errors)
    elif chroma_selection is not None:
        verify_record(root, chroma_selection, "chroma selection", errors)
    generation = inputs.get("generation")
    if generation is not None:
        for label in ("generation_run", "job", "reference"):
            verify_record(root, generation.get(label), f"generation {label}", errors)
        for index, value in enumerate(generation.get("tibo_manifests") or []):
            verify_record(root, value, f"tibo manifest {index}", errors)
        for index, value in enumerate(generation.get("failure_records") or []):
            verify_record(root, value, f"failure record {index}", errors)
    return {
        "schema_version": 1,
        "valid": not errors,
        "errors": errors,
        "checks": checks,
        "validated_manifest_sha256": sha256(root / "manifest.json"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a packaged game animation bundle.")
    parser.add_argument("--bundle", required=True)
    parser.add_argument("--out")
    args = parser.parse_args()
    result = validate_bundle(args.bundle)
    output = args.out or str(Path(args.bundle).expanduser().resolve() / "validation.json")
    path = write_json(output, result)
    print(path)
    if not result["valid"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
