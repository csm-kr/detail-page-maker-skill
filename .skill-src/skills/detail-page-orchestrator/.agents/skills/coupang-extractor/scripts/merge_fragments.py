from __future__ import annotations

import argparse
import json
from pathlib import Path

from bundle_layout import default_output_path, prepare_staging, promote, sha256_file, write_bundle_views, write_failure
from capture_tools import CaptureError, assemble_capture, load_json, parse_product_identity, validate_capture, write_json_atomic
from download_assets import download_capture_assets


def main() -> int:
    parser = argparse.ArgumentParser(description="세 수동 북마클릿 JSON 조각을 하나의 검증 번들로 합칩니다.")
    parser.add_argument("--thumbnail", type=Path, required=True)
    parser.add_argument("--detail", type=Path, required=True)
    parser.add_argument("--reviews", type=Path, required=True)
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    parser.add_argument("--output", type=Path, help="비어 있거나 존재하지 않는 출력 디렉터리")
    parser.add_argument("--no-download", action="store_true")
    args = parser.parse_args()
    fragments = {
        "thumbnails": load_json(args.thumbnail.resolve()),
        "detail": load_json(args.detail.resolve()),
        "reviews": load_json(args.reviews.resolve()),
    }
    expected_types = {"thumbnails": "thumbnails", "detail": "detail", "reviews": "reviews"}
    for key, fragment in fragments.items():
        if fragment.get("fragment_type") != expected_types[key]:
            parser.error(f"{key} 조각의 fragment_type이 잘못됐습니다.")
    requested_url = str(fragments["thumbnails"].get("product", {}).get("final_url") or "")
    try:
        identity = parse_product_identity(requested_url)
        capture = assemble_capture(fragments, requested_url=requested_url, final_url=requested_url, method="bookmarklet")
    except CaptureError as exc:
        print(json.dumps({"status": exc.code, "error": str(exc)}, ensure_ascii=False))
        return 2
    requested_output = args.output.resolve() if args.output else default_output_path(args.workspace, identity)
    try:
        output_dir, bundle_dir = prepare_staging(requested_output)
    except FileExistsError as exc:
        print(json.dumps({"status": "OUTPUT_EXISTS", "error": str(exc), "output": str(requested_output)}, ensure_ascii=False))
        return 2
    if not args.no_download and capture.get("status") != "ACCESS_BLOCKED":
        download_capture_assets(capture, bundle_dir)
    verify_files = not args.no_download and capture.get("status") != "ACCESS_BLOCKED"
    errors = validate_capture(capture, base_dir=bundle_dir, verify_files=verify_files)
    if errors:
        capture["status"] = "VALIDATION_FAILED"
    validation = {
        "status": "VALID" if not errors else "INVALID",
        "verified_files": verify_files,
        "error_count": len(errors),
        "errors": errors,
    }
    if errors or capture.get("status") == "ACCESS_BLOCKED":
        write_json_atomic(bundle_dir / "capture.json", capture)
        write_json_atomic(bundle_dir / "evidence" / "validation.json", validation)
        write_failure(
            bundle_dir,
            code="VALIDATION_FAILED" if errors else "ACCESS_BLOCKED",
            message="수동 조각 번들을 정상 출력으로 승격하지 않았습니다.",
            details={"validation_errors": len(errors)},
        )
        print(json.dumps({"status": capture["status"], "bundle": str(bundle_dir), "validation_errors": len(errors)}, ensure_ascii=False, indent=2))
        return 1
    write_bundle_views(
        bundle_dir,
        capture,
        runner_diagnostics={"status": "BOOKMARKLET_FRAGMENTS_MERGED", "requested_sections": sorted(fragments)},
        validation=validation,
    )
    promote(bundle_dir, output_dir)
    print(
        json.dumps(
            {
                "status": capture["status"],
                "bundle": str(output_dir),
                "validation_errors": 0,
                "manifest_sha256": sha256_file(output_dir / "manifest.json"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
