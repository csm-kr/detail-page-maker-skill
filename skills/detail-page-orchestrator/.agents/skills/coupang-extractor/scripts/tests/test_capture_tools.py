from __future__ import annotations

import copy
import base64
import hashlib
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from build_bookmarklets import build_bookmarklets  # noqa: E402
from bundle_layout import default_output_path, prepare_staging, promote, write_bundle_views  # noqa: E402
from capture_tools import (  # noqa: E402
    CaptureError,
    assemble_capture,
    parse_product_identity,
    redact_review_text,
    review_dedupe_key,
    validate_capture,
)
from download_assets import sniff_image_extension  # noqa: E402
from hash_artifacts import hash_tree  # noqa: E402
from run_capture import _browser_program  # noqa: E402


URL = "https://www.coupang.com/vp/products/123?itemId=456&vendorItemId=789"


def fragments() -> dict:
    product = {
        "final_url": URL,
        "product_id": "123",
        "item_id": "456",
        "vendor_item_id": "789",
        "title": "합성 테스트 상품",
    }
    text = "착용감이 편했습니다."
    review = {
        "position": 1,
        "rating": 4,
        "review_text": text,
        "option_name": "블랙 / M",
        "reviewed_at": "2026.07.01",
        "helpful_count": 2,
        "source_page": 1,
        "dedupe_key": review_dedupe_key(4, text, "블랙 / M", "2026.07.01"),
        "media_count": 0,
    }
    return {
        "thumbnails": {
            "fragment_type": "thumbnails",
            "product": dict(product),
            "status": "READY",
            "assets": [
                {
                    "order": 1,
                    "source_asset_url": "https://thumbnail.coupangcdn.com/thumbnails/a.jpg",
                    "status": "READY",
                }
            ],
            "diagnostics": {"stop_reason": "NO_MORE_ITEMS"},
        },
        "detail": {
            "fragment_type": "detail",
            "product": dict(product),
            "status": "READY",
            "assets": [
                {
                    "order": 1,
                    "source_asset_url": "https://image1.coupangcdn.com/image/vendor_inventory/b.jpg",
                    "status": "READY",
                }
            ],
            "diagnostics": {"stop_reason": "HEIGHT_AND_ASSETS_STABLE"},
        },
        "reviews": {
            "fragment_type": "reviews",
            "product": dict(product),
            "status": "READY",
            "scope": {
                "requested_max_pages": 10,
                "requested_max_reviews": 100,
                "pages_observed": 1,
                "reviews_observed": 1,
                "complete_all_reviews": False,
            },
            "items": [review],
            "diagnostics": {"stop_reason": "NO_NEXT_PAGE"},
        },
    }


class ProductIdentityTests(unittest.TestCase):
    def test_normalizes_tracking_parameters(self) -> None:
        value = parse_product_identity(
            "https://www.coupang.com/vp/products/123?vendorItemId=789&itemId=456&sourceType=srp_product_ads"
        )
        self.assertEqual(value["normalized_url"], URL)

    def test_rejects_lookalike_host_and_missing_item(self) -> None:
        with self.assertRaises(CaptureError):
            parse_product_identity("https://coupang.com.evil.test/vp/products/123?itemId=456")
        with self.assertRaises(CaptureError):
            parse_product_identity("https://www.coupang.com/vp/products/123")

    def test_product_mismatch_stops_merge(self) -> None:
        parts = fragments()
        parts["detail"]["product"]["item_id"] = "999"
        with self.assertRaises(CaptureError) as caught:
            assemble_capture(parts, requested_url=URL, final_url=URL, method="bookmarklet")
        self.assertEqual(caught.exception.code, "PRODUCT_MISMATCH")


