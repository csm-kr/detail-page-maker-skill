#!/usr/bin/env python3
"""도매꾹 상품의 썸네일, 판매자 상세설명, 공개 구매후기를 추출한다."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, NamedTuple
from urllib.parse import parse_qs, urlsplit, urlunsplit

from validate_capture import image_size, sha256_file, validate_capture


ALLOWED_HOST = "domeggook.com"
PRODUCT_ID_PATTERN = re.compile(r"(?<!\d)(\d{6,10})(?!\d)")


class ParsedProductUrl(NamedTuple):
    product_id: str
    normalized_url: str


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def compact_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8-sig") as stream:
        value = json.load(stream)
    if not isinstance(value, dict):
        raise ValueError(f"JSON 최상위 값은 객체여야 합니다: {path}")
    return value


def parse_product_url(value: str) -> ParsedProductUrl:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("URL_INVALID: 도매꾹 상품 상세 URL이 필요합니다.")
    parts = urlsplit(value.strip())
    if parts.scheme.casefold() not in {"http", "https"} or parts.username or parts.password:
        raise ValueError("URL_INVALID: 사용자 정보 없는 HTTP(S) URL만 허용합니다.")
    host = (parts.hostname or "").casefold().rstrip(".")
    if host != ALLOWED_HOST and not host.endswith(f".{ALLOWED_HOST}"):
        raise ValueError("URL_INVALID: domeggook.com 상품 URL만 허용합니다.")
    if parts.port not in {None, 80, 443}:
        raise ValueError("URL_INVALID: 비표준 포트를 허용하지 않습니다.")
    path_ids = PRODUCT_ID_PATTERN.findall(parts.path)
    query = parse_qs(parts.query)
    query_ids: list[str] = []
    for key in ("item_no", "itemNo", "goodsNo", "goods_no", "no"):
        query_ids.extend(candidate for candidate in query.get(key, []) if re.fullmatch(r"\d{6,10}", candidate))
    product_id = (path_ids or query_ids or [None])[-1]
    if product_id is None:
        raise ValueError("URL_INVALID: URL에서 6~10자리 상품번호를 찾지 못했습니다.")
    lowered_path = parts.path.casefold()
    if any(token in lowered_path for token in ("search", "category", "best", "login", "member")) and not any(token in lowered_path for token in ("itemdetail", "goodsview")):
        raise ValueError("URL_INVALID: 검색·카테고리·로그인 URL은 상품 상세가 아닙니다.")
    normalized = urlunsplit(("https", host, parts.path or "/", parts.query, ""))
    return ParsedProductUrl(str(product_id), normalized)


def validate_project_root(project_root: Path) -> Path:
    root = project_root.resolve()
    if root.is_symlink() or not root.is_dir():
        raise ValueError(f"commerce project 디렉터리가 필요합니다: {root}")
    state_path = root / "project.json"
    if not state_path.is_file() or state_path.is_symlink():
        raise ValueError(f"현재 프로젝트의 project.json을 찾지 못했습니다: {state_path}")
    try:
        state = load_json(state_path)
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"project.json을 읽을 수 없습니다: {exc}") from exc
    project = state.get("project")
    if not isinstance(project, dict) or project.get("id") != root.name:
        raise ValueError("project.json의 project.id가 현재 프로젝트 폴더명과 같아야 합니다.")
    return root


def discover_project_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in (current, *current.parents):
        if (candidate / "project.json").is_file():
            return validate_project_root(candidate)
    raise ValueError("현재 프로젝트를 찾지 못했습니다. --project-root를 지정하세요.")


def resolve_output(
    parsed: ParsedProductUrl,
    value: Path | None,
    project_root: Path | None = None,
) -> Path:
    if value is None:
        root = validate_project_root(project_root) if project_root else discover_project_root(Path.cwd())
        output = (
            root
            / "20-product-planning"
            / "research-snapshots"
            / "extractors"
            / "domeggook"
        )
    else:
        output = value
    output = output.resolve()
    if output.is_symlink():
        raise ValueError("출력 경로는 심볼릭 링크일 수 없습니다.")
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise FileExistsError(f"OUTPUT_EXISTS: 기존 결과를 덮어쓰지 않습니다: {output}")
    return output


def artifact_kind(relative: str) -> str:
    if relative == "page.json":
        return "structured_product_page"
    if relative == "thumbnail/thumbnail.png":
        return "product_thumbnail"
    if relative == "detail/detail-page.png":
        return "assembled_seller_detail_page"
    if relative.startswith("detail/assets/"):
        return "seller_detail_animated_gif" if relative.casefold().endswith(".gif") else "seller_detail_source_asset"
    if relative.startswith("detail/gif-frames/"):
        return "numbered_seller_detail_gif_frame"
    if relative == "reviews/reviews.json":
        return "sanitized_public_reviews"
    if relative.startswith("evidence/browser-harness/recordings/"):
        return "browser_harness_recording"
    return "supporting_evidence"


def build_manifest(staging: Path, parsed: ParsedProductUrl, result: dict[str, Any]) -> dict[str, Any]:
    artifacts = []
    excluded = {".capture-config.json", ".capture-result.json", "manifest.json", "capture-failure.json"}
    for path in sorted(staging.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(staging).as_posix()
        if relative in excluded or path.name.endswith(".tmp"):
            continue
        artifact: dict[str, Any] = {"path": relative, "kind": artifact_kind(relative), "size_bytes": path.stat().st_size, "sha256": sha256_file(path)}
        if path.suffix.casefold() in {".png", ".gif"}:
            width, height = image_size(path)
            artifact.update({"width_px": width, "height_px": height})
            if path.suffix.casefold() == ".gif":
                from PIL import Image

                with Image.open(path) as image:
                    artifact["frame_count"] = int(getattr(image, "n_frames", 1))
        artifacts.append(artifact)
    return {"schema_version": "1.0", "artifact_type": "dmk_extractor_snapshot", "product_id": parsed.product_id,
        "requested_url": parsed.normalized_url, "final_url": result["final_url"], "captured_at": result["captured_at"],
        "browser_mode": "isolated_headless_browser_harness", "gif_summary": {"target_scope": "expanded_seller_product_detail_only",
            "animated_gif_count": int(result.get("animated_gif_count") or 0),
            "numbered_frame_count": int(result.get("numbered_gif_frame_count") or 0)},
        "review_summary": {"visible_review_count": result["visible_review_count"],
            "captured_review_count": result["captured_review_count"], "complete": result["review_complete"]}, "artifacts": artifacts}


def run_browser_capture(skill_root: Path, parsed: ParsedProductUrl, staging: Path, review_limit: int) -> tuple[dict[str, Any], int]:
    runner = skill_root / "scripts" / "run_headless_browser_harness.py"
    payload = skill_root / "scripts" / "browser_capture.py"
    if not runner.is_file() or not payload.is_file():
        raise FileNotFoundError("headless Browser Harness 실행 파일이 누락되었습니다.")
    config_path = staging / ".capture-config.json"
    result_path = staging / ".capture-result.json"
    write_json(config_path, {"product_url": parsed.normalized_url, "product_id": parsed.product_id, "output_root": str(staging),
        "result_path": str(result_path), "review_limit": review_limit, "skill_scripts_dir": str(skill_root / "scripts")})
    environment = os.environ.copy()
    environment["DMK_CAPTURE_CONFIG"] = str(config_path)
    environment["BH_AGENT_WORKSPACE"] = str(staging / "evidence" / "browser-harness")
    environment["PYTHONUTF8"] = "1"
    environment["PYTHONIOENCODING"] = "utf-8"
    completed = subprocess.run([sys.executable, str(runner)], input=payload.read_bytes(), env=environment, check=False)
    if not result_path.is_file():
        raise RuntimeError(f"Browser Harness 결과 파일이 없습니다: exit={completed.returncode}")
    result = load_json(result_path)
    if result.get("status") != "SUCCESS":
        raise RuntimeError(str(result.get("reason") or f"Browser Harness 캡처 실패: exit={completed.returncode}"))
    return result, int(completed.returncode)


def promote(staging: Path, output: Path) -> None:
    if output.exists():
        if any(output.iterdir()):
            raise FileExistsError(f"OUTPUT_EXISTS: 승격 직전 출력 경로가 채워졌습니다: {output}")
        output.rmdir()
    staging.replace(output)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="도매꾹 상품 썸네일·판매자 상세페이지·공개 구매후기를 headless Browser Harness로 추출합니다.")
    parser.add_argument("--url", required=True, help="도매꾹 실제 상품 상세 URL")
    parser.add_argument("--project-root", type=Path, help="commerce-project/projects/<project-id> 경로")
    parser.add_argument("--output", type=Path, help="비어 있거나 존재하지 않는 출력 디렉터리")
    parser.add_argument("--review-limit", type=int, default=0, help="0이면 최근 6개월 공개 후기 전체, 양수면 앞에서부터 해당 개수")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.review_limit < 0:
        raise SystemExit("--review-limit은 0 이상의 정수여야 합니다.")
    try:
        parsed = parse_product_url(args.url)
        output = resolve_output(parsed, args.output, args.project_root)
    except (ValueError, FileExistsError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    staging = output.with_name(f"{output.name}.partial-{uuid.uuid4().hex[:10]}")
    if staging.exists():
        raise SystemExit(f"임시 출력 경로가 이미 존재합니다: {staging}")
    staging.mkdir(parents=True)
    skill_root = Path(__file__).resolve().parents[1]
    try:
        result, browser_exit = run_browser_capture(skill_root, parsed, staging, args.review_limit)
        (staging / ".capture-config.json").unlink(missing_ok=True)
        (staging / ".capture-result.json").unlink(missing_ok=True)
        manifest = build_manifest(staging, parsed, result)
        write_json(staging / "manifest.json", manifest)
        errors = validate_capture(staging)
        if errors:
            raise RuntimeError("CAPTURE_VALIDATION_FAILED: " + " | ".join(errors))
        promote(staging, output)
        manifest_path = output / "manifest.json"
        response = {"status": "SUCCESS", "product_id": parsed.product_id, "requested_url": parsed.normalized_url,
            "final_url": result["final_url"], "output_root": str(output), "thumbnail": str(output / "thumbnail" / "thumbnail.png"),
            "detail_page": str(output / "detail" / "detail-page.png"), "reviews": str(output / "reviews" / "reviews.json"),
            "visible_review_count": result["visible_review_count"], "captured_review_count": result["captured_review_count"],
            "manifest": str(manifest_path), "manifest_sha256": sha256_file(manifest_path), "recording_dir": result["recording_dir"],
            "animated_gif_count": int(result.get("animated_gif_count") or 0),
            "numbered_gif_frame_count": int(result.get("numbered_gif_frame_count") or 0),
            "browser_process_exit": browser_exit}
        print(json.dumps(response, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        write_json(staging / "capture-failure.json", {"schema_version": "1.0", "status": "FAILURE", "product_id": parsed.product_id,
            "requested_url": parsed.normalized_url, "failed_at": utc_now(), "reason": str(exc),
            "resume_condition": "공개 상품 상세 접근, Browser Harness, 출력 경로를 확인한 뒤 새 출력 디렉터리로 재시도"})
        print(f"도매꾹 추출 실패: {exc}\n실패 기록: {staging}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
