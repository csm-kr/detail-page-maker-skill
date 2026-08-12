from __future__ import annotations

from typing import Any


CONTINUITY_SENSITIVE_MOTIONS = {
    "walk-in-place",
    "run-in-place",
    "throw",
    "kick",
    "turn",
}


def state(
    phase: str,
    pose: str,
    delta: str,
    contact: list[str],
    limbs: str,
    trajectory: str,
    event: str | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "phase": phase,
        "pose": pose,
        "delta": delta,
        "contact": contact,
        "limbs": limbs,
        "trajectory": trajectory,
    }
    if event:
        result["event"] = event
    return result


CONTINUITY_TEMPLATES: dict[str, list[dict[str, Any]]] = {
    "walk-in-place": [
        state(
            "left-contact",
            "Anatomical left foot lands forward while the right leg trails.",
            "Continue the left foot and right arm forward from frame 7 into contact.",
            ["anatomical left sole planted forward"],
            "Left leg (screen-right in a front view) is forward and planted; right leg (screen-left) trails. Right arm (screen-left) is at its forward extreme; left arm is back.",
            "The left foot stops on contact. The right wrist reaches its forward extreme; frame 1 must keep it visibly forward while easing back.",
            "left-footstep",
        ),
        state(
            "left-down",
            "The body lowers over the same planted left foot while the right foot lifts behind.",
            "Absorb weight and move each free limb only partway toward passing.",
            ["anatomical left sole fixed in the same screen position"],
            "Left leg stays forward and compresses; right leg begins moving inward. Right arm stays forward but is less extended; left arm stays back but begins returning.",
            "Preserve all four limb-swing signs from frame 0. Do not snap either hand to neutral or slide the left foot.",
        ),
        state(
            "left-passing",
            "The right swing foot passes beneath the torso while the left leg supports.",
            "Carry the right foot and both wrists smoothly through their middle positions.",
            ["anatomical left support foot planted"],
            "Right foot passes near center; left foot stays loaded. Both wrists pass near side-neutral, right moving back and left moving forward.",
            "Each wrist crosses neutral once. The right foot moves monotonically from behind toward the front.",
        ),
        state(
            "right-up",
            "The body rises as the right foot reaches forward and the left heel releases.",
            "Extend the right foot and left arm toward the next contact.",
            ["anatomical left toe releasing"],
            "Right leg reaches forward; left leg lengthens behind. Left arm is clearly forward but not at maximum; right arm is back.",
            "The right foot and left wrist continue in the same directions established at passing.",
        ),
        state(
            "right-contact",
            "Anatomical right foot lands forward while the left leg trails.",
            "Complete the right-foot reach into contact without mirroring design details.",
            ["anatomical right sole planted forward"],
            "Right leg (screen-left in a front view) is forward and planted; left leg trails. Left arm (screen-right) is at its forward extreme; right arm is back.",
            "The right foot stops on contact. The left wrist reaches its forward extreme; frame 5 must keep it visibly forward while easing back.",
            "right-footstep",
        ),
        state(
            "right-down",
            "The body lowers over the same planted right foot while the left foot lifts behind.",
            "Absorb weight and move each free limb only partway toward passing.",
            ["anatomical right sole fixed in the same screen position"],
            "Right leg stays forward and compresses; left leg begins moving inward. Left arm stays forward but is less extended; right arm stays back but begins returning.",
            "Preserve all four limb-swing signs from frame 4. Do not snap either hand to neutral or slide the right foot.",
        ),
        state(
            "right-passing",
            "The left swing foot passes beneath the torso while the right leg supports.",
            "Carry the left foot and both wrists smoothly through their middle positions.",
            ["anatomical right support foot planted"],
            "Left foot passes near center; right foot stays loaded. Both wrists pass near side-neutral, left moving back and right moving forward.",
            "Each wrist crosses neutral once. The left foot moves monotonically from behind toward the front.",
        ),
        state(
            "left-up",
            "The body rises as the left foot reaches forward and the right heel releases.",
            "Approach frame 0 with the left foot and right arm already clearly forward.",
            ["anatomical right toe releasing"],
            "Left leg reaches forward; right leg lengthens behind. Right arm is clearly forward and approaching its frame-0 extreme; left arm is back.",
            "The left foot and right wrist continue monotonically into frame 0. Neither may be neutral here.",
        ),
    ],
    "run-in-place": [
        state(
            "left-contact", "Left foot strikes forward under a slightly leaning running body.",
            "Continue the left foot and right arm forward into contact.", ["left foot planted"],
            "Left leg is forward and right leg trails. Bent right arm is at its forward extreme; left arm is back.",
            "The landing foot stops; the right wrist stays visibly forward into absorption.", "left-footstep",
        ),
        state(
            "left-absorption", "Body compresses over the left foot as the right knee starts driving forward.",
            "Absorb on the same foot and return the arms only partway.", ["left foot remains planted"],
            "Left leg compresses; right knee moves inward. Right arm is still forward; left arm is still back.",
            "Keep the left foot fixed and preserve the arm-swing signs from frame 0.",
        ),
        state(
            "left-drive", "Left leg drives backward as the right knee passes beneath the torso.",
            "Push through the left forefoot and carry wrists through neutral once.", ["left forefoot pushing off"],
            "Right knee passes center; left leg extends back. Both bent arms pass their middle positions.",
            "Right knee advances monotonically; wrists cross neutral without reversing.",
        ),
        state(
            "right-flight", "Both feet are airborne as the right leg reaches toward the next strike.",
            "Release the left toe and extend the right foot and left arm forward.", [],
            "Right leg reaches forward and left leg folds behind. Left arm is clearly forward; right arm is back.",
            "Right foot and left wrist continue toward frame-4 extremes; do not land early.", "flight",
        ),
        state(
            "right-contact", "Right foot strikes forward under the running body.",
            "Complete the right-foot reach into contact.", ["right foot planted"],
            "Right leg is forward and left leg trails. Bent left arm is at its forward extreme; right arm is back.",
            "The landing foot stops; the left wrist stays visibly forward into absorption.", "right-footstep",
        ),
        state(
            "right-absorption", "Body compresses over the right foot as the left knee starts driving forward.",
            "Absorb on the same foot and return the arms only partway.", ["right foot remains planted"],
            "Right leg compresses; left knee moves inward. Left arm is still forward; right arm is still back.",
            "Keep the right foot fixed and preserve the arm-swing signs from frame 4.",
        ),
        state(
            "right-drive", "Right leg drives backward as the left knee passes beneath the torso.",
            "Push through the right forefoot and carry wrists through neutral once.", ["right forefoot pushing off"],
            "Left knee passes center; right leg extends back. Both bent arms pass their middle positions.",
            "Left knee advances monotonically; wrists cross neutral without reversing.",
        ),
        state(
            "left-flight", "Both feet are airborne as the left leg reaches toward the initial strike.",
            "Approach frame 0 with the left foot and right arm already clearly forward.", [],
            "Left leg reaches forward and right leg folds behind. Right arm is clearly forward; left arm is back.",
            "Left foot and right wrist continue monotonically into frame 0; neither may be neutral here.", "flight",
        ),
    ],
    "throw": [
        state(
            "ready", "Balanced ready stance holding the object in the {action_side} hand.",
            "Establish the throwing start pose.", ["{lead_side} lead foot and {rear_side} rear foot grounded"],
            "The {action_side} hand ({action_screen_side}) holds the object near the torso; the {support_side} hand ({support_screen_side}) balances forward. The {lead_side} foot is slightly forward and the {rear_side} foot is slightly back.",
            "Begin from stable wrist and foot anchors; do not imply a predecessor when playback is one-shot.",
        ),
        state(
            "anticipation", "Weight shifts toward the {rear_side} side as the {action_side} throwing hand starts moving back.",
            "Move the object and {action_side} wrist a small distance backward.", ["{lead_side} and {rear_side} feet grounded"],
            "The {action_side} elbow bends back slightly; {support_side} wrist extends slightly forward; {rear_side} knee loads.",
            "Begin one continuous backward {action_side}-wrist arc that continues through frames 2 and 3.",
        ),
        state(
            "wind-up", "Torso coils farther and the {action_side} throwing hand moves behind that shoulder.",
            "Continue the same backward {action_side}-wrist path and increase body coil.", ["{lead_side} foot grounded; {rear_side} foot loaded"],
            "The {action_side} wrist is farther back than frame 1 but not at maximum; {support_side} wrist remains forward.",
            "Do not reverse the {action_side} wrist or detach the object.",
        ),
        state(
            "cocked", "Throw reaches maximum wind-up with the object still in hand.",
            "Complete the backward arc and prepare acceleration toward {action_direction}.", ["{lead_side} foot grounded; {rear_side} heel may pivot"],
            "The {action_side} elbow is raised and wrist is at its farthest rear position; {support_side} arm counterbalances.",
            "This is a named direction-change extreme. Frames 2 and 4 must approach and depart it visibly.",
        ),
        state(
            "acceleration", "Hips and torso unwind while the {action_side} hand sweeps toward {action_direction}.",
            "Reverse only at the cocked extreme, then accelerate wrist and object together.", ["{lead_side} lead foot planted; {rear_side} rear foot pivoting"],
            "The {action_side} forearm passes beside the head; object remains in hand; {support_side} arm retracts.",
            "The {action_side} wrist and object move monotonically toward {action_direction}; no early projectile appears.",
        ),
        state(
            "release", "The {action_side} arm extends toward {action_direction} and releases the object.",
            "Continue the same arc through release without changing throwing side.", ["{lead_side} lead foot planted"],
            "The {action_side} hand is open; object is just beyond the fingertips toward {action_direction}; {support_side} wrist is back.",
            "Object separates exactly here and only moves farther toward {action_direction}; wrist continues into follow-through.", "release",
        ),
        state(
            "follow-through", "The {action_side} hand continues toward {action_direction} as the torso follows.",
            "Continue the same wrist direction and move the released object farther along its path.", ["{lead_side} lead foot planted"],
            "The {action_side} arm crosses forward/down; {support_side} arm counterbalances; {rear_side} foot finishes pivoting.",
            "Do not return the wrist immediately. The projectile must be farther toward {action_direction} than in frame 5.",
        ),
        state(
            "recovery", "Body settles from follow-through toward ready.",
            "Begin controlled recovery without teleporting limbs or the released object.", ["{lead_side} and {rear_side} feet regaining balanced contact"],
            "The {action_side} arm lowers but remains on the follow-through side; {support_side} wrist and both feet regain balance. The projectile is farther toward {action_direction} or has exited the canvas.",
            "Keep recovering gradually. Never move the projectile back, detach a new object, or make it disappear before it exits the canvas.",
        ),
    ],
    "kick": [
        state(
            "ready", "Balanced guard prepared to kick with the {action_side} leg.",
            "Establish the stable kick start.", ["both feet grounded"],
            "The {action_side} kicking foot ({action_screen_side}) is grounded; the {support_side} foot is ready to bear weight; hands guard.",
            "No hand or foot begins at an unexplained extreme.",
        ),
        state(
            "anticipation", "Weight shifts onto the {support_side} leg and torso leans away from the kick.",
            "Load the {support_side} foot and lightly lift the {action_side} heel.", ["{support_side} foot planted; {action_side} toes touching"],
            "The {support_side} knee bends; {action_side} heel begins lifting; both wrists separate slightly for balance.",
            "The {support_side} foot becomes the fixed pivot through impact; {action_side} foot begins one continuous lift.",
        ),
        state(
            "chamber", "The {action_side} knee lifts and folds while the {support_side} foot stays fixed.",
            "Raise the {action_side} knee on a compact arc without extending the lower leg yet.", ["{support_side} foot fixed in the same screen position"],
            "The {action_side} thigh is raised and lower leg folded; {support_side} leg stabilizes; {support_side} wrist moves forward.",
            "The {action_side} knee moves monotonically toward {action_direction}; {support_side} foot does not slide.",
        ),
        state(
            "extension", "The {action_side} lower leg unfolds toward {action_direction} while the knee remains lifted.",
            "Continue the {action_side} foot from chamber without changing sides.", ["{support_side} foot planted"],
            "The {action_side} foot is clearly toward {action_direction} but not at maximum; {support_side} knee and both wrists remain coherent.",
            "The {action_side} ankle travels monotonically toward frame-4 impact; no early recoil.",
        ),
        state(
            "impact", "The {action_side} leg reaches maximum extension toward {action_direction}.",
            "Complete the foot arc at a single readable impact extreme.", ["{support_side} foot planted"],
            "The {action_side} foot is at maximum reach; {support_side} leg stays stable; both wrists and torso counterbalance.",
            "This is the named reversal. Frames 3 and 5 must stay near it so the foot cannot flash for one frame.", "hit",
        ),
        state(
            "recoil", "The {action_side} knee stays lifted while the lower leg folds back.",
            "Retract only partway after impact, not all the way to the floor.", ["{support_side} foot planted"],
            "The {action_side} foot remains toward {action_direction} and airborne but is closer than at impact; both wrists keep balancing.",
            "Keep the {support_side} foot fixed and preserve a visible intermediate recoil pose.",
        ),
        state(
            "plant", "The {action_side} foot lowers toward a controlled landing beside the {support_side} foot.",
            "Continue recoil downward and prepare contact.", ["{support_side} foot planted; {action_side} foot approaching ground"],
            "The {action_side} knee lowers; foot nears start position; torso and both wrists begin returning.",
            "The {action_side} foot moves monotonically down/back and must not teleport to the floor.",
        ),
        state(
            "recovery", "Kicking foot regains contact and the body nearly returns to guard.",
            "Finish a controlled settling motion after the foot plants.", ["both feet grounded"],
            "Both feet are grounded; guard hands are almost neutral but retain a small recovery offset.",
            "Do not snap any limb to neutral or invent motion after this ending boundary.",
        ),
    ],
    "turn": [
        state(
            "front", "Character faces front at yaw 0 degrees.",
            "Continue from the preceding 315-degree view into front.", ["pivot foot grounded"],
            "Both anatomical sides are visible in canonical order; near/far depth changes only through rotation.",
            "Yaw continues in one direction through the loop. Frame 7 must already be near front.",
        ),
        state(
            "front-three-quarter", "Character reaches yaw 45 degrees in the requested direction.",
            "Rotate about 45 degrees while preserving anatomy and scale.", ["pivot foot grounded; other foot adjusting"],
            "Near limbs become slightly larger; far limbs remain present and are not swapped.",
            "Continue yaw monotonically; feet pivot in small increments without root translation.",
        ),
        state(
            "side", "Character reaches a clean yaw-90 side profile.",
            "Rotate another 45 degrees in the same direction.", ["pivot foot grounded"],
            "Near limbs overlap far limbs consistently; design features compress in perspective rather than mirror.",
            "Do not jump directly to the back view or reveal the opposite profile early.",
        ),
        state(
            "back-three-quarter", "Character reaches yaw 135 degrees.",
            "Continue the same yaw direction toward the back.", ["pivot foot grounded; other foot stepping around"],
            "Back surfaces dominate; anatomical side identities stay unchanged.",
            "Near/far visibility changes gradually through occlusion, never by side swapping.",
        ),
        state(
            "back", "Character faces directly away at yaw 180 degrees.",
            "Reach the back view without changing character design.", ["pivot foot grounded"],
            "Back silhouette is centered; anatomical left and right retain their identities.",
            "Continue past the back in the same direction; do not reverse here.",
        ),
        state(
            "opposite-back-three-quarter", "Character reaches yaw 225 degrees.",
            "Continue another 45 degrees past the back.", ["pivot foot grounded; other foot stepping around"],
            "New near-side limbs emerge gradually while the previous near side recedes.",
            "Occluded limbs reappear from the correct side and remain attached.",
        ),
        state(
            "opposite-side", "Character reaches the opposite yaw-270 side profile.",
            "Continue the same yaw direction toward front.", ["pivot foot grounded"],
            "Overlaps continue anatomically from frame 5, not as a mirrored copy of frame 2.",
            "Keep rotating monotonically and preserve pivot, scale, and camera.",
        ),
        state(
            "opposite-front-three-quarter", "Character reaches yaw 315 degrees and is almost front-facing.",
            "Approach frame 0 with only the final 45 degrees remaining.", ["pivot foot grounded; other foot finishing adjustment"],
            "Both sides approach frame-0 screen positions without snapping.",
            "Continue directly into frame 0; do not show full front early or reverse the turn.",
        ),
    ],
}


MOTION_GUIDANCE: dict[str, dict[str, Any]] = {
    motion_type: {
        "preferred_strategy": "parallel-candidates",
        "candidates_per_frame": 4,
        "workers": 32,
        "generation_batches": 1,
        "review_passes_max": 2,
        "automatic_regeneration": False,
        "must_select_best_available": True,
        "reason": "Generate one 8-by-4 pool, then rank complete paths using persistent wrist, foot, prop, and side continuity.",
    }
    for motion_type in CONTINUITY_SENSITIVE_MOTIONS
}
MOTION_GUIDANCE["throw"]["preferred_loop"] = "one-shot"
MOTION_GUIDANCE["kick"]["preferred_loop"] = "one-shot"
MOTION_GUIDANCE["walk-in-place"]["preferred_loop"] = "closed"
MOTION_GUIDANCE["run-in-place"]["preferred_loop"] = "closed"
MOTION_GUIDANCE["turn"]["preferred_loop"] = "closed"
