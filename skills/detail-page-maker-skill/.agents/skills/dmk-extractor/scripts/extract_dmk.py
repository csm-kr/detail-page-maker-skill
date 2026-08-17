#!/usr/bin/env python3
"""도매꾹 상품의 썸네일, 판매자 상세설명, 공개 구매후기를 추출한다."""

from __future__ import annotations

import argparse
import json
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, NamedTuple
from urllib.parse import parse_qs, urlsplit, urlunsplit

from fetch_dmk import DmkFetchError, fetch_product
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
        return "seller_detail_source_asset"
    if relative == "reviews/reviews.json":
        return "sanitized_public_reviews"
    if relative.startswith("evidence/http/"):
        return "http_fetch_evidence"
    return "supporting_evidence"


def build_manifest(staging: Path, parsed: ParsedProductUrl, result: dict[str, Any]) -> dict[str, Any]:
    artifacts = []
    excluded = {"manifest.json", "capture-failure.json"}
    for path in sorted(staging.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(staging).as_posix()
        if relative in excluded or path.name.endswith(".tmp"):
            continue
        artifact: dict[str, Any] = {"path": relative, "kind": artifact_kind(relative), "size_bytes": path.stat().st_size, "sha256": sha256_file(path)}
        if path.suffix.casefold() in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
            width, height = image_size(path)
            artifact.update({"width_px": width, "height_px": height})
        artifacts.append(artifact)
    return {"schema_version": "1.1", "artifact_type": "dmk_extractor_snapshot", "product_id": parsed.product_id,
        "canonical_supplier_url": parsed.normalized_url,
        "requested_url": parsed.normalized_url, "final_url": result["final_url"], "captured_at": result["captured_at"],
        "capture_mode": "direct_http_fetch",
        "review_summary": {"visible_review_count": result["visible_review_count"],
            "captured_review_count": result["captured_review_count"], "complete": result["review_complete"]}, "artifacts": artifacts}


def run_http_capture(parsed: ParsedProductUrl, staging: Path, review_limit: int) -> dict[str, Any]:
    return fetch_product(
        product_url=parsed.normalized_url,
        product_id=parsed.product_id,
        output_root=staging,
        review_limit=review_limit,
    )


def promote(staging: Path, output: Path) -> None:
    if output.exists():
        if any(output.iterdir()):
            raise FileExistsError(f"OUTPUT_EXISTS: 승격 직전 출력 경로가 채워졌습니다: {output}")
        output.rmdir()
    staging.replace(output)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="도매꾹 상품 썸네일·판매자 상세페이지·공개 구매후기를 HTTP 직접 요청으로 추출합니다.")
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
    try:
        result = run_http_capture(parsed, staging, args.review_limit)
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
            "manifest": str(manifest_path), "manifest_sha256": sha256_file(manifest_path),
            "http_evidence_dir": result["http_evidence_dir"],
            "detail_asset_count": int(result.get("detail_asset_count") or 0),
            "request_count": int(result.get("request_count") or 0)}
        print(json.dumps(response, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        write_json(staging / "capture-failure.json", {"schema_version": "1.1", "status": "FAILURE", "product_id": parsed.product_id,
            "requested_url": parsed.normalized_url, "failed_at": utc_now(),
            "code": exc.code if isinstance(exc, DmkFetchError) else "CAPTURE_VALIDATION_FAILED", "reason": str(exc),
            "resume_condition": "공개 상품 상세 접근과 출력 경로를 확인한 뒤 새 출력 디렉터리로 재시도"})
        print(f"도매꾹 추출 실패: {exc}\n실패 기록: {staging}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
