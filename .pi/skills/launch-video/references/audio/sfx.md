# Sound effects

Use sparse sounds for meaningful actions. A state change is a possible cue,
not an obligation; sounding every card or cut makes the sequence mechanical.
Keep effects subordinate to speech or music.

`pitch motion check` already exports actual timeline labels to `audio/cues.json`.
Query needed events together: `pitch motion sfx --mode query --event
"click,whoosh_soft,chime" --limit 3`. The tool's list/help provides the vocabulary
and measured clip durations/onsets. Library silence is compensated by the builder.

Write `audio/sfx-cues.json` as an object, not an array:

```json
{"duration":23.4,"cues":[{"t":6.4,"event":"impact","dur":0.8}]}
```

Transients land at `t`; a riser ENDS at `t`, with `dur` describing its approach.
Other sounds longer than 1.5s need `dur` matching the action and no longer than
the available clip. Match whoosh peaks to movement and leave room for silence.
The studio default SFX density is `heavy` (built for ads and promos). A launch
film is sparse: write `"sfx-density": "standard"` into `audio/mix-settings.json`
before the first build. At `standard` the builder enforces approximate ceilings
per 30s: six signature cues, one per shot, and fourteen micro-events
(tick/pop/click/type/data). These are limits, not targets. Prefer dropping
redundant sounds over filling the allowance. The Gakuyen pack ranks first for
whooshes, risers, impacts and shutters; each clip's measured `hit` is aligned to `t`.

Run `pitch motion sfx --mode build`, correct reported placement problems in a
batch, then mix (`references/audio/mix.md`). A new effect generated with
`pitch motion sound` still needs an event class and appropriate duration.
