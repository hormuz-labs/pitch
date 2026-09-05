# Study: "LangEase" SaaS launch ad (33 s, 1280×720, 30 fps)

Reference film supplied by the user (`vidssave.com Best SaaS Product Launch Ad Video _ LangEase 720P.mp4`,
watermark "zelios"). Every number below is measured from the frames, not estimated: per-frame
difference, content coverage, Laplacian sharpness, bounding boxes, palette clustering, and a
spectral split of the audio into bed, hat grid and sustained swells. Working files (all 991
frames, labelled 30 fps strips per transition, metrics.json, audio.json, spectrograms, the
scripts) are in `projects/_study/langease/` (gitignored).

Frame numbers are `f<n>` at 30 fps; `t = f/30`.

## 1. The one structural fact

There is **no cut** in 33 seconds. Scene detection at the threshold that finds all seven cuts in
our heyclicky film finds nothing here. Every change of subject is one of three moves:

1. **Transform** — the thing on screen becomes the next thing (blob → bar → pill → disc → check → card).
2. **Push** — the camera moves into a part of the thing on screen (card, row) with blur mid-way.
3. **Exit-up-and-blur into an arrival** — the outgoing object rises 60–80 px and blurs to
   nothing over 9 frames, and the next thing is already there on the next frame.

The film is a chain of sixteen objects, each born from the previous one:
words → folder → laptop → phones → blob → bar → pill → disc → check → card → strip → library →
card → scattered cards → list → row → button → star → logo.

Stillness is rare and deliberate. Holds ≥ 8 frames with no motion: 0.00–0.27, 0.53–0.80,
1.37–2.17, 2.23–2.60 and the final 29.33–33.0. **From 6.43 s to 21.63 s no frame is still**
(two motion runs of 5.2 s and 8.4 s): an orbit, a drift, a marquee or confetti keeps the frame
alive under every hold.

## 2. Timeline, frame-accurate

### Act 1 — words and the folder (0–5.8 s)

| f / t | what happens | measured |
|---|---|---|
| f0–8, 0–0.27 | "Turn" (accent blue) is already up, settling: rises 23 px, scale 1.07→1.0 | cy 387→364; soft (sharp ≈ 500) |
| f9, 0.30 | "Books" **adds** in ink, sharp, fully formed in one frame; the line re-centres | bbox w 154→397 in 1 frame; sharp 507→2684 |
| f9–20, 0.30–0.67 | the pair settles up 15 px, scale 1.10→1.0, expo-out | cy 378→363, w 397→359 |
| f26–30, 0.87–1.0 | "Turn Books" **replaced**: shrinks + blurs out; "Audio" lands from ≈1.6× and ≈20 px blur, converging | sharp 66 at 1.0 s → 289 at 1.5 s |
| f41–65, 1.37–2.17 | "Audio" holds (longest still in the film, 0.83 s); horizontal gradient across the word | |
| f66–78, 2.2–2.6 | "Audio" → "Any" (replace) | swell 2.20–2.38 |
| f95, 3.17 | "language" adds in ink | |
| f96–108, 3.2–3.6 | the **folder** scales up from small+blurred **between** "Any language" and the arriving accent word "Instantly"; the line spreads to make room | content h 62→262 in 12 frames: 166,184,212,225,237,244,249,254,259,260,262 (expo-out) |
| f108–130, 3.6–4.33 | hold; folder hovers (diff ≈ 1.3); hand cursor arrives on it ≈ f122 | |
| f131–141, 4.37–4.70 | words blur out (gone by f136); folder grows 1.0→1.45 and moves toward centre; cursor grabs | h 254→380, cx 680→633 |
| f142, 4.73 | the **laptop** plate appears under the folder, tilted, thin | bbox w jumps 356→925 |
| f142–153, 4.73–5.10 | laptop rises into place while the folder shrinks and **drops into the screen** | blue share 0.0585→0.0126 |
| f154, 5.13 | folder gone; the screen shows an **out-of-focus window stack** (DOF) | sharp 130→71→38 |
| f154–164 | the stack breathes and re-layers | |
| f165–173, 5.5–5.77 | laptop **exits up and blurs out** | cy 507→328, sharp 78→10 |
| f174, 5.80 | "Just" already in place, sharp | h 58 |

