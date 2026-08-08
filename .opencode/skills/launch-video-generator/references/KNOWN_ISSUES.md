# Known Issues — Launch Video Generator

This file is the **living error log** for all video projects in this repository.

- Read this file **before** starting any work in a session.
- Append a new entry **immediately** whenever an error is encountered, using the format below.
- Never delete entries. Mark resolved issues `**Status:** CLOSED` instead.

Format reference is in `SKILL.md` under "Error Log Format".

---

### ISSUE-001
**Date:** 2026-05-29
**Category:** lego-adaptation
**Symptom:** Animation plays correctly in the standalone lego file but does nothing when adapted into a project scene.
**Root Cause:** Legos expose their timeline as `window.masterTimeline` (lowercase `m`). Production projects use `window.MASTER_TL` (uppercase). Copying lego JS verbatim into a scene file leaves dead `masterTimeline` references that point to nothing in the project context.
**Affected Files:** `legos/*/index.html`, `js/scenes/*.js`
**Resolution:** Strip all `window.masterTimeline` references from copied lego code. The scene function receives `tl` as a parameter — use that instead. Replace every `masterTimeline.to(...)` with `tl.to(...)`.
**Prevention Rule:** Never reference `window.masterTimeline` in project scene files; always use the `tl` parameter passed to `initSceneN(tl)`.
**Tags:** MASTER_TL, masterTimeline, lego-adaptation, timeline

---

*New entries should be appended below this line.*
