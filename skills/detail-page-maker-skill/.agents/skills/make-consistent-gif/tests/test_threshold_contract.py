from __future__ import annotations

import ast
import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

SKILL_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = SKILL_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from analyze_frames import analyze  # noqa: E402
from chroma import DEFAULT_TRANSPARENT_THRESHOLD  # noqa: E402


def argparse_default(script: Path, option: str) -> float:
    """스크립트의 argparse 기본값을 AST 로 읽는다.

    import 해서 파서를 만들면 되지만, 그러면 이 단정이 "실행되는 값" 이 아니라
    "우리가 부른 방식" 을 검사하게 된다. 선언 자체를 본다.
    """
    tree = ast.parse(script.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if (isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr == "add_argument"
                and node.args
                and isinstance(node.args[0], ast.Constant)
                and node.args[0].value == option):
            for kw in node.keywords:
                if kw.arg == "default":
                    return float(ast.literal_eval(kw.value))
    raise AssertionError(f"{script.name} 에 {option} 기본값이 없습니다")


class ChromaThresholdContractTests(unittest.TestCase):
    """크로마 경계를 선언하는 곳이 서로 어긋나면 안 된다.

    실사고: `analyze_frames.py` 의 `--tolerance` 기본값이 40 이었다. 계약의
    `transparent_threshold` 는 55 다. 40 은 "배경" 경계보다 낮아서, 패키저가
    투명하게 만들 가장자리 픽셀을 분석기는 피사체로 센다. 그 결과 배경 잡티
    한두 픽셀이 bbox 를 캔버스 끝까지 늘려 후보 32장이 전부 `clipped` 로
    하드 실패했다 — 실제로는 하나도 잘리지 않았는데.
    """

    def setUp(self) -> None:
        self.defaults = json.loads(
            (SKILL_ROOT / "references" / "defaults.json").read_text(encoding="utf-8"))
        self.transparent = float(self.defaults["chroma"]["transparent_threshold"])

    def test_analyzer_background_boundary_matches_the_chroma_contract(self) -> None:
        found = argparse_default(SCRIPTS / "analyze_frames.py", "--tolerance")
        self.assertEqual(found, self.transparent)

    def test_remove_chroma_transparent_threshold_matches_the_chroma_contract(self) -> None:
        found = argparse_default(SCRIPTS / "remove_chroma.py", "--transparent-threshold")
        self.assertEqual(found, self.transparent)

    def test_python_default_matches_the_chroma_contract(self) -> None:
        self.assertEqual(DEFAULT_TRANSPARENT_THRESHOLD, self.transparent)

    def test_within_threshold_nonuniform_background_is_accepted(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "within-threshold.png"
            image = Image.new("RGB", (64, 64), (240, 12, 233))
            ImageDraw.Draw(image).rectangle((20, 16, 43, 51), fill=(255, 220, 0))
            image.save(path)

            result = analyze([path], (255, 0, 255), self.transparent)

        self.assertEqual(result["frames"][0]["border_key_fraction"], 1.0)
        self.assertTrue(result["hard_pass"])

    def test_outside_threshold_background_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "outside-threshold.png"
            image = Image.new("RGB", (64, 64), (190, 0, 190))
            ImageDraw.Draw(image).rectangle((20, 16, 43, 51), fill=(255, 220, 0))
            image.save(path)

            result = analyze([path], (255, 0, 255), self.transparent)

        self.assertEqual(result["frames"][0]["border_key_fraction"], 0.0)
        self.assertFalse(result["hard_pass"])


if __name__ == "__main__":
    unittest.main()