Sound: swells at 0.19 (+21 dB), 0.40 (+35 dB, the loudest in the film, on "Books"), 1.10 (+27),
2.20, 3.16 (+27, folder), 5.06 (drop), 5.32, 5.85.

### Act 2 — the phone ring (5.8–10.0 s)

| f / t | what happens | measured |
|---|---|---|
| f177, 5.9 | "drop" adds (accent) | |
| f193, 6.43 | "and" adds (ink) **and** the first phone enters bottom-left, huge and blurred | diff 2.6→8.5, sharp 90 |
| f198, 6.60 | second phone top-left; "go" adds (grey) | |
| f205–215, 6.83–7.17 | right-side phones; the five settle into a ring seen from inside | cover 0.08→0.256; sharp 87→387 as they slow (motion blur tied to speed) |
| 7.2–9.6 | ring orbits slowly; centre words swap: 7.4 "Books." (replace), 7.9 "Audio." (add), 8.4 "Video" (add, paler), 8.9 out, 9.0 "All In One Platform" (replace, lands from large+blur) | diff steady 2–4 |
| f294–301, 9.8–10.03 | text exits up+blur; the ring breaks: phones fly outward; the bottom phone streaks toward camera and up-left | **peak diff 37.5 at 9.80 s, the largest motion in the film** |

Three tones on one line: ink "Just", accent "drop", ink "and", grey "go". Hierarchy by colour, not weight.

### Act 3 — blob → bar → done (10.0–14.5 s)

| f / t | what happens | measured |
|---|---|---|
| f302–304, 10.07–10.13 | an indigo **blob** appears behind the exiting phone's trailing edge | blue share 0.016→0.112 in 2 frames |
| f305–318, 10.17–10.60 | blob spreads across the frame as a horn-shaped trail from the phone's tip, soft-edged | blue 0.15→0.50, near-linear |
| f319–332, 10.63–11.07 | blob **contracts vertically into a bar** | h 711,554,463,399,335,277,231,212,199,189,182,174,169 (expo-out, 0.43 s); sharp 33→389 (edge crisps as the shape settles) |
| f336, 11.2 | counter appears top-right | |
| 11.23–12.57 | **count 63→100**: 63,67,70,73,75 @ 11.23–11.37; 79 @ 11.5; 83; 87; 90 @ 11.8; 92; 94 @ 12.0; 95; 97; 98; 99 @ 12.4; 100 @ 12.57 | +3/frame → +1 per 3 frames: expo-out over 1.35 s |
| f377–384, 12.57–12.8 | 100/100 holds 8 frames | |
| f384–389, 12.8–12.97 | bar **retracts from the left into a pill** at its right end, leaving a blurred pale remnant (trail) | width → ≈100 px in 5 frames |
| f390–392, 13.0–13.07 | pill drops to the check position, shrinks to a disc | |
| f393, 13.1 | "Done" replaces the counter; disc becomes the large pale **neumorphic disc** in one frame (cyan → white gradient, blue rim) | |
| f394–398, 13.13–13.27 | **check draws in** stroke-wise (dot, short leg, long leg) | 5 frames |
| f394–433, 13.13–14.43 | **confetti**: ≈40 pieces, four colours, tumbling (facet ↔ sliver), near pieces large and heavily blurred, far pieces small and sharp | 1.3 s |
| f429–433 | "Done" and disc blur out | |
| f434, 14.47 | a blank white rounded card with a blue aura sits where the disc was: **disc → card** | 1–2 frames |

Sound: the bed (kick) **drops out** 13.24–13.44 while the check draws. Swells 10.39, 11.41,
11.94, 12.43–12.69 (+18, the "100"), 13.44, 13.97.

### Act 4 — card → library → languages (14.5–20.2 s)

