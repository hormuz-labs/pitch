# Study: "Introducing Google Vids" (86.7 s, 1280×720, 29.97 fps)

Reference film supplied by the user (`vidssave.com Introducing Google Vids 720P.mp4`). Measured the
same way as the LangEase study: 2 599 frames on disk, per-frame difference / coverage / sharpness /
bounding boxes, palette clustering, labelled 30 fps strips for 32 moves, a spectral split of the
audio, and a whisper pass for narration. Working files in `projects/_study/googlevids/`
(gitignored). `f<n>` is the frame index; `t = f/29.97`.

**No narration.** Whisper finds one line, and it is the presenter inside the recorded webcam clip at
≈70 s ("Alright sales team, we're excited to share…"). The whole film is music, typed prompts and the
product. Type carries the script.

## 1. The structure

Where LangEase is one unbroken object chain, this film is **a repeated chapter template**, eight
times over 87 s, with 22 hard cuts that all land on a full-frame flood or a beat:

```
hero prompt typed at 15 % of frame height  →  the real UI appears, tilted 2.5D, cursor acts
  →  a payoff at hero scale (a flood, a morph, an extracted element)  →  next prompt
```

| chapter | prompt (hero type) | product (tilted UI, cursor) | payoff |
|---|---|---|---|
| 1 Create | "Help me create a sales training video" | Drive ▸ New ▸ Google Vids; file chips dragged into the prompt | **"Creating…"** pill floods the frame, tilts away into the outline list |
| 2 Style | "Let's choose a **style**" | style picker, tilted | the word "style" alone → click → four full-frame template flips on the beat |
| 3 Script | "Let's write my **script**" | mic button, script panel streaming | camera pushes into the panel: the script at hero scale, words turning blue → ink |
| 4 Voice | "Now, let's give it a **voice**" | voice list, tilted; "Voice 2, US, calm" zoomed, clicked | the word "voice" explodes into gradient ellipses that squash into the list's rows |
| 5 Collab | (comment typed: "Any input?") | the slide with three live collaborator cursors; comment cards stagger in | avatar pair chip zoom; comments cascade |
| 6 Media | "Landscape" typed in a search pill | stock grid, tilted; thumbnail picked | the picked thumbnail grows and drops into the editor |
| 7 Record | record icons stagger | black recorder UI, red button | **3-2-1** as extruded 3D glyphs swinging through frame over the blurred webcam |
| 8 Play | Play pill, cursor press | concentric ripple rings fill the frame | pill label becomes "AI powered" → phrase rotator → blue flood → glitch-glow rotator → logo, Workspace grid |

The stage stays white (`#FDFDFD`). For hero moments a soft **aurora** (blurred blue / pink / lavender
blobs) fades in behind the type; the product shots sit on a pale blue haze. No grain, no vignette.

Motion vs stillness: holds ≥ 8 frames exist only in the first 3 s (the rotator) and around cuts;
every product shot has an ambient dolly (diff 1–4 continuously). Big moves peak at 50–86 mean
frame difference (the floods and the countdown glyphs), the highest in either film.

## 2. Timeline, frame-accurate (selected)

### Chapter 1 — Meet, Drive, prompt, Creating (0–15.5 s)

