from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SKILL_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = SKILL_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from run_generation import chain_references, invoke_tibo, tibo_script_path, validate_tibo_manifest  # noqa: E402


class TiboRunnerResolutionTests(unittest.TestCase):
    """God Tibo 러너와 Node 실행기를 호스트가 지정할 수 있어야 한다.

    이 스킬을 다른 저장소 안에서 쓸 때 god-tibo 는 형제 디렉터리에 없을 수 있고,
    Node 도 PATH 의 것이 아니라 그 프로젝트가 고정한 실행기여야 할 수 있다.
    기본 동작(형제 디렉터리 · PATH 의 `node`)은 그대로 둔다.
    """

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        runner = self.root / "skill" / "scripts" / "tibo-batch.mjs"
        runner.parent.mkdir(parents=True)
        runner.write_text("// stub\n", encoding="utf-8")
        self.runner = runner

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_env_skill_root_selects_the_runner(self) -> None:
        with mock.patch.dict(os.environ, {"GOD_TIBO_SKILL_ROOT": str(self.root / "skill")}):
            self.assertEqual(tibo_script_path(), self.runner.resolve())

    def test_without_env_it_falls_back_to_the_sibling_skill(self) -> None:
        expected = SKILL_ROOT.parent / "god-tibo-gpt-image2-skill" / "scripts" / "tibo-batch.mjs"
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("GOD_TIBO_SKILL_ROOT", None)
            self.assertEqual(tibo_script_path(), expected.resolve())

    def test_a_wrong_env_root_fails_loudly_instead_of_falling_back(self) -> None:
        # 조용히 형제 디렉터리로 떨어지면, 잘못 설정된 환경변수가 "동작하는 것처럼"
        # 보이면서 다른 god-tibo 를 부른다. 그건 진단할 수 없는 실패다.
        with mock.patch.dict(os.environ, {"GOD_TIBO_SKILL_ROOT": str(self.root / "nope")}):
            with self.assertRaises(ValueError) as caught:
                tibo_script_path()
        self.assertIn("nope", str(caught.exception))

    def test_env_node_binary_is_used_for_the_command(self) -> None:
        with mock.patch.dict(os.environ, {
            "GOD_TIBO_SKILL_ROOT": str(self.root / "skill"),
            "GOD_TIBO_NODE": r"C:\local\node.exe",
        }), mock.patch("run_generation.subprocess.run") as run:
            invoke_tibo(self.root / "job.json", dry_run=False)
        command = run.call_args.args[0]
        self.assertEqual(command[0], r"C:\local\node.exe")
        self.assertEqual(command[1], str(self.runner.resolve()))

    def test_without_env_node_it_uses_path_node(self) -> None:
        with mock.patch.dict(os.environ, {"GOD_TIBO_SKILL_ROOT": str(self.root / "skill")}), \
                mock.patch("run_generation.subprocess.run") as run:
            os.environ.pop("GOD_TIBO_NODE", None)
            invoke_tibo(self.root / "job.json", dry_run=True)
        command = run.call_args.args[0]
        self.assertEqual(command[0], "node")
        self.assertIn("--dry-run", command)

    def test_chain_dry_run_supplies_the_reference_roles_each_prompt_declares(self) -> None:
        original = self.root / "canonical.png"
        original.write_bytes(b"canonical")

        self.assertEqual(
            chain_references("anchored", original, [], dry_run=True, frame_index=0),
            [str(original)],
        )
        self.assertEqual(
            chain_references("anchored", original, [], dry_run=True, frame_index=1),
            [str(original), str(original)],
        )
        self.assertEqual(
            chain_references("history", original, [], dry_run=True, frame_index=2),
            [str(original), str(original), str(original)],
        )

    def write_live_manifest(self, *, result_source: str = "final", include_backend_raw: bool = True) -> Path:
        output = self.root / "frame-000.png"
        backend = self.root / "raw-000.png"
        output.write_bytes(b"final")
        backend.write_bytes(b"backend")
        payload = {
            "dry_run": False,
            "preserve_backend_raw": True,
            "images": [{
                "path": str(output),
                "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                "result_source": result_source,
                "backend_raw": {
                    "path": str(backend),
                    "sha256": hashlib.sha256(backend.read_bytes()).hexdigest(),
                } if include_backend_raw else None,
                "size_check": {"matches_expected": True},
            }],
        }
        path = self.root / "manifest.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def test_live_manifest_requires_a_completed_final_and_backend_original(self) -> None:
        manifest = self.write_live_manifest()
        validate_tibo_manifest(manifest, 1, dry_run=False)

        manifest = self.write_live_manifest(result_source="partial-fallback")
        with self.assertRaisesRegex(ValueError, "completed final image"):
            validate_tibo_manifest(manifest, 1, dry_run=False)

        manifest = self.write_live_manifest(include_backend_raw=False)
        with self.assertRaisesRegex(ValueError, "backend original is missing"):
            validate_tibo_manifest(manifest, 1, dry_run=False)


if __name__ == "__main__":
    unittest.main()
