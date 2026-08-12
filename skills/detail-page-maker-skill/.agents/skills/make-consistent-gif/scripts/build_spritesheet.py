#!/usr/bin/env python3
from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import Any

from PIL import Image

from common import load_json, sha256, write_json


def build_spritesheet(
    frame_paths: list[str | Path],
    output_path: str | Path,
    *,
    columns: int | None = None,
    motion_plan: dict[str, Any] | None = None,
    name: str = "animation",
) -> tuple[Path, dict[str, Any]]:
    if not frame_paths:
        raise ValueError("at least one frame is required")
    frames = [Image.open(path).convert("RGBA") for path in frame_paths]
    width, height = frames[0].size
    if any(frame.size != (width, height) for frame in frames):
        raise ValueError("all frames must have identical dimensions")
    columns = columns or len(frames)
    if columns <= 0:
        raise ValueError("columns must be positive")
    rows = math.ceil(len(frames) / columns)
    sheet = Image.new("RGBA", (columns * width, rows * height), (0, 0, 0, 0))
    plan_frames = (motion_plan or {}).get("frames", [])
    fps = float((motion_plan or {}).get("fps", 8))
    loop = (motion_plan or {}).get("loop", "closed")
    pivot = (motion_plan or {}).get("pivot", {"mode": "bottom-center", "x": 0.5, "y": 0.92})
    metadata_frames = []
    for index, (frame, raw_path) in enumerate(zip(frames, frame_paths)):
        column = index % columns
        row = index // columns
        x, y = column * width, row * height
        sheet.alpha_composite(frame, (x, y))
        alpha_bounds = frame.getchannel("A").getbbox()
        plan_frame = plan_frames[index] if index < len(plan_frames) else {}
        metadata_frames.append({
            "index": index,
            "path": f"frames/frame-{index:03d}.png",
            "sha256": sha256(raw_path),
            "rect": {"x": x, "y": y, "width": width, "height": height},
            "duration_ms": int(plan_frame.get("duration_ms", round(1000 / fps))),
            "alpha_bounds": None if alpha_bounds is None else {
                "x": alpha_bounds[0], "y": alpha_bounds[1],
                "width": alpha_bounds[2] - alpha_bounds[0],
                "height": alpha_bounds[3] - alpha_bounds[1],
            },
            "root_delta": plan_frame.get("root_delta", {"x": 0, "y": 0}),
            "alignment_offset": plan_frame.get("alignment_offset", {"x": 0, "y": 0}),
            "events": [] if not plan_frame.get("event") else [{"name": plan_frame["event"]}],
        })
    destination = Path(output_path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, "PNG")
    metadata = {
        "schema_version": 1,
        "name": name,
        "frame_count": len(frames),
        "canvas": {
            "width": width,
            "height": height,
            "color_space": "srgb",
            "pixel_format": "rgba8",
            "alpha_mode": "straight",
        },
        "sheet": {
            "path": destination.name,
            "layout": "row-major",
            "columns": columns,
            "rows": rows,
            "cell_width": width,
            "cell_height": height,
        },
        "fps": fps,
        "loop": loop,
        "playback": (
            list(range(len(frames))) + list(range(len(frames) - 2, 0, -1))
            if loop == "ping-pong" and len(frames) > 2
            else list(range(len(frames)))
        ),
        "pivot": pivot,
        "frames": metadata_frames,
    }
    return destination, metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a fixed-cell RGBA spritesheet.")
    parser.add_argument("--frames", nargs="+", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--motion-plan")
    parser.add_argument("--columns", type=int)
    parser.add_argument("--name", default="animation")
    args = parser.parse_args()
    plan = load_json(args.motion_plan) if args.motion_plan else None
    path, metadata = build_spritesheet(args.frames, args.out, columns=args.columns, motion_plan=plan, name=args.name)
    write_json(args.metadata, metadata)
    print(path)


if __name__ == "__main__":
    main()
