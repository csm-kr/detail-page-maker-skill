#!/usr/bin/env python3
"""도매꾹 상품 페이지를 HTTP로 직접 받아 썸네일·판매자 상세설명·공개 후기를 수집한다.

판매자 상세설명은 최초 응답의 `<textarea id="contentsBuffer">`에 통째로 들어 있고
`상품상세 더보기`는 CSS max-height 토글일 뿐이라 브라우저 없이 전량 회수할 수 있다.
"""

from __future__ import annotations

import gzip
import hashlib
import html as html_module
import json
import re
import time
import zlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
DEFAULT_PAGE_ENCODING = "cp949"
REVIEW_ENDPOINT = "https://www.domeggook.com/main/item/itemView/reviewAjax.php"
REVIEW_PAGE_SIZE = 10
REVIEW_REQUEST_INTERVAL_SECONDS = 0.4
MAX_REVIEW_PAGES = 200
# 도매꾹 판매자는 상세설명을 수십 장으로 잘라 올린다. 실측 상위 상품이 78장이라 상한을 넉넉히 둔다.
MAX_DETAIL_ASSETS = 300
MAX_ASSET_BYTES = 200 * 1024 * 1024
REQUEST_TIMEOUT_SECONDS = 40

# 판매자 업로드 이미지는 cdn1.domeggook.com/upload/ 아래에 있고, 사이트 UI 자산만 /image/ 아래에 있다.
SITE_UI_IMAGE = re.compile(r"^https?://cdn1\.domeggook\.com/image/", re.I)
BLOCK_MARKERS = ("자동입력 방지", "접근이 제한", "비정상적인 접근", "로그인이 필요", "access denied", "captcha")
SCORE_MAP = {"A": 5, "B": 4, "C": 3, "D": 2, "E": 1}
IMAGE_SIGNATURES = (
    (b"\xff\xd8\xff", ".jpg"),
    (b"\x89PNG\r\n\x1a\n", ".png"),
    (b"GIF87a", ".gif"),
    (b"GIF89a", ".gif"),
)


class DmkFetchError(Exception):
    """수집 실패를 상태 코드와 함께 전달한다."""

    code = "CAPTURE_VALIDATION_FAILED"

    def __init__(self, message: str, code: str | None = None) -> None:
        super().__init__(f"{code or self.code}: {message}")
        if code:
            self.code = code


class PageBlockedError(DmkFetchError):
    code = "PAGE_BLOCKED"


class PageFetchError(DmkFetchError):
    code = "PAGE_FETCH_FAILED"


class NotProductDetailError(DmkFetchError):
    code = "NOT_PRODUCT_DETAIL"


class ThumbnailNotFoundError(DmkFetchError):
    code = "THUMBNAIL_NOT_FOUND"


class DetailBufferNotFoundError(DmkFetchError):
    code = "DETAIL_BUFFER_NOT_FOUND"


class DetailAssetNotFoundError(DmkFetchError):
    code = "DETAIL_ASSET_NOT_FOUND"


class AssetDownloadError(DmkFetchError):
    code = "ASSET_DOWNLOAD_FAILED"


class ReviewFetchError(DmkFetchError):
    code = "REVIEW_FETCH_FAILED"


class ReviewScopeError(DmkFetchError):
    code = "REVIEW_FETCH_FAILED"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


# --------------------------------------------------------------------------- 파싱


def decode_page(raw: bytes, charset: str | None = None) -> str:
    """도매꾹 상품 페이지는 euc-kr로 내려온다. utf-8로 읽으면 한글이 전부 깨진다."""
    encoding = (charset or "").strip().casefold()
    if encoding in {"", "euc-kr", "euckr", "ks_c_5601-1987", "ksc5601"}:
        encoding = DEFAULT_PAGE_ENCODING
    try:
        return raw.decode(encoding, errors="replace")
    except LookupError:
        return raw.decode(DEFAULT_PAGE_ENCODING, errors="replace")


def detect_block(html: str) -> str | None:
    lowered = html.casefold()
    for marker in BLOCK_MARKERS:
        if marker.casefold() in lowered:
            return marker
    return None


