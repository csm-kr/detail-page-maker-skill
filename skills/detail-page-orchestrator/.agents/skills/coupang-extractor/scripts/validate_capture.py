from __future__ import annotations

import argparse
import json
from pathlib import Path

from capture_tools import load_json, validate_capture, write_json_atomic


def main() -> int:
    parser = argparse.ArgumentParser(description="쿠팡 portable capture bundle을 검증합니다.")
    parser.add_argument("capture", type=Path)
    parser.add_argument("--verify-files", action="store_true")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    capture_path = args.capture.resolve()
    capture = load_json(capture_path)
    errors = validate_capture(capture, base_dir=capture_path.parent, verify_files=args.verify_files)
    report = {
        "status": "VALID" if not errors else "INVALID",
        "capture": str(capture_path),
        "verify_files": args.verify_files,
        "error_count": len(errors),
        "errors": errors,
    }
    if args.report:
        write_json_atomic(args.report.resolve(), report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