| f / t | what happens | measured |
|---|---|---|
| f27–94, 0.9–3.13 | **"Meet your [+ New] designer"**: the real Drive button sits inside the sentence; the last word swaps in 1 frame with no transition: designer (0.67 s) → writer (0.30) → producer (0.33) → editor (0.30) → storyteller (0.47) | holds shrink, then the long one before the exit |
| f99–108, 3.3–3.6 | "Meet your" and "storyteller" **blur out in place** (opacity + 4 px blur, 9 frames) while the **+ New button persists** and settles to centre | cover 0.043 → 0.008 |
| f110–133, 3.7–4.4 | cursor arrives, button grows to real scale, hover state | |
| f134, 4.47 | click: the Drive **New menu** unfolds beneath the button (real UI, sharp) | |
| f150–172, 5.0–5.74 | cursor travels the menu, hovers "Google Vids" (row highlight) | 22 frames |
| f173–193, 5.77–6.44 | click: the menu blurs, the **Vids logo triangles** (purple → blue gradient) fly right-to-left growing, 1 → 2 → 3 → 4 triangles, the last one fills the frame and **wipes into the prompt scene** | 20 frames; cover 0.03 → 1.0 |
| f193–283, 6.44–9.4 | **hero typing**: "Help me create a sales training video" at ≈110 px cap (15 % of frame) with a bar caret, inside a frosted pill that grows with the text; typing 1 char every 1–2 frames (≈20 chars/s); the noun phrase "sales training video" turns **blue** as it is typed; from f264 the aurora fades in | |
| f292–293, 9.74–9.78 | the hero pill **shrinks to UI scale** in 2 frames (1.0 → ≈0.3) and lands centre-left | |
| f293–314, 9.78–10.48 | **file chips** (Slides, Docs, Sheets icons as 2.5D cards) fly in from the corners, oversized, with DOF blur on the near one | |
| f339–379, 11.3–12.65 | cursor **drags** the Slides chip into the pill: the chip shrinks along the drag (5 frames) and becomes an attachment chip inside the prompt ("…using ▮ portable solar charger launch") | |
| f404, 13.48 | **hard cut** to the **"Creating…"** pill filling the frame (blue gradient, sparkle) | diff 50.4 in one frame; cover 0.98 |
| f404–432, 13.48–14.4 | pill shrinks slowly from full-bleed and drifts right (ambient) | cover 0.98 → 0.63 over 28 frames |
| f438–452, 14.6–15.1 | pill **tilts away** (rotateY + rotateX) and drops bottom-left while the **outline list UI** slides in from the top, tilted, sharp — the pill is a card in the same 3D space as the UI | |
| f457–500, 15.25–16.7 | outline rows **cascade in** from the top with a stagger (one row every ≈3 frames), camera pulls back to the whole list | |

Sound: the bed has **no bass until 5.78 s** (the Vids click); kick drops out **12.8–15.4** under
"Creating…"; the film's loudest swell is at 0.47 (+49 dB, the first word).

### Chapter 2 — Style (18–27 s)

