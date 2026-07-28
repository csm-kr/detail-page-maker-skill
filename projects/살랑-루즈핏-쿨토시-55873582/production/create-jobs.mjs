import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const productionRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(productionRoot, "..");
const jobsRoot = path.join(productionRoot, "jobs");
const pendingRoot = path.join(
  projectRoot,
  "asset",
  "generated",
  "pending",
  "image",
  "production-rev001",
);

const approvedModelRelative = "asset/ssot/model-sheet-c00-03-v01.png";
const approvedModelAbsolute = path.join(projectRoot, approvedModelRelative);
const approvedModelSha256 =
  "476d751f07484de54dc7992c138beafcdf56565ed6fa3584fbf7c72e45bcaa64";
const projectFromJobs = ["..", ".."].join("/");

if (!fs.existsSync(approvedModelAbsolute)) {
  throw new Error(`Approved model SSOT is missing: ${approvedModelAbsolute}`);
}

const actualModelSha256 = crypto
  .createHash("sha256")
  .update(fs.readFileSync(approvedModelAbsolute))
  .digest("hex");

if (actualModelSha256 !== approvedModelSha256) {
  throw new Error(
    `Approved model SSOT hash mismatch: ${actualModelSha256} !== ${approvedModelSha256}`,
  );
}

fs.mkdirSync(jobsRoot, { recursive: true });
fs.mkdirSync(pendingRoot, { recursive: true });

const refs = {
  p1: `${projectFromJobs}/asset/input/user-real-original/photo-2026-07-05-411f8795.jpg`,
  p2: `${projectFromJobs}/asset/input/user-real-original/photo-2026-07-05-d63f66f5.jpg`,
  p4: `${projectFromJobs}/asset/input/user-real-original/photo-2026-07-14-0bd7c853.jpg`,
  p5: `${projectFromJobs}/asset/input/user-real-original/photo-2026-07-14-62b5cece.jpg`,
  p6: `${projectFromJobs}/asset/input/user-real-original/photo-2026-07-27-45c0af96.jpg`,
  p7: `${projectFromJobs}/asset/input/user-real-original/photo-2026-07-27-4605aff2.jpg`,
  p8: `${projectFromJobs}/asset/input/user-real-original/photo-2026-07-27-fd874f53.jpg`,
  s1: `${projectFromJobs}/assets/product-ssot/source/supplier-crops/01-pair-full.png`,
  s3: `${projectFromJobs}/assets/product-ssot/source/supplier-crops/03-pleat-macro.png`,
  s4: `${projectFromJobs}/assets/product-ssot/source/supplier-crops/04-hand-label-structure.png`,
  model: `${projectFromJobs}/asset/ssot/model-sheet-c00-03-v01.png`,
};

const productTruth = `
PRODUCT IDENTITY — REQUIRED:
The exact product is one white pair of long loose-fit arm sleeves.
Preserve the long relaxed tube silhouette rather than a tight compression sleeve.
Preserve the fine irregular vertical pleats and thin matte woven fabric.
Preserve the elastic upper-arm band, wide back-of-hand cuff, and thumb opening.
When the physical label is visible, preserve one white woven label per sleeve with the exact two-line black text "HELLO" over "CUTE SLEEVE".
Do not invent rib knit, sports compression panels, mesh panels, zippers, drawstrings, silicone strips, anti-slip dots, extra seams, extra holes, or extra labels.
The sale unit is one pair, two sleeves, unless the scene explicitly requests a single sleeve.
No UV percentage, UPF grade, cooling number, temperature graphic, moisture-wicking claim, ventilation claim, anti-slip claim, certification mark, or performance icon.
`;

const modelTruth = `
MODEL IDENTITY — REQUIRED:
Use the approved C00-03 fictional Korean woman in her late twenties.
Preserve her soft oval face, dark natural eyes, straight nose line, rose-beige lips, neutral-warm skin, black-brown collarbone-length straight long bob, and center-near part.
Preserve her slim-to-average natural build, short clean natural nails, and subtle makeup.
No watch, bracelet, rings, necklace, visible brand, tattoos, or alternate person.
The model sheet controls face, hair, body, skin tone, hands, and overall identity only.
The real product references control the sleeves and override any garment detail shown on the model sheet.
`;