| f / t | what happens | measured |
|---|---|---|
| f434–437 | the blank card fills with its thumbnail | |
| f438–450, 14.6–15.0 | cards **duplicate to the right**: each new one arrives ghosted/blurred and sharpens; the row slides left to stay centred | a new card every ≈4 frames |
| f450–470, 15.0–15.67 | the strip scrolls left as a marquee, 4 cards visible | |
| f471–473, 15.7–15.77 | the strip **becomes the library grid**: the same cards, and the app chrome (tabs, search, select-all) fades in around them, already tilted in perspective | 2 frames |
| f473–507, 15.77–16.9 | tilted UI drifts (ambient dolly); row 2 populates (f477); cursor enters from bottom-right at f499 and reaches the card by f507 | 8-frame ease-out travel; the frame pushes in during travel |
| f524, 17.47 | **click**: card gets a blue outline and lifts | |
| f525–531, 17.5–17.73 | card scales ≈2.8× while the UI blurs and fades to white; the card lands slightly tilted | w ≈210→583 in 7 frames; UI sharp 44→17 |
| f532–541 | card holds, drifting; blue aura beneath | |
| f542–546, 18.07–18.2 | card **flips about its vertical axis and shrinks** with heavy motion blur; edge-on at f546 | w 654→151 in 4 frames; sharp 197→11 |
| f547–557, 18.23–18.57 | from the sliver, 2 → 4 → 8 copies **fan out** blurred and settle into a scattered field at different scales (depth), each with a different flag | |
| f557–560 | "Multiple" then "Languages" add | |
| 18.6–19.9 | field drifts with parallax (near cards move faster) | |
| f600–605, 20.0–20.17 | cards fly off in different directions; the near one streaks past camera; text blurs out | peak diff 23.8 |
| f605–611, 20.17–20.37 | the **list UI** arrives from top-right, tilted, blurred → sharp | |

Sound: bed drops 15.22–15.44 (strip → UI), 16.50–16.98 (cursor enters), 18.75–19.01 (scatter
settles). Long swells for the strip (14.45–14.73, 15.47–15.78: 0.3 s each).

### Act 5 — list → row → button → star (20.2–25.0 s)

| f / t | what happens | measured |
|---|---|---|
| f611–660, 20.37–22.0 | tilted list frame drifts; cursor hovers rows | |
| f660–666, 22.0–22.2 | **push-in**: perspective flattens to zero and the "How-to Video" row fills the width; blur at the midpoint | 6 frames |
| f684–690, 22.8–23.0 | the row slides left out while the black **"Distribute To Youtube"** button slides in from the right on the same white card | push within the row |
| f690–699, 23.0–23.3 | cursor arrives from bottom-left | 9 frames ease-out |
| f703–706, 23.43–23.53 | **press**: button scales ≈0.93 and back; finger presses | 3 frames |
| f712–716, 23.73–23.87 | the row card collapses around the button | w 687→504 |
| f716, 23.87 | button turns **black → blue gradient in one frame** on release | blue share 0.001→0.042 |
| f717–733 | button alone at centre; cursor flies off top; button lightens slightly | |
| f734–737, 24.47–24.57 | a pale, blurred, giant **star shape floods the frame** from behind the button | cover 0.09→0.91; sharp 2.8 |
| f738–746, 24.6–24.87 | the star **shrinks geometrically** and gains full colour; the button text is visible inside it until f739, then gone | w 1279,997,799,656,544,451,371,301,239 (ratio ≈0.82/frame) |
| f746–770, 24.87–25.67 | sparkle settles, tumbles, shrinks to ≈90 px and drifts right off frame | |
| f772–786, 25.73–26.2 | re-enters top-right with a **curved comet trail** and lands where the full stop after "Translate." will be | trail fades over ≈0.5 s |

Sound: bed drops 22.77–23.00 (button arrives) and **24.14–24.39, the breath before the flood**;
the star morph itself is nearly silent (+5.6 dB at 24.92).

### Act 6 — the line and the logo (26.2–33 s)

