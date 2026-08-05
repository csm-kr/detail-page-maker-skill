from __future__ import annotations

import hashlib
import uuid
from pathlib import Path
from typing import Any, Mapping

from capture_tools import utc_now, write_json_atomic
from hash_artifacts import hash_tree


def default_output_path(workspace: Path, identity: Mapping[str, Any]) -> Path:
    return (
        workspace.resolve()
        / "tests"
        / f"coupang-extractor-{identity['product_id']}-{identity['item_id']}"
    )


def prepare_staging(output: Path) -> tuple[Path, Path]:
    output = output.resolve()
    if output.is_symlink():
        raise FileExistsError(f"OUTPUT_EXISTS: 심볼릭 링크 출력은 허용하지 않습니다: {output}")
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise FileExistsError(f"OUTPUT_EXISTS: 기존 결과를 덮어쓰지 않습니다: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = output.with_name(f"{output.name}.partial-{uuid.uuid4().hex[:10]}")
    staging.mkdir(parents=False, exist_ok=False)
    return output, staging


def promote(staging: Path, output: Path) -> None:
    staging = staging.resolve()
    output = output.resolve()
    if staging.parent != output.parent or not staging.name.startswith(output.name + ".partial-"):
        raise ValueError("승격 경로가 출력 디렉터리의 staging 경로가 아닙니다.")
    if output.exists():
        if not output.is_dir() or any(output.iterdir()):
            raise FileExistsError(f"OUTPUT_EXISTS: 승격 직전 출력 경로가 채워졌습니다: {output}")
        output.rmdir()
    staging.replace(output)


def _relative_recording(recording: Any, root: Path) -> str | None:
    if not isinstance(recording, str) or not recording:
        return None
    try:
        return Path(recording).resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return None


def write_bundle_views(
    root: Path,
    capture: dict[str, Any],
    *,
    runner_diagnostics: Mapping[str, Any],
    validation: Mapping[str, Any],
    recording_dir: str | None = None,
) -> dict[str, Any]:
    root = root.resolve()
    relative_recording = _relative_recording(recording_dir, root)
    evidence_dir = root / "evidence"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    diagnostics = dict(runner_diagnostics)
    diagnostics["recording_dir"] = relative_recording
    write_json_atomic(evidence_dir / "runner-diagnostics.json", diagnostics)
    write_json_atomic(evidence_dir / "validation.json", dict(validation))
    write_json_atomic(root / "capture.json", capture)

    product = capture.get("product") if isinstance(capture.get("product"), Mapping) else {}
    thumbnails = capture.get("thumbnails") if isinstance(capture.get("thumbnails"), Mapping) else {}
    detail = capture.get("detail") if isinstance(capture.get("detail"), Mapping) else {}
    reviews = capture.get("reviews") if isinstance(capture.get("reviews"), Mapping) else {}
    items = reviews.get("items") if isinstance(reviews.get("items"), list) else []
    page = {
        "schema_version": capture.get("schema_version"),
        "artifact_type": "coupang_extractor_page",
        "capture_id": capture.get("capture_id"),
        "captured_at": capture.get("captured_at"),
        "status": capture.get("status"),
        "requested_url": product.get("requested_url"),
        "final_url": product.get("final_url"),
        "normalized_url": product.get("normalized_url"),
        "product_id": product.get("product_id"),
        "item_id": product.get("item_id"),
        "vendor_item_id": product.get("vendor_item_id"),
        "title": product.get("title"),
        "thumbnail": {
            "status": thumbnails.get("status"),
            "asset_count": len(thumbnails.get("assets") or []),
            "representative_path": (thumbnails.get("representative_file") or {}).get("path"),
            "assets_dir": "thumbnail/assets",
        },
        "detail": {
            "status": detail.get("status"),
            "asset_count": len(detail.get("assets") or []),
            "assembled_path": (detail.get("assembled_file") or {}).get("path"),
            "assets_dir": "detail/assets",
        },
        "reviews": {
            "status": reviews.get("status"),
            "captured_review_count": len(items),
            "path": "reviews/reviews.json",
            "scope": reviews.get("scope"),
        },
        "browser_evidence": {"recording_dir": relative_recording},
        "rights": capture.get("rights"),
    }
    write_json_atomic(root / "page.json", page)
    reviews_view = {
        "schema_version": capture.get("schema_version"),
        "artifact_type": "coupang_public_review_capture",
        "capture_id": capture.get("capture_id"),
        "captured_at": capture.get("captured_at"),
        "product_id": product.get("product_id"),
        "item_id": product.get("item_id"),
        "source_page_url": product.get("final_url") or product.get("normalized_url"),
        "status": reviews.get("status"),
        "scope": reviews.get("scope"),
        "captured_review_count": len(items),
        "author_identifiers_removed": True,
        "reviews": items,
        "diagnostics": reviews.get("diagnostics"),
        "rights": capture.get("rights"),
    }
    write_json_atomic(root / "reviews" / "reviews.json", reviews_view)

    hashed = hash_tree(root, root / "manifest.json")
    manifest = {
        "schema_version": "1.0",
        "artifact_type": "coupang_extractor_bundle_manifest",
        "capture_id": capture.get("capture_id"),
        "status": capture.get("status"),
        "generated_at": utc_now(),
        "browser_mode": "visible_browser_harness",
        "product_id": product.get("product_id"),
        "item_id": product.get("item_id"),
        "vendor_item_id": product.get("vendor_item_id"),
        "requested_url": product.get("requested_url"),
        "final_url": product.get("final_url"),
        "thumbnail_count": len(thumbnails.get("assets") or []),
        "detail_asset_count": len(detail.get("assets") or []),
        "review_count": len(items),
        "review_scope": reviews.get("scope"),
        "validation": dict(validation),
        "rights": capture.get("rights"),
        "artifacts": hashed["files"],
    }
    write_json_atomic(root / "manifest.json", manifest)
    return manifest


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_failure(root: Path, *, code: str, message: str, details: Mapping[str, Any]) -> None:
    payload = {**dict(details), "status": code, "message": message, "recorded_at": utc_now()}
    write_json_atomic(root / "capture-failure.json", payload)
    write_json_atomic(root / "evidence" / "runner-diagnostics.json", payload)
