# Motion continuity contracts

Use these contracts for eight-frame clips. If another frame count is requested, interpolate between these states; do not independently invent extra extremes.

## Universal limb rule

- Track anatomical left/right wrists and feet across the whole sequence, including occlusion.
- Write the previous target, current limb position, travel direction, and next target into every prompt.
- Keep a planted foot fixed until its planned release.
- Reject `neutral → extreme → neutral` across three consecutive frames unless the middle frame is a named event and both neighbors visibly approach the extreme.
- Treat the last-to-first seam exactly like any other adjacent transition for `closed` loops.
- Generate one parallel pool of four candidates per frame by default. Use the original canonical as Image 1 for all 32 items, then enforce these trajectories while ranking complete paths. Anchored chain is explicit opt-in only.

## Eight-frame phase maps

| Type | Frames 0–7 | Critical continuity condition |
|---|---|---|
| walk-in-place | left contact, left down, left passing, right up, right contact, right down, right passing, left up | Incoming foot and opposite wrist are already forward in frames 7 and 3; contact frames do not become one-frame pops. |
| run-in-place | left contact, absorption, drive, right flight, right contact, absorption, drive, left flight | Contact wrist remains forward into absorption; incoming foot is visible before each strike. |
| throw | ready, anticipation, wind-up, cocked, acceleration, release, follow-through, recovery | Acting wrist and lead/rear feet keep named anatomical sides; object separates only at release, then moves farther along `action_direction`. |
| kick | ready, anticipation, chamber, extension, impact, recoil, plant, recovery | Acting/support sides stay named; support foot stays fixed and kicking foot remains near impact before lowering. |
| turn | yaw 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315° | Yaw changes monotonically; occluded limbs reappear as the same anatomical side, never as a mirrored replacement. |

## Visual warning examples

Count a selected frame as a hard failure and record a warning when any of these occurs. Do not return an empty result when the same 32-image pool still contains a complete usable path:

- a hand is beside the body, appears across the torso for one frame, then returns beside the body;
- a foot changes from trailing to leading without passing through center;
- a planted foot slides or swaps while its contact state says planted;
- a throwing object appears before release or moves back toward the hand after release;
- a kicking foot is neutral immediately before and after its impact extreme;
- a turn jumps between front, side, or back views, reverses yaw, or mirrors asymmetrical design details.

Silhouette IoU and whole-body change fractions cannot excuse these failures. Prefer paths without them; when none exists, choose the path with the fewest failed frames and highest full-path score, then record `limb_continuity` or `contact_continuity` warnings.