| f / t | what happens | measured |
|---|---|---|
| f786, 26.2 | "Translate." arrives; star is its terminal | |
| f799, 26.63 | "Dub." adds; star hops to the new end | |
| f819, 27.3 | "Distribute" adds (ink); star slides to the end at 4 px/frame | |
| f840–855, 28.0–28.5 | the line **exits left with ease-in** (accelerating 4→45 px/frame); the star stays | cx 619→387 |
| f856, 28.53 | star alone, 43 px | |
| f857–863, 28.57–28.77 | the logo bar **draws upward** beside the star; the pair shifts left to make room | h 45→87 |
| f864, 28.8 | "Lang" appears; f866 "Ease" appears | 2 frames apart |
| f866–880, 28.87–29.33 | "Lang Ease" **closes into "LangEase"** and settles left, expo-out | w 557→499 |
| 29.4–30.0 | "langease.ai" types beneath, ≈1 char per 2 frames | |
| f880–990 | hold 3.7 s | |

Sound: bed drops 27.22–27.90 (**0.68 s, the biggest breath, before the logo**); outro hits at
29.66 (+27), 30.19 (+37) and 30.70–31.24 (+40 dB, 0.54 s, the largest swell); silence from 31.4 s.

## 3. Audio, separated

- **Bed**: 115.4 BPM, kick-driven, hats on eighths (0.26 s). RMS −19 to −14 dBFS. The loudest bars
  (−14/−15) sit under the biggest moves: the drop (4–6 s), the ring (10 s), the scatter (18 s).
- **SFX**: 40 sustained high-band swells (≥ 80 ms, ≥ 4 dB over the hat floor). Every word add or
  replace has one of 0.15–0.25 s; object moves get 0.3 s; the loudest are the first ("Books",
  +35 dB) and the last (outro, +40 dB). That is ≈ 1.2 per second, **all motivated by picture**.
- **Breaths**: the kick pauses nine times, always right before or during a payoff (check draws,
  cursor enters, button arrives, before the star flood, before the logo). Silence is used as
  punctuation, not just density.
- Our audit measures density (events/s, longest quiet). This film would pass it, and so does
  ours. Density is not the gap; motivation and breaths are.

## 4. The motion grammar, as numbers

