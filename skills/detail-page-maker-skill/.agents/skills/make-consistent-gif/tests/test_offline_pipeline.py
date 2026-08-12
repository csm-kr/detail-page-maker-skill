from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageSequence


SKILL_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = SKILL_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from analyze_frames import analyze  # noqa: E402
from approve_animation import approve_animation  # noqa: E402
from assemble_gif import assemble_gif  # noqa: E402
from build_spritesheet import build_spritesheet  # noqa: E402
from build_tibo_jobs import (  # noqa: E402
    build_chain,
    build_parallel,
    candidate_size_fields,
    frame_prompt,
    resolve_strategy,
    size_fields,
    validate_inputs,
)
from common import sha256  # noqa: E402
from package_animation import lower_body_pivot, package_animation  # noqa: E402
from plan_motion import build_motion_plan, normalize_motion_type  # noqa: E402
from remove_magenta import remove_magenta  # noqa: E402
from score_candidates import score_candidates  # noqa: E402
from select_sequence import select_sequence  # noqa: E402
from validate_animation import validate_bundle  # noqa: E402


def write_json(path: Path, value: object) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def make_reference(path: Path, size: tuple[int, int] = (64, 64)) -> Path:
    image = Image.new("RGB", size, (255, 0, 255))
    draw = ImageDraw.Draw(image)
    draw.ellipse((14, 18, 50, 54), fill=(37, 148, 72), outline=(19, 78, 38), width=2)
    draw.ellipse((42, 27, 55, 40), fill=(74, 181, 91))
    image.save(path, "PNG")
    return path


def make_motion_job(reference: Path, *, strategy: str = "parallel-candidates") -> dict[str, object]:
    return {
        "schema_version": 1,
        "reference": str(reference),
        "motion": {
            "description": "The turtle jumps and returns to its starting pose.",
            "type": "jump",
            "frame_count": 8,
            "fps": 8,
            "loop": "closed",
        },
        "generation": {
            "strategy": strategy,
            "size_mode": "invariant",
            "detail_level": 3,
            "candidates_per_frame": 4,
            "workers": 32,
        },
    }


def make_magenta_sequence(directory: Path, count: int = 8, size: tuple[int, int] = (64, 64)) -> list[Path]:
    directory.mkdir(parents=True, exist_ok=True)
    result: list[Path] = []
    offsets = [0, 2, 5, 8, 10, 7, 3, 1]
    for index in range(count):
        image = Image.new("RGB", size, (255, 0, 255))
        draw = ImageDraw.Draw(image)
        rise = offsets[index % len(offsets)]
        left = 14 + (index % 2)
        top = 24 - rise
        right = 49 + (index % 2)
        bottom = 55 - rise
        color = (25 + index * 8, 118 + index * 9, 55 + index * 5)
        draw.rounded_rectangle((left, top, right, bottom), radius=8, fill=color, outline=(18, 60, 28), width=2)
        draw.ellipse((right - 2, top + 7, right + 8, top + 17), fill=(72, 176, 88))
        path = directory / f"raw-{index:03d}.png"
        image.save(path, "PNG")
        result.append(path)
    return result


def make_selection(paths: list[Path]) -> dict[str, object]:
    return {
        "schema_version": 1,
        "winner": {
            "score": 1.0,
            "frames": [
                {
                    "frame": index,
                    "candidate": 0,
                    "path": str(path),
                    "individual_score": 1.0,
                }
                for index, path in enumerate(paths)
            ],
        },
        "runner_up": None,
    }


def make_passed_review() -> dict[str, object]:
    return {
        "schema_version": 1,
        "status": "passed",
        "reviewer": "synthetic-reviewer",
        "checks": {
            "motion": "passed",
            "identity": "passed",
            "anatomy": "passed",
            "pose": "passed",
            "limb_continuity": "passed",
            "contact_continuity": "passed",
            "prop_continuity": "passed",
            "loop_seam": "passed",
            "edge_and_transparency": "passed",
        },
    }


class MotionPlanAndTiboJobTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.reference = make_reference(self.root / "reference.png")
        self.job = make_motion_job(self.reference)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_jump_motion_plan_has_eight_connected_absolute_poses(self) -> None:
        plan = build_motion_plan(self.job)

        self.assertEqual(plan["motion_type"], "jump")
        self.assertEqual(plan["frame_count"], 8)
        self.assertEqual(len(plan["frames"]), 8)
        self.assertEqual([frame["index"] for frame in plan["frames"]], list(range(8)))
        self.assertEqual(plan["frames"][0]["phase"], "start")
        self.assertEqual(plan["frames"][-1]["phase"], "recovery")
        self.assertEqual(plan["frames"][2]["event"], "takeoff")
        self.assertEqual(plan["frames"][4]["event"], "apex")
        self.assertEqual(plan["frames"][6]["event"], "land")
        self.assertTrue(all(frame["absolute_pose"] for frame in plan["frames"]))
        self.assertTrue(all(frame["delta"] for frame in plan["frames"]))
        self.assertTrue(all(frame["duration_ms"] == 125 for frame in plan["frames"]))
        root_y = [frame["root_delta"]["y"] for frame in plan["frames"]]
        self.assertEqual([root_y[index] for index in (0, 1, 6, 7)], [0, 0, 0, 0])
        self.assertLess(root_y[4], 0)
        self.assertEqual(root_y[4], min(root_y))
        self.assertEqual(plan["frames"][-1]["progress"], 0.875)

    def test_continuity_sensitive_motion_types_build_explicit_eight_frame_trajectories(self) -> None:
        descriptions = {
            "walk-in-place": "front-facing walk in place",
            "run-in-place": "front-facing run in place",
            "throw": "throw a ball with the left hand",
            "kick": "kick with the right foot",
            "turn": "turn clockwise in place",
        }
        for motion_type, description in descriptions.items():
            with self.subTest(motion_type=motion_type):
                job = make_motion_job(self.reference)
                job["motion"] = {
                    "description": description,
                    "type": motion_type,
                    "frame_count": 8,
                    "fps": 8,
                    "loop": "closed",
                }
                plan = build_motion_plan(job)

                self.assertEqual(plan["motion_type"], motion_type)
                self.assertTrue(plan["continuity_sensitive"])
                self.assertEqual(plan["generation_guidance"]["preferred_strategy"], "parallel-candidates")
                self.assertEqual(plan["generation_guidance"]["candidates_per_frame"], 4)
                self.assertEqual(plan["generation_guidance"]["review_passes_max"], 2)
                self.assertFalse(plan["generation_guidance"]["automatic_regeneration"])
                self.assertTrue(plan["generation_guidance"]["must_select_best_available"])
                self.assertEqual(plan["review_policy"]["max_passes"], 2)
                self.assertEqual(len(plan["frames"]), 8)
                self.assertTrue(all(frame["limb_pose"] for frame in plan["frames"]))
                self.assertTrue(all(frame["limb_trajectory"] for frame in plan["frames"]))
                self.assertTrue(all("No hand or foot" in frame["continuity_guard"] for frame in plan["frames"]))
                self.assertEqual(plan["frames"][0]["adjacent_targets"]["previous"]["index"], 7)
                self.assertEqual(plan["frames"][7]["adjacent_targets"]["next"]["index"], 0)

        left_throw = build_motion_plan({
            **make_motion_job(self.reference),
            "motion": {
                "description": "왼손으로 공을 던진다",
                "type": "throw",
                "frame_count": 8,
                "fps": 8,
                "loop": "one-shot",
            },
        })
        self.assertEqual(left_throw["acting_side"], "left")
        self.assertEqual(left_throw["action_direction"], "screen-right")
        self.assertIn("anatomical left", left_throw["frames"][0]["limb_pose"])
        self.assertIn("screen-right in a front view", left_throw["frames"][0]["limb_pose"])

    def test_korean_and_english_motion_aliases_cover_added_actions(self) -> None:
        cases = {
            "캐릭터가 달리기": "run-in-place",
            "공을 던지기": "throw",
            "발로 차기": "kick",
            "제자리 턴": "turn",
            "walk forward in place": "walk-in-place",
        }
        for description, expected in cases.items():
            with self.subTest(description=description):
                self.assertEqual(normalize_motion_type(None, description), expected)

    def test_prompts_include_adjacent_limb_targets_without_reference_role_conflicts(self) -> None:
        job = make_motion_job(self.reference)
        job["motion"] = {
            "description": "front-facing walk in place",
            "type": "walk-in-place",
            "frame_count": 8,
            "fps": 8,
            "loop": "closed",
        }
        generation = dict(job["generation"])
        generation.pop("strategy")
        job["generation"] = generation
        plan = build_motion_plan(job)

        self.assertEqual(resolve_strategy(generation, plan), "parallel-candidates")
        self.assertEqual(
            resolve_strategy({**generation, "strategy": "parallel-candidates"}, plan),
            "parallel-candidates",
        )
        chain, _ = build_chain(job, plan, self.reference.resolve(), generation)
        first = chain["steps"][0]["prompt"]
        second = chain["steps"][1]["prompt"]

        self.assertIn("Image 1 is the original canonical", first)
        self.assertNotIn("Image 2 is the original canonical", first)
        self.assertIn("Image 1 is the immediately previous generated frame", second)
        self.assertIn("Image 2 is the original canonical", second)
        self.assertIn("Previous frame target: frame 7", first)
        self.assertIn("Next frame target: frame 1", first)
        self.assertIn("Current limb positions:", first)
        self.assertIn("Per-limb trajectory:", first)
        self.assertIn("No hand or foot may jump from neutral", first)

        independent = frame_prompt(plan, plan["frames"][0])
        self.assertIn("Image 1 is the original canonical", independent)
        self.assertNotIn("immediately previous generated frame", independent)

    def test_one_shot_throw_has_explicit_direction_and_no_closed_loop_boundary_text(self) -> None:
        job = make_motion_job(self.reference, strategy="chain")
        job["motion"] = {
            "description": "오른손으로 화면 오른쪽을 향해 공을 던진다",
            "type": "throw",
            "acting_side": "right",
            "action_direction": "screen-right",
            "frame_count": 8,
            "fps": 8,
            "loop": "one-shot",
        }
        plan = build_motion_plan(job)
        chain, _ = build_chain(job, plan, self.reference.resolve(), job["generation"])
        prompts = [step["prompt"] for step in chain["steps"]]

        self.assertEqual(plan["action_direction"], "screen-right")
        self.assertIn("no predecessor target", prompts[0])
        self.assertNotIn("closed-loop predecessor", prompts[0])
        self.assertIn("Previous frame target: no adjacent target", prompts[0])
        self.assertIn("Next frame target: no adjacent target", prompts[7])
        self.assertIn("do not invent a loop predecessor", prompts[0])
        self.assertIn("do not invent a return toward frame 0", prompts[7])
        self.assertNotIn("between the previous and next targets", prompts[0])
        self.assertNotIn("between the previous and next targets", prompts[7])
        self.assertIn("anatomical right", prompts[5])
        self.assertIn("anatomical left lead foot", prompts[5])
        self.assertIn("screen-right", prompts[5])
        self.assertIn("projectile is farther toward screen-right or has exited", prompts[7])
        self.assertTrue(all("{" not in prompt and "}" not in prompt for prompt in prompts))

    def test_motion_plan_rejects_missing_job_schema_version(self) -> None:
        job = make_motion_job(self.reference)
        del job["schema_version"]
        with self.assertRaisesRegex(ValueError, "job.schema_version"):
            build_motion_plan(job)

    def test_one_shot_kick_ends_without_loop_recovery_language(self) -> None:
        job = make_motion_job(self.reference, strategy="chain")
        job["motion"] = {
            "description": "오른발로 화면 오른쪽을 찬다",
            "type": "kick",
            "acting_side": "right",
            "action_direction": "screen-right",
            "frame_count": 8,
            "fps": 8,
            "loop": "one-shot",
        }
        plan = build_motion_plan(job)
        chain, _ = build_chain(job, plan, self.reference.resolve(), job["generation"])
        ending = chain["steps"][7]["prompt"]

        self.assertIn("one-shot ending has no next target", ending)
        self.assertIn("do not invent a return toward frame 0", ending)
        self.assertNotIn("closed loop", ending.lower())
        self.assertNotIn("connect to frame 0", ending.lower())

    def test_parallel_job_preserves_eight_by_four_mapping_and_reference_order(self) -> None:
        plan = build_motion_plan(self.job)
        reference, generation = validate_inputs(self.job, plan)
        payload, mapping = build_parallel(self.job, plan, reference, generation)

        self.assertEqual(len(payload["items"]), 32)
        self.assertEqual(len(mapping["mapping"]), 32)
        self.assertEqual(payload["workers"], 32)
        self.assertEqual(payload["size_mode"], "invariant")
        self.assertTrue(payload["preserve_backend_raw"])
        self.assertEqual([item["generated_index"] for item in mapping["mapping"]], list(range(32)))
        self.assertEqual(
            [(item["frame"], item["candidate"]) for item in mapping["mapping"][:5]],
            [(0, 0), (0, 1), (0, 2), (0, 3), (1, 0)],
        )
        self.assertEqual(mapping["mapping"][-1], {"generated_index": 31, "frame": 7, "candidate": 3})
        self.assertTrue(all(item["references"] == [str(self.reference.resolve())] for item in payload["items"]))
        self.assertTrue(all("#ff00ff" in item["prompt"] for item in payload["items"]))
        self.assertTrue(all("Absolute pose:" in item["prompt"] for item in payload["items"]))
        self.assertTrue(all("Change from previous frame:" in item["prompt"] for item in payload["items"]))

    def test_invalid_size_and_excess_parallel_batch_fail_closed(self) -> None:
        with self.assertRaisesRegex(ValueError, "target_size"):
            size_fields({"size_mode": "controllable"})

        plan = build_motion_plan(self.job)
        generation = dict(self.job["generation"])
        generation["candidates_per_frame"] = 8
        oversized_plan = dict(plan)
        oversized_plan["frames"] = plan["frames"] + [dict(plan["frames"][-1], index=8)]
        oversized_plan["frame_count"] = 9
        with self.assertRaisesRegex(ValueError, "must not exceed 64"):
            build_parallel(self.job, oversized_plan, self.reference.resolve(), generation)

    def test_matching_canonical_target_uses_invariant_for_candidate_generation(self) -> None:
        generation = {
            "size_mode": "controllable",
            "target_size": "64x64",
        }

        fields = candidate_size_fields(generation, self.reference.resolve())

        self.assertEqual(fields, {"size_mode": "invariant"})

    def test_mismatched_canonical_target_keeps_controllable_postprocessing(self) -> None:
        generation = {
            "size_mode": "controllable",
            "target_size": "512x768",
            "backend_size": "1024x1536",
        }

        fields = candidate_size_fields(generation, self.reference.resolve())

        self.assertEqual(fields["size_mode"], "controllable")
        self.assertEqual(fields["target_size"], "512x768")
        self.assertEqual(fields["backend_size"], "1024x1536")
        self.assertEqual(fields["size_prompt"], "size-only")


