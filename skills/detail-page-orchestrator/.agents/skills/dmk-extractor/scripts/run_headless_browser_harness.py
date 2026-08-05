#!/usr/bin/env python3
"""Browser Harness를 격리된 임시 headless Chrome 세션에서 실행한다."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


def chrome_candidates() -> list[Path]:
    candidates: list[Path] = []
    if os.environ.get("CHROME_PATH"):
        candidates.append(Path(os.environ["CHROME_PATH"]))
    if sys.platform == "win32":
        for base, suffix in (
            (os.environ.get("PROGRAMFILES"), "Google/Chrome/Application/chrome.exe"),
            (os.environ.get("PROGRAMFILES(X86)"), "Google/Chrome/Application/chrome.exe"),
            (os.environ.get("LOCALAPPDATA"), "Google/Chrome/Application/chrome.exe"),
            (os.environ.get("PROGRAMFILES"), "Microsoft/Edge/Application/msedge.exe"),
        ):
            if base:
                candidates.append(Path(base) / suffix)
    else:
        for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"):
            resolved = shutil.which(name)
            if resolved:
                candidates.append(Path(resolved))
    return candidates


def resolve_chrome(explicit: Path | None = None) -> Path:
    candidates = [explicit] if explicit else chrome_candidates()
    for candidate in candidates:
        if candidate and candidate.is_file():
            return candidate.resolve()
    raise FileNotFoundError("Chrome/Edge 실행 파일을 찾지 못했습니다. CHROME_PATH를 지정하세요.")


def reserve_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_for_cdp(endpoint: str, process: subprocess.Popen[bytes], timeout: float) -> None:
    deadline = time.monotonic() + timeout
    last_error = "응답 없음"
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"headless Chrome이 시작 중 종료되었습니다: exit={process.returncode}")
        try:
            with urlopen(f"{endpoint}/json/version", timeout=1) as response:
                payload = json.load(response)
            if payload.get("webSocketDebuggerUrl"):
                return
        except (OSError, URLError, ValueError) as exc:
            last_error = str(exc)
        time.sleep(0.1)
    raise TimeoutError(f"headless Chrome CDP 준비 시간 초과: {last_error}")


def stop_owned_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def build_environment(endpoint: str, session_dir: Path) -> dict[str, str]:
    environment = os.environ.copy()
    environment.pop("BU_CDP_WS", None)
    environment["BU_NAME"] = "dmk_isolated"
    environment["BU_CDP_URL"] = endpoint
    environment["BH_RUNTIME_DIR"] = str(session_dir / "runtime")
    environment["BH_TMP_DIR"] = str(session_dir / "tmp")
    environment["PYTHONUTF8"] = "1"
    environment["PYTHONIOENCODING"] = "utf-8"
    Path(environment["BH_RUNTIME_DIR"]).mkdir(parents=True, exist_ok=True)
    Path(environment["BH_TMP_DIR"]).mkdir(parents=True, exist_ok=True)
    return environment


def read_script() -> bytes:
    raw = sys.stdin.buffer.read()
    if not raw.strip():
        raise ValueError("Browser Harness Python 스크립트를 표준입력으로 전달해야 합니다.")
    for encoding in ("utf-8-sig", "cp949"):
        try:
            return raw.decode(encoding).encode("utf-8")
        except UnicodeDecodeError:
            continue
    raise ValueError("표준입력 스크립트는 UTF-8 또는 CP949여야 합니다.")


def main() -> int:
    parser = argparse.ArgumentParser(description="격리 headless Chrome에서 Browser Harness 스크립트를 실행합니다.")
    parser.add_argument("--chrome", type=Path)
    parser.add_argument("--startup-timeout", type=float, default=20.0)
    args = parser.parse_args()
    script = read_script()
    harness = shutil.which("browser-harness")
    if not harness:
        raise FileNotFoundError("browser-harness 실행 파일을 찾지 못했습니다.")
    chrome = resolve_chrome(args.chrome)
    port = reserve_local_port()
    endpoint = f"http://127.0.0.1:{port}"

    with tempfile.TemporaryDirectory(prefix="dmk-browser-harness-") as temporary:
        session_dir = Path(temporary)
        profile_dir = session_dir / "chrome-profile"
        environment = build_environment(endpoint, session_dir)
        process = subprocess.Popen(
            [
                str(chrome),
                "--headless=new",
                f"--remote-debugging-port={port}",
                "--remote-debugging-address=127.0.0.1",
                f"--user-data-dir={profile_dir}",
                "--window-size=1440,1200",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-background-mode",
                "--disable-component-update",
                "about:blank",
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        execution: subprocess.CompletedProcess[bytes] | None = None
        try:
            wait_for_cdp(endpoint, process, args.startup_timeout)
            execution = subprocess.run(
                [harness],
                input=script,
                env=environment,
                check=False,
            )
            return int(execution.returncode)
        finally:
            cleanup = subprocess.run(
                [harness, "--reload"],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                env=environment,
                timeout=20,
                check=False,
            )
            if cleanup.returncode and execution is not None and execution.returncode == 0:
                print("경고: Browser Harness 정리 명령이 비정상 종료됐지만 캡처 결과 검증을 계속합니다.", file=sys.stderr)
            stop_owned_process(process)


if __name__ == "__main__":
    raise SystemExit(main())