const cleanCommercial = `
QUALITY_GATE:CLEAN_COMMERCIAL
Clean commercial product photography with controlled studio lighting,
smooth continuous gradients, crisp but natural edges, clean shadow transitions,
physically plausible material texture only, low-ISO clarity.
No film grain, no sensor noise, no chromatic noise, no dithering, no speckle,
no crunchy micro-texture, no halftone, no JPEG artifacts, no oversharpening,
no dirty shadow noise, no artificial surface glitter.
Do not hide detail with waxy blur or plastic skin smoothing.
No advertising copy, title, caption, badge, icon, price, watermark, UI, or invented logo.
Keep all important product edges, hands, face, and limbs safely inside the frame.
`;

const definitions = [
  {
    id: "A01",
    role: "pair-flatlay-hero",
    size: "1536x1024",
    scene:
      "Premium orthographic flat lay on a warm ivory seamless surface. Lay the exact left and right sleeves parallel with relaxed natural pleats, full length visible, labels aligned toward the back-of-hand ends, soft northeast window light and clean contact shadows.",
    must:
      "Show exactly two sleeves, matched length, mirrored orientation, upper bands, wide hand cuffs, thumb openings, pleats, and the physical labels.",
    refs: [refs.p7, refs.s1, refs.p1, refs.p5],
  },
  {
    id: "A02",
    role: "single-front",
    size: "1024x1536",
    scene:
      "One exact sleeve displayed vertically on a warm neutral studio surface, front side facing camera, photographed straight-on with the entire length visible and generous editorial breathing room above and below.",
    must:
      "Show a single sleeve from upper-arm band to hand cuff without crop, including the loose tube width, fine pleats, thumb opening, and one physical label.",
    refs: [refs.p1, refs.p6, refs.p5],
  },
  {
    id: "A03",
    role: "single-reverse-label",
    size: "1536x1024",
    scene:
      "Calm side-by-side studio evidence image of the same single sleeve shown in two orientations: reverse construction view on the left and back-of-hand label side on the right, both fully visible on warm ivory.",
    must:
      "Preserve seam direction, thumb opening construction, and exactly one label on the back-of-hand side; do not imply two sale units.",
    refs: [refs.p2, refs.p1, refs.p5],
  },
  {
    id: "A04",
    role: "pleat-macro",
    size: "1024x1024",
    scene:
      "High-resolution textile macro of the exact white sleeve fabric, with raking soft light revealing fine irregular vertical pleats and the thin matte woven texture, plus a small out-of-focus whole-product location cue.",
    must:
      "Show real white fabric and physically plausible folds without glossy plastic, rib knit, mesh, sparkle, or synthetic performance graphics.",
    refs: [refs.p8, refs.s3, refs.p1],
  },
  {
    id: "A05",
    role: "thumb-hole-hand-cover",
    size: "1024x1024",
    scene:
      "Tight commercial close-up of the approved model wearing one exact sleeve. The back of her hand faces camera, the thumb passes naturally through the thumb opening, the wide cuff covers the back of the hand, and the physical label orientation is clear.",
    must:
      "Show one anatomically correct hand with five fingers, a natural thumb opening, clean short nails, correct cuff coverage, and the exact label.",
    refs: [refs.p4, refs.s4, refs.p5, refs.model],
    model: true,
  },
  {
    id: "A06",
    role: "upper-band-seam",
    size: "1024x1024",
    scene:
      "Product-only macro of the upper-arm band and its transition into the pleated sleeve fabric on a soft ivory studio surface, photographed with precise side light and a shallow but sufficient depth of field.",
    must:
      "Show only observed elastic banding and seam construction; no silicone, gripper, drawcord, zipper, hardware, or invented internal layer.",
    refs: [refs.p1, refs.p8, refs.p2],
  },
  {
    id: "A07",
    role: "loose-drape-arm",
    size: "1024x1536",
    scene:
      "Natural premium side portrait of the approved model in a bright sand-and-ivory summer studio. Her face and one full arm are visible as the exact sleeve runs from above the elbow to the back of the hand with relaxed airy-looking drape.",
    must:
      "Preserve the approved face and hair, full arm length, correct thumb opening, one label, and visibly loose irregular pleats without implying tested cooling performance.",
    refs: [refs.p4, refs.p1, refs.p5, refs.model],
    model: true,
  },
  {
    id: "A08",
    role: "daylight-thinness",
    size: "1024x1536",
    scene:
      "Close natural-light portrait beside a softly glowing summer window. The approved model wears the exact white sleeve while gentle side light honestly reveals the thin fabric, subtle skin-to-fabric boundary, pleats, and cuff construction.",
    must:
      "Keep the fabric physically thin and white without turning transparent, glowing, icy, blue, wet, or performance-coded; preserve model and sleeve identity.",
    refs: [refs.p4, refs.p8, refs.p5, refs.model],
    model: true,
  },
  {
    id: "B01",
    role: "parked-car-driving",
    size: "1024x1536",
    scene:
      "Bright clean interior of a safely parked car. The approved model is seated naturally with both hands resting on the steering wheel, framed around forearms and hands with a partial calm face, editorial summer daylight, no sense of motion.",
    must:
      "Show exactly one pair worn correctly, both five-finger hands, back-of-hand cuffs and thumb openings, correct palm contact, no vehicle brand, and no active-driving hazard.",
    refs: [refs.p4, refs.s4, refs.p5, refs.model],
    model: true,
  },
  {
    id: "B02",
    role: "summer-walk",
    size: "1024x1536",
    scene:
      "Full upper-body summer lifestyle photograph of the approved model walking slowly along a bright leafy pedestrian path, arms relaxed at her sides, soft open shade, ivory and pale sky-blue palette.",
    must:
      "Preserve approved face and hair, show both sleeves from above elbow to hand, relaxed loose pleats, correct labels and thumb openings, with no sun-protection or cooling effect graphic.",
    refs: [refs.p4, refs.p7, refs.p5, refs.model],
    model: true,
  },
  {
    id: "B03",
    role: "grocery-cart",
    size: "1024x1536",
    scene:
      "Bright modern grocery aisle with no visible trademarks or prices. The approved model gently holds a clean cart handle; composition prioritizes forearms and hands with a friendly natural expression and neutral retail lighting.",
    must:
      "Show exact back-of-hand cuffs, natural palm direction, both thumb openings, normal fingers, one label per sleeve, and no store brand or price text.",
    refs: [refs.p4, refs.s4, refs.p5, refs.model],
    model: true,
  },
  {
    id: "B04",
    role: "window-desk-background",
    size: "2048x1152",
    scene:
      "Product-free and person-free premium summer window-desk background: pale warm wall, light oak tabletop, soft window light from upper left, subtle leaf shadow, shallow realistic room depth, generous clean compositing space.",
    must:
      "No product, garment, hands, people, text, icons, logos, brand objects, screens, posters, or performance symbols.",
    refs: [],
  },
  {
    id: "B05",
    role: "folded-pouch",
    size: "1024x1024",
    scene:
      "Travel-ready warm ivory flat lay with the exact pair of white sleeves folded loosely beside a small unbranded sand-colored summer pouch, soft daylight, restrained styling and clear material texture.",
    must:
      "Show exactly two sleeves as one pair, still distinguishable and not over-compressed, with pleats and cuffs recognizable; pouch has no logo or text.",
    refs: [refs.p7, refs.p1, refs.p8],
  },
  {
    id: "B06",
    role: "palm-side-structure",
    size: "1024x1024",
    scene:
      "Commercial close-up of the approved model's open palm facing camera while wearing one exact sleeve, photographed straight-on against warm ivory with soft clean light and a relaxed wrist.",
    must:
      "Show five anatomically correct fingers, natural thumb through the thumb opening, true palm-side opening range, cuff edge and label orientation consistent with real references.",
    refs: [refs.p4, refs.s4, refs.p5, refs.model],
    model: true,
  },
  {
    id: "B07",
    role: "measurement-flatlay",
    size: "1024x1536",
    scene:
      "Orthographic measurement-ready flat lay of one exact sleeve fully straightened beside a clean unnumbered neutral ruler-like scale bar, warm ivory background, even light and minimal distortion.",
    must:
      "Show entire sleeve and clear start and end points. Do not generate any number, unit, dimension, arrow label, advertising copy, or measurement claim.",
    refs: [refs.p1, refs.p6, refs.p8],
  },
  {
    id: "B08",
    role: "final-recap-hero",
    size: "2160x3840",
    scene:
      "Long premium vertical finale composition combining the approved model wearing the exact pair in the upper two-thirds and the exact unworn pair arranged elegantly in the lower third, connected by consistent ivory-to-sand studio light and clean depth.",
    must:
      "Preserve the approved face, full sleeves, loose fit, hand-cover cuffs, pleats, thumb openings and labels; show one worn pair plus one clearly separate product-display pair, with safe empty copy zones top and bottom but no text.",
    refs: [refs.p4, refs.p7, refs.p5, refs.model],
    model: true,
  },
  {
    id: "C01",
    role: "model-editorial-front",
    size: "1024x1536",
    scene:
      "Front-facing half-body editorial portrait in a white-and-sand summer studio. The approved model looks calmly toward camera with both arms relaxed and the exact sleeve pair worn symmetrically.",
    must:
      "Preserve face, hair, build, both arms, normal hands, one sleeve per arm, loose pleats, hand cuffs, thumb openings and one label per sleeve.",
    refs: [refs.p4, refs.p7, refs.p5, refs.model],
    model: true,
  },
  {
    id: "C02",
    role: "model-editorial-three-quarter",
    size: "1024x1536",
    scene:
      "Three-quarter half-body summer editorial portrait. The approved model turns slightly and lifts one relaxed hand just enough to reveal the back-of-hand cuff and label, with soft sculpted studio light.",
    must:
      "Preserve the exact three-quarter identity, correct hand anatomy, one label on the visible sleeve and matched product construction on both arms.",
    refs: [refs.p4, refs.s4, refs.p5, refs.model],
    model: true,
  },
  {
    id: "C03",
    role: "model-side-drape",
    size: "1024x1536",
    scene:
      "Elegant side-profile portrait of the approved model with one arm resting naturally alongside her body in a pale sand studio, emphasizing the sleeve's full relaxed drape and irregular vertical pleats.",
    must:
      "Preserve face profile, hair length, arm anatomy, above-elbow length, loose folds, hand cuff and thumb opening without creating compression-fit tension.",
    refs: [refs.p4, refs.p1, refs.p8, refs.model],
    model: true,
  },
  {
    id: "C04",
    role: "iced-drink-hand",
    size: "1024x1536",
    scene:
      "Bright casual summer cafe portrait of the approved model holding a clear unbranded iced drink in one hand, upper body visible, warm daylight and pale blue accents, natural candid expression.",
    must:
      "Show normal fingers around the cup, correct thumb opening and back-of-hand cuff, one physical label, no beverage logo, no written menu and no cooling-performance symbolism.",
    refs: [refs.p4, refs.s4, refs.p5, refs.model],
    model: true,
  },
  {
    id: "C05",
    role: "phone-use-close",
    size: "1024x1536",
    scene:
      "Natural close lifestyle portrait of the approved model using a blank unbranded smartphone with both hands, soft ivory room, restrained smile and clean daylight.",
    must:
      "Show two anatomically correct hands, natural phone grip, correct thumb openings and cuffs, blank unreadable screen, no app UI, no phone logo and stable model identity.",
    refs: [refs.p4, refs.s4, refs.p5, refs.model],
    model: true,
  },
  {
    id: "C06",
    role: "tote-walk",
    size: "1024x1536",
    scene:
      "Full-body fashion lifestyle shot of the approved model walking on a bright shaded path with a plain sand canvas tote, relaxed summer outfit, natural stride and soft leafy background.",
    must:
      "Keep the full head, hands and feet inside frame; preserve face, hair and build; show the exact sleeve pair, normal hands, correct labels and no tote branding.",
    refs: [refs.p4, refs.p7, refs.p5, refs.model],
    model: true,
  },
  {
    id: "C07",
    role: "balcony-reading",
    size: "1024x1536",
    scene:
      "Half-body lifestyle photograph on a shaded apartment balcony. The approved model reads a plain book calmly, indirect daylight, pale neutral architecture and a gentle summer atmosphere.",
    must:
      "Preserve model identity and sleeve pair, natural book-holding hands, no readable book text, no direct blazing sun, UV shield, temperature, wind or protection visualization.",
    refs: [refs.p4, refs.s4, refs.p5, refs.model],
    model: true,
  },
  {
    id: "C08",
    role: "neutral-full-body",
    size: "1024x1536",
    scene:
      "Clean full-body fashion portrait on a bright neutral seamless background. The approved model stands comfortably in an unbranded ivory sleeveless top and light-gray wide pants, arms slightly separated from the torso.",
    must:
      "Preserve complete head-to-toe identity, both exact sleeves from above elbow to back of hand, relaxed pleats, normal hands, thumb openings and labels.",
    refs: [refs.p4, refs.p7, refs.p5, refs.model],
    model: true,
  },
  {
    id: "D01",
    role: "pair-clean-cutout",
    size: "1536x1024",
    scene:
      "Catalog-clean pair cutout on a near-white warm neutral seamless background with a subtle grounded shadow, both sleeves parallel and fully visible at a consistent scale.",
    must:
      "Show exactly two mirrored sleeves, matched length, correct pleats, upper bands, hand cuffs, thumb openings and label direction; no transparent checkerboard.",
    refs: [refs.p7, refs.s1, refs.p1, refs.p5],
  },
  {
    id: "D02",
    role: "single-front-cutout",
    size: "1024x1536",
    scene:
      "Catalog-clean vertical front cutout of one exact sleeve on near-white warm neutral, evenly lit with a subtle contact shadow and ample crop safety.",
    must:
      "Show one full sleeve uncut from upper band to hand cuff with correct loose proportion, pleats, thumb opening and one physical label.",
    refs: [refs.p1, refs.p6, refs.p5],
  },
  {
    id: "D03",
    role: "single-reverse-cutout",
    size: "1024x1536",
    scene:
      "Catalog-clean vertical reverse-side cutout of one exact sleeve on near-white warm neutral, camera orthographic and fabric construction clearly readable.",
    must:
      "Show one full reverse side without crop, preserve thumb opening cut, seam direction, loose proportion and observed construction only.",
    refs: [refs.p2, refs.p1, refs.p8],
  },
  {
    id: "D04",
    role: "left-thumb-detail",
    size: "1024x1024",
    scene:
      "Tight studio detail of the approved model's left hand wearing the exact sleeve, back of hand angled toward camera, thumb naturally through the opening, warm ivory backdrop.",
    must:
      "Clearly depict a left hand with five normal fingers, short natural nails, correct thumb opening, cuff coverage and label placement.",
    refs: [refs.p4, refs.s4, refs.p5, refs.model],
    model: true,
  },
  {
    id: "D05",
    role: "right-thumb-detail",
    size: "1024x1024",
    scene:
      "Tight studio detail of the approved model's right hand wearing the exact sleeve, back of hand angled toward camera as a natural counterpart to the left-hand detail, warm ivory backdrop.",
    must:
      "Clearly depict a right hand with five normal fingers, short natural nails, correct thumb opening, cuff coverage and label placement.",
    refs: [refs.p4, refs.s4, refs.p5, refs.model],
    model: true,
  },
  {
    id: "D06",
    role: "label-macro-clean",
    size: "1024x1024",
    scene:
      "Extreme clean macro of the real white woven label sewn to the white hand cuff fabric, straight-on perspective, soft side light revealing weave and seam while keeping the entire label inside frame.",
    must:
      "Preserve exactly two black lines reading HELLO and CUTE SLEEVE, correct letter order, one label only, white woven base, black thread and actual surrounding pleated fabric.",
    refs: [refs.p5, refs.s4, refs.p4],
  },
  {
    id: "D07",
    role: "seam-macro-clean",
    size: "1024x1024",
    scene:
      "Clean macro of the upper-arm elastic band, edge seam and transition into fine pleated white fabric, neutral studio light with a small whole-sleeve location cue.",
    must:
      "Preserve observed stitches and material only; no silicone, grip dots, drawstrings, hardware, zipper, mesh, adhesive or invented reinforcement.",
    refs: [refs.p1, refs.p8, refs.p2],
  },
  {
    id: "D08",
    role: "folded-pair-stack",
    size: "1024x1024",
    scene:
      "Minimal premium product photograph of the exact pair loosely folded into a soft two-piece stack on warm ivory paper, each sleeve still visually distinguishable, gentle daylight and natural shadows.",
    must:
      "Show exactly two sleeves, not one or three, with recognizable cuffs, pleats and labels; do not compress into an unrealistic tiny bundle.",
    refs: [refs.p7, refs.p1, refs.p8],
  },
  {
    id: "E01",
    role: "ivory-paper-background",
    size: "2048x1152",
    scene:
      "Empty premium ivory paper background with subtle physically plausible paper grain, gentle warm top-left studio light, soft broad gradient and generous central compositing space.",
    must:
      "No product, garment, person, hand, object, text, logo, icon, frame, badge, price or watermark.",
    refs: [],
  },
  {
    id: "E02",
    role: "summer-blue-shadow-background",
    size: "2048x1152",
    scene:
      "Empty pale sky-blue plaster wall with a very soft out-of-focus leafy shadow from upper right, clean summer editorial light and a smooth surface suitable for product compositing.",
    must:
      "No product, person, hand, sun icon, UV icon, temperature graphic, text, logo, object, frame or watermark.",
    refs: [],
  },
  {
    id: "E03",
    role: "pale-coral-table-background",
    size: "2048x1152",
    scene:
      "Empty pale coral tabletop and matching soft wall sweep, directional light from upper left, restrained shadow area on the right and generous clean space for later product placement.",
    must:
      "No product, garment, person, hand, prop, food, text, logo, icon, frame, badge or watermark.",
    refs: [],
  },
  {
    id: "E04",
    role: "parked-car-interior-background",
    size: "2048x1152",
    scene:
      "Empty bright clean parked-car driver interior viewed from the passenger side, steering wheel and seat visible, neutral light upholstery, soft daylight, shallow commercial depth and no signs of vehicle motion.",
    must:
      "No person, hand, product, garment, vehicle brand, dashboard text, screen content, plate, icon, price or watermark.",
    refs: [],
  },
  {
    id: "E05",
    role: "grocery-aisle-background",
    size: "2048x1152",
    scene:
      "Empty bright organized grocery aisle with softly defocused generic packages, clean neutral ceiling light, central walking space and a commercial yet unbranded look.",
    must:
      "No person, hand, cart, product, readable brand, readable price tag, sale sign, text, logo, icon or watermark.",
    refs: [],
  },
  {
    id: "E06",
    role: "model-product-split-hero",
    size: "2160x3840",
    scene:
      "Long high-end vertical split hero: approved model wearing the exact sleeve pair in an airy summer studio above, exact unworn pair in a premium warm-ivory flat lay below, joined by one continuous light direction and soft architectural shadow.",
    must:
      "Preserve approved model identity and complete product identity in both worn and unworn presentations, safe top and middle copy space, no generated typography.",
    refs: [refs.p4, refs.p7, refs.p5, refs.model],
    model: true,
  },
  {
    id: "E07",
    role: "pair-wide-banner",
    size: "1536x1024",
    scene:
      "Wide premium banner source on a warm ivory-to-pale-blue studio sweep. Arrange the exact sleeve pair on the right half with soft grounded shadows and leave the left half clean for later copy.",
    must:
      "Show exactly two full sleeves, correct mirrored orientation, pleats, cuffs, thumb openings and label direction; no text in the empty area.",
    refs: [refs.p7, refs.s1, refs.p1, refs.p5],
  },
  {
    id: "E08",
    role: "thumbhole-procedure-mid",
    size: "1024x1024",
    scene:
      "Instructional but text-free close-up of the approved model halfway through finding the thumb opening: sleeve already on the forearm, fingers extended naturally, thumb approaching the correct opening, same warm ivory studio setup as the start and end hand frames.",
    must:
      "Show one anatomically correct hand, five fingers, clear intermediate thumb position, fixed cuff and label, no duplicate hand, no arrow, number, caption or UI.",
    refs: [refs.p4, refs.s4, refs.p5, refs.model],
    model: true,
  },
];

