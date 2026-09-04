# Scene-to-Scene Flow & Transition Bridges

Read this before storyboarding. **Default to a clean one-frame cut.** A scene
transition is an exception, not decoration placed between two finished shots.
Use one only when it explains a causal continuation that the cut cannot express
as clearly.

The strongest exceptional transitions preserve one verified object across the
boundary. That surviving element is the **transition bridge**. If the bridge is
an invented dot, panel, wash, or empty color field rather than the actual
result of the outgoing action, remove it and cut.

**Creative-freedom rule:** this is a decision vocabulary, not a required effect
set. Do not reproduce the reference film's boundary sequence, timing, visual
assets, or transition count. A product may call for restrained cuts, playful
object physics, typographic transformations, editorial wipes, a continuous
single-shot world, or another system not listed here. The current URL's brand,
causal product flow, and `direction.md` decide. Use these patterns only when
they make that particular relationship clearer.

## 1. Evidence from the reference film

An 8fps boundary pass reveals these recurring connections:

| Time | Boundary behavior | Transition principle |
|---|---|---|
| 00:16.5–00:19.3 | Limitation lines and an app icon arc into a real dock/trash target; the dock survives under “Introducing”; a blue curtain/portal grows from that same lower focal area into the brand reveal | Let the result of scene A become the origin of scene B |
| 00:20.5–00:21.5 | The blue brand field washes to white and the next browser mark appears after the brightness reset | A palette wash cleanly announces a new chapter |
| 00:32.9–00:34.5 | “Searching browsing history” fades along the same baseline where “Credit card” appears and expands | A text/position handoff can connect two UI states without moving the whole screen |
| 00:36.5–00:38.5 | The “Open Chase.com” row opens downward and the real Chase page grows out of that region | The clicked surface becomes a portal to its consequence |
| 00:41.5–00:44.5 | Task text travels out horizontally; oversized “Spawning subagents in parallel” enters with continuing horizontal velocity | Preserve direction and momentum across a density/style change |
| 00:46–00:49 | A real LinkedIn row/icon becomes the close-up hero, then gives way to the resulting support workflow | A verified asset can be the semantic hinge between setup and result |
| 00:52.75–00:53.2 | A small black dot rapidly expands into a full dark field that reveals the benchmark | A local shape can iris-wipe the entire scene |
| 00:58–01:00 | The sentence strips away until only the globe/browser token remains; that token crossfades/morphs at the same position into the Aside symbol | Reduce to one shared glyph, then transform its meaning |
| 01:04.5–01:06.5 | The capability list collapses to its final small icon; the icon grows into the privacy/account symbol before the white privacy chapter | End on the seed element for the next claim |
| 01:10.5–01:13 | Privacy copy makes room for a real laptop rising from below; front and back hardware views cut at nearly identical scale and screen position | Match silhouette and position across an angle cut |
| 01:18.9–01:19.6 | The real password field's eye-off control cuts to the same eye-off glyph isolated on dark | A tiny interaction result becomes the next scene's full-frame symbol |
| 01:21.6–01:23.3 | The provider-icon row contracts toward the Aside icon; the icon holds while the Aside wordmark and final positioning line build beside it | Collapse many objects into the brand anchor, then grow the CTA from it |

The common pattern is **conservation**: conserve identity, position, velocity,
shape, or meaning while changing the rest of the frame. This makes separate
scenes feel like one authored sequence.

## 2. Cut-first decision hierarchy

Consider these in order. Stop as soon as the boundary reads cleanly:

1. **Hard cut** — the default for every boundary, especially when the
   rhetorical mode, composition, palette, or proof category changes.
2. **Visual match cut** — align silhouette, crop, position, color, or meaning,
   but still cut without an interstitial animation.
3. **Shared-element handoff** — opt in only when the exact same verified object
   continues the exact same action and its movement is itself explanatory.
4. **Directional carry** — use only inside one uninterrupted workflow and keep
   the handoff shorter than the incoming scene's first readable beat.
5. **Surface expansion / portal** — rare; require a clicked surface that truly
   opens the destination and reject it if the expanding panel becomes a third
   composition.

Shape wipes, arbitrary bridge dots/panels, palette washes, generic crossfades,
zoom-throughs, spins, and whip pans are banned by default. They move pixels but
usually create a strange in-between shot rather than clarify the relationship.

