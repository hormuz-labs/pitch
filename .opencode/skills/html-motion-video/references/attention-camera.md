# Attention Camera & Verified Asset Direction

Use this reference for every product-demo beat. It was derived from an
all-frame motion pass on a strong 87.57s launch film at 1920×1080/29.97fps
(2,623 frames), plus 1fps scene mapping and 4fps inspection of the major camera
moves. The lesson is not a particular visual style; it is a repeatable
attention system.

**Creative-freedom rule:** the timecodes below are evidence, not a shot list.
Never copy their sequence, assets, camera path, or numeric values into another
video by default. Derive focal behavior from the current product's information
hierarchy and brand motion language. The scale/timing ranges are diagnostic
starting points only; stillness, a cut, a layout change, or a different camera
grammar may be stronger for a particular URL.

## 1. The governing idea

The camera is a semantic pointer. It should answer, at every moment:

> What exact thing should the viewer look at now?

A full product screen provides orientation, but it rarely provides focus. The
recurring grammar is:

1. **Context** — show enough of the product or composition to establish place.
2. **Focus** — ease scale and x/y together toward one active target.
3. **Hold/action** — keep the target readable while typing, clicking, changing,
   or being explained.
4. **Release** — pull back to reveal consequence/relationship, reframe to the
   next target, or cut to a new chapter.

This creates visual breathing: **wide → lateral detail → relationship**.
Ambient drift can support a quiet hold, but it is not a substitute for
semantic reframing.

## 1a. When the camera moves — and when it doesn't

A camera move is a claim: *"look here, now."* Spending that claim on every
scene devalues it — a video that zooms in all eight scenes feels nervous, not
guided. **Not every scene gets a reframe.** Decide per beat:

| Content of the beat | Camera decision |
|---|---|
| Typing into a field / terminal / query box | **Nonlinear zoom+horizontal pan** to the field, then **settle before the first character lands**. Lock scale while typing; if the line grows, track the caret laterally. |
| Text, list, or form filling progressively | **Pan** along the write direction, following the newest content (caret tracking). Little or no scale change — the pan *is* the attention. |
| One control being clicked / one value changing | Zoom only when acquiring the control also requires a material horizontal reframe. Otherwise keep scale fixed and emphasize the control locally. Hold through the state change, then cut or pan to the consequence. |
| A result whose meaning depends on context | **Release** (pull back) instead of pushing further — the relationship is the point. |
| Headline / manifesto / kinetic-type scene | **No camera move.** Motion comes from the type itself (SplitText, scramble, rotator). A zoom here competes with the words. |
| Logo, brand, or CTA end card | **No camera reframe.** Use element motion, lighting, type, or negative-space recomposition. Ambient push-ins are not a reason to spend scale. |
| Stat counters, integration grids, icon rails | **No camera move.** Staggered entrances, counters, and gentle element bob carry the scene. |
| Chapter change (problem → product → proof → CTA) | **Cut or motivated bridge**, not a camera travel across scenes. |

Camera budget for a 35–70s film: typically **2–5 deliberate reframes total**,
normally **one scale acquisition per demo scene**, and at least one full scene
between reframe clusters so attention can reset. If a beat has no target that
fails a legibility test at context scale, or the target does not require a
meaningful lateral reframe, it does not get a zoom — write element motion,
crop, contrast, or a fixed-scale pan instead.

## 1b. No-shock motion (the viewer should never flinch)

Camera moves must feel like a guided gaze, not a jump scare:

- **Every scale change is visibly nonlinear.** Focal moves use a pronounced
  S-curve such as `power3.inOut`, `power4.inOut`, `expo.inOut`, or a deliberate
  `CustomEase`: slow departure, faster middle, soft arrival. `ease: "none"`,
  linear interpolation, and barely eased long push-ins are forbidden on scale.
