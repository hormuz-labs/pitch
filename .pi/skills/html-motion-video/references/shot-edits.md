# Shot edits — studio scene and element prompts

When the user targets a shot or clicks elements in the preview, you receive a
scoped prompt naming the shot id and, for elements, a legend of `[n]` targets
with tag, class, text and selector. Follow this instead of Phases 0–6:

1. **Edit only that shot's entry in `shots.js`.** Change its fields, `bg`,
   `cut`, or `type`. Do not touch other shots.
2. **Keep `dur`** unless the user asks for a longer/shorter shot — every later
   shot and the audio mix shift with it.
3. **Need a look the engine has no field for?** Add or extend a type in
   `js/shots.custom.js` (see §3.3). Never edit `../../engine/`.
4. **Verify.** `motion_audit`, or `motion_render` with `from`/`to` for one
   shot. Do not full-render. Say what changed.

Element targets map to shot fields: a `.word`/`.type-line`/`.type-center` is a
`lines`/`parts`/`text` field; `.punch-card` is a `color-punch`; `.mq-item` is a
marquee `items` entry; `.notif` is `device-notif.notif`; `.ui-frame` is a
`ui-frame` shot (its `src`, `focus`, `cursor`, `caption`); `.logo-lockup` is
`logo-sting`/`logo-cta`.

---
