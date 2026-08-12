#!/usr/bin/env python3
from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageStat

from common import sha256, write_json
from chroma import connected_key_mask, parse_color


def foreground_mask(image: Image.Image, key: tuple[int, int, int], tolerance: float) -> Image.Image:
    return ImageChops.invert(connected_key_mask(image, key, tolerance))


def border_key_fraction(image: Image.Image, key: tuple[int, int, int], tolerance: float) -> float:
    rgb = image.convert("RGB")
    width, height = rgb.size
    points = []
    for x in range(width):
        points.append(rgb.getpixel((x, 0)))
        points.append(rgb.getpixel((x, height - 1)))
    for y in range(1, height - 1):
        points.append(rgb.getpixel((0, y)))
        points.append(rgb.getpixel((width - 1, y)))
    if not points:
        return 0.0
    matches = 0
    for red, green, blue in points:
        distance = math.sqrt((red - key[0]) ** 2 + (green - key[1]) ** 2 + (blue - key[2]) ** 2)
        matches += distance <= tolerance
    return matches / len(points)


def mask_iou(left: Image.Image, right: Image.Image) -> float:
    if left.size != right.size:
        return 0.0
    intersection = 0
    union = 0
    for a, b in zip(left.get_flattened_data(), right.get_flattened_data()):
        on_a = a > 0
        on_b = b > 0
        intersection += on_a and on_b
        union += on_a or on_b
    return 1.0 if union == 0 else intersection / union


def mean_difference(left: Image.Image, right: Image.Image) -> float:
    if left.size != right.size:
        return 1.0
    difference = ImageChops.difference(left.convert("RGB"), right.convert("RGB"))
    means = ImageStat.Stat(difference).mean
    return sum(means) / (3 * 255)


def describe_change_mask(left: Image.Image, right: Image.Image, output: Path | None = None) -> dict[str, Any]:
    change_mask = ImageChops.difference(left, right).point(lambda value: 255 if value else 0)
    change_pixels = sum(1 for value in change_mask.get_flattened_data() if value > 0)
    record: dict[str, Any] = {
        "changed_fraction": round(change_pixels / (change_mask.width * change_mask.height), 6),
        "bounds": None,
    }
    bounds = change_mask.getbbox()
    if bounds:
        record["bounds"] = {
            "x": bounds[0], "y": bounds[1],
            "width": bounds[2] - bounds[0], "height": bounds[3] - bounds[1],
        }
    if output:
        change_mask.save(output, "PNG")
        record.update({"path": str(output), "sha256": sha256(output)})
    return record