- **Duration floor.** Acquisitions run 0.6–0.9s; releases 0.9–1.2s; pans that
  follow filling content run as long as the fill. Sub-0.5s camera moves read
  as shocks unless the motion language is explicitly Kinetic.
- **Settle before the action.** The camera lands and holds ≥ 0.3s before
  typing/clicking starts. Moving *while* the viewer must read induces the
  "autofocus hunt" feeling.
- **No yo-yo.** Never run wide → detail → wide → detail within one scene beat.
  Between two nearby targets, pan at held scale instead of releasing to wide
  and re-zooming.
- **Velocity continuity.** A new move starts from rest or from the tail of the
  previous move — never contradict a camera still traveling at speed.
- **Overshoot stays off the camera.** `back.out` belongs to objects landing in
  the scene, not to the frame itself.

## 1c. The lateral-zoom gate

Treat zoom as support for horizontal attention travel, never as a decorative
effect. Before adding any camera scale tween, answer all four questions:

1. Is there a concrete interactive target that is too small at context scale?
2. Must the frame move materially left or right to acquire or follow it?
3. Does the scale acquisition finish before the viewer must read or act?
4. Does the scale curve visibly accelerate and decelerate?

If any answer is no, keep scale fixed. A useful diagnostic is horizontal travel
of roughly 8% or more of the viewport; smaller movement is often disguised
zoom-only emphasis. The percentage is a review heuristic, not a composition
quota—the semantic need is decisive.

For typing, split the camera behavior into two phases:

```js
tl.to(camera, {
  x: focusX,
  scale: detailScale,
  duration: 0.78,
  ease: "power4.inOut", // nonlinear acquisition
})
  .to({}, { duration: 0.3 }) // settle before the first character
  .to(camera, {
    x: caretEndX,
    duration: typingDuration,
    ease: "power2.inOut", // lateral tracking; scale remains locked
  });
```

For two nearby controls, acquire once, then rack laterally at the held detail
scale. Do not return to context scale between targets. Prefer a clean cut to a
wide consequence frame over an ornamental zoom-out.

## 2. Evidence from the reference film

| Time | What the frames do | Reusable lesson |
|---|---|---|
| 00:00–00:01.75 | A tiny search bar starts in a wide dark field, then rapidly grows until the typed phrase dominates the frame | Begin wide only long enough to orient; make input text legible before asking the viewer to read it |
| 00:02–00:04 | Real app icons enter one by one; the text crops off as the camera/composition favors the icons, then the shot releases to show their relationship | The previous hero may leave frame; one primary target is stronger than preserving everything |
| 00:06–00:08 | A real app dock and cursor become the focal strip; repeated connection cards radiate around the click | Use a recognizable real asset as the anchor, then build native motion around it |
| 00:11–00:17 | The camera moves from a small chat UI to individual limitation messages, then pans vertically as those messages collapse into a trash target | Reframe with the evidence; do not keep the entire UI visible while explaining a small part |
| 00:20.8 | A bright cut changes the dark manifesto chapter to the light product chapter | A chapter cut can be stronger than forcing every transition through a camera fly-through |
| 00:21–00:26 | Brand line → large value-prop text → icon-supported list → full app overview | Reveal meaning at close scale before releasing to the full product |
| 00:26–00:30 | The full interface quickly becomes a tight input view and holds while a task is typed | Focus and action belong in the same shot; the camera settles before/during interaction |
| 00:30–00:33 | The frame follows the agent response downward, then isolates “searching browsing history” | Pan along the workflow so the current state stays dominant |
| 00:33–00:38 | “Credit card” grows into a large accordion, expands to real remembered items, then releases into a real Chase page | Push to the control, hold its result, then reveal the external consequence |
| 00:38–00:41 | The real browser page enlarges, then the frame moves down to the exact task-plan rows | A verified complex surface can be a base plate; camera crop and native overlays turn it into a directed demo |
| 00:42.75–00:47 | “Spawning subagents in parallel” travels across an oversized crop; real LinkedIn/Netflix/Amazon icons enter and the camera pushes to a single row/icon | Cropping text and landing off-center can be intentional; real icons carry meaning instantly |
| 00:49–00:51 | Support/refund steps enter down the page and the camera follows the newest result | Move to the new information rather than scaling a static full screen |
| 00:53 | A flash/hard cut enters the dark benchmark chapter | Use a cut for a claim-category change |
| 00:54–00:56 | Comparison bars reveal with real product/model labels and one bright hero bar | Preserve contextual competitors but give one visual winner |
| 01:06.5–01:10 | Privacy copy pans/recomposes word by word; the active phrase remains large while prior/future words leave | Typography can be camera-directed even without product UI |
| 01:10–01:12.7 | A real laptop/product render rises, holds front-on, then cuts to the hardware back | Official hardware/product imagery makes the claim concrete; a clean angle cut beats a fake 3D reconstruction |
| 01:15–01:19 | Wide privacy copy becomes an extreme close-up of a real password field; the cursor clicks the eye and the value masks | A tiny control may need a 2.5–4× detail shot. Make the control the scene, not a dot in a dashboard |
| 01:20–01:23 | Real provider/subscription icons appear before the final brand/CTA sequence | Recognizable assets close the proof loop faster than generic iconography |

