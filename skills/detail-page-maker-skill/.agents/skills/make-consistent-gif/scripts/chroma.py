#!/usr/bin/env python3
from __future__ import annotations

from collections import deque
import math
from pathlib import Path

from PIL import Image, ImageFilter


DEFAULT_KEY_COLOR = "#ff00ff"
DEFAULT_TRANSPARENT_THRESHOLD = 50.0
DEFAULT_OPAQUE_THRESHOLD = 110.0
DEFAULT_ALPHA_FLOOR = 40
DEFAULT_EDGE_SPILL_RADIUS = 5
DEFAULT_KEY_CANDIDATES: tuple[tuple[str, str], ...] = (
    ("magenta", "#ff00ff"),
    ("chroma-green", "#00ff00"),
    ("cyan", "#00ffff"),
    ("blue", "#0000ff"),
    ("red", "#ff0000"),
    ("orange", "#ff8000"),
    ("violet", "#8000ff"),
    ("spring-green", "#00ff80"),
)


def binary_key_spill_fraction(
    color: tuple[int, int, int],
    key: tuple[int, int, int],
) -> float:
    """Estimate key spill for saturated RGB-cube keys.

    The excess of the key's high channels over its low channels survives when the
    key is mixed with dark outlines. Euclidean distance alone misses those dark
    but highly saturated fringe pixels. Non-binary/manual keys deliberately fall
    back to the distance matte.
    """
    if any(32 < channel < 223 for channel in key):
        return 0.0
    high = [index for index, channel in enumerate(key) if channel >= 223]
    low = [index for index, channel in enumerate(key) if channel <= 32]
    if not high or not low:
        return 0.0
    excess = min(color[index] for index in high) - max(color[index] for index in low)
    key_excess = min(key[index] for index in high) - max(key[index] for index in low)
    if key_excess <= 0:
        return 0.0
    return max(0.0, min(1.0, excess / key_excess))


def parse_color(value: str) -> tuple[int, int, int]:
    text = value.strip().lstrip("#")
    if len(text) != 6:
        raise ValueError(f"expected six-digit hex color: {value}")
    return tuple(int(text[index:index + 2], 16) for index in (0, 2, 4))  # type: ignore[return-value]


def color_hex(color: tuple[int, int, int]) -> str:
    return "#%02x%02x%02x" % color


def color_distance(left: tuple[int, int, int], right: tuple[int, int, int]) -> float:
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(left, right)))


def border_color(image: Image.Image) -> tuple[int, int, int]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    points: list[tuple[int, int, int]] = []
    for x in range(width):
        for y in (0, height - 1):
            red, green, blue, alpha = rgba.getpixel((x, y))
            if alpha >= 16:
                points.append((red, green, blue))
    for y in range(1, height - 1):
        for x in (0, width - 1):
            red, green, blue, alpha = rgba.getpixel((x, y))
            if alpha >= 16:
                points.append((red, green, blue))
    if not points:
        return (0, 0, 0)
    channels = [sorted(color[index] for color in points) for index in range(3)]
    middle = len(points) // 2
    return tuple(channel[middle] for channel in channels)  # type: ignore[return-value]


def connected_key_mask(
    image: Image.Image,
    key: tuple[int, int, int],
    tolerance: float,
) -> Image.Image:
    """Return key-like pixels connected to the canvas border.

    Isolated foreground pixels that resemble the key remain foreground. Transparent
    source pixels are always eligible background seeds.
    """
    if tolerance < 0:
        raise ValueError("tolerance must be non-negative")
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = list(rgba.get_flattened_data())
    tolerance_squared = tolerance * tolerance
    eligible = [
        alpha < 16
        or (
            (red - key[0]) ** 2
            + (green - key[1]) ** 2
            + (blue - key[2]) ** 2
        ) <= tolerance_squared
        for red, green, blue, alpha in pixels
    ]
    connected = bytearray(width * height)
    queue: deque[int] = deque()

    def seed(index: int) -> None:
        if eligible[index] and not connected[index]:
            connected[index] = 1
            queue.append(index)

    for x in range(width):
        seed(x)
        seed((height - 1) * width + x)
    for y in range(1, height - 1):
        seed(y * width)
        seed(y * width + width - 1)

    while queue:
        index = queue.popleft()
        x = index % width
        y = index // width
        for nx, ny in (
            (x - 1, y - 1), (x, y - 1), (x + 1, y - 1),
            (x - 1, y), (x + 1, y),
            (x - 1, y + 1), (x, y + 1), (x + 1, y + 1),
        ):
            if nx < 0 or ny < 0 or nx >= width or ny >= height:
                continue
            neighbor = ny * width + nx
            if eligible[neighbor] and not connected[neighbor]:
                connected[neighbor] = 1
                queue.append(neighbor)

    mask = Image.new("L", rgba.size)
    mask.putdata([255 if value else 0 for value in connected])
    return mask