| move | frames | shape |
|---|---|---|
| word **add** | 1 frame to appear, then the line settles 10–12 frames | present instantly; group re-centres expo-out; arrives 7–10 % oversize |
| word **replace** | out 5 (shrink 0.9 + blur), in 5–8 (from ≈1.5× + ≈20 px blur) | both converge on the resting size |
| hold between type events | 9–25 frames (0.3–0.8 s) | |
| object arrival (folder) | 12 frames | scale from ≈0.6 + blur, expo-out |
| fly-in (phones) | 20 frames | from off-frame, motion blur proportional to speed, decelerating |
| **exit up + blur** (the film's one exit) | 9 frames | rise 60–80 px, blur to nothing, ease-in |
| camera push (row, card) | 6–7 frames | blur at the midpoint, perspective → 0 |
| bar retract → pill → disc → check | 5 + 3 + 1 + 5 = 14 frames | a chain of small morphs, each one shape into the next |
| blob spread → contract | 13 + 13 frames | linear spread, expo-out contract |
| button → star | 3 flood + 9 shrink | flood is pale and blurred; shrink is geometric (×0.82/frame) |
| counter 63 → 100 | 40 frames | expo-out |
| line exit | 15 frames | **ease-in** (accelerates off), the only accelerating move |
| cursor travel | 8–9 frames | ease-out, tiny overshoot; press 3 frames |
| confetti | 39 frames | ≈40 pieces, tumble, DOF by size |
| check draw | 5 frames | stroke-wise |

Two easing families only: expo-out for arrivals and settles, ease-in for exits. Nothing bounces.

## 5. Stage, palette, type, materials

- **Stage**: `#F8F7FD`, a lavender-tinted off-white. No grain, no vignette, no ambient shapes,
  no gradients on the stage itself. The only ambient life is object drift.
- **Palette** (k-means over saturated pixels): deep accent `#1055EC`, mid `#4D95E4`, light `#7EB1ED`,
  pale `#B0CEF7`, indigo `#5E51EB` (the app's own purple, used for the blob and bar), cyan cap
  ≈`#57B3FC`, confetti pink, ink `#0D0C11` (words, button), grey for the de-emphasised word.
  Three tints of one hue do the hierarchy.
- **Type**: SF Pro Display-class grotesque, Regular, cap ≈ 54 px at 720p (7.5 % of frame height),
  tight tracking; "Done" in Light with a horizontal gradient; the wordmark is a geometric sans
  (Lexend/Outfit class) Semibold. Never more than four words on screen. Colour, not weight,
  carries emphasis.
- **Materials**: frosted-glass folder front (backdrop blur over the papers, white ≈40 % over
  blue) with a contact shadow; bar with a travelling highlight and a cyan end cap; neumorphic
  disc (white → pale-blue radial, 1 px blue rim, soft drop); UI frames with a 2 px accent stroke on
  the lit edges and a blue **aura** beneath (screen light spilling onto the stage); cards with a
  1 px blue outline on hover and the same aura; pure black pill button that goes blue on release.
- **Depth**: three cues, always together: scale, blur (both DOF and motion), aura shadow. Near =
  big + blurred, far = small + sharp. Motion blur is proportional to speed everywhere.
- **Cursor**: a custom white hand with a thick blue outline, ≈50 px, present only when an action
  follows, travel 8–9 frames ease-out.
- **Real product, always**: phone screens show real transcripts, PDFs and lectures; cards have
  real thumbnails, flags and dates; the list and library are the real app. Nothing generic.

## 6. Why it reads as premium

1. **One continuous take.** The viewer never re-orients; attention is carried, not reset.
2. **Object as protagonist.** Each scene's subject is born from the previous one, so every
   feature is the consequence of an action (drop → process → done → library → languages →
   distribute). The product story is a job story told by one object.
3. **Two things on screen.** Coverage is under 6 % for most of the type beats and never above
   ≈45 % except during the blob. Whitespace does the work our ambient layers try to do.
4. **Blur is the grammar.** Blur-in for type, DOF for what is not the subject, motion blur for
   speed, blur-out for exits. It is one vocabulary applied everywhere.
5. **Pieces of the product at hero scale.** A card, a row, a button, extracted from the real
   screen and shown alone, with the app drawn around it when context is needed.
6. **Rhythm**: burst 0.2–0.5 s, hold 0.3–0.8 s, and between 6 s and 22 s never fully still.
   Breaths in the music before every payoff.
7. **Restraint in easing**: expo-out in, ease-in out, geometric shrinks. No bounce, no elastic.

## 7. What our stack cannot do yet, mapped

| the reference does | we have | the gap |
|---|---|---|
| one object persists and transforms across 16 scenes | shots as isolated DOM subtrees; `carry` = a screenshot ghost | **persistent actors** with tweened transform/blur across shot boundaries |
| word add / replace with line re-centring and 3 tones | `parts` blocks, blur-in, weights | a **line** primitive: add / replace / three tones / exit-left ease-in |
| object between words | captions top or bottom | a type beat with an **object slot** |
| exit up + blur as the default exit | scatter, hard cut, transitions | the exit family, and blur as a tween target |
| DOF: blur by depth (window stack, confetti, cards) | none | per-element blur tied to z |
| motion blur on fast moves | shutter supersampling in capture | already in place; not used by the films |
| blob trail; bar → pill → disc → check; disc → card; button → star | MorphSVG for icons | **shape morph chain** between primitives (rect, pill, circle, path) plus a goo trail |
| card zoom (UI blurs to white), flip to sliver, fan-out to 8 | cursor beats, `then` swaps | **element push-in** with DOF, flip + multiply |
| strip → library grid "context reveal" | ui-frame | rebuild the app **around** an extracted element |
| glass, gradient cap, neumorph, aura | flat fills | material presets |
| five phones in a ring, real screens | `device-3d` single device | multi-device stage |
| bare stage | ambient layers by default | ambient none as a legitimate direction |
| music breaths before payoffs | density audit | a **breath** beat kind (duck the bed) |

The first row is the one that changes the films. Everything else layers on it.