Observed timing pattern: decisive reframes commonly cover most of their travel
in about **0.45–0.85s**, then hold the readable target for roughly **0.7–2.0s**.
Pull-backs tend to feel gentler than pushes. The film also alternates sparse
type/brand shots with denser product shots so the viewer's attention can reset.

The all-frame motion-vector pass found **791 of 2,623 frames** with coherent
pan-like translation, clustered into short bursts rather than one continuous
drift (64 windows of four or more frames). The longest visually confirmed
bursts align with the browser/task reframe around 00:38–00:39.4, oversized
kinetic phrase travel around 00:43.2–00:44.5, and the password-field focus
around 01:16–01:17.6. Treat the count as supporting evidence—local element
travel can also produce coherent vectors—but the clustering confirms the
observed “move, settle, move” rhythm.

## 3. Plan a focal target, not “some camera motion”

Every product-demo storyboard row must include this ledger:

| Field | Required decision |
|---|---|
| Primary target | One selector, image region, word, icon, row, chart value, or control |
| Why now | The claim/action this target proves |
| Context frame | What remains visible so the viewer knows where they are |
| Focus frame | Target landing point and required legibility |
| Focus move | Scale, x/y reframe, duration, ease |
| Hold/action | Typing, click, state change, draw, or narration that occurs while settled |
| Exit | Release wide, rack to next target, match cut, flash, wipe, or hard cut |
| Asset source | Official/provided/live-product source and construction mode |

One beat gets one primary hero. Supporting context may remain visible at lower
contrast, but two equally loud targets split attention. If the storyboard says
only “show dashboard,” it is unfinished.

## 4. Framing and scale tiers

Choose scale by rendered legibility, not by a universal 8% travel rule. Useful
starting ranges for a 1920×1080 master:

| Shot purpose | Typical scale | Composition test |
|---|---:|---|
| Context / geography | 0.85–1.05× | Viewer can identify the product/section in under a second |
| Feature region | 1.25–1.8× | Region occupies roughly one-third to two-thirds of the frame |
| Control / action | 1.8–3.2× | Label, cursor target, and changed state are readable at playback size |
| Tiny icon / field detail | 2.5–4.5× | The control is unmistakable without hiding the consequence it affects |

These are starting points, not quotas. Preview at actual delivery size. Body UI
copy central to the claim should generally render around 28–40px high or more;
secondary context can be smaller. Preserve 72–120px safe margins unless an
intentional crop creates the composition.

The focal landing need not always be dead center:

- Center for a single control, logo, or hard proof.
- Left/right third when copy or the cursor needs negative space.
- Upper/lower third when the action reveals content in the opposite direction.
- Intentional edge crop for kinetic type or a match cut, never from accidental
  overflow.

