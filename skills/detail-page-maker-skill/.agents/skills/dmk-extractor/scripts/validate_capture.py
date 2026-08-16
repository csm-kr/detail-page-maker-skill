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


def validate_detail_assets(root: Path, page: dict[str, Any]) -> list[str]:
    """상세 원본이 DOM 순서대로 빠짐없이 보존됐는지 확인한다."""
    errors: list[str] = []
    assets = (page.get("detail_content_capture") or {}).get("assets") or []
    if not assets:
        errors.append("상세 원본 목록이 비어 있습니다.")
        return errors
    for expected, asset in enumerate(assets, 1):
        if not isinstance(asset, dict):
            errors.append(f"상세 원본 항목이 객체가 아닙니다: #{expected}")
            continue
        if int(asset.get("order") or 0) != expected:
            errors.append(f"상세 원본 조립 순서가 어긋납니다: #{expected}")
        relative = str(asset.get("path") or "")
        path = root / relative
        if not relative.startswith("detail/assets/") or not path.is_file():
            errors.append(f"상세 원본 누락: {relative}")
            continue
        try:
            width, height = image_size(path)
            if width != int(asset.get("natural_width_px") or 0) or height != int(asset.get("natural_height_px") or 0):
                errors.append(f"상세 원본 자연 크기 불일치: {relative}")
        except Exception as exc:
            errors.append(f"상세 원본 이미지 검증 실패: {relative}: {exc}")
        if not str(asset.get("source_url") or "").startswith("http"):
            errors.append(f"상세 원본 URL 기록이 없습니다: {relative}")
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
    if manifest.get("capture_mode") != "direct_http_fetch" or page.get("capture_mode") != "direct_http_fetch":
        errors.append("수집 방식이 direct_http_fetch로 기록되지 않았습니다.")
    if page.get("detail_source") != "contentsBuffer":
        errors.append("판매자 상세설명 출처가 contentsBuffer로 기록되지 않았습니다.")
    if str(manifest.get("canonical_supplier_url") or "") != str(manifest.get("requested_url") or ""):
        errors.append("manifest의 canonical 공급처 URL이 요청 URL과 다릅니다.")
    errors.extend(validate_detail_assets(root, page))

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
    evidence = root / str(page.get("http_evidence_dir") or "")
    if not evidence.is_dir():
        errors.append("HTTP 증거 디렉터리가 없습니다.")
    else:
        for name in ("page.html", "requests.jsonl"):
            if not (evidence / name).is_file():
                errors.append(f"HTTP 증거 파일 누락: {name}")
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
