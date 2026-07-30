from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from capture_tools import (
    CaptureError,
    assemble_capture,
    parse_product_identity,
    utc_now,
    validate_capture,
    write_json_atomic,
)
from bundle_layout import default_output_path, prepare_staging, promote, sha256_file, write_bundle_views, write_failure
from download_assets import download_capture_assets


SCRIPT_DIR = Path(__file__).resolve().parent
SENTINELS = {
    "__CE_PAGE__": "page",
    "__CE_THUMBNAILS__": "thumbnails",
    "__CE_DETAIL__": "detail",
    "__CE_REVIEWS__": "reviews",
    "__CE_RECORDING__": "recording",
}


def _start_expression(
    common: str,
    collector: str,
    global_name: str,
    options: dict[str, Any],
    job_key: str,
) -> str:
    opts = json.dumps(options, ensure_ascii=False, separators=(",", ":"))
    key = json.dumps(job_key)
    return f"""(()=>{{
{common}
{collector}
globalThis.__coupangExtractorJobs=globalThis.__coupangExtractorJobs||{{}};
const job={{done:false,result:null,error:null,started_at:new Date().toISOString()}};
globalThis.__coupangExtractorJobs[{key}]=job;
Promise.resolve(globalThis.{global_name}.collect({opts})).then(
  result=>{{job.result=result;job.done=true;}},
  error=>{{job.error=(error&&error.name)||'CollectorError';job.done=true;}}
);
return {{started:true,job:{key}}};
}})()"""


def _poll_expression(job_key: str) -> str:
    key = json.dumps(job_key)
    return (
        "(()=>{const jobs=globalThis.__coupangExtractorJobs||{};"
        f"const job=jobs[{key}];"
        "return job?{done:job.done,result:job.result,error:job.error}:null;})()"
    )


def _failure_fragment_expression(section: str, reason: str) -> str:
    kind = json.dumps(section)
    reason_json = json.dumps(reason)
    if section == "reviews":
        payload = (
            "{scope:{requested_max_pages:1,requested_max_reviews:1,requested_latest_reviews:100,requested_supplement_reviews:1,pages_observed:0,reviews_observed:0,latest_reviews_observed:0,supplement_reviews_observed:0,complete_all_reviews:false},"
            + "items:[],diagnostics:{stop_reason:"
            + reason_json
            + "}}"
        )
    else:
        payload = "{assets:[],diagnostics:{stop_reason:" + reason_json + "}}"
    return f"globalThis.CoupangExtractorCommon.fragment({kind},'PARTIAL',{payload})"


def _browser_program(
    url: str,
    sections: set[str],
    max_latest_pages: int,
    max_supplement_pages: int,
    latest_reviews: int,
    supplement_reviews: int,
    recording_name: str,
) -> str:
    common = (SCRIPT_DIR / "browser-common.js").read_text(encoding="utf-8")
    specs = {
        "thumbnails": ("thumbnail-collector.js", "CoupangExtractorThumbnail", {"maxItems": 50, "itemTimeoutMs": 5000}),
        "detail": ("detail-collector.js", "CoupangExtractorDetail", {"maxSteps": 75, "maxMs": 60000}),
        "reviews": (
            "review-collector.js",
            "CoupangExtractorReviews",
            {
                "maxLatestPages": max_latest_pages,
                "maxSupplementPages": max_supplement_pages,
                "latestReviews": latest_reviews,
                "supplementReviews": supplement_reviews,
                "pageTimeoutMs": 7000,
            },
        ),
    }
    start_expressions = {}
    poll_expressions = {}
    for section, (filename, global_name, options) in specs.items():
        collector = (SCRIPT_DIR / filename).read_text(encoding="utf-8")
        expression = _start_expression(common, collector, global_name, options, section)
        start_expressions[section] = base64.b64encode(expression.encode("utf-8")).decode("ascii")
        poll_expressions[section] = _poll_expression(section)
    lines = [
        "import base64, json, time",
        f"recording_dir = start_recording({recording_name!r}, title='Coupang product evidence extraction')",
        "print('__CE_RECORDING__' + json.dumps(recording_dir, ensure_ascii=True))",
        f"new_tab({url!r})",
        "wait_for_load()",
        "time.sleep(2)",
        "page = page_info()",
        "print('__CE_PAGE__' + json.dumps(page, ensure_ascii=True))",
        "blocked = False",
    ]
    for section, sentinel in (
        ("thumbnails", "__CE_THUMBNAILS__"),
        ("detail", "__CE_DETAIL__"),
        ("reviews", "__CE_REVIEWS__"),
    ):
        if section not in sections:
            continue
        job_timeout = (
            60
            if section == "thumbnails"
            else 100
            if section == "detail"
            else (max_latest_pages + max_supplement_pages) * 16 + 45
        )
        failure_expression = _failure_fragment_expression(section, "COLLECTOR_JOB_TIMEOUT")
        lines.extend(
            [
                "if not blocked:",
                f"    expression = base64.b64decode({start_expressions[section]!r}).decode('utf-8')",
                "    js(expression)",
                f"    deadline = time.time() + {job_timeout}",
                "    state = None",
                "    while time.time() < deadline:",
                f"        state = js({poll_expressions[section]!r})",
                "        if state and state.get('done'):",
                "            break",
                "        time.sleep(0.5)",
                "    if state and state.get('done') and state.get('result'):",
                "        result = state['result']",
                "    else:",
                f"        result = js({failure_expression!r})",
                f"    print({sentinel!r} + json.dumps(result, ensure_ascii=True))",
                "    blocked = result.get('status') in ('ACCESS_BLOCKED', 'LOGIN_REQUIRED')",
            ]
        )
    lines.append("stop_recording()")
    return "\n".join(lines) + "\n"


