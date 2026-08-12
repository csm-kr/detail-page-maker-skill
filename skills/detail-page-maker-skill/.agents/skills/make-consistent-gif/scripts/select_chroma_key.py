#!/usr/bin/env python3
from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageFilter

from chroma import (
    DEFAULT_KEY_CANDIDATES,
    DEFAULT_OPAQUE_THRESHOLD,
    DEFAULT_TRANSPARENT_THRESHOLD,
    border_color,
    color_distance,
    color_hex,
    connected_key_mask,
    parse_color,
    replace_background,
)
from common import sha256, write_json


def foreground_palette(
    path: str | Path,
    *,
    source_tolerance: float,
) -> tuple[Counter[tuple[int, int, int]], dict[str, Any]]:
    source_path = Path(path).expanduser().resolve()
    with Image.open(source_path) as opened:
        image = opened.convert("RGBA")
    detected_background = border_color(image)
    background = connected_key_mask(image, detected_background, source_tolerance)
    foreground = ImageChops.invert(background)
    interior = foreground.filter(ImageFilter.MinFilter(3))
    if interior.getbbox() is None:
        interior = foreground
    palette: Counter[tuple[int, int, int]] = Counter()
    for (red, green, blue, alpha), keep in zip(
        image.get_flattened_data(), interior.get_flattened_data()
    ):
        if alpha < 16 or keep == 0:
            continue
        palette[((red // 8) * 8 + 4, (green // 8) * 8 + 4, (blue // 8) * 8 + 4)] += 1
    if not palette:
        raise ValueError(f"could not isolate foreground colors from reference: {source_path}")
    foreground_pixels = sum(1 for value in foreground.get_flattened_data() if value)
    return palette, {
        "path": str(source_path),
        "sha256": sha256(source_path),
        "source_background": color_hex(detected_background),
        "foreground_fraction": round(foreground_pixels / (image.width * image.height), 6),
        "palette_bins": len(palette),
    }


def weighted_percentile(values: list[tuple[float, int]], percentile: float) -> float:
    total = sum(weight for _, weight in values)
    target = max(1, round(total * percentile))
    running = 0
    for value, weight in sorted(values):
        running += weight
        if running >= target:
            return value
    return values[-1][0]


def choose_adaptive_key(
    references: list[str | Path],
    *,
    candidates: tuple[tuple[str, str], ...] = DEFAULT_KEY_CANDIDATES,
    source_tolerance: float = DEFAULT_TRANSPARENT_THRESHOLD,
    minimum_separation: float = 125.0,
) -> dict[str, Any]:
    if not references:
        raise ValueError("at least one canonical reference is required")
    combined: Counter[tuple[int, int, int]] = Counter()
    reference_records = []
    for reference in references:
        palette, record = foreground_palette(reference, source_tolerance=source_tolerance)
        combined.update(palette)
        reference_records.append(record)
    scored = []
    for name, raw_color in candidates:
        color = parse_color(raw_color)
        distances = [(color_distance(color, palette_color), count) for palette_color, count in combined.items()]
        minimum = min(value for value, _ in distances)
        percentile_01 = weighted_percentile(distances, 0.01)
        scored.append({
            "name": name,
            "color": color_hex(color),
            "minimum_foreground_distance": round(minimum, 3),
            "p01_foreground_distance": round(percentile_01, 3),
            "safe": minimum >= minimum_separation,
        })
    scored.sort(
        key=lambda item: (
            bool(item["safe"]),
            float(item["minimum_foreground_distance"]),
            float(item["p01_foreground_distance"]),
        ),
        reverse=True,
    )
    winner = scored[0]
    if not winner["safe"]:
        raise ValueError(
            "no adaptive chroma candidate is safely separated from the canonical foreground palette"
        )
    return {
        "schema_version": 1,
        "mode": "adaptive",
        "selection_metric": "maximin-quantized-rgb-distance",
        "source_tolerance": source_tolerance,
        "minimum_separation": minimum_separation,
        "selected": winner,
        "candidates": scored,
        "references": reference_records,
    }


def parse_candidate(value: str) -> tuple[str, str]:
    if "=" in value:
        name, color = value.split("=", 1)
    else:
        name, color = value, value
    parse_color(color)
    return name.strip(), color.strip().lower()


def prepare_reference(
    input_path: str | Path,
    output_path: str | Path,
    *,
    source_key: tuple[int, int, int],
    target_key: tuple[int, int, int],
    transparent_threshold: float,
    opaque_threshold: float,
) -> tuple[Path, dict[str, Any]]:
    source_path = Path(input_path).expanduser().resolve()
    with Image.open(source_path) as opened:
        rgba = opened.convert("RGBA")
    width, height = rgba.size
    border_alpha = []
    for x in range(width):
        border_alpha.extend((rgba.getpixel((x, 0))[3], rgba.getpixel((x, height - 1))[3]))
    for y in range(1, height - 1):
        border_alpha.extend((rgba.getpixel((0, y))[3], rgba.getpixel((width - 1, y))[3]))
    transparent_border_fraction = sum(alpha < 16 for alpha in border_alpha) / len(border_alpha)
    if transparent_border_fraction >= 0.9:
        destination = Path(output_path).expanduser().resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        background = Image.new("RGBA", rgba.size, (*target_key, 255))
        Image.alpha_composite(background, rgba).convert("RGB").save(destination, "PNG")
        return destination, {
            "mode": "existing-alpha",
            "detected_color": None,
            "transparent_border_fraction": round(transparent_border_fraction, 6),
            "connected_only": False,
            "despill": False,
            "edge_spill_cleanup": False,
        }
    prepared = replace_background(
        source_path,
        output_path,
        source_key=source_key,
        target_key=target_key,
        transparent_threshold=transparent_threshold,
        opaque_threshold=opaque_threshold,
    )
    return prepared, {
        "mode": "border-chroma",
        "detected_color": color_hex(source_key),
        "transparent_threshold": transparent_threshold,
        "opaque_threshold": opaque_threshold,
        "connected_only": True,
        "despill": True,
        "edge_spill_cleanup": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Select a chroma key far from canonical foreground colors and prepare Image 1."
    )
    parser.add_argument("--references", nargs="+", required=True)
    parser.add_argument("--prepared-reference", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--candidate", action="append", default=[])
    parser.add_argument("--source-tolerance", type=float, default=DEFAULT_TRANSPARENT_THRESHOLD)
    parser.add_argument("--minimum-separation", type=float, default=125.0)
    parser.add_argument("--opaque-threshold", type=float, default=DEFAULT_OPAQUE_THRESHOLD)
    args = parser.parse_args()

    candidates = (
        tuple(parse_candidate(value) for value in args.candidate)
        if args.candidate
        else DEFAULT_KEY_CANDIDATES
    )
    result = choose_adaptive_key(
        args.references,
        candidates=candidates,
        source_tolerance=args.source_tolerance,
        minimum_separation=args.minimum_separation,
    )
    source_key = parse_color(result["references"][0]["source_background"])
    selected_key = parse_color(result["selected"]["color"])
    prepared, source_normalization = prepare_reference(
        args.references[0],
        args.prepared_reference,
        source_key=source_key,
        target_key=selected_key,
        transparent_threshold=args.source_tolerance,
        opaque_threshold=args.opaque_threshold,
    )
    result["prepared_reference"] = {
        "path": str(prepared),
        "sha256": sha256(prepared),
    }
    result["source_normalization"] = source_normalization
    result["chroma"] = {
        "color": result["selected"]["color"],
        "name": result["selected"]["name"],
        "transparent_threshold": DEFAULT_TRANSPARENT_THRESHOLD,
        "opaque_threshold": DEFAULT_OPAQUE_THRESHOLD,
        "alpha_floor": 40,
        "connected_only": True,
        "despill": True,
        "edge_spill_cleanup": True,
    }
    print(write_json(args.out, result))


if __name__ == "__main__":
    main()
