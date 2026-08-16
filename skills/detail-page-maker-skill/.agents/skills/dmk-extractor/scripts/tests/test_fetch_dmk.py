#!/usr/bin/env python3
"""fetch_dmk의 순수 파싱·정제 함수를 실제 응답 픽스처로 검증한다. 네트워크를 쓰지 않는다."""

from __future__ import annotations

import gzip
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fetch_dmk import (  # noqa: E402
    ReviewScopeError,
    assemble_detail_page,
    decode_page,
    detect_block,
    extract_detail_html,
    extract_detail_image_urls,
    find_thumbnail_url,
    is_product_detail,
    map_score,
    parse_image_usage_notice,
    parse_visible_review_count,
    sanitize_reviews,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures"

# 도매꾹 상세설명은 판매자가 올린 외부 CDN 이미지를 쓰고, 사이트 UI 이미지는 cdn1 고정 경로를 쓴다.
STICKY_TRAP = "28573280"  # 상세 이미지 1개, 후기 0건
INSOLE = "60851997"  # 상세 이미지 1개, 후기 9건


def load_page(product_id: str) -> str:
    raw = gzip.decompress((FIXTURES / f"item-{product_id}.html.gz").read_bytes())
    return decode_page(raw)


def load_reviews(product_id: str) -> list[dict]:
    return json.loads((FIXTURES / f"reviews-{product_id}.json").read_bytes().decode("cp949"))


class DecodeTest(unittest.TestCase):
    def test_euc_kr_페이지를_한글로_디코드한다(self):
        html = load_page(STICKY_TRAP)
        self.assertIn("해충끈끈이", html)
        self.assertIn("돈버는 쇼핑 도매꾹", html)
        self.assertNotIn("�", html[:200000])

    def test_utf8_디코드는_한글을_깨뜨린다는_전제를_고정한다(self):
        raw = gzip.decompress((FIXTURES / f"item-{STICKY_TRAP}.html.gz").read_bytes())
        self.assertNotIn("해충끈끈이", raw.decode("utf-8", errors="replace"))


class PageClassificationTest(unittest.TestCase):
    def test_실제_상품상세를_인식한다(self):
        self.assertTrue(is_product_detail(load_page(INSOLE), INSOLE))

    def test_다른_상품번호면_상세로_보지_않는다(self):
        self.assertFalse(is_product_detail(load_page(INSOLE), "99999999"))

    def test_빈_문서는_상세가_아니다(self):
        self.assertFalse(is_product_detail("<html></html>", INSOLE))

    def test_정상_페이지에는_차단신호가_없다(self):
        self.assertIsNone(detect_block(load_page(STICKY_TRAP)))

    def test_캡차_페이지를_차단으로_본다(self):
        self.assertIsNotNone(detect_block("<html>자동입력 방지문자를 입력하세요</html>"))

    def test_접근제한_페이지를_차단으로_본다(self):
        self.assertIsNotNone(detect_block("<html><body>Access Denied</body></html>"))


class ThumbnailTest(unittest.TestCase):
    def test_대표_썸네일_원본_URL을_찾는다(self):
        url = find_thumbnail_url(load_page(STICKY_TRAP))
        self.assertIsNotNone(url)
        self.assertIn("cdn1.domeggook.com/upload/item/", url)

    def test_HTML_엔티티를_풀어서_돌려준다(self):
        url = find_thumbnail_url('<img id="lThumbImg" src="https://x/y?a=1&amp;b=2" alt="상품 섬네일 이미지">')
        self.assertEqual(url, "https://x/y?a=1&b=2")

    def test_썸네일이_없으면_None이다(self):
        self.assertIsNone(find_thumbnail_url("<html><img src='https://x/z.png'></html>"))


class DetailExtractionTest(unittest.TestCase):
    def test_contentsBuffer에서_판매자_상세HTML을_꺼낸다(self):
        detail = extract_detail_html(load_page(STICKY_TRAP))
        self.assertIsNotNone(detail)
        self.assertIn("<img", detail)
        self.assertIn("sabangnet.co.kr", detail)

    def test_contentsBuffer가_없으면_None이다(self):
        self.assertIsNone(extract_detail_html("<html><body>없음</body></html>"))

    def test_상세_이미지_URL을_추출한다(self):
        urls = extract_detail_image_urls(extract_detail_html(load_page(STICKY_TRAP)))
        self.assertEqual(len(urls), 1)
        self.assertTrue(urls[0].startswith("https://images002.sabangnet.co.kr/"))

    def test_다른_상품도_상세_이미지를_추출한다(self):
        urls = extract_detail_image_urls(extract_detail_html(load_page(INSOLE)))
        self.assertEqual(len(urls), 1)
        self.assertIn("gi.esmplus.com", urls[0])

    def test_사이트_UI_이미지는_제외한다(self):
        detail = (
            '<div>'
            '<img src="https://cdn1.domeggook.com/image/item/view/ico_notice.png">'
            '<img src="https://cdn1.domeggook.com/image/mobile_v2/image/item/view/ico_beta.png">'
            '<img src="https://seller.example.com/a.jpg">'
            '</div>'
        )
        self.assertEqual(extract_detail_image_urls(detail), ["https://seller.example.com/a.jpg"])

    def test_DOM_순서를_보존한다(self):
        detail = (
            '<img src="https://s.example.com/3.jpg">'
            '<img src="https://s.example.com/1.jpg">'
            '<img src="https://s.example.com/2.jpg">'
        )
        self.assertEqual(
            extract_detail_image_urls(detail),
            ["https://s.example.com/3.jpg", "https://s.example.com/1.jpg", "https://s.example.com/2.jpg"],
        )

    def test_data_src_지연로딩_속성도_읽는다(self):
        detail = '<img data-src="https://s.example.com/lazy.jpg">'
        self.assertEqual(extract_detail_image_urls(detail), ["https://s.example.com/lazy.jpg"])

    def test_중복_URL은_한_번만_담는다(self):
        detail = '<img src="https://s.example.com/a.jpg"><img src="https://s.example.com/a.jpg">'
        self.assertEqual(extract_detail_image_urls(detail), ["https://s.example.com/a.jpg"])

    def test_프로토콜_상대경로를_https로_올린다(self):
        self.assertEqual(
            extract_detail_image_urls('<img src="//s.example.com/a.jpg">'),
            ["https://s.example.com/a.jpg"],
        )

    def test_data_URI는_버린다(self):
        detail = '<img src="data:image/gif;base64,R0lGODlhAQ=="><img src="https://s.example.com/a.jpg">'
        self.assertEqual(extract_detail_image_urls(detail), ["https://s.example.com/a.jpg"])


class VisibleReviewCountTest(unittest.TestCase):
    def test_후기가_없는_상품은_0이다(self):
        self.assertEqual(parse_visible_review_count(load_page(STICKY_TRAP)), 0)

    def test_후기가_있는_상품은_HTML에_박힌_총개수를_읽는다(self):
        self.assertEqual(parse_visible_review_count(load_page(INSOLE)), 9)

    def test_총개수를_못_찾으면_0이다(self):
        self.assertEqual(parse_visible_review_count("<html></html>"), 0)


class ImageUsageNoticeTest(unittest.TestCase):
    def test_상세설명_이미지_사용여부를_관찰값으로_읽는다(self):
        self.assertEqual(parse_image_usage_notice(load_page(INSOLE)), "사용허용")
        self.assertEqual(parse_image_usage_notice(load_page(STICKY_TRAP)), "사용허용")

    def test_JS_주석의_같은_문구에_속지_않는다(self):
        html = "<script>el: $('.lInfoViewSubWrap')\t// 상세설명 이미지 사용여부\n</script>"
        self.assertIsNone(parse_image_usage_notice(html))

    def test_표기가_없으면_None이다(self):
        self.assertIsNone(parse_image_usage_notice("<html></html>"))


class ScoreMappingTest(unittest.TestCase):
    def test_A부터_E까지_5부터_1로_매핑한다(self):
        self.assertEqual([map_score(c) for c in "ABCDE"], [5, 4, 3, 2, 1])

    def test_소문자도_받는다(self):
        self.assertEqual(map_score("a"), 5)

    def test_알_수_없는_등급은_거부한다(self):
        with self.assertRaises(ValueError):
            map_score("Z")


class SanitizeReviewsTest(unittest.TestCase):
    def build(self, rows, visible=None, limit=0):
        return sanitize_reviews(
            rows,
            product_id=INSOLE,
            source_page_url=f"https://domeggook.com/{INSOLE}",
            visible_review_count=len(rows) if visible is None else visible,
            requested_review_limit=limit,
        )

    def test_실제_후기_9건을_정제한다(self):
        result = self.build(load_reviews(INSOLE))
        self.assertEqual(result["captured_review_count"], 9)
        self.assertEqual(result["visible_review_count"], 9)
        self.assertTrue(result["complete"])
        self.assertTrue(result["author_identifiers_removed"])
        self.assertEqual(result["scope"], "public_purchase_reviews_recent_six_months")

    def test_작성자_식별정보와_내부_후기번호를_제거한다(self):
        result = self.build(load_reviews(INSOLE))
        blob = json.dumps(result, ensure_ascii=False)
        self.assertNotIn("writeId", blob)
        self.assertNotIn("kaj****", blob)
        for review in result["reviews"]:
            self.assertNotIn("no", review)
            self.assertNotIn("own", review)
            self.assertNotIn("write_id", review)

    def test_별점을_정수로_바꾼다(self):
        for review in self.build(load_reviews(INSOLE))["reviews"]:
            self.assertIsInstance(review["rating"], int)
            self.assertIn(review["rating"], (1, 2, 3, 4, 5))

    def test_evidence_id를_1부터_순차_부여한다(self):
        result = self.build(load_reviews(INSOLE))
        self.assertEqual([r["evidence_id"] for r in result["reviews"]], list(range(1, 10)))

    def test_공급사_답변이_없으면_None이다(self):
        result = self.build([{"no": "1", "score": "A", "review": "좋아요", "reply": False,
                              "writeId": "abc***", "isPremium": "f", "date": "26/08/15", "files": ""}])
        self.assertIsNone(result["reviews"][0]["seller_reply"])

    def test_공급사_답변이_있으면_보존한다(self):
        result = self.build([{"no": "1", "score": "B", "review": "괜찮아요", "reply": "감사합니다",
                              "writeId": "abc***", "isPremium": "f", "date": "26/08/15", "files": ""}])
        self.assertEqual(result["reviews"][0]["seller_reply"], "감사합니다")

    def test_프리미엄_여부를_불리언으로_바꾼다(self):
        rows = [{"no": "1", "score": "A", "review": "", "reply": False, "writeId": "a***",
                 "isPremium": "t", "date": "26/08/15", "files": ""},
                {"no": "2", "score": "A", "review": "", "reply": False, "writeId": "b***",
                 "isPremium": "f", "date": "26/08/14", "files": ""}]
        result = self.build(rows)
        self.assertIs(result["reviews"][0]["is_premium"], True)
        self.assertIs(result["reviews"][1]["is_premium"], False)

    def test_후기_이미지가_없으면_빈_배열이다(self):
        result = self.build(load_reviews(INSOLE))
        for review in result["reviews"]:
            self.assertEqual(review["image_urls"], [])

    def test_후기_이미지는_고해상도_URL을_고른다(self):
        rows = [{"no": "1", "score": "A", "review": "사진", "reply": False, "writeId": "a***",
                 "isPremium": "f", "date": "26/08/15",
                 "files": [{"url_660": "https://x/small.jpg", "url_1000": "https://x/big.jpg"}]}]
        self.assertEqual(self.build(rows)["reviews"][0]["image_urls"], ["https://x/big.jpg"])

    def test_url_1000이_없으면_url_660을_쓴다(self):
        rows = [{"no": "1", "score": "A", "review": "사진", "reply": False, "writeId": "a***",
                 "isPremium": "f", "date": "26/08/15", "files": [{"url_660": "https://x/small.jpg"}]}]
        self.assertEqual(self.build(rows)["reviews"][0]["image_urls"], ["https://x/small.jpg"])

    def test_표시된_작성일을_그대로_보존한다(self):
        result = self.build(load_reviews(INSOLE))
        self.assertEqual(result["reviews"][0]["written_on"], "26/08/15")

    def test_후기가_0건이면_빈_배열로_정상_완료한다(self):
        result = sanitize_reviews([], product_id=STICKY_TRAP,
                                  source_page_url=f"https://domeggook.com/{STICKY_TRAP}",
                                  visible_review_count=0, requested_review_limit=0)
        self.assertEqual(result["reviews"], [])
        self.assertTrue(result["complete"])

    def test_전체_수집인데_개수가_모자라면_거부한다(self):
        with self.assertRaises(ReviewScopeError):
            self.build(load_reviews(INSOLE), visible=20)

    def test_limit이_있으면_부분_수집을_정상으로_본다(self):
        rows = load_reviews(INSOLE)[:3]
        result = self.build(rows, visible=9, limit=3)
        self.assertEqual(result["captured_review_count"], 3)
        self.assertEqual(result["requested_review_limit"], 3)
        self.assertTrue(result["complete"])

    def test_평점_요약을_계산한다(self):
        result = self.build(load_reviews(INSOLE))
        self.assertEqual(result["rating_summary"]["count"], 9)
        self.assertEqual(result["rating_summary"]["average"], 5.0)
        self.assertEqual(result["rating_summary"]["distribution"]["5"], 9)


class AssembleDetailPageTest(unittest.TestCase):
    def make(self, directory: Path, name: str, size: tuple[int, int], color: str) -> Path:
        from PIL import Image

        path = directory / name
        Image.new("RGB", size, color).save(path)
        return path

    def test_세로로_이어붙인다(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            sources = [self.make(d, "a.png", (800, 300), "red"), self.make(d, "b.png", (800, 200), "blue")]
            width, height = assemble_detail_page(sources, d / "out.png")
            self.assertEqual((width, height), (800, 500))

    def test_폭이_다르면_최대폭_기준_흰배경_중앙정렬한다(self):
        from PIL import Image

        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            sources = [self.make(d, "a.png", (400, 100), "red"), self.make(d, "b.png", (800, 100), "blue")]
            width, height = assemble_detail_page(sources, d / "out.png")
            self.assertEqual((width, height), (800, 200))
            with Image.open(d / "out.png") as out:
                self.assertEqual(out.getpixel((10, 50)), (255, 255, 255))  # 좁은 이미지 왼쪽 여백
                self.assertEqual(out.getpixel((400, 50)), (255, 0, 0))  # 가운데 정렬된 원본
                self.assertEqual(out.getpixel((10, 150)), (0, 0, 255))  # 넓은 이미지는 꽉 참

    def test_GIF는_첫_프레임을_정지_이미지로_쓴다(self):
        from PIL import Image

        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            gif = d / "a.gif"
            frames = [Image.new("RGB", (200, 100), "red"), Image.new("RGB", (200, 100), "blue")]
            frames[0].save(gif, save_all=True, append_images=frames[1:], duration=100, loop=0)
            width, height = assemble_detail_page([gif], d / "out.png")
            self.assertEqual((width, height), (200, 100))
            with Image.open(d / "out.png") as out:
                self.assertEqual(out.convert("RGB").getpixel((100, 50)), (255, 0, 0))

    def test_원본이_없으면_거부한다(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                assemble_detail_page([], Path(tmp) / "out.png")


if __name__ == "__main__":
    unittest.main(verbosity=2)