class PrivacyAndValidationTests(unittest.TestCase):
    def test_redacts_email_phone_and_order(self) -> None:
        redacted, count = redact_review_text(
            "문의 me@example.com, 010-1234-5678, 주문번호 ABCD-12345"
        )
        self.assertEqual(count, 3)
        self.assertNotIn("me@example.com", redacted)
        self.assertNotIn("010-1234-5678", redacted)
        self.assertNotIn("ABCD-12345", redacted)

    def test_valid_capture_and_forbidden_reviewer_field(self) -> None:
        capture = assemble_capture(fragments(), requested_url=URL, final_url=URL, method="bookmarklet")
        self.assertEqual(validate_capture(capture), [])
        invalid = copy.deepcopy(capture)
        invalid["reviews"]["items"][0]["author_name"] = "저장 금지"
        errors = validate_capture(invalid)
        self.assertTrue(any("작성자" in error for error in errors))

    def test_validates_low_rating_two_to_one_sampling_contract(self) -> None:
        parts = fragments()
        reviews = []
        for position, rating in enumerate((1, 2, 4), start=1):
            text = f"rating-{rating}-review"
            reviews.append(
                {
                    "position": position,
                    "rating": rating,
                    "rating_filter": rating,
                    "review_text": text,
                    "option_name": None,
                    "reviewed_at": "2026.07.01",
                    "helpful_count": 0,
                    "source_page": position,
                    "dedupe_key": review_dedupe_key(rating, text, None, "2026.07.01"),
                    "media_count": 0,
                }
            )
        parts["reviews"]["items"] = reviews
        parts["reviews"]["scope"].update(
            {
                "requested_max_reviews": 3,
                "pages_observed": 3,
                "reviews_observed": 3,
                "sampling_strategy": "rating_stratified_low_1_2_to_high_4_5",
                "target_low_high_ratio": "2:1",
                "observed_low_count": 2,
                "observed_high_count": 1,
                "observed_neutral_count": 0,
                "observed_low_high_ratio": 2.0,
            }
        )
        parts["reviews"]["diagnostics"] = {
            "stop_reason": "MAX_REVIEWS_REACHED",
            "sampling_contract_met": True,
        }
        capture = assemble_capture(parts, requested_url=URL, final_url=URL, method="bookmarklet")
        self.assertEqual(validate_capture(capture), [])

        invalid = copy.deepcopy(capture)
        invalid["reviews"]["scope"]["observed_low_count"] = 1
        errors = validate_capture(invalid)
        self.assertTrue(any("observed_low_count" in error for error in errors))

    def test_validates_latest_minimum_plus_two_to_one_supplement(self) -> None:
        parts = fragments()
        reviews = []
        for position in range(1, 101):
            rating = 5 if position % 3 else 3
            text = f"latest-review-{position}"
            reviews.append(
                {
                    "position": position,
                    "sample_group": "latest_baseline",
                    "rating": rating,
                    "review_text": text,
                    "option_name": None,
                    "reviewed_at": "2026.07.21",
                    "helpful_count": 0,
                    "source_page": (position - 1) // 10 + 1,
                    "content_key": review_dedupe_key(rating, text, None, "2026.07.21"),
                    "dedupe_occurrence": 1,
                    "dedupe_key": review_dedupe_key(rating, text, None, "2026.07.21", 1),
                    "media_count": 0,
                }
            )
        for rating in (1, 2, 4):
            position = len(reviews) + 1
            text = f"supplement-review-{rating}"
            reviews.append(
                {
                    "position": position,
                    "sample_group": "rating_stratified_supplement",
                    "rating": rating,
                    "rating_filter": rating,
                    "review_text": text,
                    "option_name": None,
                    "reviewed_at": "2026.06.01",
                    "helpful_count": 0,
                    "source_page": 1,
                    "content_key": review_dedupe_key(rating, text, None, "2026.06.01"),
                    "dedupe_occurrence": 1,
                    "dedupe_key": review_dedupe_key(rating, text, None, "2026.06.01", 1),
                    "media_count": 0,
                }
            )
        parts["reviews"]["items"] = reviews
        parts["reviews"]["scope"] = {
            "requested_max_pages": 36,
            "requested_latest_max_pages": 12,
            "requested_supplement_max_pages": 24,
            "requested_max_reviews": 103,
            "requested_latest_reviews": 100,
            "requested_supplement_reviews": 3,
            "pages_observed": 13,
            "reviews_observed": 103,
            "latest_reviews_observed": 100,
            "supplement_reviews_observed": 3,
            "complete_all_reviews": False,
            "sampling_strategy": "latest_minimum_plus_rating_stratified_supplement",
            "target_low_high_ratio": "2:1",
            "target_low_count": 2,
            "target_high_count": 1,
            "observed_low_count": 2,
            "observed_high_count": 1,
            "observed_neutral_count": 0,
            "observed_low_high_ratio": 2.0,
        }
        parts["reviews"]["diagnostics"] = {
            "latest_observation": {"sort_status": "LATEST_SORT_CONFIRMED"},
            "latest_minimum_met": True,
            "supplement_contract_met": True,
            "sampling_contract_met": True,
            "stop_reason": "LATEST_AND_SUPPLEMENT_TARGETS_REACHED",
        }
        capture = assemble_capture(parts, requested_url=URL, final_url=URL, method="bookmarklet")
        self.assertEqual(validate_capture(capture), [])

        duplicate_content = copy.deepcopy(capture)
        first = duplicate_content["reviews"]["items"][0]
        second = duplicate_content["reviews"]["items"][1]
        for key in ("rating", "review_text", "option_name", "reviewed_at", "content_key"):
            second[key] = first[key]
        second["dedupe_occurrence"] = 2
        second["dedupe_key"] = review_dedupe_key(
            second["rating"], second["review_text"], second["option_name"], second["reviewed_at"], 2
        )
        self.assertEqual(validate_capture(duplicate_content), [])

        invalid = copy.deepcopy(capture)
        invalid["reviews"]["items"].pop(99)
        invalid["reviews"]["scope"]["latest_reviews_observed"] = 99
        invalid["reviews"]["scope"]["reviews_observed"] = 102
        errors = validate_capture(invalid)
        self.assertTrue(any("latest_minimum_met" in error for error in errors))

    def test_file_hash_verification(self) -> None:
        capture = assemble_capture(fragments(), requested_url=URL, final_url=URL, method="bookmarklet")
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            target = base / "detail" / "detail-001.jpg"
            target.parent.mkdir()
            target.write_bytes(b"sample-image-bytes")
            entry = {
                "path": "detail/detail-001.jpg",
                "bytes": target.stat().st_size,
                "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
            }
            capture["detail"]["assets"][0]["file"] = dict(entry)
            capture["files_manifest"] = [dict(entry)]
            self.assertEqual(validate_capture(capture, base_dir=base, verify_files=True), [])
            target.write_bytes(b"changed")
            errors = validate_capture(capture, base_dir=base, verify_files=True)
            self.assertTrue(any("SHA-256" in error for error in errors))


