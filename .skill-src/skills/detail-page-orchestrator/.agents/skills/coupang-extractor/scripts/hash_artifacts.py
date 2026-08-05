from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

from capture_tools import utc_now, write_json_atomic


def hash_tree(bundle_dir: Path, output: Path) -> dict:
    files = []
    output_resolved = output.resolve()
    for path in sorted(p for p in bundle_dir.rglob("*") if p.is_file()):
        if path.resolve() == output_resolved:
            continue
        data = path.read_bytes()
        files.append(
            {
                "path": path.relative_to(bundle_dir).as_posix(),
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        )
    return {"generated_at": utc_now(), "algorithm": "sha256", "files": files}


def main() -> int:
    parser = argparse.ArgumentParser(description="캡처 번들의 모든 파일 SHA-256을 기록합니다.")
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    bundle = args.bundle.resolve()
    if not bundle.is_dir():
        parser.error("bundle 디렉터리가 없습니다.")
    output = (args.output or (bundle / "artifact-hashes.json")).resolve()
    manifest = hash_tree(bundle, output)
    write_json_atomic(output, manifest)
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