During acquisition, horizontal pan and zoom happen in the same tween. A slide
followed by a zoom feels like the camera searched for the target; a unified
move feels intentional. After acquisition, lock scale and track the action
horizontally.

## 5. Easing grammar

Record named camera tokens in `direction.md`; do not scatter arbitrary eases.

```js
const CAMERA = {
  focusDuration: 0.68,
  releaseDuration: 0.92,
  focusEase: "power4.inOut",   // precise, decisive acquisition
  releaseEase: "power2.inOut", // calmer return to context
};
```

Recommended families by motion language:

| Language | Focus | Release | Notes |
|---|---|---|---|
| Precision | `expo.inOut`, `power4.inOut` | `power3.inOut` | Fast, clean acquisition; no overshoot |
| Fluid | custom smooth S-curve, `power3.inOut` | `sine.inOut`, `power2.inOut` | Longer overlap; preserve visual continuity |
| Elastic | `back.out(1.15)` only for an object landing, not the global camera | `power2.inOut` | Keep camera mass believable; put bounce in the subject |
| Editorial | `power3.out` or `power2.inOut` | `power2.inOut` | Restrained flat pushes and pans |
| Kinetic | `power4.inOut`, short `expo.out` | hard/match cut or `power3.inOut` | Beat-driven, decisive crops |

Avoid `ease: "none"` for a focal acquisition and never use it for scale.
Linear motion is suitable for a constant-speed ticker, not for directing
attention. A scale curve must show a real acceleration/deceleration profile;
do not hide a near-linear zoom inside a long ambient tween. Do not add overshoot
to large camera zooms: it momentarily makes text unreadable and feels like an
autofocus error. The lateral gate and comfort rules in §1b–1c are mandatory
regardless of motion language.

## 6. Deterministic target math

Use a dedicated `.camera-content` wrapper inside a scene and set
`transform-origin: 0 0`. At the frame where the target exists in its settled
layout, measure it relative to that wrapper. For target center `(cx, cy)`, scale
`s`, and desired viewport landing `(lx, ly)`:

```text
x = lx - s * cx
y = ly - s * cy
```

Reference helper:

```js
function frameForElement(content, target, {
  scale,
  landingX = 960,
  landingY = 540,
}) {
  const contentRect = content.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const cx = targetRect.left - contentRect.left + targetRect.width / 2;
  const cy = targetRect.top - contentRect.top + targetRect.height / 2;
  return { scale, x: landingX - scale * cx, y: landingY - scale * cy };
}
```

Measurement contract:

1. Assemble the master timeline first.
2. Seek to the target's settled measurement time.
3. Temporarily measure `.camera-content` at identity (`x:0, y:0, scale:1`),
   preserving and then restoring its GSAP state.
4. Resolve the numeric frame and populate a placeholder focus timeline, as the
   cursor controller does for click targets.
5. Clamp the result so the target and any required consequence remain inside
   safe margins.
6. Bind focus frames before the final duration/audit pass.

Do not compute coordinates while a `.from()` entrance offset is active. Do not
use hand-tuned pixel guesses for DOM targets: layout, font loading, and copy
changes will invalidate them.

For an image base plate, define hotspot rectangles as normalized fractions of
the image (`x / naturalWidth`, `y / naturalHeight`, etc.). Convert them through
the rendered `object-fit` rectangle before calculating the camera frame. This
keeps a password-eye, chart bar, or menu item target stable at any render size.

## 7. Verified asset hierarchy

Use recognizable assets in this order:

1. User-provided product assets.
2. Official assets extracted from the product/site or its documented brand kit.
3. Verified third-party logos/icons or real app favicons for integrations.
4. Real product/website screenshots for complex or external surfaces.
5. Faithful native HTML/CSS reconstruction where animation needs separable
   layers.
