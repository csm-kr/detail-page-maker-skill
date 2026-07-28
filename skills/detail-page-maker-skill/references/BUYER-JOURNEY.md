# Buyer Journey Planning Standard

## Purpose

Use this document with `COMMERCIAL.md` and `DESIGN.md` before generating any
image, GIF, or customer-facing detail page.

- `COMMERCIAL.md` decides what the product can truthfully sell.
- `DESIGN.md` decides how the selling story should look and feel.
- `BUYER-JOURNEY.md` decides why the buyer keeps reading and in what order each
  purchase question is answered.

When the three documents conflict, protect verified product facts and claim
boundaries first, then preserve the buyer journey, then adjust the visual
direction.

## Core Journey

Every detail page must move the buyer through this sequence:

1. `Pain Recognition`
   - Let the buyer recognize a real inconvenience or unmet preference.
   - Use verified own reviews, clearly labeled market pain, or an honest
     planning question. Never manufacture a testimonial.
2. `Product Answer`
   - Show the actual product immediately as the answer.
   - State the product category and the main promise in one glance.
3. `Reasons to Believe`
   - Separate three to five purchase reasons.
   - Give each reason its own customer benefit, still-image proof, and
     dedicated motion proof.
4. `Use Confidence`
   - Show how to wear or use the product.
   - Show realistic use cases and motion only when motion explains something.
5. `Detail Confidence`
   - Show material, construction, finish, fit, direction, and supplied
     configuration with the right camera distance.
6. `Decision Support`
   - Show verified same-SKU reviews when review text exists.
   - Reconnect the opening problem to the proven product answers.
   - Answer size, care, compatibility, limitations, and frequently asked
     questions after value has been established.
7. `Decision Recap`
   - Repeat only the strongest verified reasons.
   - End with the actual product and supplied configuration, not a new claim.

Do not place a long block of doubt, warnings, or specifications immediately
after the opening problem. The buyer must first see the product answer and the
reasons to believe.

## Default 14-Page Story

The page count can change only when the approved content plan requires it, but
the following page jobs must remain present and in this relative order.

| Page | Journey stage | Page job | Customer-facing result |
| ---: | --- | --- | --- |
| 1 | Pain Recognition | Recognize the inconvenience | A short problem statement or buyer concern |
| 2 | Product Answer | Reveal the product and its promise | Product category, hero visual, four reason anchors |
| 3 | Reasons to Believe | Prove reason 1 | First core benefit with direct visual proof |
| 4 | Reasons to Believe | Prove reason 2 | Second core benefit with direct visual proof |
| 5 | Reasons to Believe | Prove reason 3 | Third core benefit with direct visual proof |
| 6 | Reasons to Believe | Prove reason 4 | Style, finish, or other differentiating reason |
| 7 | Use Confidence | Explain how to use | A short, ordered use or wearing sequence |
| 8 | Use Confidence | Show primary use case | One realistic situation shown large |
| 9 | Decision Support | Show verified customer voices | Same-SKU review text, or hide the section when unavailable |
| 10 | Decision Support | Recap problem and solution | Opening problems mapped to the already proven reasons |
| 11 | Detail Confidence | Inspect construction | Material, seam, band, opening, label, or mechanism |
| 12 | Decision Support | Confirm configuration and size | Quantity, color, direction, verified dimensions |
| 13 | Decision Support | Answer care and fit questions | Care, use conditions, limitations, concise FAQ |
| 14 | Decision Recap | Close the decision | Strongest reasons, actual product, final configuration |

For a low-complexity product, combine evidence inside a page instead of
inventing new benefits. For a high-complexity product, add pages without
changing the journey order.

## Planning Card Contract

Studio must present the plan as readable cards. Each card must contain:

```text
page
journey_stage
page_job
headline
supporting_copy
customer_benefit
visual_proof
still_evidence_asset_id
motion_evidence_asset_id
planned_assets
next_reason
```

The primary card face shows only:

- page title
- headline
- customer benefit
- planned visual

Evidence IDs, source files, prompt text, QA state, hashes, and design rules
belong in an optional advanced disclosure. They must never appear inside the
customer preview iframe.

## Reason Card Contract

Each core purchase reason must answer five questions:

1. What does the buyer want?
2. What product structure or visible property answers it?
3. What is the shortest honest customer-facing phrase?
4. Which still image proves it?
5. Which dedicated GIF proves it?
6. Which stronger interpretation is still unverified and therefore blocked?

Do not merge unrelated reasons into one card. A style reason, a coverage
reason, and a material reason require different proof.

## Pain to Solution Rules

- Prefer a buyer's plain-language inconvenience over a production label.
- Use `OWN_REVIEW` only for a verified review of the same product.
- Use `MARKET_PAIN` only as a market concern, never as this product's review.
- Use `PLANNED_QUESTION` or `SYNTHETIC_PAIN` as a question or problem prompt,
  without stars, names, avatars, purchase badges, or recommendation language.
- The product answer must appear on the same page or the immediately following
  page.
- The solution must be a verified product fact or a restrained interpretation
  of a visible product property.

## Use, Example, and Detail Rules

- `How to use` must show a correct sequence, not a decorative lifestyle photo.
- `Use cases` must use different situations, not the same pose with different
  backgrounds.
- `Detail` pages must change camera distance and show the exact part being
  discussed.
- `Motion` must explain one action, state change, direction, or fit question.
- A qualitative `MANUFACTURER_CLAIM` graph may show direction without numeric
  ticks. Quantitative axes require manufacturer-supplied values and conditions.
- Verified review copy must come from the same SKU. If it is unavailable, hide
  or hold the review section instead of inventing customer voices.
- Problem-solution recap and decision recap must not introduce a new claim.
- `Product information` must use supplier facts, approved SSOT, and recorded
  manufacturer claims only.
- Care and limitation copy must be readable and must not be used to hide a
  weak value proposition.

## Approval Gate

Before image generation:

1. Confirm the supplier URL and product SSOT.
2. Approve the core purchase reasons and claim boundaries.
3. Review all page cards in journey order.
4. Confirm that every strong claim has a planned still image and dedicated GIF.
5. Confirm that the customer preview contains no production metadata.

After approval, image generation and asset approval may begin. If the buyer
journey changes, invalidate only the affected page, asset, and downstream GIF
approvals.

## Completion Check

- The first two pages explain the inconvenience, the product, and the main
  promise.
- Three to five distinct purchase reasons are visible.
- Every reason has direct proof.
- How-to, use cases, detail inspection, and motion each have a separate job.
- Configuration, size, care, limitations, and FAQ appear after the value story.
- The final page introduces no new claim.
- Customer-facing output contains no source file, prompt, approval, version,
  SSOT, QA, or production-status metadata.