def analyze(
    paths: list[str | Path],
    key: tuple[int, int, int],
    tolerance: float,
    safe_margin: int = 1,
    expected_size: tuple[int, int] | None = None,
    diff_dir: str | Path | None = None,
) -> dict[str, Any]:
    if not paths:
        raise ValueError("at least one frame is required")
    frames = []
    masks = []
    images = []
    change_output = Path(diff_dir).expanduser().resolve() if diff_dir else None
    if change_output:
        change_output.mkdir(parents=True, exist_ok=True)
    baseline_size = expected_size
    for index, raw_path in enumerate(paths):
        path = Path(raw_path).expanduser().resolve()
        if not path.is_file() or path.stat().st_size == 0:
            raise ValueError(f"missing or empty frame: {path}")
        image = Image.open(path)
        if baseline_size is None:
            baseline_size = image.size
        size_matches = image.size == baseline_size
        mask = foreground_mask(image, key, tolerance)
        bounds = mask.getbbox()
        coverage = sum(1 for value in mask.get_flattened_data() if value > 0) / (image.width * image.height)
        if bounds:
            left, top, right, bottom = bounds
            clipped = left <= safe_margin or top <= safe_margin or right >= image.width - safe_margin or bottom >= image.height - safe_margin
            pivot = {"x": round(((left + right) / 2) / image.width, 6), "y": round(bottom / image.height, 6)}
            bounds_object = {"x": left, "y": top, "width": right - left, "height": bottom - top}
        else:
            clipped = True
            pivot = None
            bounds_object = None
        border_fraction = border_key_fraction(image, key, tolerance)
        frames.append({
            "index": index,
            "path": str(path),
            "sha256": sha256(path),
            "mode": image.mode,
            "width": image.width,
            "height": image.height,
            "size_matches": size_matches,
            "border_key_fraction": round(border_fraction, 6),
            "foreground_coverage": round(coverage, 6),
            "alpha_bounds": bounds_object,
            "bottom_center_pivot": pivot,
            "clipped": clipped,
            "hard_pass": bool(
                size_matches
                and bounds
                and coverage > 0.001
                and coverage < 0.98
                and border_fraction >= 0.90
                and not clipped
            ),
        })
        masks.append(mask)
        images.append(image.copy())
    transitions = []
    for index in range(1, len(paths)):
        previous = images[index - 1]
        current = images[index]
        previous_pivot = frames[index - 1]["bottom_center_pivot"]
        current_pivot = frames[index]["bottom_center_pivot"]
        pivot_delta = None
        if previous_pivot and current_pivot:
            pivot_delta = round(math.hypot(current_pivot["x"] - previous_pivot["x"], current_pivot["y"] - previous_pivot["y"]), 8)
        change_path = change_output / f"change-{index - 1:03d}-to-{index:03d}.png" if change_output else None
        change_record = describe_change_mask(masks[index - 1], masks[index], change_path)
        transitions.append({
            "from": index - 1,
            "to": index,
            "silhouette_iou": round(mask_iou(masks[index - 1], masks[index]), 6),
            "rgb_mean_difference_diagnostic": round(mean_difference(previous, current), 6),
            "pivot_delta": pivot_delta,
            "change_mask": change_record,
        })
    cumulative = []
    for index in range(len(paths)):
        baseline_pivot = frames[0]["bottom_center_pivot"]
        current_pivot = frames[index]["bottom_center_pivot"]
        pivot_delta = None
        if baseline_pivot and current_pivot:
            pivot_delta = round(math.hypot(current_pivot["x"] - baseline_pivot["x"], current_pivot["y"] - baseline_pivot["y"]), 8)
        cumulative_path = change_output / f"cumulative-000-to-{index:03d}.png" if change_output else None
        cumulative.append({
            "from": 0,
            "to": index,
            "silhouette_iou": round(mask_iou(masks[0], masks[index]), 6),
            "rgb_mean_difference_diagnostic": round(mean_difference(images[0], images[index]), 6),
            "pivot_delta": pivot_delta,
            "change_mask": describe_change_mask(masks[0], masks[index], cumulative_path),
        })
    return {
        "schema_version": 1,
        "key_color": "#%02x%02x%02x" % key,
        "key_tolerance": tolerance,
        "expected_size": {"width": baseline_size[0], "height": baseline_size[1]},
        "frames": frames,
        "transitions": transitions,
        "cumulative_from_frame_0": cumulative,
        "hard_pass": all(frame["hard_pass"] for frame in frames),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze animation frames for technical and silhouette QA.")
    parser.add_argument("--frames", nargs="+", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--key", required=True)
    # 크로마 계약의 `transparent_threshold` 와 같은 경계다 (references/defaults.json).
    # 이보다 낮으면 패키저가 투명하게 만들 가장자리 픽셀을 분석기가 피사체로 세고,
    # 배경 잡티 한두 픽셀이 bbox 를 캔버스 끝까지 늘려 멀쩡한 프레임이 `clipped`
    # 로 하드 실패한다. tests/test_threshold_contract.py 가 이 일치를 잠근다.
    parser.add_argument("--tolerance", type=float, default=50.0)
    parser.add_argument("--safe-margin", type=int, default=1)
    parser.add_argument("--expected-size", help="required WIDTHxHEIGHT canvas")
    parser.add_argument("--diff-dir", help="optional directory for transition silhouette change masks")
    args = parser.parse_args()
    from common import parse_size
    expected = parse_size(args.expected_size) if args.expected_size else None
    path = write_json(args.out, analyze(
        args.frames, parse_color(args.key), args.tolerance, args.safe_margin, expected,
        diff_dir=args.diff_dir,
    ))
    print(path)


if __name__ == "__main__":
    main()
