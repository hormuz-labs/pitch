# Launch-film mechanisms

A menu of moves seen in professional launch films, for choosing how a scene
works or how two scenes join. It is not a recipe or a ranking. Start from the
product's mechanism (what goes in, what changes, what comes out), pick the move
that shows it, and build it with the product's own objects. A film made of
every move here is a showreel, not a story.

Adapted from the MIT-licensed motion-video-kit (echris6), whose notes study 28
films from a launch studio's public portfolio. The films belong to their
owners. Moments were read by eye at approximate times, not measured frame by
frame; when a timing matters, take it from a reference you can study
(`references/reference-video.md`). The lab studies named below are the closest
implementations in `pitch effects`, not ports of these films.

## Moves

| Move | What happens | Fits when the product… | Closest lab studies |
|---|---|---|---|
| Foreground fly-through | A claim, logo or shape scales through the camera with stretched edges while the next scene already waits underneath | has one promise that opens onto the product | `launch-primitives/notification-type-payoff`, `launch-studies/kinetic-slides-to-prompt` |
| Shape as portal | A brand shape or control grows until its inside becomes the next frame | has a mark or control people recognise | `launch-primitives/voice-pill-magnification` |
| Selection → expansion | A selected item expands into the detailed workspace of the next beat | is used by picking one thing from many | `launch-primitives/result-card-focus-expansion`, `launch-studies/replit-canvas-camera` |
| Action causes the transition | A click or request is itself what opens the next scene | has a decisive button or command | `launch-primitives/cursor-dashboard-flythrough` |
| Materialising result | The result's shell appears, then its regions fill in order, then it holds readable | produces a document, card or report | `launch-primitives/phone-stat-depth` |
| Persistent rails | Lines connecting steps survive while the words on them change | runs a multi-step process or pipeline | `launch-primitives/reasoning-path-camera` |
| Continuous canvas | One camera move travels over a single spatial layout; the selected item stays sharp while neighbours blur | lives on a canvas, board or long page | `launch-primitives/product-canvas-pullback`, `launch-primitives/focus-target-camera`, `launch-studies/mobbin-ui-camera` |
| Artifact ring | Small artifacts orbit one stable sentence that keeps adding words | gathers many inputs into one place | `devices/orbit-cards` |
| Stack / fan | Screens arrive and occlude into a shallow stack, or one card fans into a collection | turns one thing into many, or many into one | `showreels/stacked-cards`, `launch-primitives/phone-gallery-pullback` |
| Perspective fold | A panel folds edge-on into a strip and the next panel rises out of it | moves an item from one state to the next | `effects/card-flip` |
| Exploded layers | A physical object separates along its real layers, holds, and recombines | is hardware or has real physical structure | custom three.js (`references/treatments/3d.md`) |
| Registered decomposition | The source object stays recognisable while its regions lift out as structured outputs | analyses or parses an input | `launch-primitives/code-scan-constellation` |
| Wall → one actor | An overload of items collapses to one clear subject, which then works | cuts through noise or volume | `launch-primitives/triptych-prompt-montage`, `launch-studies/coderabbit-security-scan` |
| Carousel emphasis | A rotating list with one bright, readable active item and receding neighbours | has a short sequence of named steps | `text/blur-text-scroller` |
| Request → choice → confirmation | A request bubble anchors while a sheet rises, a choice is made and the state confirms | books, schedules or answers on someone's behalf | `launch-studies/gemini-assistant-journey`, `devices/text-message-ios` |
| Stable subject, moving world | The product stays centred and sharp while the surroundings streak past | goes with the user through their day | — |
| Colour-field breath | A soft field of brand colour takes the frame for one handoff | needs one brand moment; use once, not as the language | `cut: "flood"` |
| Tile wipe | A grid of tiles covers the frame as a chapter break | changes chapter; fragmenting, so rarely | `effects/pixelated-mask`, `effects/pixel-dissolve-transition` |

## One moment from each film

Each line: what the film is, then the moment and what it teaches.

