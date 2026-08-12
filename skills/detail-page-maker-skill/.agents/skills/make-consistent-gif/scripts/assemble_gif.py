#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def global_palette(frames: list[Image.Image]) -> Image.Image:
    width = max(frame.width for frame in frames)
    sample = Image.new("RGB", (width, sum(frame.height for frame in frames)), (255, 0, 255))
    y = 0
    for frame in frames:
        rgba = frame.convert("RGBA")
        background = Image.new("RGBA", rgba.size, (255, 0, 255, 255))
        sample.paste(Image.alpha_composite(background, rgba).convert("RGB"), (0, y))
        y += rgba.height
    return sample.quantize(colors=255, method=Image.Quantize.MEDIANCUT)


def palette_frame(frame: Image.Image, palette: Image.Image) -> Image.Image:
    rgba = frame.convert("RGBA")
    background = Image.new("RGBA", rgba.size, (255, 0, 255, 255))
    rgb = Image.alpha_composite(background, rgba).convert("RGB")
    converted = rgb.quantize(palette=palette, dither=Image.Dither.FLOYDSTEINBERG)
    palette_values = converted.getpalette() or []
    palette_values.extend([0] * (768 - len(palette_values)))
    palette_values[255 * 3:255 * 3 + 3] = [255, 0, 255]
    converted.putpalette(palette_values[:768])
    alpha = rgba.getchannel("A")
    pixels = list(converted.get_flattened_data())
    alpha_values = list(alpha.get_flattened_data())
    converted.putdata([255 if a < 128 else value for value, a in zip(pixels, alpha_values)])
    converted.info["transparency"] = 255
    return converted


def quantize_gif_durations(durations_ms: list[int]) -> list[int]:
    """Quantize to GIF centiseconds while preserving cumulative clip duration."""
    result = []
    source_total = 0
    encoded_total = 0
    for duration in durations_ms:
        source_total += duration
        next_total = max(encoded_total + 10, round(source_total / 10) * 10)
        result.append(next_total - encoded_total)
        encoded_total = next_total
    return result


def assemble_gif(
    frame_paths: list[str | Path],
    output_path: str | Path,
    *,
    fps: float = 8,
    width: int | None = None,
    durations_ms: list[int] | None = None,
    loop: int | None = 0,
) -> Path:
    if not frame_paths:
        raise ValueError("at least one frame is required")
    if fps <= 0:
        raise ValueError("fps must be positive")
    frames = [Image.open(path).convert("RGBA") for path in frame_paths]
    if width:
        if width <= 0:
            raise ValueError("width must be positive")
        resized = []
        for frame in frames:
            height = max(1, round(frame.height * width / frame.width))
            resized.append(frame.resize((width, height), Image.Resampling.LANCZOS))
        frames = resized
    if any(frame.size != frames[0].size for frame in frames):
        raise ValueError("all GIF frames must have identical dimensions")
    palette = global_palette(frames)
    converted = [palette_frame(frame, palette) for frame in frames]
    durations = durations_ms or [max(1, round(1000 / fps))] * len(converted)
    if len(durations) != len(converted) or any(duration <= 0 for duration in durations):
        raise ValueError("durations_ms must contain one positive value per frame")
    durations = quantize_gif_durations(durations)
    destination = Path(output_path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    save_options = {
        "save_all": True,
        "append_images": converted[1:],
        "duration": durations,
        "transparency": 255,
        "disposal": 2,
        "optimize": False,
    }
    # Omitting the NETSCAPE loop extension is the only true one-shot GIF.
    if loop is not None:
        save_options["loop"] = loop
    converted[0].save(destination, **save_options)
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description="Assemble a transparent GIF preview from RGBA frames.")
    parser.add_argument("--frames", nargs="+", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--fps", type=float, default=8)
    parser.add_argument("--width", type=int)
    parser.add_argument("--durations", help="comma-separated milliseconds")
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    durations = [int(value) for value in args.durations.split(",")] if args.durations else None
    path = assemble_gif(args.frames, args.out, fps=args.fps, width=args.width, durations_ms=durations, loop=None if args.once else 0)
    print(path)


if __name__ == "__main__":
    main()