## 3. Add a transition ledger to the storyboard

After the scene table, plan every boundary:

| From → To | Relationship | Bridge element | Conserved property | Mechanism | Duration/ease | Sound cue |
|---|---|---|---|---|---|---|
| S1 → S2 | New rhetorical chapter | none | none | clean cut | 1 frame | beat accent |
| S2 → S3 | Task launches external site | `Open Chase.com` row → browser page | source region + meaning | surface expansion | 0.68s `power4.inOut` | soft open |
| S5 → S6 | Interaction result becomes security claim | password eye-off → eye-off glyph | shape + screen position | shared-element match | 0.36s `power3.inOut` | muted click |

Every boundary must be marked as either:

- **clean cut** — the default; state the outgoing final frame and incoming
  first frame; or
- **connected exception** — name the continuing verified object, conserved
  property, causal action, and why the cut failed in a boundary review.

“Fade to next scene” without a reason is unfinished. Do not create a transition
vocabulary merely because the film has multiple scenes. Rhythm can come from
the contrast between outgoing and incoming scene entrances.

## 3a. The no-third-shot gate

Review every boundary alone at 10fps. Reject the transition and use a direct
cut if any sampled frame shows:

- a blank or near-blank color field between two populated scenes;
- a bridge dot, line, panel, or card floating without its original context;
- an expanding surface that temporarily becomes a new third composition;
- two complete readable scenes overlapping;
- the outgoing scene awkwardly clipped while the incoming scene is not yet
  established; or
- more attention on the handoff mechanism than on either product claim.

The clean-cut baseline is not optional: render the boundary once as a one-frame
cut before judging an animated alternative. Keep the animation only if it is
unambiguously clearer at playback speed.

## 4. Timing and easing

Typical ranges at 30/60fps:

| Transition | Typical duration | Easing behavior |
|---|---:|---|
| Shared-element handoff | 0.35–0.75s | One smooth S-curve (`power3.inOut`) |
| Surface expansion | 0.55–0.9s | Fast commitment, soft settle (`power4.inOut`) |
| Iris / curtain / mask | 0.45–0.75s | `power3.inOut` or a brand-specific CustomEase |
| Directional carry | 0.4–0.7s | Outgoing accelerates in; incoming decelerates out |
| Match cut | 1–6 frames | Cut at peak alignment; optional tiny post-cut settle |
| Palette wash | 0.25–0.6s | Fast exposure bloom, no long gray crossfade |
| Clean cut | 1 frame | Default; land on speech punctuation or a musical beat |

Finish the outgoing scene intentionally, cut, then let the incoming scene own
the frame immediately. For a connected exception, start outgoing motion before
the boundary and let the incoming scene inherit it. Never insert an empty
bridge-only hold, and never overlap two readable screens.

## 5. Shared-element architecture (exceptional use only)

Put persistent transition assets in a layer above scenes and below the cursor
and finish layers:

```html
<div id="transition-layer" aria-hidden="true">
  <div id="bridge-eye" class="transition-bridge"><!-- verified SVG/icon --></div>
</div>
```

```css
#transition-layer {
  position: absolute;
  inset: 0;
  z-index: 800;
  pointer-events: none;
  overflow: hidden;
}
.transition-bridge {
  position: absolute;
  opacity: 0;
  transform-origin: 50% 50%;
  will-change: transform, opacity, clip-path;
}
```

Do not try to keep an ordinary child alive after its `.scene` fades out. Use a
verified duplicate in `#transition-layer`, or a deterministic Flip-based clone,
and align it to the outgoing and incoming element rectangles after fonts/assets
load. Hide the scene copies during the handoff so only one bridge is visible.

### Shared-element handoff

```js
function sharedElementBridge({ outScene, inScene, bridge, from, to, d = 0.58 }) {
  return gsap.timeline()
    .set(bridge, { ...from, autoAlpha: 1 })
    .to(`${outScene} .bridge-source`, { autoAlpha: 0, duration: 0.08 }, 0)
    .to(bridge, { ...to, duration: d, ease: "power3.inOut" }, 0)
    .set(inScene, { autoAlpha: 1 }, d - 0.14)
    .to(bridge, { autoAlpha: 0, duration: 0.12 }, d - 0.1)
    .set(`${inScene} .bridge-target`, { autoAlpha: 1 }, d - 0.1)
    .to(outScene, { autoAlpha: 0, duration: 0.12 }, d - 0.12);
}
```

