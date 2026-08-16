from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit


SCHEMA_VERSION = "1.0"
COLLECTOR_VERSION = "1.1.0"
ARTIFACT_TYPE = "coupang_product_evidence_capture"
ALLOWED_PRODUCT_HOSTS = {"coupang.com", "www.coupang.com"}
ALLOWED_CDN_SUFFIX = "coupangcdn.com"
TOP_LEVEL_STATUSES = {"READY", "PARTIAL", "ACCESS_BLOCKED", "VALIDATION_FAILED"}
SECTION_STATUSES = {
    "READY",
    "PARTIAL",
    "SKIPPED",
    "ACCESS_BLOCKED",
    "LOGIN_REQUIRED",
    "THUMBNAIL_NOT_FOUND",
    "DETAIL_ASSET_NOT_FOUND",
    "DETAIL_REGION_UNCERTAIN",
    "REVIEW_TAB_NOT_FOUND",
    "REVIEW_CARD_NOT_FOUND",
}
REVIEW_EXHAUSTION_STOP_REASONS = {
    "NO_NEXT_PAGE",
    "STABLE_NO_NEW_REVIEWS",
    "REVIEW_CARD_NOT_FOUND",
    "RATING_OPTION_NOT_FOUND",
}
FORBIDDEN_REVIEW_KEYS = {
    "reviewer",
    "reviewer_name",
    "author",
    "author_name",
    "nickname",
    "user_id",
    "profile",
    "profile_url",
    "profile_image",
    "account_url",
    "raw_html",
    "html",
    "cookie",
    "cookies",
    "session",
    "token",
}

EMAIL_RE = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
PHONE_RE = re.compile(
    r"(?<!\d)(?:\+?82[-.\s]?)?(?:0?1[016789]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)"
)
ORDER_RE = re.compile(r"(?i)(?:주문\s*(?:번호|ID)|order\s*(?:number|no\.?|id))\s*[:#-]?\s*[A-Z0-9-]{5,}")


class CaptureError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _single_numeric(query: Mapping[str, list[str]], key: str, required: bool) -> str | None:
    values = [value for value in query.get(key, []) if value]
    unique = list(dict.fromkeys(values))
    if not unique:
        if required:
            raise CaptureError("URL_INVALID", f"{key}가 필요합니다.")
        return None
    if len(unique) != 1 or not unique[0].isdigit():
        raise CaptureError("URL_INVALID", f"{key}는 하나의 숫자여야 합니다.")
    return unique[0]


def parse_product_identity(url: str, *, require_item: bool = True) -> dict[str, Any]:
    raw = (url or "").strip()
    try:
        parsed = urlsplit(raw)
        port = parsed.port
    except ValueError as exc:
        raise CaptureError("URL_INVALID", f"URL을 해석할 수 없습니다: {exc}") from exc
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https" or host not in ALLOWED_PRODUCT_HOSTS:
        raise CaptureError("URL_INVALID", "https 쿠팡 직접 상품 URL만 허용합니다.")
    if parsed.username or parsed.password or port not in (None, 443):
        raise CaptureError("URL_INVALID", "userinfo 또는 비기본 포트 URL은 허용하지 않습니다.")
    match = re.fullmatch(r"/vp/products/(\d+)/?", parsed.path)
    if not match:
        raise CaptureError("URL_INVALID", "경로가 /vp/products/<productId> 형식이어야 합니다.")
    product_id = match.group(1)
    query = parse_qs(parsed.query, keep_blank_values=False)
    item_id = _single_numeric(query, "itemId", require_item)
    vendor_item_id = _single_numeric(query, "vendorItemId", False)
    normalized_query: list[tuple[str, str]] = []
    if item_id is not None:
        normalized_query.append(("itemId", item_id))
    if vendor_item_id is not None:
        normalized_query.append(("vendorItemId", vendor_item_id))
    normalized_url = urlunsplit(
        (
            "https",
            "www.coupang.com",
            f"/vp/products/{product_id}",
            urlencode(normalized_query),
            "",
        )
    )
    return {
        "requested_url": raw,
        "normalized_url": normalized_url,
        "product_id": product_id,
        "item_id": item_id,
        "vendor_item_id": vendor_item_id,
    }


