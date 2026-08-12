from __future__ import annotations

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

from build_tibo_jobs import build_parallel, validate_inputs  # noqa: E402
from chroma import (  # noqa: E402
    binary_key_spill_fraction,
    parse_color,
    remove_chroma,
    replace_background,
)
from common import sha256  # noqa: E402
from package_animation import package_animation  # noqa: E402
from plan_motion import build_motion_plan  # noqa: E402
from select_chroma_key import choose_adaptive_key, prepare_reference  # noqa: E402
from validate_animation import validate_bundle  # noqa: E402


class AdaptiveChromaTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "source.png"
        image = Image.new("RGB", (96, 96), (249, 6, 241))
        draw = ImageDraw.Draw(image)
        draw.rectangle((22, 18, 73, 80), fill=(250, 220, 20), outline=(10, 10, 10), width=3)
        draw.rectangle((37, 35, 45, 43), fill=(255, 0, 255))
        draw.rectangle((51, 35, 59, 43), fill=(30, 150, 230))
        draw.rectangle((44, 62, 52, 74), fill=(230, 20, 20))
        image.save(self.source, "PNG")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_selector_avoids_foreground_colors_including_source_magenta(self) -> None:
        result = choose_adaptive_key([self.source], source_tolerance=50, minimum_separation=100)

        self.assertTrue(result["selected"]["safe"])
        self.assertNotEqual(result["selected"]["color"], "#ff00ff")
        self.assertGreaterEqual(result["selected"]["minimum_foreground_distance"], 100)

    def test_prepared_reference_and_connected_removal_preserve_isolated_key_color(self) -> None:
        result = choose_adaptive_key([self.source], source_tolerance=50, minimum_separation=100)
        target = parse_color(result["selected"]["color"])
        prepared = self.root / "prepared.png"
        replace_background(
            self.source,
            prepared,
            source_key=(249, 6, 241),
            target_key=target,
            transparent_threshold=50,
            opaque_threshold=110,
        )
        with Image.open(prepared) as opened:
            keyed = opened.convert("RGB")
        self.assertEqual(keyed.getpixel((0, 0)), target)
        self.assertEqual(keyed.getpixel((40, 39)), (255, 0, 255))

        keyed.putpixel((40, 39), target)
        keyed.save(prepared, "PNG")
        output = self.root / "cutout.png"
        remove_chroma(prepared, output, key=target, connected_only=True)
        with Image.open(output) as opened:
            rgba = opened.convert("RGBA")
        self.assertEqual(rgba.getpixel((0, 0))[3], 0)
        self.assertEqual(rgba.getpixel((40, 39))[3], 255)
        self.assertEqual(rgba.getpixel((30, 30))[3], 255)

    def test_edge_spill_cleanup_removes_dark_key_fringe_but_preserves_interior(self) -> None:
        key = (0, 255, 0)
        image = Image.new("RGB", (32, 32), key)
        draw = ImageDraw.Draw(image)
        draw.rectangle((8, 8, 23, 23), fill=(0, 0, 0))
        image.putpixel((8, 15), (0, 128, 0))
        image.putpixel((15, 15), (0, 128, 0))
        source = self.root / "dark-green-fringe.png"
        output = self.root / "dark-green-fringe-rgba.png"
        image.save(source, "PNG")

        remove_chroma(source, output, key=key, connected_only=True)
        with Image.open(output) as opened:
            rgba = opened.convert("RGBA")

        edge = rgba.getpixel((8, 15))
        interior = rgba.getpixel((15, 15))
        self.assertLess(edge[3], 160)
        self.assertLessEqual(max(edge[:3]), 2)
        self.assertEqual(interior, (0, 128, 0, 255))
        self.assertAlmostEqual(binary_key_spill_fraction((0, 128, 0), key), 0.502, places=3)
        self.assertGreater(
            binary_key_spill_fraction((142, 7, 142), (249, 6, 241)),
            0.55,
        )

    def test_transparent_reference_uses_existing_alpha_without_rekeying_black_outline(self) -> None:
        source = self.root / "transparent-source.png"
        rgba = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
        draw = ImageDraw.Draw(rgba)
        draw.rectangle((10, 10, 37, 37), fill=(0, 0, 0, 255))
        draw.rectangle((13, 13, 34, 34), fill=(250, 210, 20, 255))
        rgba.save(source, "PNG")
        prepared = self.root / "transparent-prepared.png"

        path, normalization = prepare_reference(
            source,
            prepared,
            source_key=(0, 0, 0),
            target_key=(0, 255, 0),
            transparent_threshold=50,
            opaque_threshold=110,
        )

        with Image.open(path) as opened:
            keyed = opened.convert("RGB")
        self.assertEqual(normalization["mode"], "existing-alpha")
        self.assertEqual(keyed.getpixel((0, 0)), (0, 255, 0))
        self.assertEqual(keyed.getpixel((10, 10)), (0, 0, 0))
        self.assertEqual(keyed.getpixel((20, 20)), (250, 210, 20))

    def test_motion_plan_and_generation_prompt_use_selected_clip_key(self) -> None:
        result = choose_adaptive_key([self.source], source_tolerance=50, minimum_separation=100)
        target = parse_color(result["selected"]["color"])
        prepared = self.root / "prepared.png"
        replace_background(
            self.source,
            prepared,
            source_key=(249, 6, 241),
            target_key=target,
            transparent_threshold=50,
            opaque_threshold=110,
        )
        result["prepared_reference"] = {"path": str(prepared), "sha256": sha256(prepared)}
        selection = self.root / "chroma-selection.json"
        selection.write_text(json.dumps(result), encoding="utf-8")
        job = {
            "schema_version": 1,
            "reference": str(prepared),
            "motion": {
                "description": "The character jumps and lands.",
                "type": "jump",
                "frame_count": 8,
                "fps": 8,
                "loop": "closed",
            },
            "generation": {
                "strategy": "parallel-candidates",
                "size_mode": "invariant",
                "candidates_per_frame": 1,
                "workers": 1,
            },
            "chroma": {"mode": "adaptive", "selection": str(selection)},
        }
        plan = build_motion_plan(job)
        reference, generation = validate_inputs(job, plan)
        payload, _ = build_parallel(job, plan, reference, generation)

        self.assertEqual(plan["chroma"]["color"], result["selected"]["color"])
        self.assertTrue(plan["chroma"]["edge_spill_cleanup"])
        self.assertTrue(all(result["selected"]["color"] in item["prompt"] for item in payload["items"]))
        self.assertTrue(all("selected chroma-key contamination" in item["prompt"] for item in payload["items"]))

    def test_adaptive_key_is_packaged_and_validated_end_to_end(self) -> None:
        result = choose_adaptive_key([self.source], source_tolerance=50, minimum_separation=100)
        target = parse_color(result["selected"]["color"])
        prepared = self.root / "prepared.png"
        replace_background(
            self.source,
            prepared,
            source_key=(249, 6, 241),
            target_key=target,
            transparent_threshold=50,
            opaque_threshold=110,
        )
        result["prepared_reference"] = {"path": str(prepared), "sha256": sha256(prepared)}
        result["chroma"] = {
            "color": result["selected"]["color"],
            "name": result["selected"]["name"],
            "transparent_threshold": 50,
            "opaque_threshold": 110,
            "alpha_floor": 40,
            "connected_only": True,
            "despill": True,
        }
        chroma_selection = self.root / "chroma-selection.json"
        chroma_selection.write_text(json.dumps(result), encoding="utf-8")
        job = {
            "schema_version": 1,
            "reference": str(prepared),
            "motion": {
                "description": "The character holds a calm idle pose.",
                "type": "idle",
                "frame_count": 2,
                "fps": 8,
                "loop": "closed",
            },
            "generation": {"strategy": "parallel-candidates", "size_mode": "invariant"},
            "chroma": {"mode": "adaptive", "selection": str(chroma_selection)},
        }
        plan = build_motion_plan(job)
        plan_path = self.root / "motion-plan.json"
        plan_path.write_text(json.dumps(plan), encoding="utf-8")
        frames = []
        for index in range(2):
            frame = self.root / f"frame-{index:03d}.png"
            with Image.open(prepared) as opened:
                candidate = opened.convert("RGB")
            ImageDraw.Draw(candidate).rectangle((32, 48, 39, 55), fill=target)
            if index == 1:
                ImageDraw.Draw(candidate).rectangle((48, 50, 51, 53), fill=(20, 80, 220))
            candidate.save(frame, "PNG")
            frames.append(frame)
        selection = {
            "schema_version": 1,
            "winner": {
                "score": 1.0,
                "frames": [
                    {"frame": index, "candidate": 0, "path": str(path), "individual_score": 1.0}
                    for index, path in enumerate(frames)
                ],
            },
            "runner_up": None,
        }
        selection_path = self.root / "selection.json"
        selection_path.write_text(json.dumps(selection), encoding="utf-8")
        bundle = self.root / "bundle"

        package_animation(selection_path, plan_path, bundle, name="adaptive-idle")
        manifest = json.loads((bundle / "manifest.json").read_text(encoding="utf-8"))
        validation = validate_bundle(bundle)

        self.assertEqual(manifest["chroma"]["key"], result["selected"]["color"])
        self.assertTrue(manifest["chroma"]["connected_only"])
        self.assertTrue(manifest["chroma"]["edge_spill_cleanup"])
        self.assertEqual(
            manifest["inputs"]["chroma_selection"]["path"],
            "provenance/chroma-selection.json",
        )
        with Image.open(bundle / "frames" / "frame-000.png") as opened:
            self.assertEqual(opened.convert("RGBA").getpixel((35, 59)), (*target, 255))
        self.assertTrue(validation["valid"], validation["errors"])


if __name__ == "__main__":
    unittest.main()
