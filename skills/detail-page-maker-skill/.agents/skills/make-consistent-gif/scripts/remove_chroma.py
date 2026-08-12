#!/usr/bin/env python3
from __future__ import annotations

import argparse

from chroma import (
    DEFAULT_ALPHA_FLOOR,
    DEFAULT_OPAQUE_THRESHOLD,
    DEFAULT_TRANSPARENT_THRESHOLD,
    parse_color,
    remove_chroma,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Remove the selected border-connected chroma background into RGBA PNG."
    )
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument(
        "--transparent-threshold", type=float, default=50.0
    )
    parser.add_argument("--opaque-threshold", type=float, default=110.0)
    parser.add_argument("--alpha-floor", type=int, default=40)
    parser.add_argument("--global-removal", action="store_true")
    parser.add_argument("--no-despill", action="store_true")
    parser.add_argument("--no-edge-spill-cleanup", action="store_true")
    args = parser.parse_args()
    print(remove_chroma(
        args.input,
        args.out,
        key=parse_color(args.key),
        transparent_threshold=args.transparent_threshold,
        opaque_threshold=args.opaque_threshold,
        alpha_floor=args.alpha_floor,
        connected_only=not args.global_removal,
        despill=not args.no_despill,
        edge_spill_cleanup=not args.no_edge_spill_cleanup,
    ))


if __name__ == "__main__":
    main()
