#!/usr/bin/env python3
"""Motion gate: frames, size, poster sheet. Loop/diversity/budget are warnings only.

    python3 qa_motion.py --spec motions.json --renders ./renders [--budget-mb 10]

--budget-mb 는 기본 0(=상한 없음)이다. 값을 주면 그때만 합계를 검사하고, 넘어도 경고다.
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import sys

from PIL import Image, ImageChops, ImageDraw

AXES = ("camera", "change", "transition", "graphic")


def frames_of(gif: pathlib.Path) -> int:
    with Image.open(gif) as im:
        return getattr(im, "n_frames", 1)


def _mad(a: Image.Image, b: Image.Image) -> float:
    hist = ImageChops.difference(a, b).convert("L").histogram()
    total = sum(hist)
    return sum(i * c for i, c in enumerate(hist)) / max(1, total)


def loop_delta(gif: pathlib.Path) -> float:
    """Mean absolute pixel difference between first and last frame, 0..255."""
    with Image.open(gif) as im:
        n = getattr(im, "n_frames", 1)
        im.seek(0)
        first = im.convert("RGB").copy()
        im.seek(n - 1)
        last = im.convert("RGB").copy()
    return _mad(first, last)


def step_deltas(gif: pathlib.Path) -> list[float]:
    """Consecutive-frame differences, for cyclic motions where first != last by design."""
    out = []
    with Image.open(gif) as im:
        n = getattr(im, "n_frames", 1)
        im.seek(0)
        prev = im.convert("RGB").copy()
        for i in range(1, n):
            im.seek(i)
            cur = im.convert("RGB").copy()
            out.append(_mad(prev, cur))
            prev = cur
    return out


def contact_sheet(posters, out, cols=3, cell=330):
    if not posters:
        return None
    rows = math.ceil(len(posters) / cols)
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 22)), "white")
    draw = ImageDraw.Draw(sheet)
    for i, (name, p) in enumerate(posters):
        im = Image.open(p).convert("RGB")
        im.thumbnail((cell, cell))
        x, y = (i % cols) * cell, (i // cols) * (cell + 22)
        sheet.paste(im, (x, y + 22))
        draw.text((x + 4, y + 6), name, fill="black")
    sheet.save(out, quality=82)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--renders", required=True)
    ap.add_argument("--budget-mb", type=float, default=0.0,
                    help="0이면 용량 상한을 검사하지 않는다 (기본)")
    ap.add_argument("--loop-tolerance", type=float, default=6.0)
    a = ap.parse_args()

    spec = json.loads(pathlib.Path(a.spec).read_text(encoding="utf-8"))
    rend = pathlib.Path(a.renders)
    motions = spec["motions"]
    canvas = spec.get("canvas", {})
    want = (canvas.get("width", 780), canvas.get("height", 780))

    fails, warns, total = [], [], 0
    posters = []

    for m in motions:
        mid = m["id"]
        if m.get("engine", "hyperframes") != "hyperframes":
            warns.append("%s: %s 엔진 산출물은 해당 스킬 QA로 검증" % (mid, m.get("engine")))
            continue

        # slot contract
        for field in ("verb", "customer_question", "visible_delta"):
            if not m.get(field):
                fails.append("%s: 슬롯 계약 누락 [%s]" % (mid, field))
        if not m.get("evidence"):
            warns.append("%s: evidence 미기재" % mid)
        if not m.get("headline"):
            fails.append("%s: 첫 프레임 헤드라인 없음" % mid)

        gif = rend / ("%s.gif" % mid)
        if not gif.exists():
            fails.append("%s: GIF 없음" % mid)
            continue

        n = frames_of(gif)
        if n < 2:
            fails.append("%s: 프레임 %d개 (poster-only)" % (mid, n))
        with Image.open(gif) as im:
            if im.size != want:
                fails.append("%s: 크기 %s (기대 %s)" % (mid, im.size, want))

        d = loop_delta(gif)
        mode = m.get("loop_mode", "return")
        if mode == "cycle":
            # continuous motion (rotation, conveyor): first != last by design.
            # the seam must merely be no larger than a normal step.
            # GIF fps usually oversamples the source frames, so most consecutive
            # pairs are identical. Compare the seam against real transitions only.
            steps = sorted(x for x in step_deltas(gif) if x > 0.5)
            med = steps[len(steps) // 2] if steps else 0.0
            limit = max(a.loop_tolerance, med * 2.0)
            if d > limit:
                warns.append("%s: 순환 루프 이음새 튐 (이음새 %.1f > 실제 전환 중앙값 %.1f의 2배)"
                             % (mid, d, med))
            else:
                print("      순환 이음새 %.1f ≤ 전환 중앙값 %.1f×2 — 정상" % (d, med))
        elif d > a.loop_tolerance:
            warns.append("%s: 루프 미복귀 (첫·끝 차이 %.1f > %.1f)" % (mid, d, a.loop_tolerance))

        size_mb = gif.stat().st_size / 1e6
        total += size_mb

        poster = rend / ("%s.poster.png" % mid)
        if poster.exists():
            posters.append((mid, poster))

        print("  %-28s %3d프레임  %5.2fMB  loopΔ=%4.1f  [%s]"
              % (mid, n, size_mb, d, m.get("loop_mode", "return")))

    # adjacency diversity
    hf = [m for m in motions if m.get("engine", "hyperframes") == "hyperframes"]
    for i in range(len(hf) - 1):
        a_, b_ = hf[i].get("diversity", {}), hf[i + 1].get("diversity", {})
        if not a_ or not b_:
            warns.append("%s→%s: diversity 미기재" % (hf[i]["id"], hf[i + 1]["id"]))
            continue
        diff = sum(1 for k in AXES if a_.get(k) != b_.get(k))
        if diff < 2:
            warns.append("%s→%s: 인접 축 차이 %d개 (2 이상 권장)"
                         % (hf[i]["id"], hf[i + 1]["id"], diff))

    if a.budget_mb > 0 and total > a.budget_mb:
        warns.append("GIF 합계 %.1fMB > 지정 예산 %.1fMB" % (total, a.budget_mb))

    sheet = contact_sheet(posters, rend / "poster-sheet.jpg")

    print("\nGIF 합계 %.1fMB / 예산 %s"
          % (total, "%.1fMB" % a.budget_mb if a.budget_mb > 0 else "상한 없음"))
    if sheet:
        print("포스터 시트: %s  ← 반드시 눈으로 확인" % sheet)
    for w in warns:
        print("WARN:", w)
    for f in fails:
        print("FAIL:", f)
    print("VERDICT:", "PASS" if not fails else "FAIL (%d)" % len(fails))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