def chroma_to_rgba(
    source: Image.Image,
    *,
    key: tuple[int, int, int],
    transparent_threshold: float = DEFAULT_TRANSPARENT_THRESHOLD,
    opaque_threshold: float = DEFAULT_OPAQUE_THRESHOLD,
    alpha_floor: int = DEFAULT_ALPHA_FLOOR,
    connected_only: bool = True,
    despill: bool = True,
    edge_spill_cleanup: bool = True,
) -> Image.Image:
    if transparent_threshold < 0 or opaque_threshold <= transparent_threshold:
        raise ValueError("opaque_threshold must be greater than transparent_threshold")
    if not 0 <= alpha_floor < 255:
        raise ValueError("alpha_floor must be between 0 and 254")
    rgba = source.convert("RGBA")
    pixels = list(rgba.get_flattened_data())
    connected = (
        list(connected_key_mask(rgba, key, opaque_threshold).get_flattened_data())
        if connected_only
        else [255] * len(pixels)
    )
    if connected_only:
        connected_image = Image.new("L", rgba.size)
        connected_image.putdata(connected)
        fringe_band = list(
            connected_image.filter(
                ImageFilter.MaxFilter(DEFAULT_EDGE_SPILL_RADIUS * 2 + 1)
            ).get_flattened_data()
        )
    else:
        fringe_band = connected
    result = []
    for (red, green, blue, original_alpha), is_connected, is_near_key in zip(
        pixels, connected, fringe_band
    ):
        spill = (
            binary_key_spill_fraction((red, green, blue), key)
            if edge_spill_cleanup and is_near_key
            else 0.0
        )
        if not is_connected and spill <= 0.0:
            result.append((red, green, blue, original_alpha))
            continue
        distance = color_distance((red, green, blue), key)
        if distance <= transparent_threshold or original_alpha < 16:
            matte = 0.0
        elif distance >= opaque_threshold:
            matte = 1.0
        else:
            matte = (distance - transparent_threshold) / (opaque_threshold - transparent_threshold)
            matte = matte * matte * (3.0 - 2.0 * matte)
        if spill > 0.0:
            matte = min(matte, 1.0 - spill)
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
    output = Image.new("RGBA", rgba.size)
    output.putdata(result)
    return output


def remove_chroma(
    input_path: str | Path,
    output_path: str | Path,
    *,
    key: tuple[int, int, int],
    transparent_threshold: float = DEFAULT_TRANSPARENT_THRESHOLD,
    opaque_threshold: float = DEFAULT_OPAQUE_THRESHOLD,
    alpha_floor: int = DEFAULT_ALPHA_FLOOR,
    connected_only: bool = True,
    despill: bool = True,
    edge_spill_cleanup: bool = True,
) -> Path:
    with Image.open(input_path) as source:
        output = chroma_to_rgba(
            source,
            key=key,
            transparent_threshold=transparent_threshold,
            opaque_threshold=opaque_threshold,
            alpha_floor=alpha_floor,
            connected_only=connected_only,
            despill=despill,
            edge_spill_cleanup=edge_spill_cleanup,
        )
    destination = Path(output_path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    output.save(destination, "PNG")
    return destination


def replace_background(
    input_path: str | Path,
    output_path: str | Path,
    *,
    source_key: tuple[int, int, int],
    target_key: tuple[int, int, int],
    transparent_threshold: float = DEFAULT_TRANSPARENT_THRESHOLD,
    opaque_threshold: float = DEFAULT_OPAQUE_THRESHOLD,
    edge_spill_cleanup: bool = True,
) -> Path:
    with Image.open(input_path) as source:
        foreground = chroma_to_rgba(
            source,
            key=source_key,
            transparent_threshold=transparent_threshold,
            opaque_threshold=opaque_threshold,
            connected_only=True,
            despill=True,
            edge_spill_cleanup=edge_spill_cleanup,
        )
    background = Image.new("RGBA", foreground.size, (*target_key, 255))
    prepared = Image.alpha_composite(background, foreground).convert("RGB")
    destination = Path(output_path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    prepared.save(destination, "PNG")
    return destination
