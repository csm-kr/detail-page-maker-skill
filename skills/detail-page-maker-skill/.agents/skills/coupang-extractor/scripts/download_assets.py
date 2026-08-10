from __future__ import annotations

import argparse
import hashlib
import io
import os
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from capture_tools import is_allowed_cdn_url, load_json, write_json_atomic


DEFAULT_MAX_BYTES = 25 * 1024 * 1024
DEFAULT_TOTAL_BYTES = 300 * 1024 * 1024


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def sniff_image_extension(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


def _download_once(url: str, *, timeout: float, max_bytes: int) -> tuple[bytes, str | None]:
    if not is_allowed_cdn_url(url):
        raise ValueError("허용되지 않은 CDN URL")
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
            "Referer": "https://www.coupang.com/",
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        method="GET",
    )
    opener = urllib.request.build_opener(NoRedirect)
    with opener.open(request, timeout=timeout) as response:
        length_header = response.headers.get("Content-Length")
        if length_header and length_header.isdigit() and int(length_header) > max_bytes:
            raise ValueError("개별 이미지 byte 상한 초과")
        data = response.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise ValueError("개별 이미지 byte 상한 초과")
        if not data:
            raise ValueError("빈 이미지 응답")
        return data, response.headers.get_content_type()


def _write_bytes_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("wb", delete=False, dir=path.parent) as tmp:
        tmp.write(data)
        temp_name = tmp.name
    os.replace(temp_name, path)


def _png_bytes(image: Any) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _derived_file_entry(
    rel: Path,
    data: bytes,
    *,
    section: str,
    kind: str,
    width: int,
    height: int,
) -> dict[str, Any]:
    return {
        "path": rel.as_posix(),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "content_type": "image/png",
        "section": section,
        "kind": kind,
        "width_px": width,
        "height_px": height,
    }


def _create_representative_thumbnail(capture: dict[str, Any], bundle_dir: Path) -> dict[str, Any] | None:
    from PIL import Image

    section = capture.get("thumbnails")
    if not isinstance(section, dict):
        return None
    assets = section.get("assets")
    if not isinstance(assets, list):
        return None
    first = next(
        (
            asset
            for asset in assets
            if isinstance(asset, dict)
            and asset.get("status") == "READY"
            and isinstance(asset.get("file"), dict)
        ),
        None,
    )
    if first is None:
        return None
    source = bundle_dir / first["file"]["path"]
    with Image.open(source) as opened:
        opened.seek(0)
        image = opened.convert("RGBA")
        if image.getbbox() is None:
            raise ValueError("대표 썸네일이 비어 있습니다.")
        background = Image.new("RGBA", image.size, "white")
        background.alpha_composite(image)
        rendered = background.convert("RGB")
        data = _png_bytes(rendered)
        width, height = rendered.size
    rel = Path("thumbnail") / "thumbnail.png"
    _write_bytes_atomic(bundle_dir / rel, data)
    entry = _derived_file_entry(
        rel,
        data,
        section="thumbnails",
        kind="representative_thumbnail",
        width=width,
        height=height,
    )
    section["representative_file"] = dict(entry)
    return entry


def _create_detail_page(capture: dict[str, Any], bundle_dir: Path) -> dict[str, Any] | None:
    from PIL import Image

    section = capture.get("detail")
    if not isinstance(section, dict):
        return None
    assets = section.get("assets")
    if not isinstance(assets, list):
        return None
    images = []
    for asset in assets:
        if not isinstance(asset, dict) or asset.get("status") != "READY" or not isinstance(asset.get("file"), dict):
            continue
        source = bundle_dir / asset["file"]["path"]
        with Image.open(source) as opened:
            opened.seek(0)
            images.append(opened.convert("RGBA"))
    if not images:
        return None
    width = max(image.width for image in images)
    height = sum(image.height for image in images)
    if width * height > 150_000_000:
        raise ValueError("상세페이지 조립 픽셀 상한을 넘었습니다.")
    canvas = Image.new("RGB", (width, height), "white")
    offset = 0
    for image in images:
        x = (width - image.width) // 2
        canvas.paste(image.convert("RGB"), (x, offset), image.getchannel("A"))
        offset += image.height
        image.close()
    data = _png_bytes(canvas)
    rel = Path("detail") / "detail-page.png"
    _write_bytes_atomic(bundle_dir / rel, data)
    entry = _derived_file_entry(
        rel,
        data,
        section="detail",
        kind="assembled_detail_page",
        width=width,
        height=height,
    )
    section["assembled_file"] = dict(entry)
    return entry