1. **TypeSafe** — editorial flow diagrams around founder speech. A node and its connector stay put while the text beside them changes: keep one artifact on screen while the next proposition arrives.
2. **T:0 finance agent** — black/white finance type with one green annotation colour. Words rearrange into a new phrase and a hand-drawn strike lands: fast semantic type changes plus a single accent beat.
3. **Cognition, Devin Voice** — documentary warmth, thin charts over footage. A chart stays registered over the subject while a caption advances: restrained overlays explain without taking over.
4. **Poke × Cognition** — filmed phone UI and dimensional cards. Holds work when what is held is the product doing its job.
5. **AsideHQ** — a dark "friction" premise opening into a bright workspace. A cursor crosses dock icons and the chosen app fans upward into the next scene: the action is the transition.
6. **Browserbase** — bitmap nature, coloured cursor labels, staged browser tasks. The page reveals lower cards as the camera pulls back while the cursor keeps tracking its target: camera motion over nested UI on one working surface.
7. **Poke, travel montage** — the phone stays centred and sharp while the background streaks past: a stable subject through a moving world.
8. **ListenLabs** — circles turn edge-on and repeat in depth; type runs past the frame. A capsule outline draws around a placeholder that becomes a typed question: contours and text states animate together, and extreme scale gives type energy.
9. **Buds** — prompt → documents → results in one warm workspace. A result moves up, its text follows, the next arrives from below: change content inside a persistent workspace instead of cutting between slides.
10. **Taste** — perspective galleries and artifact rings. A wall of large panels becomes a belt of small screenshots orbiting a sentence that keeps adding words; it stays smooth because the eye's centre and the cards' track are shared.
11. **Replit Slides** — cream, black type, orange emphasis, oversized controls. Dots resolve into a card that grows while a colour wash reveals its regions in stages: materialise the result, then let it read.
12. **Replit Canvas** — prompt → directions → canvas → publish. The camera travels down a column of artboards; neighbours blur, the selected column stays sharp, new content appears before the old leaves.
13. **Replit Parallel Agents** — four endpoints travel along thin rails while the headline swaps; the rails survive the swap: a persistent path lets words change without resetting the scene.
14. **Adaline** — a globe and orbits dissolve into a radial network and the next phrase forms at its centre: a small family of shapes (circles, thin lines, compact labels) carries complex ideas quietly. Pale low-contrast elements fail on the key message.
15. **Pilot Protocol** — black tiles multiply over the frame, then expose a new environment: a tile wipe is a one-time chapter break, not a transition language.
16. **Bevel** — screens arrive upward in a stack, each soft-focused, aligning and occluding the last: overlapping timing plus motion that decreases as things align reads as smooth. Keep stacks shallow so text stays large.
17. **Poke, campaign** — an avatar pulls back into the phone; a request bubble stays readable while a calendar sheet rises: request → choice → confirmation, with the request as the anchor.
18. **Wonder (first)** — the camera pulls back from a selected frame while skeleton regions fill neighbouring artboards: couple the global camera move with local UI motion, keep selection borders attached to their objects, end readable.
19. **Wonder (second)** — the selected title barely moves, then accelerates through the camera, stretched and blurred, clearing white space for the next prompt: the foreground fly-through, with the selection marker as the actor.
20. **MadeThis** — a tilted wheel of labels advances; the active line is bright, neighbours recede, the background hue flows: carousel emphasis.
21. **AgentArcade** — an upright panel folds into a luminous strip and the next card rises out of it: the perspective fold. Near-black transition frames hide the story on phones; keep contrast.
22. **Work Louder** — parallax keyboards hard-cut to three exploded layers that keep drifting, almost no copy. The cut holds because geometry, palette and motion continue across it: the reference for physical products.
23. **Contra (Indy)** — a wall of posts races upward, cuts to one character close-up, pulls back into a clean grid: overload resolves to one actor, then a scan visibly produces results.
24. **Contra (Creative Arena)** — the centred claim and logos scale through the camera while the destination site is already visible underneath, then settle: the model fly-through. Two options, one selected, and the selection becomes the next scene.
25. **Bolt.new** — the brand letterform scales until its counter fills the frame and becomes the next scene: shape as portal. A strike-through replacing text is another strong move.
26. **Tembo** — one card moves to centre and its copies fan diagonally as the camera pulls back: one becomes many with the front card preserved. Calm pacing.
27. **Conduit** — a soft coloured cloud takes over the frame as the logo settles: one colour-field breath for the brand handoff; input → work → result is the real lesson.
28. **Extend** — a perspective document keeps its coloured regions registered while a scan completes, then the regions lift as planes and category cards reveal: registered decomposition.

## Across the films

- The strongest never cut to an unrelated layout without a carried object, a matched direction or a destination already in place (`references/continuity.md`).
- Software shows cause and effect through a cursor or selection; physical products get material realism and real structure; services show a request becoming a confirmation.
- Long founder sections and slow historical intros belong to long-form films, not a 15–40s launch.
- Near-black transition frames and pale text on the key message disappear on a phone.
