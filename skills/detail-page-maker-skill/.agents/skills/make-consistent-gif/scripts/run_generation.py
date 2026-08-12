#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from build_tibo_jobs import build_chain, build_parallel, resolve_strategy, validate_inputs
from common import load_json, require_new_directory, sha256, write_json


def tibo_script_path() -> Path:
    """God Tibo 러너의 경로.

    기본은 형제 스킬 디렉터리다. 이 스킬을 다른 저장소 안에 넣어 쓸 때는 god-tibo
    가 그 자리에 없을 수 있으므로 `GOD_TIBO_SKILL_ROOT` 로 지정할 수 있다.
    지정된 경로에 러너가 없으면 **조용히 형제 디렉터리로 떨어지지 않는다** —
    잘못 설정된 환경변수가 다른 god-tibo 를 부르면 진단할 수 없는 실패가 된다.
    """
    skill_root = os.environ.get("GOD_TIBO_SKILL_ROOT")
    if skill_root:
        script = Path(skill_root).expanduser().resolve() / "scripts" / "tibo-batch.mjs"
        if not script.is_file():
            raise ValueError(f"GOD_TIBO_SKILL_ROOT God Tibo runner is missing: {script}")
        return script
    script = Path(__file__).resolve().parents[2] / "god-tibo-gpt-image2-skill" / "scripts" / "tibo-batch.mjs"
    if not script.is_file():
        raise ValueError(f"sibling God Tibo runner is missing: {script}")
    return script


def node_binary() -> str:
    """Node 실행기. 호스트가 고정한 실행기가 있으면 `GOD_TIBO_NODE` 로 넘긴다."""
    return os.environ.get("GOD_TIBO_NODE") or "node"


def invoke_tibo(job_path: Path, *, dry_run: bool) -> None:
    command = [node_binary(), str(tibo_script_path()), "--job", str(job_path)]
    if dry_run:
        command.append("--dry-run")
    # God Tibo persists its canonical manifest beside the outputs. Suppress the
    # duplicate stdout JSON because dry-run manifests can include large request
    # payloads for every reference image.
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL)


