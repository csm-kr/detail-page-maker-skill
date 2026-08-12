# Frame prompt patterns

## Prompt layers

Write every generation prompt in this order:

1. Reference roles.
2. Immutable character and rendering identity.
3. Canvas, camera, selected adaptive chroma background, pivot, and in-place/root-motion rules.
4. Previous target, current absolute pose, and next target.
5. Current anatomical/screen-relative wrist and foot positions.
6. Per-limb direction from the previous frame and planned direction into the next.
7. Secondary motion, contact, expression, and silhouette.
8. Continuity guard and avoid list.

## Shared invariant block

```text
Image 1 is the canonical pose/canvas reference. Preserve the same character identity,
body proportions, face, shell or costume design, palette, material, rendering style,
camera, framing, scale, and canvas. Images 2 and later are supporting references only.
Use a perfectly flat solid {chroma_name} background ({chroma_hex}) with no gradient,
texture, floor plane, reflection, or background shadow. Do not use {chroma_hex} or a
visually similar color in any foreground character, costume, prop, or effect. Keep the
full character inside the canvas with stable bottom-center pivot and generous safety padding.
```

For an anchored chain, add:

```text
Image 1 is the immediately previous animation frame. Image 2 is the original identity
anchor. Continue motion from Image 1 while preserving Image 2's character design.
```

Frame 0 has no generated predecessor. For that step, Image 1 remains the canonical reference;
still describe the last-frame target when the loop is closed. Never claim that Image 1 is both
the canonical and the immediately previous frame.

## Spatial naming

- Name both anatomical and screen-relative side: `the character's anatomical right front leg, visible on screen-left`.
- Add location: `near normalized image coordinate x=0.31, y=0.76`.
- State contact: grounded, lifting, airborne, planting, or sliding intentionally.
- State the root: fixed bottom-center pivot for in-place motion, or explicit root delta.

## Absolute-pose frame template

```text
Animation frame {index}/{last}, phase {phase}, normalized progress {progress}.
Absolute pose: {absolute_pose}
Change from the previous frame: {delta}
Current limb positions: {limb_pose}
Per-limb trajectory: {limb_trajectory}
Previous frame target: {previous_target}
Next frame target: {next_target}
Ground contact: {contact}
Secondary motion: {secondary_motion}
Expression: {expression}
Silhouette goal: {silhouette}
Apply the complete body response needed for believable balance; do not move only one
isolated limb unless the motion explicitly calls for a localized action.
Track every wrist and foot as the same persistent point. No hand or foot may jump from
neutral to an extreme and back in one displayed frame. Reverse direction only at a named
extreme, with adjacent frames visibly approaching and departing it.
Avoid: extra or missing limbs, anatomy changes, identity drift, camera movement, crop,
reframe, motion blur, text, watermark, selected chroma-key contamination, clipped silhouette.
```

## Phase patterns

### Idle

Use a closed low-amplitude curve: neutral → inhale/rise → blink or settle → neutral. Keep the pivot fixed. Avoid identical consecutive frames.

### Walk in place

Use left contact → left down → left passing → right up → right contact → right down → right passing → left up. Keep the contact foot fixed through its down/passing support, and make the incoming foot and opposite wrist already approach frame 0 from the last frame.

### Run in place

Use contact → absorption → drive → flight → opposite contact → absorption → drive → flight. A wrist at a contact-frame forward extreme must remain forward in absorption, and the incoming foot must already be visible in the preceding flight frame.

### Throw

Use ready → anticipation → wind-up → cocked → acceleration → release → follow-through → recovery. Name the anatomical throwing side, its screen-relative side, the lead/rear feet, and `action_direction` (`screen-left`, `screen-right`, `toward-camera`, or `away-from-camera`). Keep the object attached through acceleration, separate it exactly at `release`, and move both wrist and projectile farther along the same direction through recovery or until it exits the canvas. Prefer `one-shot` unless a recovery loop is requested.

### Kick

Use ready → anticipation → chamber → extension → impact → recoil → plant → recovery. Name the anatomical kicking side, support side, both screen-relative sides, and `action_direction`. Fix the support foot from anticipation through recoil. The kicking foot must approach impact in extension and remain near the extreme in recoil before returning. Prefer `one-shot` unless a recovery loop is requested.

### Turn

For a closed 360-degree turn use monotonic yaw targets 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315° → 0°. Preserve anatomical sides through occlusion; never substitute a mirrored side view or reverse yaw.

### Jump

Use neutral → anticipation/crouch → takeoff → ascent → apex → descent → landing/contact → recovery. Mark `takeoff`, `apex`, and `land` events. For a loop, recover to the starting pose; do not teleport the root.

### Generic action

Identify anticipation, action, follow-through, and recovery. If the requested frame count is too small to represent them, preserve the most readable extremes and contacts rather than writing vague intermediate prompts.
