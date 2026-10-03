---
name: icon-library
description: Find and use local brand logos and general-purpose SVG icons in videos, decks or interfaces. Use for recognizable services such as Slack/GitHub, operating systems, or visual actions such as messages, files and completion. Imports selected SVGs with licenses and provenance; no network or full-catalog reading needed.
---

# Icon library

1. Search the concept: `pitch icons search "slack messaging" --limit 3`.
   Prefer the product's own icons and `svgl` original-colour brand marks
   (`simple-icons` for monochrome). `lucide` is the generic look: use it only
   for an action no brand owns, restyled to the film (the type's stroke
   weight, a brand colour), never a thin grey outline. Pick the light/dark
   variant for the scene's background.
2. Import selected IDs in one call:
   `pitch icons import --ids svgl/slack,lucide/check`.
   Use the returned workspace paths. Source metadata and licenses come with them.
3. Show the icon doing a useful job: a message moving into a task, a source
   becoming a result, or a selected environment taking focus. Use short labels
   only where the visual is ambiguous. An icon is not a reason to add another card.

For an image, keep its aspect ratio and give it enough visual space. For path
animation, read only the imported SVG and inline it into the shot; coordinate
its IDs if several SVGs share the same DOM. Preserve brand colors/proportions.
Lucide uses `currentColor`; set an explicit stroke/color when embedding as an image.

If a brand is absent, use its official kit or the product's own assets rather
than drawing an approximation. Keep the catalog out of model context.

Outside Pitch, read `references/portable.md` for the bundled offline Node tool.
