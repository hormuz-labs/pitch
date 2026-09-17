# Narration

Write the spoken story before the shot table or animation timings. Give the
listener a situation, a meaningful change and a consequence, in the product's
own context. It should make sense without watching the screen; avoid a feature
list or play-by-play of clicks. Preserve any user-supplied script and its intent.

Record one continuous read with natural phrasing, emphasis and pauses, then
build picture around it. Separate per-shot clips restart intonation. A thought
can span several shots; not every visual action needs a spoken counterpart.
Let a reveal or result land without filling every gap with speech. If the script
is crowded, edit it rather than asking the voice to keep up with the screen.

1. `pitch motion tts --script audio/vo.txt --voice <v> --style <s>` records the
   read before building the visual sequence. When authoring `shots.js`, use the
   returned file as `audio.vo`. The configured provider
   and user-selected voice take precedence. Gemini uses voice names; ElevenLabs
   uses IDs from `pitch motion voices` and delivery tags in the script.
2. `pitch motion align --vo <returned-file> --script audio/vo.txt` aligns the
   known script; a poor match can mean the
   wrong file/text, not a reason to invent timestamps.
3. Author shots to support the spoken thoughts, using `cue` for meaningful
   changes rather than making a sentence for every cut. Then run
   `pitch motion sync --write` and `pitch motion check`. The sync tool sets shot
   durations and retimes SFX from the read. Repeat alignment/sync only after
   changing narration or cues. Remove per-shot `vo` / `voDur` fields. The read's
   phrasing sets the pace; sync aligns the picture, not the narrator's delivery.

For balance and final output, read `references/audio/mix.md`.