6. Generic icons only for universal concepts such as search, lock, or upload.

Never use a generic star, letter tile, or invented glyph in place of a known
brand. Preserve aspect ratio, clear space, and brand colors. Record provenance
in `recon/assets.md`.

### Three construction modes

- **Native:** best for a small product surface whose controls, rows, charts, or
  state changes must animate individually.
- **Verified base plate:** best for complex third-party sites, dense product
  screens, hardware, and visuals whose fidelity would suffer in reconstruction.
- **Hybrid:** usually strongest. Use a verified image for visual truth, then add
  native cursor, focus ring, mask, status row, highlight, text replacement, or
  result card above it.

A screenshot becomes motion design through staging: crop it, pan into one
region, mask/reveal it, place it in a device/browser shell, add a measured
interaction overlay, and release to its consequence. Never hold a totally
unchanged full-screen image for an entire narrated beat.

## 8. Build motion around real assets

Real assets are the semantic anchors; native layers supply choreography:

- App icons can enter on staggered depth planes, cast consistent shadows, and
  settle into a dock, row, orbit, or workflow.
- Provider logos can attach to real task rows and become the focus target.
- A browser screenshot can sit under a native cursor, selection ring, typed
  query, expanded result, or progress state.
- A hardware render can rise from frame, rotate only if multiple verified
  angles support it, and cut between front/back views rather than faking 3D.
- A chart base can receive native bar fills, labels, and one highlighted proof.

Do not animate every asset at once. Introduce them in the order the narration
names them, then dim, crop, or move prior assets out of the focal hierarchy.

## 9. Edit rhythm and chapter changes

Camera continuity is useful within one thought. Use a hard cut, flash, wipe, or
match cut when the semantic category changes: problem → reveal, copy → product,
demo → benchmark, security → CTA. A forced 3D fly-through between unrelated
chapters adds travel without meaning.

Alternate density:

- dense UI proof → sparse claim/type reset;
- tight control detail → wider consequence;
- real asset proof → abstract/typographic synthesis.

This protects comprehension and makes the next close-up feel earned.

For the full boundary analysis, transition hierarchy, bridge-layer patterns,
and storyboard ledger, read `scene-transitions.md`. Attention releases and
scene transitions should be designed together: the outgoing focal result is
often the strongest bridge into the next scene.

## 10. Attention audit

Before final render, verify:

- [ ] Every product-demo beat has one named primary target.
- [ ] Camera budget respected: only interaction targets that fail a legibility
      test and require material lateral travel got a zoom; type/brand/stat/CTA
      scenes use element motion, not camera moves.
- [ ] Every scale change passes the lateral-zoom gate: concrete target,
      meaningful horizontal travel, settle-before-read, nonlinear S-curve.
- [ ] Typing beats settle the camera before the first character, lock scale,
      then pan along the write direction instead of zooming while text appears.
- [ ] No back-to-back zoom-in/zoom-out cycles within one scene beat.
- [ ] The first wide frame lasts only as long as orientation requires.
- [ ] Each important control/claim is readable at delivery size.
- [ ] Scale and horizontal reframe acquire together; scale stays fixed during
      tracking, and there is no accidental search-like camera path.
- [ ] Focus acquisition uses an eased 0.6–0.9s move unless the direction
      explicitly calls for a slower Fluid move; releases run 0.9–1.2s.
- [ ] The target holds long enough to read and observe its state change.
- [ ] Release reveals consequence, connects to the next target, or is replaced
      by a motivated cut.
- [ ] Ambient drift pauses or yields during precise interactions.
- [ ] Recognizable logos, UI, and hardware use verified real assets.
- [ ] Screenshot/image base plates have native interaction or directed staging;
      none sit unchanged for a whole scene.
- [ ] Non-target layers are visibly subordinate through scale, contrast,
      opacity, blur, crop, or position.
- [ ] At least one sparse reset follows every run of dense product proof.
