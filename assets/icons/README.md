# Shared icon library

Pinned GitHub snapshots of Lucide, Simple Icons and SVGL live in their named
directories. Existing cursor/Pitch assets remain at the root. `manifest.json`
indexes names, variants, search tags, source URLs and SHA-256 checksums.

Use `pitch icons search` and `pitch icons import` from a project. Agents load
`.pi/skills/icon-library/SKILL.md`; its bundled Node tool also works outside
Pitch with this directory, offline. Only selected files and their licenses are
copied into project workspaces, so published work is self-contained.

`sources.json` pins the upstream repositories/commits. To update, change those
pins deliberately and run `bun scripts/vendor-icons.ts` from the repo root.
The importer downloads GitHub archives, extracts SVGs and metadata without
executing upstream code, and rebuilds the catalog. SVGs lacking a viewBox get
one from numeric width/height; those entries record `normalizedViewBox`.

Original licenses are under `licenses/`. Collection licenses do not override
brand trademark guidelines; individual source/guideline links are retained.
The catalog is data for tools, not a document for agents to read in full.