def extract_detail_html(html: str) -> str | None:
    """판매자 상세설명 원문이 담긴 숨은 textarea를 꺼내 엔티티를 되돌린다."""
    match = re.search(
        r'<textarea[^>]*\bid=["\']contentsBuffer["\'][^>]*>(.*?)</textarea>',
        html,
        re.S | re.I,
    )
    return html_module.unescape(match.group(1)) if match else None


def is_product_detail(html: str, product_id: str) -> bool:
    if not re.search(rf'\bvar\s+itemNo\s*=\s*["\']{re.escape(product_id)}["\']', html):
        return False
    return extract_detail_html(html) is not None


def find_thumbnail_url(html: str) -> str | None:
    tag = re.search(r'<img[^>]*\bid=["\']lThumbImg["\'][^>]*>', html, re.I)
    if not tag:
        return None
    src = re.search(r'\ssrc\s*=\s*["\']([^"\']+)["\']', tag.group(0), re.I)
    return html_module.unescape(src.group(1)).strip() if src else None


def _image_src(tag: str) -> str | None:
    for attribute in ("data-src", "data-original", "data-lazy", "src"):
        found = re.search(rf'\s{re.escape(attribute)}\s*=\s*["\']([^"\']+)["\']', tag, re.I)
        if found:
            return found.group(1).strip()
    return None


def extract_detail_image_urls(detail_html: str) -> list[str]:
    """판매자 상세설명 안의 이미지 원본 URL을 DOM 순서 그대로 모은다."""
    urls: list[str] = []
    seen: set[str] = set()
    for tag in re.finditer(r"<img\b[^>]*>", detail_html or "", re.I):
        raw = _image_src(tag.group(0))
        if not raw:
            continue
        url = html_module.unescape(raw).strip()
        if url.startswith("//"):
            url = f"https:{url}"
        if not re.match(r"^https?://", url, re.I) or SITE_UI_IMAGE.match(url):
            continue
        if url not in seen:
            seen.add(url)
            urls.append(url)
    return urls


def parse_visible_review_count(html: str) -> int:
    """후기 총개수는 API가 주지 않고 서버가 페이지에 박아 둔다."""
    match = re.search(r'"mode"\s*:\s*"review"[^}]*"total"\s*:\s*(\d+)', html)
    if match:
        return int(match.group(1))
    match = re.search(r"Math\.ceil\((\d+)\s*/\s*10\)", html)
    return int(match.group(1)) if match else 0


def parse_product_name(html: str) -> str:
    match = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
    if not match:
        return ""
    title = html_module.unescape(re.sub(r"\s+", " ", match.group(1))).strip()
    return re.sub(r"\s*\|\s*돈버는 쇼핑 도매꾹\s*$", "", title).strip()


def parse_image_usage_notice(html: str) -> str | None:
    """`상세설명 이미지 사용여부`는 관찰값으로만 기록한다. 판매용 사용권 보증이 아니다.

    같은 문구가 JS 주석에도 있어 표기 전용 컨테이너를 앵커로 삼는다.
    """
    anchor = re.search(r'class=["\']lInfoViewImgUse["\']', html, re.I)
    if not anchor:
        return None
    for text in re.findall(r">([^<]+)<", html[anchor.end() : anchor.end() + 400]):
        cleaned = re.sub(r"\s+", " ", html_module.unescape(text)).strip()
        if cleaned:
            return cleaned
    return None


# --------------------------------------------------------------------------- 후기 정제


def map_score(value: Any) -> int:
    try:
        return SCORE_MAP[str(value).strip().upper()]
    except KeyError:
        raise ValueError(f"알 수 없는 별점 등급입니다: {value!r}") from None


def _review_image_urls(files: Any) -> list[str]:
    if not isinstance(files, (list, tuple)):
        return []
    urls = []
    for entry in files:
        if isinstance(entry, dict):
            url = entry.get("url_1000") or entry.get("url_660")
            if url:
                urls.append(str(url))
    return urls