class GlobalSequenceSelectionTests(unittest.TestCase):
    @staticmethod
    def score_fixture() -> dict[str, object]:
        weights = {
            "motion": 0.30,
            "identity": 0.25,
            "edge": 0.05,
            "continuity": 0.20,
            "pivot": 0.10,
            "loop": 0.10,
        }
        levels = {0: 1.0, 1: 0.9, 2: 0.5, 3: 0.4}
        candidates = []
        for frame in range(8):
            for candidate in range(4):
                value = levels[candidate]
                candidates.append({
                    "frame": frame,
                    "candidate": candidate,
                    "path": f"frame-{frame:03d}-candidate-{candidate:02d}.png",
                    "hard_pass": True,
                    "scores": {"motion": value, "identity": value, "edge": value},
                })
        transitions = []
        for frame in range(7):
            for previous in range(4):
                for current in range(4):
                    coherent = 1.0 if previous == current == 1 else 0.0
                    transitions.append({
                        "from_frame": frame,
                        "from_candidate": previous,
                        "to_candidate": current,
                        "scores": {"continuity": coherent, "pivot": coherent},
                    })
        loops = [
            {
                "last_candidate": last,
                "first_candidate": first,
                "score": 1.0 if last == first == 1 else 0.0,
            }
            for last in range(4)
            for first in range(4)
        ]
        return {
            "frame_count": 8,
            "weights": weights,
            "candidates": candidates,
            "transitions": transitions,
            "loops": loops,
        }

    def test_selector_uses_global_transition_path_instead_of_greedy_frames(self) -> None:
        data = self.score_fixture()
        greedy = []
        for frame in range(8):
            frame_candidates = [item for item in data["candidates"] if item["frame"] == frame]
            greedy.append(max(frame_candidates, key=lambda item: item["scores"]["motion"])["candidate"])

        result = select_sequence(data)
        winner = [frame["candidate"] for frame in result["winner"]["frames"]]

        self.assertEqual(greedy, [0] * 8)
        self.assertEqual(winner, [1] * 8)
        self.assertNotEqual(winner, greedy)
        self.assertIsNotNone(result["runner_up"])
        self.assertGreater(result["winner"]["score"], result["runner_up"]["score"])

    def test_selector_always_returns_best_effort_when_a_frame_has_no_hard_pass_candidate(self) -> None:
        data = self.score_fixture()
        for candidate in data["candidates"]:
            if candidate["frame"] == 3:
                candidate["hard_pass"] = False

        result = select_sequence(data)

        self.assertEqual(result["selection_mode"], "best-effort")
        self.assertFalse(result["hard_pass"])
        self.assertEqual(result["winner"]["hard_failure_count"], 1)
        self.assertEqual([item["frame"] for item in result["failed_frames"]], [3])
        self.assertTrue(result["needs_visual_review"])
        self.assertEqual(result["review_policy"]["max_passes"], 2)
        self.assertFalse(result["review_policy"]["automatic_regeneration"])

    def test_selector_fails_only_when_a_frame_has_no_usable_image(self) -> None:
        data = self.score_fixture()
        for candidate in data["candidates"]:
            if candidate["frame"] == 3:
                candidate["selectable"] = False
        with self.assertRaisesRegex(ValueError, "frame 3 has no selectable candidates"):
            select_sequence(data)


class CandidateScoringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_candidate_scoring_combines_visual_gates_with_technical_transitions(self) -> None:
        reference = make_reference(self.root / "reference.png")
        job = make_motion_job(reference)
        job["motion"] = dict(job["motion"], frame_count=2)
        plan = build_motion_plan(job)
        images = make_magenta_sequence(self.root / "candidates", count=4)
        generation_run = {
            "candidates": [
                {"frame": 0, "candidate": 0, "path": str(images[0])},
                {"frame": 0, "candidate": 1, "path": str(images[1])},
                {"frame": 1, "candidate": 0, "path": str(images[2])},
                {"frame": 1, "candidate": 1, "path": str(images[3])},
            ]
        }
        visual = {
            "reviewer": "synthetic-test",
            "default_pose_pass": True,
            "candidates": [
                {
                    "frame": 0, "candidate": 0, "motion": 0.9, "identity": 0.8,
                    "anatomy_pass": True, "pose_pass": True,
                },
                {
                    "frame": 0, "candidate": 1, "motion": 0.7, "identity": 0.7,
                    "anatomy_pass": False, "pose_pass": True,
                },
                {
                    "frame": 1, "candidate": 0, "motion": 0.8, "identity": 0.9,
                    "anatomy_pass": True, "pose_pass": True,
                },
                {
                    "frame": 1, "candidate": 1, "motion": 1.7, "identity": -0.2,
                    "anatomy_pass": True, "pose_pass": False,
                },
            ],
            "transitions": [
                {"from_frame": 0, "from_candidate": 0, "to_candidate": 0, "continuity": 0.82, "pivot": 0.76}
            ],
            "loops": [{"last_candidate": 0, "first_candidate": 0, "score": 0.88}],
        }

        result = score_candidates(generation_run, plan, visual)

        self.assertEqual(result["frame_count"], 2)
        self.assertEqual(result["candidates_per_frame"], 2)
        self.assertEqual(len(result["candidates"]), 4)
        self.assertEqual(len(result["transitions"]), 4)
        self.assertEqual(len(result["loops"]), 4)
        rejected = next(item for item in result["candidates"] if item["frame"] == 0 and item["candidate"] == 1)
        self.assertFalse(rejected["hard_pass"])
        self.assertEqual(rejected["failures"], ["ANATOMY_GATE"])
        clamped = next(item for item in result["candidates"] if item["frame"] == 1 and item["candidate"] == 1)
        self.assertFalse(clamped["hard_pass"])
        self.assertEqual(clamped["failures"], ["POSE_GATE"])
        self.assertEqual(clamped["scores"]["motion"], 1.0)
        self.assertEqual(clamped["scores"]["identity"], 0.0)
        overridden = next(
            item for item in result["transitions"]
            if item["from_candidate"] == 0 and item["to_candidate"] == 0
        )
        self.assertEqual(overridden["scores"], {"continuity": 0.82, "pivot": 0.76})
        loop = next(item for item in result["loops"] if item["last_candidate"] == 0 and item["first_candidate"] == 0)
        self.assertEqual(loop["score"], 0.88)
        self.assertEqual(result["visual_review"]["reviewer"], "synthetic-test")
        self.assertEqual(
            result["visual_review"]["required_fields"],
            ["motion", "identity", "anatomy_pass", "pose_pass"],
        )


class OfflineImagePipelineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.reference = make_reference(self.root / "reference.png")
        self.job = make_motion_job(self.reference)
        self.plan = build_motion_plan(self.job)
        self.raw_frames = make_magenta_sequence(self.root / "raw")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _package(self, name: str = "turtle-jump") -> Path:
        selection_path = write_json(self.root / "selection.json", make_selection(self.raw_frames))
        plan_path = write_json(self.root / "motion-plan.json", self.plan)
        output = self.root / "bundle"
        package_animation(selection_path, plan_path, output, name=name, columns=4)
        return output

    def test_magenta_conversion_creates_rgba_with_transparent_background_and_opaque_subject(self) -> None:
        source = self.root / "magenta-family.png"
        with Image.open(self.raw_frames[0]) as raw:
            family = raw.convert("RGB")
        family.putpixel((2, 2), (120, 10, 110))
        family.save(source, "PNG")
        destination = self.root / "rgba.png"
        remove_magenta(source, destination)

        with Image.open(destination) as image:
            self.assertEqual(image.mode, "RGBA")
            self.assertEqual(image.size, (64, 64))
            self.assertEqual(image.getpixel((0, 0))[3], 0)
            self.assertEqual(image.getpixel((2, 2)), (0, 0, 0, 0))
            self.assertEqual(image.getpixel((30, 35))[3], 255)
            self.assertEqual(image.getchannel("A").getextrema(), (0, 255))

    def test_controllable_jobs_ask_god_tibo_for_a_size_only_prompt(self) -> None:
        # 프레임 시퀀스는 구도가 흔들리면 안 된다. God Tibo 의 controllable 기본값은
        # 목표 비율과 center-crop-safe 구성까지 프롬프트에 넣는데, 그러면 프레임마다
        # 구도를 다시 잡으려 든다. 비율 정렬은 생성 후 중앙 crop 이 맡는다.
        controllable = size_fields({"size_mode": "controllable", "target_size": "512x768"})
        self.assertEqual(controllable["size_prompt"], "size-only")

        # invariant 는 목표 크기가 곧 Image 1 의 원본 크기라 뜻이 없다.
        invariant = size_fields({"size_mode": "invariant"})
        self.assertNotIn("size_prompt", invariant)

    def test_manifest_paths_stay_posix_on_every_platform(self) -> None:
        # manifest 는 번들과 함께 다른 플랫폼으로 옮겨져 읽힌다. Windows 에서 구운
        # 번들이 역슬래시를 담으면 그 manifest 는 이식되지 않는다 - SKILL.md 의
        # "all manifest file paths must remain bundle-relative" 계약이 깨진다.
        output = self._package()
        manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))

        offenders: list[tuple[str, str]] = []

        def walk(node: object, trail: str) -> None:
            if isinstance(node, dict):
                for key, value in node.items():
                    walk(value, f"{trail}.{key}")
            elif isinstance(node, list):
                for index, value in enumerate(node):
                    walk(value, f"{trail}[{index}]")
            elif isinstance(node, str) and "\\" in node:
                offenders.append((trail, node))

        walk(manifest, "manifest")
        self.assertEqual(offenders, [], f"manifest 에 역슬래시 경로가 있습니다: {offenders}")

    def test_package_builds_rgba_frames_spritesheet_gif_metadata_and_validates(self) -> None:
        output = self._package()
        validation = validate_bundle(output)

        self.assertTrue(validation["valid"], validation["errors"])
        self.assertEqual(validation["checks"]["frame_count"], 8)
        self.assertEqual(validation["checks"]["gif_frame_count"], 8)
        self.assertEqual(validation["checks"]["gif_size"], [64, 64])
        self.assertEqual(validation["checks"]["spritesheet_size"], [256, 128])

        metadata = json.loads((output / "animation.json").read_text(encoding="utf-8"))
        manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(metadata["frame_count"], 8)
        self.assertEqual(metadata["canvas"], {
            "width": 64,
            "height": 64,
            "color_space": "srgb",
            "pixel_format": "rgba8",
            "alpha_mode": "straight",
        })
        self.assertEqual(metadata["sheet"], {
            "path": "spritesheet.png",
            "layout": "row-major",
            "columns": 4,
            "rows": 2,
            "cell_width": 64,
            "cell_height": 64,
        })
        self.assertEqual(metadata["fps"], 8.0)
        self.assertEqual(metadata["loop"], "closed")
        self.assertEqual(metadata["playback"], list(range(8)))
        offsets = [frame["alignment_offset"] for frame in metadata["frames"]]
        self.assertTrue(all(set(offset) == {"x", "y"} for offset in offsets))
        self.assertTrue(all(isinstance(offset[axis], int) for offset in offsets for axis in ("x", "y")))
        self.assertTrue(any(offset != {"x": 0, "y": 0} for offset in offsets))
        for frame_index, frame in enumerate(metadata["frames"]):
            root_delta = frame["root_delta"]
            with Image.open(output / "frames" / f"frame-{frame_index:03d}.png") as frame_image:
                actual_root_x, actual_root_y = lower_body_pivot(frame_image.getchannel("A"))
            expected_root_x = metadata["pivot"]["x"] * 64 + root_delta["x"]
            expected_root_y = metadata["pivot"]["y"] * 64 + root_delta["y"]
            self.assertLessEqual(abs(actual_root_x - expected_root_x), 1)
            self.assertLessEqual(abs(actual_root_y - expected_root_y), 1)
        self.assertEqual(metadata["frames"][2]["events"], [{"name": "takeoff"}])
        self.assertEqual(metadata["frames"][4]["events"], [{"name": "apex"}])
        self.assertEqual(metadata["frames"][6]["events"], [{"name": "land"}])
        self.assertEqual(len(manifest["outputs"]["frames"]), 8)
        self.assertEqual(manifest["outputs"]["contact_sheet"]["path"], "contact-sheet.png")
        self.assertFalse(Path(manifest["inputs"]["motion_plan"]["path"]).is_absolute())
        self.assertFalse(Path(manifest["inputs"]["selection"]["path"]).is_absolute())
        self.assertTrue(all(not Path(item["path"]).is_absolute() for item in manifest["inputs"]["source_frames"]))
        self.assertTrue(all("path" not in item for item in manifest["inputs"]["selection"]["winner"]["frames"]))
        self.assertTrue((output / "contact-sheet.png").is_file())

        with Image.open(output / "spritesheet.png") as sheet, Image.open(output / "frames" / "frame-005.png") as frame:
            cell = sheet.crop((64, 64, 128, 128))
            self.assertIsNone(ImageChops.difference(cell.convert("RGBA"), frame.convert("RGBA")).getbbox())
        with Image.open(output / "turtle-jump.gif") as gif:
            self.assertEqual(gif.n_frames, 8)
            self.assertEqual(gif.info.get("loop"), 0)
            durations = []
            for frame_index in range(gif.n_frames):
                gif.seek(frame_index)
                durations.append(int(gif.info["duration"]))
            self.assertEqual(set(durations), {120, 130})
            self.assertEqual(durations.count(120), 4)
            self.assertEqual(durations.count(130), 4)
            self.assertEqual(sum(durations), 1000)
            self.assertEqual(gif.n_frames / (sum(durations) / 1000), 8.0)
        self.assertEqual(validation["checks"]["gif_durations_ms"], durations)
        self.assertAlmostEqual(validation["checks"]["ffprobe_effective_fps"], 8.0, places=6)

        raw_qa = json.loads((output / "qa-raw.json").read_text(encoding="utf-8"))
        self.assertTrue(raw_qa["hard_pass"])

    def test_best_effort_selection_still_packages_a_gif_with_visible_warnings(self) -> None:
        selection = make_selection(self.raw_frames)
        selection.update({
            "schema_version": 2,
            "selection_mode": "best-effort",
            "hard_pass": False,
            "failed_frames": [{"frame": 3, "candidate": 0, "failures": ["POSE_GATE"]}],
            "warnings": ["selected the best available path from the original candidate pool"],
            "review_policy": {
                "max_passes": 2,
                "candidate_pool": "same-generation-batch",
                "automatic_regeneration": False,
                "must_select_best_available": True,
            },
        })
        selection["winner"].update({"hard_pass": False, "hard_failure_count": 1})
        selection["winner"]["frames"][3].update({
            "hard_pass": False,
            "failures": ["POSE_GATE"],
        })
        selection_path = write_json(self.root / "best-effort-selection.json", selection)
        plan_path = write_json(self.root / "best-effort-motion-plan.json", self.plan)
        output = self.root / "best-effort-bundle"

        package_animation(selection_path, plan_path, output, name="best-effort", columns=4)
        manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))

        self.assertTrue((output / "best-effort.gif").is_file())
        self.assertEqual(manifest["status"], "best-effort-with-warnings")
        self.assertFalse(manifest["inputs"]["selection"]["hard_pass"])
        self.assertEqual(manifest["inputs"]["selection"]["review_policy"]["max_passes"], 2)
        self.assertTrue(manifest["warnings"])

    def test_lower_body_pivot_ignores_connected_upper_projectile_effect(self) -> None:
        alpha = Image.new("L", (64, 64), 0)
        draw = ImageDraw.Draw(alpha)
        draw.rounded_rectangle((28, 30, 44, 55), radius=4, fill=255)
        draw.line((29, 32, 8, 9), fill=255, width=2)
        draw.ellipse((3, 4, 12, 13), fill=255)

        full_bounds = alpha.getbbox()
        self.assertIsNotNone(full_bounds)
        full_center_x = (full_bounds[0] + full_bounds[2]) / 2
        root_x, root_y = lower_body_pivot(alpha)

        self.assertGreater(abs(root_x - full_center_x), 8)
        self.assertEqual(root_x, 36.5)
        self.assertEqual(root_y, 56)

    def test_standalone_sprite_and_gif_reject_mixed_canvas_sizes(self) -> None:
        first = self.root / "a.png"
        second = self.root / "b.png"
        Image.new("RGBA", (32, 32), (0, 200, 0, 255)).save(first)
        Image.new("RGBA", (48, 32), (0, 200, 0, 255)).save(second)

        with self.assertRaisesRegex(ValueError, "identical dimensions"):
            build_spritesheet([first, second], self.root / "invalid-sheet.png")
        with self.assertRaisesRegex(ValueError, "identical dimensions"):
            assemble_gif([first, second], self.root / "invalid.gif")

    def test_one_shot_gif_omits_netscape_loop_extension(self) -> None:
        rgba_frames = []
        for index, source in enumerate(self.raw_frames[:2]):
            destination = self.root / f"one-shot-{index:03d}.png"
            remove_magenta(source, destination)
            rgba_frames.append(destination)
        output = assemble_gif(rgba_frames, self.root / "one-shot.gif", durations_ms=[80, 120], loop=None)

        payload = output.read_bytes()
        self.assertNotIn(b"NETSCAPE2.0", payload)
        with Image.open(output) as gif:
            self.assertNotIn("loop", gif.info)
            self.assertEqual(len(list(ImageSequence.Iterator(gif))), 2)

    def test_ping_pong_package_preserves_variable_durations_and_effective_fps(self) -> None:
        selection_path = write_json(self.root / "selection.json", make_selection(self.raw_frames))
        plan = json.loads(json.dumps(self.plan))
        plan["loop"] = "ping-pong"
        durations = [100, 150, 100, 150, 100, 150, 100, 150]
        for frame, duration in zip(plan["frames"], durations):
            frame["duration_ms"] = duration
        plan_path = write_json(self.root / "motion-plan-ping-pong.json", plan)
        output = self.root / "ping-pong-bundle"

        package_animation(selection_path, plan_path, output, name="ping-pong", columns=4)
        validation = validate_bundle(output)
        metadata = json.loads((output / "animation.json").read_text(encoding="utf-8"))

        self.assertTrue(validation["valid"], validation["errors"])
        self.assertEqual(metadata["playback"], list(range(8)) + list(range(6, 0, -1)))
        self.assertEqual(validation["checks"]["gif_frame_count"], 14)
        self.assertEqual(set(validation["checks"]["gif_durations_ms"]), {100, 150})
        self.assertAlmostEqual(validation["checks"]["ffprobe_effective_fps"], 8.0, places=6)

    def test_analyzer_marks_clipped_subject_as_hard_failure(self) -> None:
        clipped = self.root / "clipped.png"
        image = Image.new("RGB", (64, 64), (255, 0, 255))
        ImageDraw.Draw(image).rectangle((0, 12, 30, 55), fill=(20, 150, 60))
        image.save(clipped)

        report = analyze([clipped], (255, 0, 255), 40, safe_margin=1)

        self.assertFalse(report["hard_pass"])
        self.assertTrue(report["frames"][0]["clipped"])
        self.assertFalse(report["frames"][0]["hard_pass"])

    def test_analyzer_records_transition_masks_and_cumulative_drift(self) -> None:
        diff_dir = self.root / "change-masks"
        report = analyze(
            self.raw_frames[:3], (255, 0, 255), 40,
            safe_margin=1, expected_size=(64, 64), diff_dir=diff_dir,
        )

        self.assertEqual(len(report["transitions"]), 2)
        self.assertEqual(len(report["cumulative_from_frame_0"]), 3)
        self.assertEqual(report["cumulative_from_frame_0"][0]["silhouette_iou"], 1.0)
        for transition in report["transitions"]:
            change = transition["change_mask"]
            self.assertGreater(change["changed_fraction"], 0)
            self.assertIsNotNone(change["bounds"])
            self.assertTrue(Path(change["path"]).is_file())
            self.assertEqual(sha256(change["path"]), change["sha256"])

    def test_validator_rejects_visible_selected_key_residue(self) -> None:
        output = self._package()
        frame_path = output / "frames" / "frame-000.png"
        with Image.open(frame_path) as source:
            contaminated = source.convert("RGBA")
        pixels = contaminated.load()
        changed = 0
        for y in range(contaminated.height):
            for x in range(contaminated.width):
                if pixels[x, y][3] > 40:
                    pixels[x, y] = (255, 0, 255, 255)
                    changed += 1
                    if changed == 40:
                        break
            if changed == 40:
                break
        self.assertEqual(changed, 40)
        contaminated.save(frame_path, "PNG")

        validation = validate_bundle(output)

        self.assertFalse(validation["valid"])
        self.assertTrue(any("edge contains" in error and "visible selected-key pixels" in error for error in validation["errors"]))

    def test_passed_visual_review_is_hashed_into_manifest_and_verified(self) -> None:
        output = self._package()
        review_source = write_json(self.root / "review.json", make_passed_review())
        write_json(output / "validation.json", validate_bundle(output))

        manifest_path = approve_animation(output, review_source)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        review_path = output / "visual-review.json"

        self.assertEqual(manifest["status"], "passed")
        self.assertEqual(manifest["outputs"]["visual_review"], {
            "path": "visual-review.json",
            "sha256": sha256(review_path),
            "status": "passed",
        })
        self.assertEqual(manifest["approval"]["technical_validation"]["path"], "provenance/pre-approval-validation.json")
        self.assertTrue(validate_bundle(output)["valid"])

        write_json(review_path, {"schema_version": 1, "status": "failed"})
        tampered = validate_bundle(output)
        self.assertFalse(tampered["valid"])
        self.assertTrue(any("visual review did not pass" in error for error in tampered["errors"]))
        self.assertTrue(any("visual review hash mismatch" in error for error in tampered["errors"]))

    def test_approval_rejects_missing_limb_or_contact_continuity_checks(self) -> None:
        output = self._package()
        write_json(output / "validation.json", validate_bundle(output))
        review = make_passed_review()
        del review["checks"]["limb_continuity"]
        review["checks"]["contact_continuity"] = {"passed": False}
        review_source = write_json(self.root / "review.json", review)

        with self.assertRaisesRegex(
            ValueError,
            "contact_continuity, limb_continuity",
        ):
            approve_animation(output, review_source)

    def test_approval_fails_closed_without_current_technical_validation(self) -> None:
        output = self._package()
        review_source = write_json(self.root / "review.json", make_passed_review())

        with self.assertRaisesRegex(FileNotFoundError, "validation.json"):
            approve_animation(output, review_source)

        stale = validate_bundle(output)
        write_json(output / "validation.json", stale)
        manifest_path = output / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["name"] = "tampered-after-validation"
        write_json(manifest_path, manifest)
        with self.assertRaisesRegex(ValueError, "stale"):
            approve_animation(output, review_source)

    def test_approval_revalidates_bundle_assets_after_validation_file_was_written(self) -> None:
        output = self._package()
        review_source = write_json(self.root / "review.json", make_passed_review())
        write_json(output / "validation.json", validate_bundle(output))
        frame_path = output / "frames" / "frame-000.png"
        with Image.open(frame_path) as source:
            damaged = source.convert("RGBA")
        damaged.putpixel((0, 0), (255, 0, 255, 255))
        damaged.save(frame_path, "PNG")

        with self.assertRaisesRegex(ValueError, "no longer passes"):
            approve_animation(output, review_source)

    def test_validator_rejects_manifest_path_escape(self) -> None:
        output = self._package()
        manifest_path = output / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["outputs"]["contact_sheet"]["path"] = "../reference.png"
        write_json(manifest_path, manifest)

        validation = validate_bundle(output)

        self.assertFalse(validation["valid"])
        self.assertTrue(any("escapes the bundle directory" in error for error in validation["errors"]))

    def test_validator_and_packager_fail_closed_on_missing_selected_or_final_frame(self) -> None:
        broken_selection = make_selection(self.raw_frames)
        broken_selection["winner"]["frames"][4]["path"] = str(self.root / "missing.png")
        selection_path = write_json(self.root / "broken-selection.json", broken_selection)
        plan_path = write_json(self.root / "motion-plan.json", self.plan)
        with self.assertRaisesRegex(ValueError, "missing or empty frame"):
            package_animation(selection_path, plan_path, self.root / "broken-bundle")

        output = self._package()
        (output / "frames" / "frame-004.png").unlink()
        validation = validate_bundle(output)
        self.assertFalse(validation["valid"])
        self.assertTrue(any("missing frame 4" in error for error in validation["errors"]))


if __name__ == "__main__":
    unittest.main()
