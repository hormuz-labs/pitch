# Launch-video studio

The launch-video flow is one of the four studio flows; the architecture, routes,
events and flow interface are documented in `studio-architecture.md`. Flow-specific
pieces:

- `apps/api/src/flows/launch-video/` — `index.ts` (registration, per-turn
  steering, pricing, legacy import), `describe.ts` (shots.js → scenes, preview,
  exports), `export.ts` (capture.mjs render → S3 output).
- `.pi/APPEND_SYSTEM.md` — the agent's system prompt; `.pi/extensions/html-motion-tools.ts`
  — the `motion_*` host tools; `.pi/skills/html-motion-video/` — the skill.
- `engine/` — the shots.js compiler the preview plays (`js/compiler.js` carries the
  studio postMessage transport and the shot-aware inspector).
- Web: `apps/studio-web/src/studio/previews/HtmlPreview.tsx` (iframe player, inspector,
  synced audio), `Strips.tsx` (scene strip), the export menu in `StudioView.tsx`.

Pricing: resolution + narration charged at creation; exporting above the paid tier
charges the difference (`projects/export.ts`).