def sanitize_reviews(
    rows: Sequence[dict[str, Any]],
    *,
    product_id: str,
    source_page_url: str,
    visible_review_count: int,
    requested_review_limit: int = 0,
) -> dict[str, Any]:
    """작성자 식별정보와 내부 후기번호를 버리고 계약이 요구하는 필드만 남긴다."""
    reviews = []
    for index, row in enumerate(rows, 1):
        reply = row.get("reply")
        reviews.append(
            {
                "evidence_id": index,
                "rating": map_score(row.get("score")),
                "body": str(row.get("review") or ""),
                "seller_reply": str(reply) if reply else None,
                "written_on": str(row.get("date") or ""),
                "is_premium": str(row.get("isPremium") or "f").strip().casefold() in {"t", "true", "1", "y"},
                "image_urls": _review_image_urls(row.get("files")),
            }
        )

    expected = visible_review_count if requested_review_limit == 0 else min(visible_review_count, requested_review_limit)
    if len(reviews) != expected:
        raise ReviewScopeError(
            f"후기 수집 수가 기대치와 다릅니다: 표시 {visible_review_count}, 기대 {expected}, 수집 {len(reviews)}"
        )

    distribution = {str(score): 0 for score in range(1, 6)}
    for review in reviews:
        distribution[str(review["rating"])] += 1
    average = round(sum(r["rating"] for r in reviews) / len(reviews), 1) if reviews else None

    return {
        "schema_version": "1.1",
        "product_id": product_id,
        "source_page_url": source_page_url,
        "scope": "public_purchase_reviews_recent_six_months",
        "visible_review_count": visible_review_count,
        "requested_review_limit": requested_review_limit,
        "captured_review_count": len(reviews),
        "complete": True,
        "author_identifiers_removed": True,
        "rating_summary": {"count": len(reviews), "average": average, "distribution": distribution},
        "reviews": reviews,
    }


# --------------------------------------------------------------------------- 이미지


