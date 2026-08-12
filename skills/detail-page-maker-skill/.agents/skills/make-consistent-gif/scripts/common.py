#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


def load_json(path: str | Path) -> dict[str, Any]:
    resolved = Path(path).expanduser().resolve()
    with resolved.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"JSON root must be an object: {resolved}")
    return value


def write_json(path: str | Path, value: Any) -> Path:
    resolved = Path(path).expanduser().resolve()
    resolved.parent.mkdir(parents=True, exist_ok=True)
    with resolved.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return resolved


def sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_file(path: str | Path, label: str = "file") -> Path:
    resolved = Path(path).expanduser().resolve()
    if not resolved.is_file() or resolved.stat().st_size == 0:
        raise ValueError(f"{label} is missing or empty: {resolved}")
    return resolved


def require_new_directory(path: str | Path, label: str = "output directory") -> Path:
    resolved = Path(path).expanduser().resolve()
    if resolved.exists() and any(resolved.iterdir()):
        raise ValueError(f"{label} already contains files; use a new versioned path: {resolved}")
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def parse_size(value: str) -> tuple[int, int]:
    normalized = value.lower().replace("×", "x")
    parts = normalized.split("x")
    if len(parts) != 2:
        raise ValueError(f"Invalid size; expected WIDTHxHEIGHT: {value}")
    width, height = (int(part) for part in parts)
    if width <= 0 or height <= 0:
        raise ValueError(f"Size values must be positive: {value}")
    return width, height


def bundle_relative(path: str | Path, root: str | Path) -> str:
    """번들 기준 상대 경로를 POSIX 구분자로 돌려준다.

    manifest 는 번들과 함께 다른 플랫폼으로 옮겨져 읽힌다. `str(Path.relative_to())`
    는 Windows 에서 역슬래시를 내므로 그렇게 적힌 manifest 는 이식되지 않는다.
    """
    resolved = Path(path).expanduser().resolve()
    base = Path(root).expanduser().resolve()
    return resolved.relative_to(base).as_posix()
