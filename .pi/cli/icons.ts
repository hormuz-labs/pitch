import { Type } from '@sinclair/typebox'
import { ASSETS_DIR, workspaceOf } from '../lib/paths.ts'
import { text } from '../lib/studio-host.ts'
import { collections, importIcons, searchIcons } from '../skills/icon-library/scripts/icons.mjs'
import type { CommandSpec } from './registry.ts'

const library = `${ASSETS_DIR}/icons`

export default function iconCommands(): CommandSpec[] {
  return [
    {
      verb: 'search',
      description:
        'Search the offline SVG library by brand name or concept. Returns a small shortlist, not SVG code. Use svgl for original-color brand marks, simple-icons for monochrome brands, lucide for general interface/action icons.',
      parameters: Type.Object({
        query: Type.String({
          description: 'Brand or concept, e.g. "slack messaging", "github", "check"',
        }),
        collection: Type.Optional(Type.String()),
        limit: Type.Optional(
          Type.Integer({ minimum: 1, maximum: 20, description: 'Max results (default 5)' }),
        ),
      }),
      async execute(_id, p: any) {
        return text(JSON.stringify(searchIcons(library, p.query, p)))
      },
    },
    {
      verb: 'import',
      description:
        'Copy selected SVGs, source metadata and licenses into this project. No network. Use the returned local file paths in the composition; read only an imported SVG if its paths need animation. Existing differing files are not overwritten.',
      parameters: Type.Object({
        ids: Type.Array(Type.String(), {
          minItems: 1,
          maxItems: 20,
          description:
            'Selected IDs, comma-separated or a JSON array, e.g. svgl/slack,lucide/check',
        }),
        out: Type.Optional(
          Type.String({
            description: 'Workspace-relative output directory (default assets/icons)',
          }),
        ),
      }),
      async execute(_id, p: any, _signal, _onUpdate, ctx) {
        return text(JSON.stringify(importIcons(library, workspaceOf(ctx), p.ids, p.out)))
      },
    },
    {
      verb: 'collections',
      description:
        'List available offline icon collections, counts, pinned revisions and license information. Does not dump icon names or SVG source.',
      parameters: Type.Object({}),
      async execute() {
        return text(JSON.stringify(collections(library)))
      },
    },
  ]
}