| f / t | what happens | measured |
|---|---|---|
| f540–580, 18.0–19.4 | "Let's choose a style" typed hero-scale with caret; from f568 the line **shrinks to ≈45 %** while typing continues (the sentence lands at reading scale) | |
| f609–632, 20.3–21.1 | the other words **blur out one by one from the left** (Let's → choose → a), leaving "**style**" in blue; the cursor arrives | 23 frames |
| f633–648, 21.1–21.6 | cursor hovers the word; the word is a **button** | |
| f649–653, 21.65–21.8 | click: an aurora halo blooms behind "style", the frame floods lavender | 5 frames |
| f654–720, 21.8–24.0 | style picker, tilted, drifting; cursor | |
| f727, 24.26 | **hard cut**: the yellow template full-frame (the picker's first card at 100 %) | diff 33 |
| f746, 24.9 | cut: pink template | |
| f767, 25.6 | cut: dark template | diff 54 |
| f782, 26.1 | cut: teal template | diff 51 |

Each template holds 0.5–0.7 s; the cuts sit on beats (swells at 24.13, 25.47, 26.77, 27.14).

### Chapter 3 — Script (27–36 s)

- f820–870: "Let's write my script" typed; "script" blue; other words blur out; the **mic button**
  (pale disc, mic + sparkle) arrives f884 (29.5 s) 0.2 s after the word leaves; cursor 29.5–29.9.
- f898–914, 29.96–30.5: press: the disc turns saturated blue and a **blue haze blooms** behind it
  (cover 0.1 → 0.7 in 8 frames).
- f916, 30.56: **cut** to the Script panel (tilted card, real UI).
- f930–991, 31–33.07: text **streams** into the panel word by word with a **blue block cursor**
  (a rounded blue rectangle that grows to the next word's width, then the word appears inside it
  and the block hops on). ≈1 word per 2 frames.
- f992, 33.1: **push-in**: the panel text at hero scale (≈60 px), still streaming with the block
  cursor; three lines visible, new lines push up.
- f1035–1046, 34.5–34.9: the finished text turns from **blue to ink** line by line from the top.

### Chapter 4 — Voice (36–46 s)

| f / t | what happens | measured |
|---|---|---|
| f1080–1130, 36.0–37.7 | "Now, let's give it a voice" typed; "voice" blue; the other words blur out | |
| f1134–1146, 37.84–38.24 | "**voice**" grows to 1 177 px wide with a horizontal blue gradient | |
| f1146–1150, 38.2–38.33 | the letters **become gradient ellipses** (blue, pink, orange) that fill the frame | cover 0.13 → 0.76 in 4 frames |
| f1150–1206, 38.33–40.24 | ellipses drift, squash and stretch, lava-lamp, colours mixing | 1.9 s |
| f1209–1236, 40.34–41.24 | ellipses **squash into pills** stacked as rows, each with a solid disc at its left: the voice list's row geometry, in the voices' colours | |
| f1237, 41.23 | **cut**: the real voice picker, tilted; the pills are its rows | sharp 18 → 444 in one frame |
| f1269–1275, 42.34–42.54 | cursor on "Voice 2"; **push-in** so the row fills the frame; the cursor scales with the zoom (it is in the world) | 6 frames |
| f1291–1293, 43.08–43.14 | click: the disc gains a check in 2 frames | |
| f1350–1395, 45.05–46.5 | **waveform**: white pill bars rise from the left across a blue gradient flood, bar heights animating; a wipe into the comment card | 1.5 s |

### Chapter 5 — Collaboration (46.5–54 s)

- f1394, 46.5: **cut** to a comment card ("Sloane Allen"); "Any input?" types 1 char per frame.
- f1432, 47.75: cut to the slide (solar panel photo) with three **named collaborator cursors**
  moving (real product).
- f1478–1500: the two-avatar chip zooms in; cursor.
- f1512–1560, 50.45–52.0: comment cards **cascade** in from below, one every ≈15 frames, the
  previous ones fading up and out of focus (DOF on the stack). Bed drops out for this whole chapter
  (48.8–57.4 s), RMS −30 vs −19 elsewhere: the quiet chapter.

### Chapter 6 — Media (54–64 s)

- f1610–1640: stock-media icon (disc) hero-scale, cursor press with a pale halo.
- f1680–1684, 56.06–56.19: the search field **push-in** from UI scale to hero: "Landscape" continues
  typing at hero scale (1 char per frame).
- f1730–1800: thumbnail grid; the picked thumbnail **grows 2.5×** under the cursor (f1782), the rest
  defocus, then f1804 (60.19) **cut** into the editor with the image already placed.

### Chapter 7 — Record (64–74 s)

- f1932–1954, 64.46–65.2: record icon hero-scale, press, pale halo blooms (6 frames).
- f1956, 65.27: **cut** to the black recorder bar (red button).
- f1980–1984, 66.07–66.2: "**3**" enters as an extruded 3D glyph at ≈3× frame height with heavy
  motion blur, lands inside a glass disc in 4 frames; the disc has a **radial progress wipe** that
  completes over the second; the webcam feed behind is blurred. "2" f2010–2016, "1" f2040–2046,
  same move. Cuts at 67.07, 68.07, 69.07: one per second, on the beat.
- f2070–2140: webcam recording in the recorder UI (presenter speaks: the only voice in the film).
- f2169–2205, 72.4–73.6: the finished slide with the presenter cut-out, full frame; f2205–2215
  the slide **shrinks into the editor** (perspective on, UI drawn around it) in 10 frames.

### Chapter 8 — Play and outro (75–86.7 s)

| f / t | what happens | measured |
|---|---|---|
| f2276–2280, 75.94–76.08 | the toolbar's Play button **push-in** to hero scale as a frosted glass pill; cursor arrives from bottom-right as a big cartoon hand | 4 frames |
| f2306–2308, 76.94–77.0 | press: "Play" turns blue | |
| f2312–2338, 77.07–77.93 | **ripple**: concentric rounded-rectangle rings expand from the pill, one new ring every ≈2 frames, thin blue/pink strokes, filling the frame by f2319 (7 frames) then continuing outward and fading | cover 0.66 → 0.97 |
| f2339, 77.97 | the pill's label is now "**AI powered**" (blur-in inside the pill) | |
| f2340–2357, 78.0–78.6 | "AI powered" **zooms** past the camera with blur (scale ×3 in 6 frames) and the aurora sweeps | |
| f2359–2415, 78.7–80.5 | **phrase rotator**, instant swaps: "video creation app" (0.65 s) → "for work" (0.35) → "product demo" → "project updates" → "event recaps"…; the noun in blue | |
| f2417–2423, 80.57–80.77 | a blue halo grows behind the phrase (w 695 → 1 263 in 6 frames) | |
| f2423, 80.77 | **flood**: the frame goes solid blue in one frame; text now white with a horizontal streak-glow ("glitch") | blue share 0.38 → 0.95 in 5 frames |
| f2424–2478, 80.8–82.6 | white phrases swap **every ≈10 frames = one beat at 176 BPM**: company milestones, vendor outreach, campaign reviews, employee onboarding, new business pitches… | |
| f2478, 82.6 | cut to white; **Google Vids** logo blur-in; "coming soon to" f2502; app-grid dots f2520; dots → 9 app icons f2528 (1 frame); icons → "Workspace" f2546; "Google" fades in before it f2560 | |

## 3. Audio

- Bed at **176.5 BPM** (88 BPM felt), electronic, hats on every 0.34 s; RMS −19 to −17 dBFS in the
  main chapters, −23 in chapter 1, **−30 in the collaboration chapter** (48.8–57.4 s, kick out), silence
  at 85.7.
- Sustained swells: ≈45 outside the hat grid. They sit on the word swaps of the rotators, on every
  template flip (24.1, 25.5, 26.8, 27.1), on the countdown digits, and on the floods. The loudest
  are the first word (0.47, +49 dB) and the countdown/record section.
- Breaths: bass out 0–5.8 (before the product exists), 12.8–15.4 (Creating), 48.8–57.4 (the
  quiet chapter), and the outro.
- No keystroke SFX: hero typing runs at 20–30 chars/s, faster than any click could read.

## 4. The motion grammar, as numbers

| move | frames | notes |
|---|---|---|
| hero typing | 1 char / 1–2 frames | bar caret; frosted pill grows with the text; the noun turns blue as typed |
| word rotator swap | 1 frame | no transition; holds 0.3–0.67 s, shrinking toward the exit |
| beat rotator (blue section) | swap every 10 frames | exactly one beat |
| words blur out in place | 9 frames | opacity + ≈4 px blur; the kept word stays; the button persists |
| hero → UI scale | 2 frames | pill shrinks 1.0 → 0.3 and lands; almost a cut |
| UI → hero (push-in) | 4–6 frames | the cursor scales with the zoom |
| flood (Creating, blue) | 1 frame | a hard cut to a full-bleed colour; then 28 frames of slow retreat |
| halo before a flood | 6 frames | a blurred disc grows behind the element first |
| ripple | 1 ring / 2 frames, 7 frames to fill | rounded-rect rings, thin strokes, then fade |
| word → shapes | 4 frames | letters become gradient ellipses |
| shapes → rows | 27 frames | squash into pills stacked as the list geometry, then cut to the real list |
| chips fly in | 20 frames | oversized, from corners, near one blurred |
| drag into prompt | 5 frames | the dragged chip shrinks along the path into an attachment chip |
| cascade (rows, comments) | 1 item / 3 frames (rows), / 15 frames (comments) | earlier items defocus |
| countdown glyph | 4 frames in, 26 hold | 3× frame height, extruded, motion blur; glass disc with radial wipe |
| template flips | hard cuts, 0.5–0.7 s holds | on the beat |
| element shrinks into the editor | 10 frames | perspective comes on while the UI draws around it |

Easing: expo-out for arrivals, near-instant for swaps, geometric for the flood retreat. No bounce.

## 5. Stage, palette, type, materials

- **Stage**: `#FDFDFD`; aurora (blurred blue `#478AED`, pink, lavender `#7474C8`) under hero
  moments; pale blue haze under product shots; solid `#165BC1`-ish blue for the flood section.
- **Palette** (k-means): `#478AED`, `#9BBDF0`, `#165BC1`, `#7474C8` for the brand; the template
  colours (yellow `#E9BC15`, teal `#347F65`, pink) come from the product's own themes; Workspace
  icon colours appear only in the last 3 s.
- **Type**: Google Sans throughout, Regular. Hero prompts ≈110 px cap (15 % of frame), UI at real
  scale. Emphasis = the noun in blue, never a weight change. One sentence at a time, then one word.
- **Materials**: frosted pills (backdrop blur, white 60 %, hairline rim) for prompts, search and
  Play; gradient blue pill with soft glow for Creating; pale discs with a halo for icon buttons;
  glass disc with radial wipe for the countdown; the real UI as tilted cards with soft shadows.
- **Cursor**: two, scale-consistent with the world: a small pointer at UI scale, a large white
  cartoon hand with a black outline at hero scale. Press = a halo bloom, not a scale dip.
- **Real product everywhere**: Drive menu, Vids outline, style picker, script panel, voice list,
  live collaborator cursors, stock grid, editor timeline, recorder. Nothing is a mock.

## 6. Why it works

1. **One template, eight times.** Prompt → product → payoff is learnable in the first chapter, so
   the next seven read instantly. Variety comes from the payoffs, not the structure.
2. **Type is the narrator.** Every chapter starts with a sentence the viewer reads as their own
   thought, at a size that cannot be ignored, typed at a speed that feels alive.
3. **The demonstrated noun becomes the object.** "style" is a button, "voice" becomes the voices,
   the prompt pill becomes the UI's prompt box, the Play pill becomes the type container.
4. **Cuts are allowed when they land on a flood or a beat.** 22 cuts, none of them felt as cuts:
   each is preceded by a halo or is a full-bleed colour on the downbeat.
5. **Zoom is the camera.** Hero ↔ UI scale is the main move, done in 2–6 frames, with the cursor
   scaling along.
6. **The music has chapters.** Bass in when the product appears, out for the quiet chapter, and the
   swaps in the blue section are locked to the beat grid.

## 7. What this adds to the LangEase list

Both films agree on: object continuity across scale changes, blur as the grammar of depth and
exit, two things on screen, the real product, the noun in accent, breaths in the music. This film
adds what LangEase does not have:

| the film does | we have | gap |
|---|---|---|
| hero typing with caret, pill grows, noun turns blue | `typewriter` treatment in the catalog | a **prompt** beat: hero-scale typing whose container becomes the product's input |
| chapter template repeated | shots as a flat list | a **chapter** grouping: prompt → product → payoff, so the film has rhythm at the minute scale |
| push-in / pull-out between hero and UI scale, 2–6 frames | punch cut | **scale cuts** as a first-class move, cursor scaling with the world |
| word rotator (1-frame swaps, shrinking holds, beat-locked) | `word rotator` in the catalog | rotator with a hold curve and a beat lock |
| flood: halo → full-bleed colour → retreat | flash beat | a **flood** transition kind |
| ripple rings from a press | none | a press feedback family (halo, ripple) |
| word → shapes → the list's rows → the real list | none | **abstract-to-UI context reveal** (LangEase had strip → grid) |
| cascade of rows / comments with defocus of the earlier ones | stagger | cascade with DOF |
| countdown / big glyph swing-through | none | an extruded type hit |
| tilted UI cards as the default product framing | ui-frame flat | 2.5D card framing with ambient dolly by default |
| collaborator cursors, live product | one cursor | multiple named cursors on a ui-frame |
| aurora under hero type; bass-in when the product appears | ambient kinds | aurora as a stage kind; music sections keyed to chapters |
