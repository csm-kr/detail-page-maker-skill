# Game asset bundle contract

## Directory

```text
output/<clip>-vNNN/
├── selected/
├── frames/
│   ├── frame-000.png
│   └── ...
├── provenance/
│   ├── motion-plan.json
│   ├── selection.json
│   ├── chroma-selection.json
│   ├── reference.png
│   ├── generation-run.json
│   ├── job.json
│   ├── tibo-manifest-000.json
│   └── pre-approval-validation.json
├── animation.gif
├── spritesheet.png
├── animation.json
├── contact-sheet.png
├── qa-raw.json
├── visual-review.json
├── validation.json
└── manifest.json
```

Never overwrite an accepted version.

## Production masters

- `frames/*.png`: RGBA, identical canvas, identical pivot convention, contiguous indexes.
- `spritesheet.png`: RGBA fixed-cell atlas; cells remain the full frame canvas.
- `animation.json`: engine-neutral authoritative timing and layout.
- `animation.gif`: preview only because GIF has an indexed palette and limited transparency.

## animation.json

```json
{
  "schema_version": 1,
  "name": "turtle-jump",
  "frame_count": 8,
  "canvas": { "width": 1254, "height": 1254, "color_space": "srgb", "pixel_format": "rgba8", "alpha_mode": "straight" },
  "sheet": { "path": "spritesheet.png", "layout": "row-major", "columns": 8, "rows": 1, "cell_width": 1254, "cell_height": 1254 },
  "fps": 8,
  "loop": "closed",
  "playback": [0, 1, 2, 3, 4, 5, 6, 7],
  "pivot": { "mode": "bottom-center", "x": 0.5, "y": 0.92 },
  "frames": [
    {
      "index": 0,
      "path": "frames/frame-000.png",
      "rect": { "x": 0, "y": 0, "width": 1254, "height": 1254 },
      "duration_ms": 125,
      "alpha_bounds": { "x": 100, "y": 140, "width": 980, "height": 920 },
      "root_delta": { "x": 0, "y": 0 },
      "alignment_offset": { "x": 0, "y": 0 },
      "events": []
    }
  ]
}
```

Coordinates in metadata are pixels except normalized pivot `x` and `y`. Fixed-cell rects map frames in row-major order.

## Validation

- PNG frames: exact count, RGBA, same dimensions, non-empty alpha.
- Spritesheet: dimensions equal `columns × canvas.width` and `rows × canvas.height`.
- Metadata: contiguous indexes, existing paths, positive durations, legal loop mode, valid pivot, valid rectangles.
- GIF: expected frame count, dimensions, duration/FPS, and repeat behavior.
- No frame clips the subject unless the motion explicitly exits the canvas.
- Manifest output and provenance paths are bundle-relative and must not escape the bundle through absolute paths, `..`, or symlinks.
- Manifest hashes cover packaged outputs, selected source frames, the motion plan, sequence selection, adaptive chroma selection (including source normalization), prepared canonical reference, generation run/job, and upstream Tibo manifests.
- `approve_animation.py` accepts only `technical-pass-visual-pending` bundles with a current valid `validation.json`; approval copies that result to `provenance/pre-approval-validation.json` and requires a final revalidation.
