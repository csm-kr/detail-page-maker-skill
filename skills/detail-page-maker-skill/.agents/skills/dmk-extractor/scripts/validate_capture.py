#!/usr/bin/env python3
"""완료된 dmk-extractor 출력 디렉터리를 검증한다."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
FORBIDDEN_REVIEW_KEYS = {"author", "author_id", "writer", "writeid", "username", "user_id", "member_id", "reviewer", "no", "own"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8-sig") as stream:
        value = json.load(stream)
    if not isinstance(value, dict):
        raise ValueError(f"JSON 최상위 값은 객체여야 합니다: {path}")
    return value


def image_size(path: Path) -> tuple[int, int]:
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = None
    with Image.open(path) as image:
        image.load()
        return int(image.width), int(image.height)


def find_forbidden_keys(value: Any, prefix: str = "") -> list[str]:
    found: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            location = f"{prefix}.{key}" if prefix else key
            if key.casefold() in FORBIDDEN_REVIEW_KEYS:
                found.append(location)
            found.extend(find_forbidden_keys(child, location))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(find_forbidden_keys(child, f"{prefix}[{index}]"))
    return found


def validate_numbered_gif_frames(root: Path, page: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    animations: list[tuple[str, dict[str, Any], str]] = []
    thumbnail = page.get("thumbnail_source") or {}
    if thumbnail.get("animated_gif") or thumbnail.get("animation"):
        errors.append("대표 썸네일에 GIF 프레임 분리가 적용되어 있습니다.")
    if thumbnail.get("gif_frame_split_applied") not in {None, False}:
        errors.append("대표 썸네일 GIF 분리 플래그는 false여야 합니다.")
    for asset in (page.get("detail_content_capture") or {}).get("assets") or []:
        if isinstance(asset, dict) and asset.get("animated_gif"):
            animations.append((f"detail-{asset.get('order')}", asset.get("animation") or {}, r"frame-\d{4}\.png"))
            gif_path = root / str(asset.get("path") or "")
            if not gif_path.is_file() or gif_path.read_bytes()[:6] not in {b"GIF87a", b"GIF89a"}:
                errors.append(f"GIF 원본 누락 또는 시그니처 불일치: {asset.get('path')}")
    total_frames = 0
    for label, animation, filename_pattern in animations:
        frames = animation.get("frames")
        frame_count = int(animation.get("frame_count") or 0)
        if not isinstance(frames, list) or frame_count != len(frames) or frame_count < 1:
            errors.append(f"GIF 프레임 수 불일치: {label}")
            continue
        total_frames += frame_count
        for expected, frame in enumerate(frames, 1):
            if not isinstance(frame, dict) or int(frame.get("frame_number") or 0) != expected:
                errors.append(f"GIF 프레임 번호 불일치: {label} #{expected}")
                continue
            relative = str(frame.get("path") or "")
            if not re.fullmatch(filename_pattern, Path(relative).name):
                errors.append(f"GIF 프레임 파일명 불일치: {relative}")
            frame_path = root / relative
            if not frame_path.is_file():
                errors.append(f"GIF 프레임 누락: {relative}")
            else:
                try:
                    width, height = image_size(frame_path)
                    if width != int(frame.get("width_px") or 0) or height != int(frame.get("height_px") or 0):
                        errors.append(f"GIF 프레임 크기 불일치: {relative}")
                except Exception as exc:
                    errors.append(f"GIF 프레임 이미지 검증 실패: {relative}: {exc}")
    summary = page.get("animation_summary") or {}
    if animations and summary.get("target_scope") != "expanded_seller_product_detail_only":
        errors.append("GIF 분리 대상 범위가 판매자 상세설명 내부로 잠기지 않았습니다.")
    if animations and (int(summary.get("animated_gif_count") or 0) != len(animations) or int(summary.get("numbered_frame_count") or 0) != total_frames):
        errors.append("GIF 애니메이션 요약과 번호 프레임 수가 일치하지 않습니다.")
    return errors


def validate_capture(root: Path) -> list[str]:
    root = root.resolve()
    errors: list[str] = []
    required = {
        "manifest.json": None,
        "page.json": None,
        "thumbnail/thumbnail.png": (250, 250),
        "detail/detail-page.png": (600, 1000),
        "reviews/reviews.json": None,
    }
    for relative, minimum in required.items():
        path = root / relative
        if not path.is_file():
            errors.append(f"필수 파일 누락: {relative}")
        elif minimum:
            try:
                width, height = image_size(path)
                if width < minimum[0] or height < minimum[1]:
                    errors.append(f"이미지 크기 미달: {relative}={width}x{height}")
            except Exception as exc:
                errors.append(f"이미지 검증 실패: {relative}: {exc}")
    if errors:
        return errors

    manifest = load_json(root / "manifest.json")
    page = load_json(root / "page.json")
    reviews = load_json(root / "reviews" / "reviews.json")
    product_id = str(manifest.get("product_id") or "")
    if not re.fullmatch(r"\d{6,10}", product_id):
        errors.append("manifest 상품번호가 올바르지 않습니다.")
    if str(page.get("product_id")) != product_id or str(reviews.get("product_id")) != product_id:
        errors.append("manifest/page/reviews 상품번호가 일치하지 않습니다.")
    host = (urlsplit(str(page.get("final_url") or "")).hostname or "").casefold()
    if host != "domeggook.com" and not host.endswith(".domeggook.com"):
        errors.append("최종 URL이 domeggook.com 상품 페이지가 아닙니다.")
    if page.get("page_type") != "product_detail" or page.get("opened_detail_page") is not True:
        errors.append("실제 상품 상세 판정이 없습니다.")
    if page.get("detail_expand", {}).get("expanded") is not True:
        errors.append("상세설명 확장 검증이 없습니다.")
    if page.get("lazy_load_scroll_completed") is not True:
        errors.append("지연 로딩 완료 검증이 없습니다.")
    page_gif_summary = page.get("animation_summary") or {}
    manifest_gif_summary = manifest.get("gif_summary") or {}
    if page_gif_summary and page_gif_summary.get("target_scope") != "expanded_seller_product_detail_only":
        errors.append("page의 GIF 대상 범위가 판매자 상세설명 내부가 아닙니다.")
    if manifest_gif_summary and manifest_gif_summary.get("target_scope") != "expanded_seller_product_detail_only":
        errors.append("manifest의 GIF 대상 범위가 판매자 상세설명 내부가 아닙니다.")
    if int(page_gif_summary.get("animated_gif_count") or 0) != int(manifest_gif_summary.get("animated_gif_count") or 0):
        errors.append("page와 manifest의 GIF 원본 수가 일치하지 않습니다.")
    if int(page_gif_summary.get("numbered_frame_count") or 0) != int(manifest_gif_summary.get("numbered_frame_count") or 0):
        errors.append("page와 manifest의 GIF 번호 프레임 수가 일치하지 않습니다.")

    rows = reviews.get("reviews")
    if not isinstance(rows, list):
        errors.append("reviews 배열이 없습니다.")
        rows = []
    visible = int(reviews.get("visible_review_count") or 0)
    captured_raw = reviews.get("captured_review_count")
    captured = int(captured_raw) if captured_raw is not None else -1
    limit = int(reviews.get("requested_review_limit") or 0)
    expected = visible if limit == 0 else min(visible, limit)
    if captured != len(rows) or captured != expected or reviews.get("complete") is not True:
        errors.append(f"후기 수 불일치: visible={visible}, expected={expected}, captured={captured}, rows={len(rows)}")
    if reviews.get("author_identifiers_removed") is not True:
        errors.append("후기 작성자 식별정보 제거 표시가 없습니다.")
    forbidden = find_forbidden_keys(rows)
    if forbidden:
        errors.append("금지된 후기 식별 필드가 있습니다: " + ", ".join(forbidden[:10]))
    errors.extend(validate_numbered_gif_frames(root, page))

    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        errors.append("manifest artifacts가 없습니다.")
        return errors
    for artifact in artifacts:
        if not isinstance(artifact, dict):
            errors.append("manifest artifact가 객체가 아닙니다.")
            continue
        relative = artifact.get("path")
        if not isinstance(relative, str) or relative.startswith("/") or ".." in Path(relative).parts:
            errors.append(f"안전하지 않은 artifact 경로: {relative}")
            continue
        path = (root / relative).resolve()
        try:
            path.relative_to(root)
        except ValueError:
            errors.append(f"출력 루트 밖 artifact 경로: {relative}")
            continue
        if not path.is_file():
            errors.append(f"artifact 파일 누락: {relative}")
            continue
        expected_hash = str(artifact.get("sha256") or "")
        if not SHA256_PATTERN.fullmatch(expected_hash) or sha256_file(path) != expected_hash:
            errors.append(f"artifact SHA-256 불일치: {relative}")
        if int(artifact.get("size_bytes") or -1) != path.stat().st_size:
            errors.append(f"artifact 크기 불일치: {relative}")
    recording = root / str(page.get("browser_harness_recording_dir") or "")
    if not recording.is_dir():
        errors.append("Browser Harness 녹화 디렉터리가 없습니다.")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="dmk-extractor 출력의 파일·해시·후기 개인정보·완전성을 검증합니다.")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    errors = validate_capture(args.output)
    if errors:
        print(json.dumps({"status": "INVALID", "errors": errors}, ensure_ascii=False, indent=2))
        return 1
    manifest_path = args.output.resolve() / "manifest.json"
    print(json.dumps({"status": "VALID", "output": str(args.output.resolve()), "manifest_sha256": sha256_file(manifest_path)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
