#!/usr/bin/env python3
from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image


def parse_color(value: str) -> tuple[int, int, int]:
    text = value.strip().lstrip("#")
    if len(text) != 6:
        raise ValueError(f"expected six-digit hex color: {value}")
    return tuple(int(text[index:index + 2], 16) for index in (0, 2, 4))  # type: ignore[return-value]


def is_magenta_family(red: int, green: int, blue: int) -> bool:
    """Catch dark/bright magenta variations that Euclidean key distance misses."""
    strongest = max(red, blue)
    return bool(
        red >= 60
        and blue >= 60
        and red > green * 1.4
        and blue > green * 1.4
        and abs(red - blue) <= strongest * 0.65
    )


def remove_magenta(
    input_path: str | Path,
    output_path: str | Path,
    *,
    key: tuple[int, int, int] = (255, 0, 255),
    transparent_threshold: float = 55.0,
    opaque_threshold: float = 120.0,
    alpha_floor: int = 40,
    remove_color_family: bool = True,
    despill: bool = True,
) -> Path:
    if transparent_threshold < 0 or opaque_threshold <= transparent_threshold:
        raise ValueError("opaque_threshold must be greater than transparent_threshold")
    if not 0 <= alpha_floor < 255:
        raise ValueError("alpha_floor must be between 0 and 254")
    source = Image.open(input_path).convert("RGBA")
    output = Image.new("RGBA", source.size)
    result = []
    for red, green, blue, original_alpha in source.get_flattened_data():
        if remove_color_family and is_magenta_family(red, green, blue):
            result.append((0, 0, 0, 0))
            continue
        distance = math.sqrt((red - key[0]) ** 2 + (green - key[1]) ** 2 + (blue - key[2]) ** 2)
        if distance <= transparent_threshold:
            matte = 0.0
        elif distance >= opaque_threshold:
            matte = 1.0
        else:
            matte = (distance - transparent_threshold) / (opaque_threshold - transparent_threshold)
            matte = matte * matte * (3.0 - 2.0 * matte)
        matte *= original_alpha / 255.0
        alpha = max(0, min(255, round(matte * 255)))
        if alpha < alpha_floor:
            alpha = 0
        if alpha == 0:
            result.append((0, 0, 0, 0))
            continue
        if despill and 0.04 < matte < 0.999:
            red = round((red - (1.0 - matte) * key[0]) / matte)
            green = round((green - (1.0 - matte) * key[1]) / matte)
            blue = round((blue - (1.0 - matte) * key[2]) / matte)
        result.append((
            max(0, min(255, red)),
            max(0, min(255, green)),
            max(0, min(255, blue)),
            alpha,
        ))
    output.putdata(result)
    destination = Path(output_path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    output.save(destination, "PNG")
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description="Remove a flat magenta background into RGBA PNG.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--key", default="#ff00ff")
    parser.add_argument("--transparent-threshold", type=float, default=55.0)
    parser.add_argument("--opaque-threshold", type=float, default=120.0)
    parser.add_argument("--alpha-floor", type=int, default=40)
    parser.add_argument("--keep-magenta-family", action="store_true")
    parser.add_argument("--no-despill", action="store_true")
    args = parser.parse_args()
    path = remove_magenta(
        args.input,
        args.out,
        key=parse_color(args.key),
        transparent_threshold=args.transparent_threshold,
        opaque_threshold=args.opaque_threshold,
        alpha_floor=args.alpha_floor,
        remove_color_family=not args.keep_magenta_family,
        despill=not args.no_despill,
    )
    print(path)


if __name__ == "__main__":
    main()