def _parse_browser_output(stdout: str) -> dict[str, Any]:
    values: dict[str, Any] = {}
    for line in stdout.splitlines():
        for sentinel, key in SENTINELS.items():
            if line.startswith(sentinel):
                values[key] = json.loads(line[len(sentinel) :])
                break
    return values


def main() -> int:
    parser = argparse.ArgumentParser(description="쿠팡 URL 하나에서 썸네일·상세·공개 후기를 수집합니다.")
    parser.add_argument("--url", required=True)
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    parser.add_argument("--output", type=Path, help="비어 있거나 존재하지 않는 출력 디렉터리")
    parser.add_argument("--sections", default="thumbnails,detail,reviews")
    parser.add_argument("--max-latest-pages", type=int, default=12)
    parser.add_argument("--max-supplement-pages", type=int, default=24)
    parser.add_argument("--max-review-pages", type=int, help="호환 옵션: 최신·보강 단계에 같은 페이지 상한 적용")
    parser.add_argument("--latest-reviews", type=int, default=100)
    parser.add_argument("--supplement-reviews", "--max-reviews", dest="supplement_reviews", type=int, default=100)
    parser.add_argument("--browser-timeout", type=int, default=900)
    parser.add_argument("--no-download", action="store_true")
    args = parser.parse_args()
    try:
        identity = parse_product_identity(args.url)
    except CaptureError as exc:
        print(json.dumps({"status": exc.code, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    if args.max_review_pages is not None:
        args.max_latest_pages = args.max_review_pages
        args.max_supplement_pages = args.max_review_pages
    if not 1 <= args.max_latest_pages <= 30 or not 1 <= args.max_supplement_pages <= 30:
        parser.error("후기 페이지 상한은 단계별 1~30페이지입니다.")
    if not 100 <= args.latest_reviews <= 299:
        parser.error("최신 후기 최소 표본은 100~299개입니다.")
    if not 1 <= args.supplement_reviews <= 200 or args.latest_reviews + args.supplement_reviews > 300:
        parser.error("보강 표본은 1~200개이며 최신 표본과 합쳐 300개 이하여야 합니다.")
    allowed_sections = {"thumbnails", "detail", "reviews"}
    sections = {part.strip() for part in args.sections.split(",") if part.strip()}
    if not sections or not sections <= allowed_sections:
        parser.error("--sections는 thumbnails,detail,reviews의 쉼표 목록이어야 합니다.")

    workspace = args.workspace.resolve()
    requested_output = args.output.resolve() if args.output else default_output_path(workspace, identity)
    try:
        output_dir, bundle_dir = prepare_staging(requested_output)
    except FileExistsError as exc:
        print(json.dumps({"status": "OUTPUT_EXISTS", "error": str(exc), "output": str(requested_output)}, ensure_ascii=False))
        return 2
    harness = shutil.which("browser-harness")
    if not harness:
        write_failure(bundle_dir, code="LOCAL_RUNTIME_FAILED", message="browser-harness 명령을 찾지 못했습니다.", details={})
        print(bundle_dir)
        return 3

    recording_name = f"coupang-{identity['product_id']}-{identity['item_id']}-extract"
    program = _browser_program(
        args.url,
        sections,
        args.max_latest_pages,
        args.max_supplement_pages,
        args.latest_reviews,
        args.supplement_reviews,
        recording_name,
    )
    environment = os.environ.copy()
    environment["BH_AGENT_WORKSPACE"] = str(bundle_dir / "evidence" / "browser-harness")
    try:
        completed = subprocess.run(
            [harness],
            input=program,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=args.browser_timeout,
            check=False,
            env=environment,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        write_failure(
            bundle_dir,
            code="LOCAL_RUNTIME_FAILED",
            message="Browser Harness 실행에 실패했습니다.",
            details={"error_type": type(exc).__name__},
        )
        print(bundle_dir)
        return 3
    values = _parse_browser_output(completed.stdout)
    diagnostics = {
        "status": "BROWSER_COMPLETED" if completed.returncode == 0 else "LOCAL_RUNTIME_FAILED",
        "recorded_at": utc_now(),
        "return_code": completed.returncode,
        "requested_sections": sorted(sections),
        "observed_sections": sorted(key for key in values if key != "page"),
        "page": values.get("page"),
        "stdout_line_count": len(completed.stdout.splitlines()),
        "stderr_tail": completed.stderr[-4000:],
    }
    if completed.returncode != 0 or not any(section in values for section in sections):
        write_failure(
            bundle_dir,
            code="LOCAL_RUNTIME_FAILED",
            message="Browser Harness가 요청한 수집 조각을 반환하지 못했습니다.",
            details=diagnostics,
        )
        print(json.dumps({"status": "LOCAL_RUNTIME_FAILED", "bundle": str(bundle_dir)}, ensure_ascii=False))
        return 3

    fragments = {section: values[section] for section in sections if section in values}
    page = values.get("page") if isinstance(values.get("page"), dict) else {}
    try:
        capture = assemble_capture(
            fragments,
            requested_url=args.url,
            final_url=page.get("url"),
            method="browser-harness",
        )
    except CaptureError as exc:
        write_failure(
            bundle_dir,
            code=exc.code,
            message=str(exc),
            details={"observed_sections": sorted(fragments)},
        )
        print(json.dumps({"status": exc.code, "bundle": str(bundle_dir)}, ensure_ascii=False))
        return 4

    if not args.no_download and capture.get("status") != "ACCESS_BLOCKED":
        download_capture_assets(capture, bundle_dir)
    verify_files = not args.no_download and capture.get("status") != "ACCESS_BLOCKED"
    errors = validate_capture(capture, base_dir=bundle_dir, verify_files=verify_files)
    if errors:
        capture["status"] = "VALIDATION_FAILED"
    validation = {
        "status": "VALID" if not errors else "INVALID",
        "verified_files": verify_files,
        "error_count": len(errors),
        "errors": errors,
    }
    if errors or capture.get("status") == "ACCESS_BLOCKED":
        write_json_atomic(bundle_dir / "capture.json", capture)
        write_json_atomic(bundle_dir / "evidence" / "validation.json", validation)
        write_failure(
            bundle_dir,
            code="VALIDATION_FAILED" if errors else "ACCESS_BLOCKED",
            message="검증을 통과하지 못해 정상 출력으로 승격하지 않았습니다." if errors else "접근 제한으로 정상 출력으로 승격하지 않았습니다.",
            details={"validation_errors": len(errors), "recording_dir": values.get("recording")},
        )
        print(json.dumps({"status": capture["status"], "bundle": str(bundle_dir), "validation_errors": len(errors)}, ensure_ascii=False))
        return 1 if errors else 3
    manifest = write_bundle_views(
        bundle_dir,
        capture,
        runner_diagnostics=diagnostics,
        validation=validation,
        recording_dir=values.get("recording") if isinstance(values.get("recording"), str) else None,
    )
    promote(bundle_dir, output_dir)
    manifest_path = output_dir / "manifest.json"
    summary = {
        "status": capture["status"],
        "bundle": str(output_dir),
        "thumbnails": len(capture.get("thumbnails", {}).get("assets", [])),
        "detail_assets": len(capture.get("detail", {}).get("assets", [])),
        "reviews": len(capture.get("reviews", {}).get("items", [])),
        "validation_errors": len(errors),
        "manifest_sha256": sha256_file(manifest_path),
        "recording_dir": (manifest.get("artifacts") and next((item["path"].rsplit("/", 1)[0] for item in manifest["artifacts"] if item["path"].startswith("evidence/browser-harness/recordings/")), None)),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if not errors and capture["status"] in {"READY", "PARTIAL", "ACCESS_BLOCKED"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
