# Real app capture

Read only for sequences demonstrating a real app. Use the
[shared mechanics](capture-mechanics.md) for transport, narration timing and recovery.

## Prepare the proof

Open `pitch demo browser-open --url <url>`, then use `pitch demo bash` to snapshot
and inspect controls and starting state without recording. Establish the actual
navigation route and what visible result proves each requested step. Return to
the starting view in this same browser. Do not trigger paid/destructive actions
just to rehearse them. Check toggle state before clicking: a successful click can
turn an already-enabled feature OFF. Verify the selected state before claiming
the feature is enabled.

Expand the lifecycle's ledger with actual controls and success evidence. Prefer
“Enable Search, enter this question, then inspect the returned links” to a generic
claim about power. Draft connected, complete thoughts about intent and consequence.
For a new action-led line, put that action's intent near its beginning so the
gesture can coincide; this is not a rule to cue every camera move at sentence start.

Start with `pitch demo record-start` in the prepared browser. If already familiar
with the workflow, `pitch demo record-start --url <url>` can open its starting page.

## Demonstrate while explaining

Use `narrate --action` for one grounded click or visible field entry as speech
begins, avoiding a separate model round-trip before the gesture. Replace these
example refs with refs from the current snapshot:

```sh
pitch demo narrate --text "Choose the report to see its breakdown." --action '{"command":"click e53"}'
pitch demo bash --command snapshot
pitch demo narrate --text "Enter a name so the report is easy to find later." --action '{"target":"e72","text":"Weekly usage"}'
```

Continue related interactions while speech is active; do not alternate stationary
spoken paragraphs with silent clicks. A successful narration does not prove its
attached action succeeded: inspect both results, then verify the application state.
Snapshot after transitions. Show the export and its result rather than merely
saying “now export.” Complete the requested workflow without substituting narration
for missing interactions.

Useful commands inside `pitch demo bash --command '…'`:
`click e53` · `hover e4` · `select e9 "v"` ·
`eval "el => el.currentSrc || el.src" e53` ·
`screenshot '<selector>' --filename recording/detail.png` ·
`tab-new <url>` / `tab-select 0`.

- **Forms:** use `pitch demo fill-field --target <ref> --text <text> [--submit]`
  for visible typing, or the narration action form above (optional `"submit":true`).
  Do not use `playwright-cli fill`. Keep fields visible and completed values readable.
- **Offscreen subjects:** `pitch demo narrate --text "<line>" --focus <ref>` scrolls
  the subject to center before speech; it is not a camera zoom. Omit when visible.
- **Popups:** dismiss with a plain click.

## Keep meaningful progression

Explain only verified results, including limitations. Avoid describing an answer's
contents while it is still arriving; narrate then only if explaining that process.
Think on a stable, complete view rather than an open menu or half-filled form.
Brief actions/transitions may be silent; do not fill them with generic speech or
narration about production choices.

Capture silent typing and streamed output continuously. Keep first/last input,
submission, first useful response and completed result legible. Preserve slow-load
triggers and useful reading holds. Update the ledger with those observations and
the phrases that belong to them; mark timing uncertainty instead of guessing.
The editor's narrated-screen branch decides preprocessing and acceleration while
preserving progression and speech. Return to the lifecycle to stop and hand off.
