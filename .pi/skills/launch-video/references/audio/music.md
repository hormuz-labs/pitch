# Music

The bed is chosen before the storyboard, because the picture is cut to it.
Reuse a user-selected or existing bed; respect requests for none. Otherwise
`pitch motion find-audio` imports a candidate, or `pitch motion music`
generates one from the arrangement in `direction.md` (describe sound and
progression, never an artist). When the useful passage starts later,
`pitch media ffmpeg` trims a new bed.

Then `pitch motion beats --duration <film>` measures it: tempo, bars, loudness
per bar, the changes and the drop, in film seconds. Write the storyboard in
bars of it:

- a chapter starts on a downbeat (`cue: "bar 5"`); the turn, or the moment
  worth replaying, lands on the drop (`cue: "drop"`);
- inside a shot each arrival takes its own beat (`s.beatTimes` in a custom
  type, `cue: "bar 5.3"` on a beat or line); quiet bars are for reading, busy
  ones for building;
- holds last whole beats, so reading time and rhythm are the same count.

`pitch motion sync --write` sets the durations and `beatTimes` from the cues;
run it again after any change to the cues or the bed. When the tracker calls
the pulse weak or loose, cue the energy changes rather than every bar. Report
the measured tempo; never claim an audition that did not happen.