const expectedCount = 40;
if (definitions.length !== expectedCount) {
  throw new Error(`Expected ${expectedCount} definitions, got ${definitions.length}`);
}

const bySize = new Map();
for (const definition of definitions) {
  const list = bySize.get(definition.size) ?? [];
  list.push(definition);
  bySize.set(definition.size, list);
}

const sizeLabels = {
  "1024x1536": "vertical",
  "1024x1024": "square",
  "1536x1024": "landscape",
  "2048x1152": "background",
  "2160x3840": "long-hero",
};

const jobRecords = [];
for (const [size, entries] of bySize.entries()) {
  for (let offset = 0; offset < entries.length; offset += 8) {
    const chunk = entries.slice(offset, offset + 8);
    const part = String(Math.floor(offset / 8) + 1).padStart(2, "0");
    const slug = `${sizeLabels[size]}-${size}-${part}`;
    const outputDirectory = `${projectFromJobs}/asset/generated/pending/image/production-rev001/${slug}`;
    const jobPath = path.join(jobsRoot, `${slug}.json`);
    const detailLevel = size === "2048x1152" ? 2 : 3;

    const job = {
      items: chunk.map((entry) => ({
        prompt: [
          `Create asset ${entry.id} (${entry.role}) for the Korean Coupang detail-page source library of "루즈핏 쿨토시", manufacturer "살랑".`,
          `Final output must be exactly ${entry.size}. Compose for this ratio from the start and keep the main subject center-crop-safe.`,
          entry.refs.length
            ? `Reference routing: Image 1 is the canonical real-product reference. Images 2 through ${entry.refs.length} are supporting product-angle, label, supplier-crop, or approved C00-03 human-identity references. Product references decide sleeve shape, color, fabric, construction, thumb opening and physical label. The approved model sheet decides only the human face, hair, build, skin tone and hands.`
            : "This is a pure background generation with no reference image and no product or person.",
          productTruth,
          entry.model ? modelTruth : "",
          `SCENE — REQUIRED:\n${entry.scene}`,
          `MUST SHOW — REQUIRED:\n${entry.must}`,
          cleanCommercial,
        ]
          .filter(Boolean)
          .join("\n\n"),
        references: entry.refs,
      })),
      detail_level: detailLevel,
      workers: chunk.length,
      size_mode: "controllable",
      target_size: size,
      output_dir: outputDirectory,
    };

    fs.writeFileSync(jobPath, `${JSON.stringify(job, null, 2)}\n`, "utf8");

    jobRecords.push({
      jobId: slug,
      path: path.relative(projectRoot, jobPath).replaceAll("\\", "/"),
      outputDirectory: path
        .relative(projectRoot, path.resolve(jobsRoot, outputDirectory))
        .replaceAll("\\", "/"),
      targetSize: size,
      detailLevel,
      workers: chunk.length,
      assetIds: chunk.map((entry) => entry.id),
    });
  }
}