class ScriptTests(unittest.TestCase):
    def test_image_signature_detection(self) -> None:
        self.assertEqual(sniff_image_extension(b"\xff\xd8\xffmore"), ".jpg")
        self.assertEqual(sniff_image_extension(b"\x89PNG\r\n\x1a\nmore"), ".png")
        self.assertIsNone(sniff_image_extension(b"<html>blocked</html>"))

    def test_builds_three_bookmarklets(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            manifest = build_bookmarklets(output)
            self.assertEqual({entry["kind"] for entry in manifest["entries"]}, {"thumbnail", "detail", "reviews"})
            self.assertTrue((output / "coupang-bookmarklets.html").is_file())
            for kind in ("thumbnail", "detail", "reviews"):
                href = (output / f"coupang-{kind}-bookmarklet.txt").read_text(encoding="utf-8")
                self.assertTrue(href.startswith("javascript:"))

    def test_hash_tree_excludes_its_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / "capture.json").write_text(json.dumps({"ok": True}), encoding="utf-8")
            output = base / "artifact-hashes.json"
            result = hash_tree(base, output)
            self.assertEqual([entry["path"] for entry in result["files"]], ["capture.json"])

    def test_browser_program_is_ascii_safe_and_polls_background_jobs(self) -> None:
        program = _browser_program(URL, {"thumbnails", "detail", "reviews"}, 2, 4, 100, 3, "test-recording")
        self.assertTrue(program.isascii())
        self.assertIn("__coupangExtractorJobs", program)
        self.assertIn("base64.b64decode", program)
        self.assertIn("start_recording", program)
        decoded = "\n".join(
            base64.b64decode(value).decode("utf-8")
            for value in re.findall(r"base64\.b64decode\('([^']+)'\)", program)
        )
        self.assertIn('"latestReviews":100', decoded)

    def test_writes_dmk_style_tests_bundle_views(self) -> None:
        capture = assemble_capture(fragments(), requested_url=URL, final_url=URL, method="bookmarklet")
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            output = default_output_path(workspace, capture["product"])
            resolved, staging = prepare_staging(output)
            validation = {"status": "VALID", "verified_files": False, "error_count": 0, "errors": []}
            write_bundle_views(
                staging,
                capture,
                runner_diagnostics={"status": "TEST"},
                validation=validation,
            )
            promote(staging, resolved)
            self.assertTrue((resolved / "manifest.json").is_file())
            self.assertTrue((resolved / "page.json").is_file())
            self.assertTrue((resolved / "reviews" / "reviews.json").is_file())
            self.assertTrue((resolved / "evidence" / "validation.json").is_file())


if __name__ == "__main__":
    unittest.main()
