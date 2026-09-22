# Bounded plan authoring

The full plan is a machine-managed artifact. Work on one editorial change at a
time; do not regenerate a long clip/caption list. Small validated patches make
omissions and stale indices detectable before they change the file.

## Create or resume

Reuse the starter `plan` returned by preprocessing. For another scenario:

```sh
pitch video plan --operation create --plan edits/tutorial.json --source uploads/source.mp4 --output renders/tutorial-v1.mp4
```

The host supplies source dimensions/fps and an initial full-source clip. Existing
plans and rendered outputs are not overwritten. Use the scenario's coverage and
selection policy before trimming it.

## Inspect only the affected page

```sh
pitch video plan --operation inspect --plan edits/tutorial.json --section clips --offset 12 --limit 3
pitch video plan --operation inspect --plan edits/tutorial.json --section timeline --offset 12 --limit 3
```

Sections: `clips`, `timeline`, `captions`, `overlays`, `redactions`, `coverage`,
`output`, `music`. Default page size is 5, maximum 10. Items include their index
and JSON pointer. `output`/`music` page by field; `timeline` is computed/read-only.
Use `next_offset` when another page is genuinely needed. An oversized item's
explicitly marked preview is not a complete object: never paste it back as one.

Every inspection returns the SHA256 `revision` of the current plan bytes. Keep
that revision with the small page you are editing. Array positions can change
after another patch; do not reuse old indices with a new revision blindly.

## Patch, validate, commit atomically

Use the actual revision and observed clip index, not these placeholders:

```sh
pitch video plan --operation patch --plan edits/tutorial.json --revision REVISION_FROM_INSPECT --ops '[{"op":"replace","path":"/clips/12/speed","value":2}]'
```

Operations are `add`, `replace`, `remove`, `test`, using JSON pointers (`~0` means
`~`, `~1` means `/`). `replace` requires an existing field; use `add` for an omitted
optional field. An array `add` inserts at the index; `-` appends. No `move`/`copy`,
whole-document operations or bulk-array replacement. Maximum 8 ops and 12 KiB per
request are ceilings, not batch-size targets.

The host checks the revision, applies the small patch to a copy, validates the
**entire candidate**, preserves coverage requirements, saves the prior revision
and atomically commits. A stale revision or failed validation leaves the original
unchanged. Reinspect/rebase on conflict; do not force it with an unrelated hash.
Keep coordinated changes, such as splitting one protected clip, in one patch so
intermediate missing coverage is never committed.

For example, splitting a known `[0,12)` clip around a verified silent `[4,8)`
interior can use three ops: replace clip 0 with `[0,4)`, insert `[4,8)` at index 1,
then insert `[8,12)` at index 2. Only the middle clip gets a speed change. Include
the inspected source path and preserve relevant fields on each replacement.
Do not duplicate a timed entrance, fade or transition onto both halves: plan their
phases explicitly. Static holds can repeat the same viewport across splits.

After a render, inspect still works. Select a new `/output/path` in the same patch
as the next correction. Render snapshots retain the earlier version. Coverage
cannot be weakened/deleted through patches to make an invalid edit pass.

## Keep the context bounded too

- `validate`, `render`, `preprocess` and `analyze` return compact summaries and
  full report artifact paths by default. Inspect affected timeline pages rather
  than reading or requesting the entire report. Use `--details` only for a
  concrete diagnostic; restrict `analyze` to a short range first.
- Page `prepass_plan`'s timeline for original→prepared mappings. Page the working
  plan's timeline for prepared→final mappings. Do not re-emit maps.
- Keep a short attention index and update the affected notes/beat, not the full
  log on each correction. Inspect relevant transcript words and nearby context;
  a long transcript need not be pasted into every turn.
- Prefer `add /clips/N/camera` or a small nested-field correction over replacing
  a whole clip. Use the checked viewport and appropriate speech cue or output-time
  `delay`. Do not invent speech timestamps for silent navigation.
- A successful patch validates structure and timing constraints, not editorial
  intent. Review the affected rendered subjects and downstream consequences of
  retiming, including captions/overlays, under the chosen scenario.

The [plan reference](plan.md) defines the stored schema. Its JSON examples explain
individual fields; they are not instructions to regenerate a complete long plan.