def copy_generated(source: Path, destination: Path) -> Path:
    if not source.is_file() or source.stat().st_size == 0:
        raise ValueError(f"God Tibo did not produce an expected frame: {source}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    return destination.resolve()


def validate_tibo_manifest(path: Path, expected_count: int, *, dry_run: bool) -> dict[str, Any]:
    manifest = load_json(path)
    if bool(manifest.get("dry_run")) != dry_run:
        raise ValueError(f"God Tibo manifest dry-run state mismatch: {path}")
    images = manifest.get("images") or []
    if len(images) != expected_count:
        raise ValueError(f"God Tibo manifest expected {expected_count} images, found {len(images)}")
    if not dry_run:
        if not manifest.get("preserve_backend_raw"):
            raise ValueError(f"God Tibo manifest did not preserve backend originals: {path}")
        for image in images:
            output = Path(image.get("path", "")).expanduser().resolve()
            backend_raw = image.get("backend_raw") or {}
            backend_output = Path(backend_raw.get("path", "")).expanduser().resolve()
            size_check = image.get("size_check") or {}
            if not output.is_file() or output.stat().st_size == 0:
                raise ValueError(f"God Tibo manifest references a missing output: {output}")
            if not size_check.get("matches_expected"):
                raise ValueError(f"God Tibo size check failed: {output}")
            if not image.get("sha256") or sha256(output) != image["sha256"]:
                raise ValueError(f"God Tibo output hash mismatch: {output}")
            if image.get("result_source") != "final":
                raise ValueError(f"God Tibo did not return a completed final image: {output}")
            if not backend_output.is_file() or backend_output.stat().st_size == 0:
                raise ValueError(f"God Tibo backend original is missing: {backend_output}")
            if not backend_raw.get("sha256") or sha256(backend_output) != backend_raw["sha256"]:
                raise ValueError(f"God Tibo backend original hash mismatch: {backend_output}")
    return manifest


def run_parallel(
    job: dict[str, Any], plan: dict[str, Any], work_dir: Path, *, dry_run: bool
) -> dict[str, Any]:
    reference, generation = validate_inputs(job, plan)
    payload, mapping = build_parallel(job, plan, reference, generation)
    job_path = write_json(work_dir / "tibo-parallel-job.json", payload)
    write_json(work_dir / "candidate-mapping.json", mapping)
    invoke_tibo(job_path, dry_run=dry_run)
    raw_dir = work_dir / payload["output_dir"]
    manifest_path = raw_dir / "manifest.json"
    validate_tibo_manifest(manifest_path, len(mapping["mapping"]), dry_run=dry_run)
    candidates = []
    if not dry_run:
        for item in mapping["mapping"]:
            source = raw_dir / f"frame-{int(item['generated_index']):03d}.png"
            destination = work_dir / "candidates" / f"frame-{int(item['frame']):03d}" / f"candidate-{int(item['candidate']):02d}.png"
            candidates.append({**item, "path": str(copy_generated(source, destination))})
    return {
        "strategy": "parallel-candidates",
        "dry_run": dry_run,
        "tibo_job": str(job_path),
        "tibo_manifest": str(manifest_path.resolve()),
        "candidates": candidates,
    }


def chain_references(
    mode: str,
    original: Path,
    generated: list[Path],
    *,
    dry_run: bool,
    frame_index: int = 0,
) -> list[str]:
    if dry_run:
        if frame_index == 0 or mode == "pure":
            return [str(original)]
        if mode == "anchored":
            return [str(original), str(original)]
        return [str(original), str(original), str(original)]
    if not generated:
        return [str(original)]
    previous = generated[-1]
    if mode == "pure":
        return [str(previous)]
    references = [str(previous), str(original)]
    if mode == "history" and len(generated) >= 2:
        references.append(str(generated[-2]))
    return references


def run_chain(
    job: dict[str, Any], plan: dict[str, Any], work_dir: Path, *, dry_run: bool, resume: bool = False
) -> dict[str, Any]:
    original, generation = validate_inputs(job, plan)
    chain, mapping = build_chain(job, plan, original, generation)
    chain_path = write_json(work_dir / "tibo-chain-plan.json", chain)
    write_json(work_dir / "candidate-mapping.json", mapping)
    generated: list[Path] = []
    candidates: list[dict[str, Any]] = []
    tibo_manifests: list[str] = []
    for step in chain["steps"]:
        index = int(step["frame"])
        raw_name = f"raw-step-{index:03d}"
        tibo_job = {
            "prompt": step["prompt"],
            "references": chain_references(
                chain["chain_mode"], original, generated,
                dry_run=dry_run, frame_index=index,
            ),
            "batch_size": 1,
            "workers": 1,
            "detail_level": chain["detail_level"],
            "output_dir": raw_name,
            "preserve_backend_raw": chain["preserve_backend_raw"],
            **chain["size"],
        }
        job_path = work_dir / "chain-jobs" / f"frame-{index:03d}.json"
        if resume and job_path.is_file():
            if load_json(job_path) != tibo_job:
                raise ValueError(f"resume job differs from preserved chain job: {job_path}")
        else:
            job_path = write_json(job_path, tibo_job)
        manifest_path = job_path.parent / raw_name / "manifest.json"
        destination = work_dir / "candidates" / f"frame-{index:03d}" / "candidate-00.png"
        if resume and manifest_path.is_file():
            validate_tibo_manifest(manifest_path, 1, dry_run=dry_run)
            if not dry_run and not destination.is_file():
                copy_generated(job_path.parent / raw_name / "frame-000.png", destination)
        else:
            invoke_tibo(job_path, dry_run=dry_run)
        validate_tibo_manifest(manifest_path, 1, dry_run=dry_run)
        tibo_manifests.append(str(manifest_path.resolve()))
        if not dry_run:
            source = job_path.parent / raw_name / "frame-000.png"
            saved = destination.resolve() if destination.is_file() else copy_generated(source, destination)
            generated.append(saved)
            candidates.append({"frame": index, "candidate": 0, "path": str(saved), "tibo_job": str(job_path)})
    return {
        "strategy": "chain",
        "chain_mode": chain["chain_mode"],
        "dry_run": dry_run,
        "chain_plan": str(chain_path),
        "tibo_manifests": tibo_manifests,
        "candidates": candidates,
    }


def run_generation(
    job_path: str | Path,
    plan_path: str | Path,
    work_dir: str | Path,
    *,
    dry_run: bool = False,
    resume: bool = False,
) -> Path:
    job = load_json(job_path)
    plan = load_json(plan_path)
    strategy = resolve_strategy(job.get("generation") or {}, plan)
    if resume:
        destination = Path(work_dir).expanduser().resolve()
        if strategy != "chain" or not destination.is_dir():
            raise ValueError("--resume is supported only for an existing chain work directory")
    else:
        destination = require_new_directory(work_dir, "generation work directory")
    if strategy == "parallel-candidates":
        result = run_parallel(job, plan, destination, dry_run=dry_run)
    elif strategy == "chain":
        result = run_chain(job, plan, destination, dry_run=dry_run, resume=resume)
    else:
        raise ValueError("generation.strategy must resolve to chain or parallel-candidates before execution")
    result.update({
        "schema_version": 1,
        "job": str(Path(job_path).expanduser().resolve()),
        "motion_plan": str(Path(plan_path).expanduser().resolve()),
    })
    return write_json(destination / "generation-run.json", result)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run animation generation through the sibling God Tibo skill.")
    parser.add_argument("--job", required=True)
    parser.add_argument("--motion-plan", required=True)
    parser.add_argument("--work-dir", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    print(run_generation(args.job, args.motion_plan, args.work_dir, dry_run=args.dry_run, resume=args.resume))


if __name__ == "__main__":
    main()