def download_capture_assets(
    capture: dict[str, Any],
    bundle_dir: Path,
    *,
    timeout: float = 25.0,
    max_bytes: int = DEFAULT_MAX_BYTES,
    max_total_bytes: int = DEFAULT_TOTAL_BYTES,
) -> dict[str, Any]:
    manifest: list[dict[str, Any]] = []
    downloaded: dict[tuple[str, str], dict[str, Any]] = {}
    total_bytes = 0
    any_failure = False

    for section_name, folder, stem in (
        ("thumbnails", "thumbnail/assets", "thumbnail"),
        ("detail", "detail/assets", "detail"),
    ):
        section = capture.get(section_name)
        if not isinstance(section, dict):
            continue
        failures: list[dict[str, Any]] = []
        assets = section.get("assets")
        if not isinstance(assets, list):
            continue
        for asset in assets:
            if not isinstance(asset, dict):
                continue
            url = str(asset.get("source_asset_url") or "")
            order = int(asset.get("order") or 0)
            cache_key = (section_name, url)
            if cache_key in downloaded:
                asset["file"] = dict(downloaded[cache_key])
                asset["status"] = "READY"
                continue
            try:
                data, content_type = _download_once(url, timeout=timeout, max_bytes=max_bytes)
                extension = sniff_image_extension(data)
                if extension is None:
                    raise ValueError("지원하지 않는 이미지 바이트")
                if total_bytes + len(data) > max_total_bytes:
                    raise ValueError("전체 이미지 byte 상한 초과")
                rel = Path(folder) / f"{stem}-{order:03d}{extension}"
                target = bundle_dir / rel
                _write_bytes_atomic(target, data)
                sha256 = hashlib.sha256(data).hexdigest()
                file_entry = {
                    "path": rel.as_posix(),
                    "bytes": len(data),
                    "sha256": sha256,
                    "content_type": content_type,
                    "source_asset_url": url,
                    "section": section_name,
                    "order": order,
                }
                total_bytes += len(data)
                downloaded[cache_key] = file_entry
                manifest.append(dict(file_entry))
                asset["file"] = dict(file_entry)
                asset["status"] = "READY"
            except (OSError, ValueError, urllib.error.URLError, urllib.error.HTTPError) as exc:
                any_failure = True
                asset["status"] = "DOWNLOAD_FAILED"
                error_type = type(exc).__name__
                asset["download_error"] = error_type
                failures.append({"order": order, "code": "DOWNLOAD_FAILED", "error_type": error_type})
        diagnostics = section.setdefault("diagnostics", {})
        if isinstance(diagnostics, dict):
            diagnostics["download_failure_count"] = len(failures)
            if failures:
                diagnostics["download_failures"] = failures
        if failures and section.get("status") == "READY":
            section["status"] = "PARTIAL"

    for section_name, builder in (
        ("thumbnails", _create_representative_thumbnail),
        ("detail", _create_detail_page),
    ):
        try:
            derived = builder(capture, bundle_dir)
            if derived is not None:
                manifest.append(dict(derived))
        except (ImportError, OSError, ValueError) as exc:
            any_failure = True
            section = capture.get(section_name)
            if isinstance(section, dict):
                if section.get("status") == "READY":
                    section["status"] = "PARTIAL"
                diagnostics = section.setdefault("diagnostics", {})
                if isinstance(diagnostics, dict):
                    diagnostics["derived_output_error"] = type(exc).__name__

    capture["files_manifest"] = manifest
    if any_failure and capture.get("status") == "READY":
        capture["status"] = "PARTIAL"
    return capture


def main() -> int:
    parser = argparse.ArgumentParser(description="쿠팡 캡처의 CDN 이미지를 원본 바이트로 1회 다운로드합니다.")
    parser.add_argument("capture", type=Path)
    parser.add_argument("--bundle-dir", type=Path)
    parser.add_argument("--timeout", type=float, default=25.0)
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument("--max-total-bytes", type=int, default=DEFAULT_TOTAL_BYTES)
    args = parser.parse_args()
    capture_path = args.capture.resolve()
    bundle_dir = (args.bundle_dir or capture_path.parent).resolve()
    capture = load_json(capture_path)
    download_capture_assets(
        capture,
        bundle_dir,
        timeout=args.timeout,
        max_bytes=args.max_bytes,
        max_total_bytes=args.max_total_bytes,
    )
    write_json_atomic(capture_path, capture)
    print(capture_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
