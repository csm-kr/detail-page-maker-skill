# Legacy `assets/product-ssot` archive

- Archived on: 2026-07-28
- Reason: the project now uses one canonical asset root, `asset/`.
- Recovery policy: do not delete this directory. Restore only by matching the SHA-256 values in `checksums.sha256`.

## Moved to the canonical asset root

The four active supplier crops were moved without re-encoding:

`assets/product-ssot/source/supplier-crops/`
→ `asset/input/product-ssot/supplier-crops/`

## Archived

- `user-real-original/`: legacy duplicates of the eight canonical files in `asset/input/user-real-original/`
- `user-real-recovered/`: low-resolution recovery files retained for history only and excluded from generation
- `legacy-product-ssot-manifest.json`: the pre-migration manifest

The former project-root `assets/` directory is intentionally absent. Skill-owned runtime folders and HyperFrames project-local `assets/` folders are separate scopes and are not affected.