def assemble_detail_page(sources: Sequence[Path], output: Path) -> tuple[int, int]:
    """상세 원본을 DOM 순서대로 세로 조립한다. 폭이 다르면 흰 배경에 중앙 정렬한다."""
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = None
    if not sources:
        raise ValueError("조립할 상세 원본이 없습니다.")

    frames = []
    for path in sources:
        with Image.open(path) as image:
            image.seek(0)  # 애니메이션 GIF는 첫 프레임을 대표 정지 이미지로 쓴다.
            frames.append(image.convert("RGB").copy())

    width = max(frame.width for frame in frames)
    height = sum(frame.height for frame in frames)
    canvas = Image.new("RGB", (width, height), (255, 255, 255))
    offset = 0
    for frame in frames:
        canvas.paste(frame, ((width - frame.width) // 2, offset))
        offset += frame.height
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, format="PNG", optimize=True)
    return width, height


def _extension_for(payload: bytes, url: str) -> str:
    for signature, suffix in IMAGE_SIGNATURES:
        if payload.startswith(signature):
            return suffix
    if payload[:4] == b"RIFF" and payload[8:12] == b"WEBP":
        return ".webp"
    suffix = Path(re.sub(r"[?#].*$", "", url)).suffix.casefold()
    return suffix if suffix in {".jpg", ".jpeg", ".png", ".gif", ".webp"} else ".bin"


# --------------------------------------------------------------------------- HTTP


class HttpSession:
    """요청 하나하나를 증거로 남기는 최소 HTTP 클라이언트."""

    def __init__(self, referer: str | None = None) -> None:
        self.referer = referer
        self.records: list[dict[str, Any]] = []

    def get(self, url: str, *, accept: str = "*/*") -> tuple[bytes, str, str]:
        headers = {
            "User-Agent": USER_AGENT,
            "Accept": accept,
            "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate",
        }
        if self.referer:
            headers["Referer"] = self.referer
        try:
            with urlopen(Request(url, headers=headers), timeout=REQUEST_TIMEOUT_SECONDS) as response:
                payload = response.read()
                encoding = (response.headers.get("Content-Encoding") or "").casefold()
                content_type = response.headers.get("Content-Type") or ""
                status = response.status
                final_url = response.geturl()
        except (HTTPError, URLError, OSError) as exc:
            self.records.append({"url": url, "method": "GET", "error": str(exc), "fetched_at": utc_now()})
            raise PageFetchError(f"요청 실패: {url}: {exc}") from exc

        if encoding == "gzip":
            payload = gzip.decompress(payload)
        elif encoding == "deflate":
            payload = zlib.decompress(payload, -zlib.MAX_WBITS)

        self.records.append(
            {
                "url": url,
                "method": "GET",
                "status": status,
                "final_url": final_url,
                "content_type": content_type,
                "size_bytes": len(payload),
                "sha256": sha256_bytes(payload),
                "fetched_at": utc_now(),
            }
        )
        return payload, content_type, final_url


def _charset_of(content_type: str) -> str | None:
    match = re.search(r"charset\s*=\s*([\w-]+)", content_type, re.I)
    return match.group(1) if match else None


# --------------------------------------------------------------------------- 수집


def _download_assets(session: HttpSession, urls: Sequence[str], assets_dir: Path) -> list[dict[str, Any]]:
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = None
    if len(urls) > MAX_DETAIL_ASSETS:
        raise DetailAssetNotFoundError(
            f"상세 원본이 안전 한도를 넘습니다: {len(urls)}개 > {MAX_DETAIL_ASSETS}개"
        )
    assets_dir.mkdir(parents=True, exist_ok=True)
    assets: list[dict[str, Any]] = []
    total = 0
    for order, url in enumerate(urls, 1):
        payload, content_type, _ = session.get(url, accept="image/avif,image/webp,image/*,*/*;q=0.8")
        total += len(payload)
        if total > MAX_ASSET_BYTES:
            raise AssetDownloadError(f"상세 원본 총량이 안전 한도를 넘습니다: {total:,}B")
        path = assets_dir / f"detail-{order:02d}{_extension_for(payload, url)}"
        path.write_bytes(payload)
        try:
            with Image.open(path) as image:
                image.load()
                size = (int(image.width), int(image.height))
        except Exception as exc:
            raise AssetDownloadError(f"상세 원본이 이미지가 아닙니다: {url}: {exc}") from exc
        assets.append(
            {
                "order": order,
                "source_url": url,
                "path": path.relative_to(assets_dir.parents[1]).as_posix(),
                "content_type": content_type,
                "size_bytes": len(payload),
                "natural_width_px": size[0],
                "natural_height_px": size[1],
            }
        )
    return assets


def _fetch_reviews(session: HttpSession, product_id: str, total: int, limit: int) -> list[dict[str, Any]]:
    if total <= 0:
        return []
    wanted = total if limit == 0 else min(total, limit)
    pages = min(-(-wanted // REVIEW_PAGE_SIZE), MAX_REVIEW_PAGES)
    rows: list[dict[str, Any]] = []
    for page in range(1, pages + 1):
        if page > 1:
            time.sleep(REVIEW_REQUEST_INTERVAL_SECONDS)
        url = (
            f"{REVIEW_ENDPOINT}?mode=review&itemNo={product_id}&total={total}"
            f"&sz={REVIEW_PAGE_SIZE}&pg={page}&nPg={page + 1}"
        )
        payload, content_type, _ = session.get(url, accept="application/json,*/*;q=0.8")
        try:
            parsed = json.loads(payload.decode(_charset_of(content_type) or DEFAULT_PAGE_ENCODING, errors="replace"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ReviewFetchError(f"후기 응답이 JSON이 아닙니다: pg={page}: {exc}") from exc
        if not isinstance(parsed, list):
            raise ReviewFetchError(f"후기 응답이 배열이 아닙니다: pg={page}")
        if not parsed:
            break
        rows.extend(parsed)
    return rows[:wanted] if limit else rows


def fetch_product(
    *,
    product_url: str,
    product_id: str,
    output_root: Path,
    review_limit: int = 0,
) -> dict[str, Any]:
    """상품 하나를 순차 수집해 출력 루트를 채우고 요약을 돌려준다."""
    output_root = Path(output_root)
    evidence_dir = output_root / "evidence" / "http"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    session = HttpSession(referer=product_url)
    captured_at = utc_now()

    payload, content_type, final_url = session.get(product_url, accept="text/html,application/xhtml+xml,*/*;q=0.8")
    (evidence_dir / "page.html").write_bytes(payload)
    html = decode_page(payload, _charset_of(content_type))

    blocked = detect_block(html)
    if blocked:
        raise PageBlockedError(f"접근이 차단된 화면입니다: {blocked!r}")
    if not is_product_detail(html, product_id):
        raise NotProductDetailError(f"상품번호 {product_id}의 실제 상품 상세가 아닙니다: {final_url}")

    thumbnail_url = find_thumbnail_url(html)
    if not thumbnail_url:
        raise ThumbnailNotFoundError("대표 갤러리 썸네일 원본을 확정하지 못했습니다.")

    detail_html = extract_detail_html(html)
    if detail_html is None:
        raise DetailBufferNotFoundError("판매자 상세설명 버퍼를 찾지 못했습니다.")
    detail_urls = extract_detail_image_urls(detail_html)
    if not detail_urls:
        raise DetailAssetNotFoundError("판매자 상세설명에서 이미지 원본을 찾지 못했습니다.")

    thumbnail_payload, thumbnail_type, _ = session.get(
        thumbnail_url, accept="image/avif,image/webp,image/*,*/*;q=0.8"
    )
    thumbnail_path = output_root / "thumbnail" / "thumbnail.png"
    thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = None
    try:
        with Image.open(_write_temp(thumbnail_path.parent, thumbnail_payload, thumbnail_url)) as image:
            image.seek(0)
            thumbnail = image.convert("RGB").copy()
    except Exception as exc:
        raise ThumbnailNotFoundError(f"썸네일 원본을 이미지로 읽지 못했습니다: {exc}") from exc
    thumbnail.save(thumbnail_path, format="PNG", optimize=True)
    _clear_temp(thumbnail_path.parent)

    assets = _download_assets(session, detail_urls, output_root / "detail" / "assets")
    detail_width, detail_height = assemble_detail_page(
        [output_root / asset["path"] for asset in assets], output_root / "detail" / "detail-page.png"
    )

    visible_review_count = parse_visible_review_count(html)
    rows = _fetch_reviews(session, product_id, visible_review_count, review_limit)
    reviews = sanitize_reviews(
        rows,
        product_id=product_id,
        source_page_url=final_url,
        visible_review_count=visible_review_count,
        requested_review_limit=review_limit,
    )
    _write_json(output_root / "reviews" / "reviews.json", reviews)

    page = {
        "schema_version": "1.1",
        "product_id": product_id,
        "requested_url": product_url,
        "final_url": final_url,
        "page_type": "product_detail",
        "opened_detail_page": True,
        "product_name": parse_product_name(html),
        "source_encoding": _charset_of(content_type) or DEFAULT_PAGE_ENCODING,
        "detail_source": "contentsBuffer",
        "capture_mode": "direct_http_fetch",
        "thumbnail_source": {
            "source_url": thumbnail_url,
            "content_type": thumbnail_type,
            "natural_width_px": thumbnail.width,
            "natural_height_px": thumbnail.height,
        },
        "detail_content_capture": {
            "assets": assets,
            "assembled_width_px": detail_width,
            "assembled_height_px": detail_height,
        },
        "review_capture": {
            "endpoint": REVIEW_ENDPOINT,
            "visible_review_count": visible_review_count,
            "captured_review_count": reviews["captured_review_count"],
            "requested_review_limit": review_limit,
            "complete": reviews["complete"],
        },
        "detail_image_usage_notice": parse_image_usage_notice(html),
        "http_evidence_dir": (evidence_dir.relative_to(output_root)).as_posix(),
        "captured_at": captured_at,
    }
    _write_json(output_root / "page.json", page)

    with (evidence_dir / "requests.jsonl").open("w", encoding="utf-8") as stream:
        for record in session.records:
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")

    return {
        "final_url": final_url,
        "captured_at": captured_at,
        "visible_review_count": visible_review_count,
        "captured_review_count": reviews["captured_review_count"],
        "review_complete": reviews["complete"],
        "detail_asset_count": len(assets),
        "http_evidence_dir": page["http_evidence_dir"],
        "request_count": len(session.records),
    }


def _write_temp(directory: Path, payload: bytes, url: str) -> Path:
    path = directory / f".thumbnail-source{_extension_for(payload, url)}"
    path.write_bytes(payload)
    return path


def _clear_temp(directory: Path) -> None:
    for path in directory.glob(".thumbnail-source*"):
        path.unlink(missing_ok=True)


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