def is_allowed_cdn_url(url: str) -> bool:
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except (TypeError, ValueError):
        return False
    host = (parsed.hostname or "").lower().rstrip(".")
    return (
        parsed.scheme == "https"
        and not parsed.username
        and not parsed.password
        and port in (None, 443)
        and (host == ALLOWED_CDN_SUFFIX or host.endswith("." + ALLOWED_CDN_SUFFIX))
    )


def normalize_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def redact_review_text(value: str | None) -> tuple[str, int]:
    text = normalize_text(value)
    count = 0
    for pattern, token in (
        (EMAIL_RE, "[REDACTED_EMAIL]"),
        (PHONE_RE, "[REDACTED_PHONE]"),
        (ORDER_RE, "[REDACTED_ORDER]"),
    ):
        text, n = pattern.subn(token, text)
        count += n
    return text, count


def sensitive_patterns(value: str | None) -> list[str]:
    text = value or ""
    found: list[str] = []
    if EMAIL_RE.search(text):
        found.append("EMAIL")
    if PHONE_RE.search(text):
        found.append("PHONE")
    if ORDER_RE.search(text):
        found.append("ORDER")
    return found


def parse_review_date(value: str | None) -> datetime | None:
    match = re.fullmatch(r"\s*(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\s*", value or "")
    if not match:
        return None
    try:
        return datetime(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    except ValueError:
        return None


def review_dedupe_key(
    rating: int | None,
    review_text: str,
    option_name: str | None,
    reviewed_at: str | None,
    occurrence: int | None = None,
) -> str:
    parts = [
        "" if rating is None else str(rating),
        normalize_text(review_text),
        normalize_text(option_name),
        normalize_text(reviewed_at),
    ]
    if occurrence is not None:
        parts.append(str(occurrence))
    payload = " | ".join(parts)
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _fragment_identity(fragment: Mapping[str, Any]) -> tuple[str, str, str | None]:
    product = fragment.get("product")
    if not isinstance(product, Mapping):
        raise CaptureError("VALIDATION_FAILED", "수집 조각에 product가 없습니다.")
    product_id = str(product.get("product_id") or "")
    item_id = str(product.get("item_id") or "")
    vendor = product.get("vendor_item_id")
    vendor_id = str(vendor) if vendor not in (None, "") else None
    if not product_id.isdigit() or not item_id.isdigit() or (vendor_id and not vendor_id.isdigit()):
        raise CaptureError("VALIDATION_FAILED", "수집 조각의 상품 ID 형식이 잘못됐습니다.")
    return product_id, item_id, vendor_id


def assert_same_product(
    requested: Mapping[str, Any], fragments: Iterable[Mapping[str, Any]]
) -> tuple[str, str, str | None]:
    expected_product = str(requested.get("product_id") or "")
    expected_item = str(requested.get("item_id") or "")
    expected_vendor_value = requested.get("vendor_item_id")
    expected_vendor = str(expected_vendor_value) if expected_vendor_value not in (None, "") else None
    observed_vendors: set[str] = set()
    for fragment in fragments:
        product_id, item_id, vendor_id = _fragment_identity(fragment)
        if product_id != expected_product or item_id != expected_item:
            raise CaptureError("PRODUCT_MISMATCH", "productId 또는 itemId가 입력 URL과 다릅니다.")
        if vendor_id:
            observed_vendors.add(vendor_id)
        if expected_vendor and vendor_id != expected_vendor:
            raise CaptureError("PRODUCT_MISMATCH", "vendorItemId가 입력 URL과 다릅니다.")
    if len(observed_vendors) > 1:
        raise CaptureError("PRODUCT_MISMATCH", "수집 조각의 vendorItemId가 서로 다릅니다.")
    return expected_product, expected_item, expected_vendor or (next(iter(observed_vendors)) if observed_vendors else None)


def skipped_section(kind: str) -> dict[str, Any]:
    if kind == "reviews":
        return {
            "status": "SKIPPED",
            "scope": {
                "requested_max_pages": 1,
                "requested_max_reviews": 1,
                "pages_observed": 0,
                "reviews_observed": 0,
                "complete_all_reviews": False,
            },
            "items": [],
            "diagnostics": {"stop_reason": "NOT_REQUESTED"},
        }
    return {"status": "SKIPPED", "assets": [], "diagnostics": {"stop_reason": "NOT_REQUESTED"}}


def assemble_capture(
    fragments: Mapping[str, Mapping[str, Any]],
    *,
    requested_url: str,
    final_url: str | None,
    method: str,
) -> dict[str, Any]:
    requested = parse_product_identity(requested_url)
    present = [fragment for fragment in fragments.values() if fragment]
    _, _, vendor_id = assert_same_product(requested, present)
    titles = [
        normalize_text(str(fragment.get("product", {}).get("title") or ""))
        for fragment in present
        if isinstance(fragment.get("product"), Mapping)
    ]
    sections = {
        "thumbnails": dict(fragments.get("thumbnails") or skipped_section("thumbnails")),
        "detail": dict(fragments.get("detail") or skipped_section("detail")),
        "reviews": dict(fragments.get("reviews") or skipped_section("reviews")),
    }
    statuses = [str(section.get("status") or "") for section in sections.values()]
    if any(status in {"ACCESS_BLOCKED", "LOGIN_REQUIRED"} for status in statuses):
        top_status = "ACCESS_BLOCKED"
    elif all(status in {"READY", "SKIPPED"} for status in statuses):
        top_status = "READY"
    else:
        top_status = "PARTIAL"
    normalized_url = requested["normalized_url"]
    if vendor_id and not requested.get("vendor_item_id"):
        normalized_url += ("&" if "?" in normalized_url else "?") + urlencode({"vendorItemId": vendor_id})
    product = {
        **requested,
        "final_url": final_url,
        "normalized_url": normalized_url,
        "vendor_item_id": vendor_id,
        "title": next((title for title in titles if title), None),
    }
    return {
        "schema_version": SCHEMA_VERSION,
        "artifact_type": ARTIFACT_TYPE,
        "capture_id": str(uuid.uuid4()),
        "captured_at": utc_now(),
        "status": top_status,
        "collector": {"method": method, "version": COLLECTOR_VERSION},
        "product": product,
        **sections,
        "rights": {
            "scope": "research_reference_only",
            "production_use_allowed": False,
            "reviewer_identity_stored": False,
        },
        "files_manifest": [],
    }


def _walk_keys(value: Any, path: str = "$") -> Iterable[tuple[str, str]]:
    if isinstance(value, Mapping):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            yield str(key), child_path
            yield from _walk_keys(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _walk_keys(child, f"{path}[{index}]")


def _verify_file(base_dir: Path, entry: Mapping[str, Any], errors: list[str], path: str) -> None:
    rel = entry.get("path")
    if not isinstance(rel, str) or not rel or Path(rel).is_absolute():
        errors.append(f"{path}: 파일 상대 경로가 잘못됐습니다.")
        return
    base = base_dir.resolve()
    target = (base / rel).resolve()
    try:
        common = Path(os.path.commonpath([str(base), str(target)]))
    except ValueError:
        errors.append(f"{path}: 파일 경로가 번들 밖입니다.")
        return
    if common != base or not target.is_file():
        errors.append(f"{path}: 파일이 없거나 번들 밖입니다: {rel}")
        return
    data = target.read_bytes()
    expected_bytes = entry.get("bytes")
    expected_hash = entry.get("sha256")
    if expected_bytes != len(data):
        errors.append(f"{path}: bytes 불일치: {rel}")
    actual = hashlib.sha256(data).hexdigest()
    if expected_hash != actual:
        errors.append(f"{path}: SHA-256 불일치: {rel}")


def validate_capture(
    capture: Mapping[str, Any], *, base_dir: Path | None = None, verify_files: bool = False
) -> list[str]:
    errors: list[str] = []
    if capture.get("schema_version") != SCHEMA_VERSION:
        errors.append("$.schema_version: 1.0이어야 합니다.")
    if capture.get("artifact_type") != ARTIFACT_TYPE:
        errors.append("$.artifact_type: 지원하지 않는 artifact입니다.")
    if capture.get("status") not in TOP_LEVEL_STATUSES:
        errors.append("$.status: 지원하지 않는 전체 상태입니다.")
    try:
        datetime.fromisoformat(str(capture.get("captured_at", "")).replace("Z", "+00:00"))
    except ValueError:
        errors.append("$.captured_at: ISO-8601 시간이 아닙니다.")
    product = capture.get("product")
    if not isinstance(product, Mapping):
        errors.append("$.product: 객체가 필요합니다.")
    else:
        try:
            parsed = parse_product_identity(str(product.get("normalized_url") or ""))
            if parsed["product_id"] != str(product.get("product_id") or ""):
                errors.append("$.product.product_id: normalized_url과 다릅니다.")
            if parsed["item_id"] != str(product.get("item_id") or ""):
                errors.append("$.product.item_id: normalized_url과 다릅니다.")
            stored_vendor = product.get("vendor_item_id")
            if parsed["vendor_item_id"] != (str(stored_vendor) if stored_vendor not in (None, "") else None):
                errors.append("$.product.vendor_item_id: normalized_url과 다릅니다.")
        except CaptureError as exc:
            errors.append(f"$.product.normalized_url: {exc}")
    rights = capture.get("rights")
    if not isinstance(rights, Mapping):
        errors.append("$.rights: 객체가 필요합니다.")
    else:
        if rights.get("scope") != "research_reference_only":
            errors.append("$.rights.scope: research_reference_only여야 합니다.")
        if rights.get("production_use_allowed") is not False:
            errors.append("$.rights.production_use_allowed: false여야 합니다.")
        if rights.get("reviewer_identity_stored") is not False:
            errors.append("$.rights.reviewer_identity_stored: false여야 합니다.")

    for section_name in ("thumbnails", "detail"):
        section = capture.get(section_name)
        if not isinstance(section, Mapping):
            errors.append(f"$.{section_name}: 객체가 필요합니다.")
            continue
        if section.get("status") not in SECTION_STATUSES:
            errors.append(f"$.{section_name}.status: 지원하지 않는 상태입니다.")
        assets = section.get("assets")
        if not isinstance(assets, list):
            errors.append(f"$.{section_name}.assets: 배열이 필요합니다.")
            continue
        orders: list[int] = []
        for index, asset in enumerate(assets):
            item_path = f"$.{section_name}.assets[{index}]"
            if not isinstance(asset, Mapping):
                errors.append(f"{item_path}: 객체가 필요합니다.")
                continue
            order = asset.get("order")
            if isinstance(order, int):
                orders.append(order)
            else:
                errors.append(f"{item_path}.order: 정수가 필요합니다.")
            if not is_allowed_cdn_url(str(asset.get("source_asset_url") or "")):
                errors.append(f"{item_path}.source_asset_url: 허용되지 않은 CDN URL입니다.")
            file_entry = asset.get("file")
            if verify_files and isinstance(file_entry, Mapping):
                if base_dir is None:
                    errors.append(f"{item_path}.file: base_dir가 필요합니다.")
                else:
                    _verify_file(base_dir, file_entry, errors, f"{item_path}.file")
        if orders != list(range(1, len(orders) + 1)):
            errors.append(f"$.{section_name}.assets: order가 1부터 연속이어야 합니다.")

    reviews = capture.get("reviews")
    if not isinstance(reviews, Mapping):
        errors.append("$.reviews: 객체가 필요합니다.")
    else:
        if reviews.get("status") not in SECTION_STATUSES:
            errors.append("$.reviews.status: 지원하지 않는 상태입니다.")
        scope = reviews.get("scope")
        if not isinstance(scope, Mapping) or scope.get("complete_all_reviews") is not False:
            errors.append("$.reviews.scope.complete_all_reviews: false여야 합니다.")
        occurrence_strategy = (
            isinstance(scope, Mapping)
            and scope.get("sampling_strategy") == "latest_minimum_plus_rating_stratified_supplement"
        )
        items = reviews.get("items")
        if not isinstance(items, list):
            errors.append("$.reviews.items: 배열이 필요합니다.")
        else:
            if len(items) > 300:
                errors.append("$.reviews.items: 하드 상한 300개를 넘었습니다.")
            seen_keys: set[str] = set()
            observed_rating_counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
            latest_rating_counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
            supplement_rating_counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
            latest_count = 0
            supplement_count = 0
            supplement_started = False
            for index, item in enumerate(items):
                item_path = f"$.reviews.items[{index}]"
                if not isinstance(item, Mapping):
                    errors.append(f"{item_path}: 객체가 필요합니다.")
                    continue
                for key, key_path in _walk_keys(item, item_path):
                    if key.lower() in FORBIDDEN_REVIEW_KEYS:
                        errors.append(f"{key_path}: 후기 작성자/원본 식별 필드는 금지됩니다.")
                rating = item.get("rating")
                if rating is not None and (not isinstance(rating, int) or not 1 <= rating <= 5):
                    errors.append(f"{item_path}.rating: 1~5 또는 null이어야 합니다.")
                if isinstance(rating, int) and 1 <= rating <= 5:
                    observed_rating_counts[rating] += 1
                sample_group = item.get("sample_group")
                if sample_group == "latest_baseline":
                    latest_count += 1
                    if supplement_started:
                        errors.append(f"{item_path}.sample_group: 최신 표본은 보강 표본보다 먼저 와야 합니다.")
                    if isinstance(rating, int) and 1 <= rating <= 5:
                        latest_rating_counts[rating] += 1
                elif sample_group == "rating_stratified_supplement":
                    supplement_started = True
                    supplement_count += 1
                    if isinstance(rating, int) and 1 <= rating <= 5:
                        supplement_rating_counts[rating] += 1
                rating_filter = item.get("rating_filter")
                if rating_filter is not None and rating_filter != rating:
                    errors.append(f"{item_path}.rating_filter: 카드 별점과 달라서는 안 됩니다.")
                review_text = item.get("review_text")
                if not isinstance(review_text, str) or not review_text or len(review_text) > 10000:
                    errors.append(f"{item_path}.review_text: 1~10000자 문자열이어야 합니다.")
                    continue
                sensitive = sensitive_patterns(review_text)
                if sensitive:
                    errors.append(f"{item_path}.review_text: 미마스킹 개인정보 패턴 {','.join(sensitive)}")
                content_key = review_dedupe_key(
                    rating,
                    review_text,
                    item.get("option_name") if isinstance(item.get("option_name"), str) else None,
                    item.get("reviewed_at") if isinstance(item.get("reviewed_at"), str) else None,
                )
                occurrence = item.get("dedupe_occurrence")
                if occurrence_strategy:
                    if item.get("content_key") != content_key:
                        errors.append(f"{item_path}.content_key: 정규화 본문 SHA-256과 다릅니다.")
                    if not isinstance(occurrence, int) or occurrence < 1:
                        errors.append(f"{item_path}.dedupe_occurrence: 1 이상 정수가 필요합니다.")
                        occurrence = None
                    expected_key = review_dedupe_key(
                        rating,
                        review_text,
                        item.get("option_name") if isinstance(item.get("option_name"), str) else None,
                        item.get("reviewed_at") if isinstance(item.get("reviewed_at"), str) else None,
                        occurrence,
                    )
                else:
                    expected_key = content_key
                if item.get("dedupe_key") != expected_key:
                    errors.append(f"{item_path}.dedupe_key: 정규화 SHA-256과 다릅니다.")
                if expected_key in seen_keys:
                    errors.append(f"{item_path}.dedupe_key: 중복 후기입니다.")
                seen_keys.add(expected_key)
            if isinstance(scope, Mapping) and scope.get("reviews_observed") != len(items):
                errors.append("$.reviews.scope.reviews_observed: items 길이와 다릅니다.")
            if isinstance(scope, Mapping) and scope.get("sampling_strategy") == "rating_stratified_low_1_2_to_high_4_5":
                low_count = observed_rating_counts[1] + observed_rating_counts[2]
                high_count = observed_rating_counts[4] + observed_rating_counts[5]
                neutral_count = observed_rating_counts[3]
                if scope.get("target_low_high_ratio") != "2:1":
                    errors.append("$.reviews.scope.target_low_high_ratio: 2:1이어야 합니다.")
                for key, actual in (
                    ("observed_low_count", low_count),
                    ("observed_high_count", high_count),
                    ("observed_neutral_count", neutral_count),
                ):
                    if scope.get(key) != actual:
                        errors.append(f"$.reviews.scope.{key}: items 별점 집계와 다릅니다.")
                diagnostics = reviews.get("diagnostics")
                contract_met = isinstance(diagnostics, Mapping) and diagnostics.get("sampling_contract_met") is True
                requested_max = scope.get("requested_max_reviews")
                if contract_met and (
                    not isinstance(requested_max, int)
                    or len(items) != requested_max
                    or high_count <= 0
                    or low_count < high_count * 2
                    or neutral_count != 0
                ):
                    errors.append("$.reviews.diagnostics.sampling_contract_met: 실제 2:1 표본과 일치하지 않습니다.")
            elif isinstance(scope, Mapping) and scope.get("sampling_strategy") == "latest_minimum_plus_rating_stratified_supplement":
                requested_latest = scope.get("requested_latest_reviews")
                requested_supplement = scope.get("requested_supplement_reviews")
                requested_total = scope.get("requested_max_reviews")
                if not isinstance(requested_latest, int) or not 100 <= requested_latest <= 299:
                    errors.append("$.reviews.scope.requested_latest_reviews: 100~299 정수여야 합니다.")
                if not isinstance(requested_supplement, int) or not 1 <= requested_supplement <= 200:
                    errors.append("$.reviews.scope.requested_supplement_reviews: 1~200 정수여야 합니다.")
                if (
                    isinstance(requested_latest, int)
                    and isinstance(requested_supplement, int)
                    and requested_total != requested_latest + requested_supplement
                ):
                    errors.append("$.reviews.scope.requested_max_reviews: 최신+보강 목표와 다릅니다.")
                if isinstance(requested_total, int) and requested_total > 300:
                    errors.append("$.reviews.scope.requested_max_reviews: 하드 상한 300개를 넘었습니다.")
                if scope.get("latest_reviews_observed") != latest_count:
                    errors.append("$.reviews.scope.latest_reviews_observed: latest_baseline 수와 다릅니다.")
                if scope.get("supplement_reviews_observed") != supplement_count:
                    errors.append("$.reviews.scope.supplement_reviews_observed: 보강 표본 수와 다릅니다.")
                if scope.get("target_low_high_ratio") != "2:1":
                    errors.append("$.reviews.scope.target_low_high_ratio: 2:1이어야 합니다.")
                low_count = supplement_rating_counts[1] + supplement_rating_counts[2]
                high_count = supplement_rating_counts[4] + supplement_rating_counts[5]
                neutral_count = supplement_rating_counts[3]
                for key, actual in (
                    ("observed_low_count", low_count),
                    ("observed_high_count", high_count),
                    ("observed_neutral_count", neutral_count),
                ):
                    if scope.get(key) != actual:
                        errors.append(f"$.reviews.scope.{key}: 보강 표본 별점 집계와 다릅니다.")
                for index, item in enumerate(items):
                    if not isinstance(item, Mapping):
                        continue
                    group = item.get("sample_group")
                    if group not in {"latest_baseline", "rating_stratified_supplement"}:
                        errors.append(f"$.reviews.items[{index}].sample_group: 지원하지 않는 표본 그룹입니다.")
                    elif group == "latest_baseline" and item.get("rating_filter") is not None:
                        errors.append(f"$.reviews.items[{index}].rating_filter: 최신 표본에는 별점 필터가 없어야 합니다.")
                    elif group == "rating_stratified_supplement" and item.get("rating_filter") not in {1, 2, 4, 5}:
                        errors.append(f"$.reviews.items[{index}].rating_filter: 보강 표본은 1·2·4·5점 필터가 필요합니다.")
                previous_latest_date: datetime | None = None
                for index, item in enumerate(items):
                    if not isinstance(item, Mapping) or item.get("sample_group") != "latest_baseline":
                        continue
                    current_date = parse_review_date(item.get("reviewed_at") if isinstance(item.get("reviewed_at"), str) else None)
                    if current_date is None:
                        continue
                    if previous_latest_date is not None and current_date > previous_latest_date:
                        errors.append(f"$.reviews.items[{index}].reviewed_at: 최신 표본 날짜가 내림차순이 아닙니다.")
                        break
                    previous_latest_date = current_date
                diagnostics = reviews.get("diagnostics")
                if not isinstance(diagnostics, Mapping):
                    errors.append("$.reviews.diagnostics: 객체가 필요합니다.")
                else:
                    latest_observation = diagnostics.get("latest_observation")
                    latest_sort_confirmed = (
                        isinstance(latest_observation, Mapping)
                        and latest_observation.get("sort_status") == "LATEST_SORT_CONFIRMED"
                    )
                    latest_exhausted = (
                        isinstance(latest_observation, Mapping)
                        and latest_observation.get("supply_exhausted") is True
                    )
                    if latest_exhausted:
                        # 소진 여부는 브라우저에서만 관측되므로 재계산 대신 구조 정합성만 검사한다.
                        if isinstance(requested_latest, int) and latest_count >= requested_latest:
                            errors.append(
                                "$.reviews.diagnostics.latest_observation.supply_exhausted: 목표를 채웠으면 소진일 수 없습니다."
                            )
                            latest_exhausted = False
                        if latest_observation.get("stop_reason") not in REVIEW_EXHAUSTION_STOP_REASONS:
                            errors.append(
                                "$.reviews.diagnostics.latest_observation.supply_exhausted: 소진 stop_reason이 아닙니다."
                            )
                            latest_exhausted = False
                    actual_latest_met = (
                        isinstance(requested_latest, int)
                        and latest_sort_confirmed
                        and latest_count > 0
                        and (latest_count >= requested_latest or latest_exhausted)
                    )
                    if diagnostics.get("latest_minimum_met") is not actual_latest_met:
                        errors.append("$.reviews.diagnostics.latest_minimum_met: 최신 표본 수·정렬 확인과 다릅니다.")
                    low_target = None
                    high_target = None
                    if isinstance(requested_supplement, int):
                        low_target = (requested_supplement * 2 + 2) // 3
                        high_target = requested_supplement - low_target
                        if scope.get("target_low_count") != low_target:
                            errors.append("$.reviews.scope.target_low_count: 보강 저평점 목표와 다릅니다.")
                        if scope.get("target_high_count") != high_target:
                            errors.append("$.reviews.scope.target_high_count: 보강 고평점 목표와 다릅니다.")
                    bucket_observations = diagnostics.get("rating_filter_observations")
                    bucket_exhausted = isinstance(bucket_observations, list) and any(
                        isinstance(observation, Mapping)
                        and observation.get("supply_exhausted") is True
                        and observation.get("stop_reason") in REVIEW_EXHAUSTION_STOP_REASONS
                        for observation in bucket_observations
                    )
                    supplement_exhausted = diagnostics.get("supplement_supply_exhausted") is True
                    if supplement_exhausted:
                        if isinstance(requested_supplement, int) and supplement_count >= requested_supplement:
                            errors.append(
                                "$.reviews.diagnostics.supplement_supply_exhausted: 목표를 채웠으면 소진일 수 없습니다."
                            )
                            supplement_exhausted = False
                        if not bucket_exhausted:
                            errors.append(
                                "$.reviews.diagnostics.supplement_supply_exhausted: 소진된 별점 버킷 기록이 없습니다."
                            )
                            supplement_exhausted = False
                    exact_supplement = (
                        supplement_count == requested_supplement
                        and low_target is not None
                        and high_target is not None
                        and low_count == low_target
                        and high_count == high_target
                    )
                    actual_supplement_met = (
                        isinstance(requested_supplement, int)
                        and neutral_count == 0
                        and (exact_supplement or supplement_exhausted)
                    )
                    if diagnostics.get("supplement_contract_met") is not actual_supplement_met:
                        errors.append("$.reviews.diagnostics.supplement_contract_met: 실제 2:1 보강 표본과 다릅니다.")
                    if diagnostics.get("sampling_contract_met") is not (actual_latest_met and actual_supplement_met):
                        errors.append("$.reviews.diagnostics.sampling_contract_met: 최신 최소·2:1 보강 계약과 다릅니다.")

    if verify_files:
        manifest = capture.get("files_manifest")
        if not isinstance(manifest, list):
            errors.append("$.files_manifest: 배열이 필요합니다.")
        elif base_dir is not None:
            for index, entry in enumerate(manifest):
                if isinstance(entry, Mapping):
                    _verify_file(base_dir, entry, errors, f"$.files_manifest[{index}]")
                else:
                    errors.append(f"$.files_manifest[{index}]: 객체가 필요합니다.")
    return errors


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise CaptureError("VALIDATION_FAILED", f"JSON 루트가 객체가 아닙니다: {path}")
    return value


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False, dir=path.parent, newline="\n") as tmp:
        tmp.write(payload)
        temp_name = tmp.name
    os.replace(temp_name, path)
