# Mixing and level edits

Use `pitch motion mix`; the studio preview and Export automatically use its
`audio/mix.wav`. No HTML audio wiring is needed. Example without narration:

```sh
pitch motion mix --duration 23.4 --music audio/music.mp3 --sfx audio/sfx_bus.wav --music_only
```

Use the actual timeline duration and existing paths; omit SFX when there are
none. Conventional `audio/music.<ext>` and `audio/sfx_bus.wav` are discovered
when input flags are omitted. Narrated films omit `--music_only` and use
`shots.js`'s continuous `audio.vo` plus `voStart`.

Default bed trim is −13dB narrated, −10dB music-only; music-only SFX trim is −3dB.
The mixer verifies extracted levels and local SFX/music balance. Fix the reported
cue or apply its suggested absolute trim; do not boost music to hide a loud hit.
It reports all failing time ranges so they can be corrected together.

Successful settings persist in `audio/mix-settings.json`. A level-only change
needs only re-mixing; changed SFX placements need a bus rebuild first. Timing
changes require current cues and matching sound. Scheduled `breath` beats are
musical dips; `duck` controls speech sidechain separately, and `no_breaths`
disables those scheduled dips.

After the mix and picture checks succeed, finish. A mix pass verifies levels,
not artistic quality. Launch MP4 export remains the user's action.