const byJobId = Object.fromEntries(jobRecords.map((record) => [record.jobId, record]));
const waves = [
  {
    id: "wave-01",
    workerTotal: 16,
    jobIds: ["vertical-1024x1536-01", "square-1024x1024-01"],
  },
  {
    id: "wave-02",
    workerTotal: 16,
    jobIds: [
      "vertical-1024x1536-02",
      "background-2048x1152-01",
      "long-hero-2160x3840-01",
    ],
  },
  {
    id: "wave-03",
    workerTotal: 8,
    jobIds: [
      "landscape-1536x1024-01",
      "square-1024x1024-02",
      "vertical-1024x1536-03",
    ],
  },
];

for (const wave of waves) {
  for (const jobId of wave.jobIds) {
    if (!byJobId[jobId]) {
      throw new Error(`Wave references unknown job: ${jobId}`);
    }
  }
  const calculated = wave.jobIds.reduce(
    (total, jobId) => total + byJobId[jobId].workers,
    0,
  );
  if (calculated !== wave.workerTotal) {
    throw new Error(
      `${wave.id} worker total mismatch: ${calculated} !== ${wave.workerTotal}`,
    );
  }
}

const productionPlan = {
  schemaVersion: 1,
  revisionId: "rev-001",
  productName: "루즈핏 쿨토시",
  manufacturer: "살랑",
  provider: "god-tibo-gpt-image2-skill",
  runner:
    "skills/detail-page-maker-skill/.agents/skills/god-tibo-gpt-image2-skill/scripts/tibo-batch.mjs",
  approvedModel: {
    candidateId: "C00-03",
    path: approvedModelRelative,
    sha256: approvedModelSha256,
    approvedAt: "2026-07-27T12:13:47.592Z",
    approvedBy: "human_user",
  },
  sizeMode: "controllable",
  requestedAssetCount: definitions.length,
  providerBatchLimit: 8,
  maxEffectiveWorkers: 16,
  waves,
  jobs: jobRecords,
  assetRouting: jobRecords.flatMap((job) =>
    job.assetIds.map((assetId, index) => ({
      assetId,
      jobId: job.jobId,
      frameIndex: index,
      rawPath: `${job.outputDirectory}/frame-${String(index).padStart(3, "0")}.png`,
      status: "queued",
    })),
  ),
};

fs.writeFileSync(
  path.join(productionRoot, "production-plan.json"),
  `${JSON.stringify(productionPlan, null, 2)}\n`,
  "utf8",
);

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      jobs: jobRecords.length,
      assets: definitions.length,
      waves,
      plan: path
        .relative(projectRoot, path.join(productionRoot, "production-plan.json"))
        .replaceAll("\\", "/"),
    },
    null,
    2,
  )}\n`,
);
