#!/usr/bin/env python3
"""애니메이션 GIF 원본을 검증하고 모든 프레임을 번호 PNG로 분리한다."""

from __future__ import annotations

import io
from pathlib import Path
from typing import Any

from PIL import Image


MAX_GIF_BYTES = 100 * 1024 * 1024
MAX_GIF_FRAMES = 1000
MAX_TOTAL_FRAME_PIXELS = 500_000_000


def is_gif_bytes(data: bytes) -> bool:
    return data[:6] in {b"GIF87a", b"GIF89a"}


def atomic_write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def extract_gif_frames(
    data: bytes,
    output_dir: Path,
    output_root: Path,
    *,
    filename_prefix: str = "frame",
) -> dict[str, Any]:
    if len(data) > MAX_GIF_BYTES:
        raise RuntimeError(f"GIF_TOO_LARGE: GIF 원본이 {MAX_GIF_BYTES}바이트 한도를 넘습니다.")
    if not is_gif_bytes(data):
        raise RuntimeError("GIF_SOURCE_INVALID: GIF87a/GIF89a 시그니처가 없습니다.")
    output_dir.mkdir(parents=True, exist_ok=True)
    frames: list[dict[str, Any]] = []
    first_frame_png: bytes | None = None
    Image.MAX_IMAGE_PIXELS = None
    with Image.open(io.BytesIO(data)) as image:
        if image.format != "GIF":
            raise RuntimeError(f"GIF_SOURCE_INVALID: Pillow 판정 형식이 GIF가 아닙니다: {image.format}")
        frame_count = int(getattr(image, "n_frames", 1))
        if frame_count < 1 or frame_count > MAX_GIF_FRAMES:
            raise RuntimeError(f"GIF_FRAME_LIMIT_EXCEEDED: GIF 프레임 수가 1~{MAX_GIF_FRAMES} 범위를 벗어납니다: {frame_count}")
        if image.width * image.height * frame_count > MAX_TOTAL_FRAME_PIXELS:
            raise RuntimeError("GIF_FRAME_LIMIT_EXCEEDED: 전체 프레임 픽셀 수가 안전 한도를 넘습니다.")
        loop_count = int(image.info.get("loop", 1))
        for index in range(frame_count):
            image.seek(index)
            frame = image.convert("RGBA")
            output = io.BytesIO()
            frame.save(output, format="PNG", optimize=True)
            png = output.getvalue()
            if first_frame_png is None:
                first_frame_png = png
            path = output_dir / f"{filename_prefix}-{index + 1:04d}.png"
            atomic_write_bytes(path, png)
            frames.append(
                {
                    "frame_number": index + 1,
                    "duration_ms": int(image.info.get("duration", 0) or 0),
                    "width_px": int(frame.width),
                    "height_px": int(frame.height),
                    "path": path.resolve().relative_to(output_root.resolve()).as_posix(),
                }
            )
    if first_frame_png is None:
        raise RuntimeError("GIF_SOURCE_INVALID: GIF에서 첫 프레임을 만들지 못했습니다.")
    return {
        "animated": len(frames) > 1,
        "frame_count": len(frames),
        "loop_count": loop_count,
        "frames": frames,
        "first_frame_png": first_frame_png,
    }
