#!/bin/bash
# check -> deterministic MP4 -> FFmpeg GIF + animated WebP + poster
#   bash render.sh --projects ./projects --out ./renders [--spec motions.json] [--colors 128]
set -u

PROJECTS=""; OUT=""; SPEC=""; COLORS=128; DEFAULT_FPS=12
while [ $# -gt 0 ]; do
  case "$1" in
    --projects) PROJECTS="$2"; shift 2 ;;
    --out)      OUT="$2"; shift 2 ;;
    --spec)     SPEC="$2"; shift 2 ;;
    --colors)   COLORS="$2"; shift 2 ;;
    --fps)      DEFAULT_FPS="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
[ -n "$PROJECTS" ] && [ -n "$OUT" ] || { echo "--projects and --out are required" >&2; exit 2; }
mkdir -p "$OUT"
# absolute paths: the loop cd's into each project, so relative paths would break
PROJECTS=$(cd "$PROJECTS" && pwd)
OUT=$(cd "$OUT" && pwd)
[ -n "$SPEC" ] && SPEC=$(cd "$(dirname "$SPEC")" && pwd)/$(basename "$SPEC")

fps_for() {  # per-slot fps from the spec, else default
  [ -n "$SPEC" ] || { echo "$DEFAULT_FPS"; return; }
  python3 - "$SPEC" "$1" "$DEFAULT_FPS" <<'PY'
import json,sys
spec,mid,dflt=sys.argv[1],sys.argv[2],sys.argv[3]
try:
    d=json.load(open(spec,encoding="utf-8"))
    for m in d.get("motions",[]):
        if m.get("id")==mid:
            print(int((m.get("gif") or {}).get("fps", dflt))); break
    else: print(dflt)
except Exception: print(dflt)
PY
}

fail=0
for d in "$PROJECTS"/*/; do
  [ -f "$d/index.html" ] || continue
  id=$(basename "$d")
  cd "$d" || { echo "[$id] SKIP (cd failed)"; fail=$((fail+1)); continue; }

  chk=$(npx --no-install hyperframes check --json 2>/dev/null | python3 -c "
import sys,json
raw=sys.stdin.read(); i=raw.find('{')
try:
    d=json.loads(raw[i:]); print('OK' if d.get('ok') else 'FAIL')
except Exception: print('PARSE_FAIL')")
  if [ "$chk" != "OK" ]; then echo "[$id] check -> $chk"; fail=$((fail+1)); continue; fi

  npx --no-install hyperframes render --quality high --output "$OUT/$id.mp4" >/dev/null 2>&1
  [ -s "$OUT/$id.mp4" ] || { echo "[$id] RENDER FAILED"; fail=$((fail+1)); continue; }

  FPS=$(fps_for "$id")
  ffmpeg -v error -y -i "$OUT/$id.mp4" \
    -vf "fps=$FPS,scale=780:-1:flags=lanczos,palettegen=max_colors=$COLORS:stats_mode=diff" \
    "$OUT/$id.pal.png"
  ffmpeg -v error -y -i "$OUT/$id.mp4" -i "$OUT/$id.pal.png" \
    -lavfi "fps=$FPS,scale=780:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
    -loop 0 "$OUT/$id.gif"
  ffmpeg -v error -y -i "$OUT/$id.mp4" -vcodec libwebp -filter:v "fps=$FPS" \
    -lossless 0 -compression_level 5 -q:v 68 -loop 0 -preset picture -an -vsync 0 "$OUT/$id.webp"
  ffmpeg -v error -y -i "$OUT/$id.mp4" -frames:v 1 "$OUT/$id.poster.png"
  rm -f "$OUT/$id.pal.png"

  g=$(( $(stat -f%z "$OUT/$id.gif" 2>/dev/null || stat -c%s "$OUT/$id.gif") / 1024 ))
  w=$(( $(stat -f%z "$OUT/$id.webp" 2>/dev/null || stat -c%s "$OUT/$id.webp") / 1024 ))
  echo "[$id] OK  fps=$FPS  gif=${g}KB  webp=${w}KB"
done
echo "FAILURES: $fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