`from` and `to` must be seek-measured rectangles, not guessed coordinates.
Resolve them after master assembly using the same measurement contract as
`FocusDirector` and `CursorController`.

### Surface expansion

The triggering row/card remains visible as the next surface grows from its
rectangle. Animate border radius toward the next surface, expand width/height,
and reveal its internal image with a mask. This is ideal for “open website,”
“view report,” “inspect item,” or card → detail transitions.

```js
tl.set("#site-bridge", { ...sourceRect, autoAlpha: 1, borderRadius: 14 })
  .to("#site-bridge", {
    ...destinationRect,
    borderRadius: 0,
    duration: 0.68,
    ease: "power4.inOut",
  })
  .fromTo("#site-bridge .verified-page",
    { clipPath: "inset(45% 40% 45% 40%)" },
    { clipPath: "inset(0% 0% 0% 0%)", duration: 0.58, ease: "power3.inOut" },
    "<0.08");
```

### Iris / shape wipe — normally reject

Do not use an invented dot or mask merely to cover a cut. Consider this only
when the outgoing interaction literally creates the same verified shape and
the boundary passes the no-third-shot gate. A clean cut remains the baseline.

Reveal the incoming scene through a mask whose origin has meaning—the clicked
dot, icon, cursor result, logo counter, or focal card—not an arbitrary center.

```js
gsap.fromTo(nextScene,
  { autoAlpha: 1, clipPath: "circle(0% at 43% 72%)" },
  { clipPath: "circle(150% at 43% 72%)", duration: 0.58,
    ease: "power4.inOut" }
);
```

### Directional carry

Use one shared vector. If the outgoing scene accelerates left, the incoming
scene enters from the right and settles while continuing leftward momentum.

```js
tl.to(outScene, { xPercent: -115, duration: 0.42, ease: "power3.in" })
  .fromTo(inScene,
    { xPercent: 115, autoAlpha: 1 },
    { xPercent: 0, duration: 0.52, ease: "power3.out" },
    "-=0.18");
```

Do not reverse direction halfway unless the reversal itself communicates a
rejection, undo, or return.

### Match cut

Align outgoing and incoming silhouettes, focal centers, and approximate size.
Cut at the closest match, preferably on a beat. Examples: laptop front → back,
eye-off control → eye-off glyph, globe token → product mark. A match cut needs
little or no crossfade; excessive blending weakens the perceptual snap.

## 6. Clean cuts versus connected flow

Even inside one causal thought, try a clean or visual-match cut first:

```text
type task → inspect memory → open website → perform action → show result
```

Use a clean chapter cut when the rhetorical mode changes:

```text
pain montage | product reveal | live demo | benchmark proof | trust | CTA
```

The cut provides cognitive punctuation. A video where every boundary is a
portal, wipe, or bridge feels exhausting and often produces awkward empty
frames. Connected motion is earned only by a literal continuing action.

## 7. Transition audit

- [ ] Every scene boundary was rendered and reviewed as a clean cut first.
- [ ] Every boundary is labeled clean cut or connected exception.
- [ ] Every connected exception names one verified continuing object, its
      conserved property, the causal action, and why the cut was less clear.
- [ ] The bridge grows out of the outgoing action/result, not an arbitrary
      overlay.
- [ ] Outgoing motion begins before the boundary; incoming motion inherits or
      settles that vector.
- [ ] Shared elements align within a few pixels at the handoff frame.
- [ ] No two complete, readable screens sit over each other.
- [ ] No blank field, arbitrary bridge object, or temporary third composition
      appears between scenes.
- [ ] Transition duration matches the chosen motion language and does not steal
      time from the incoming proof.
- [ ] The transition layer is hidden outside its exact handoff window.
- [ ] Real logos/icons remain undistorted during bridge transforms.
- [ ] Clean cuts land on semantic punctuation and preferably an audio beat.
- [ ] Any retained transition is rare enough to feel causal, not ornamental.
