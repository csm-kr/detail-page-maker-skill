#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from common import bundle_relative, load_json, sha256, write_json
from validate_animation import validate_bundle


REQUIRED_VISUAL_CHECKS = {
    "motion",
    "identity",
    "anatomy",
    "pose",
    "limb_continuity",
    "contact_continuity",
    "prop_continuity",
    "loop_seam",
    "edge_and_transparency",
}


def check_passed(value: object) -> bool:
    if value is True or value == "passed":
        return True
    return isinstance(value, dict) and value.get("passed") is True


def approve_animation(bundle: str | Path, review_path: str | Path) -> Path:
    root = Path(bundle).expanduser().resolve()
    manifest_path = root / "manifest.json"
    manifest = load_json(manifest_path)
    if manifest.get("status") != "technical-pass-visual-pending":
        raise ValueError("bundle must be in technical-pass-visual-pending state")
    if not ((manifest.get("outputs") or {}).get("qa") or {}).get("hard_pass", False):
        raise ValueError("bundle manifest does not contain a hard-pass technical QA result")
    validation_source = root / "validation.json"
    validation = load_json(validation_source)
    if validation.get("valid") is not True:
        raise ValueError("technical validation must pass before visual approval")
    if validation.get("validated_manifest_sha256") != sha256(manifest_path):
        raise ValueError("technical validation is stale for the current manifest")
    current_validation = validate_bundle(root)
    if current_validation.get("valid") is not True:
        raise ValueError("bundle no longer passes technical validation")
    if current_validation.get("validated_manifest_sha256") != validation.get("validated_manifest_sha256"):
        raise ValueError("persisted technical validation does not match the current manifest")
    review_source = Path(review_path).expanduser().resolve()
    review = load_json(review_source)
    if review.get("status") != "passed":
        raise ValueError("visual review status must be passed")
    checks = review.get("checks") or {}
    missing_or_failed = sorted(
        name for name in REQUIRED_VISUAL_CHECKS if not check_passed(checks.get(name))
    )
    if missing_or_failed:
        raise ValueError(
            "visual review is missing required passed checks: " + ", ".join(missing_or_failed)
        )
    destination = root / "visual-review.json"
    if review_source != destination.resolve():
        shutil.copy2(review_source, destination)
    provenance_dir = root / "provenance"
    provenance_dir.mkdir(parents=True, exist_ok=True)
    pre_approval_validation = provenance_dir / "pre-approval-validation.json"
    shutil.copy2(validation_source, pre_approval_validation)
    outputs = manifest.setdefault("outputs", {})
    outputs["visual_review"] = {
        "path": destination.name,
        "sha256": sha256(destination),
        "status": "passed",
    }
    manifest["approval"] = {
        "technical_validation": {
            "path": bundle_relative(pre_approval_validation, root),
            "sha256": sha256(pre_approval_validation),
            "valid": True,
        },
        "visual_review": {
            "path": destination.name,
            "sha256": sha256(destination),
            "status": "passed",
        },
    }
    manifest["status"] = "passed"
    return write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description="Promote a technically valid animation bundle after a passed visual review.")
    parser.add_argument("--bundle", required=True)
    parser.add_argument("--review", required=True)
    args = parser.parse_args()
    print(approve_animation(args.bundle, args.review))


if __name__ == "__main__":
    main()
