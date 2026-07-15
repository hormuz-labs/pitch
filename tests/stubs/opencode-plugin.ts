/**
 * Test stub for `@opencode-ai/plugin`.
 *
 * The real package only exists inside the OpenCode runtime that the worker
 * spawns per job, so it is not in node_modules and cannot be imported by the
 * test process. This stub provides just the surface `.opencode/tools/*.ts` use:
 *   - `tool(config)` returns the config verbatim, so tests can call `.execute`.
 *   - `tool.schema.{string,number,boolean}()` return a chainable no-op builder
 *     (`.describe/.optional/.min/.max`), matching how the tools declare args.
 * Aliased in vitest.config.ts so `import { tool } from '@opencode-ai/plugin'`
 * resolves here during tests.
 */
type Builder = {
  describe: (_d?: string) => Builder
  optional: () => Builder
  min: (_n?: number) => Builder
  max: (_n?: number) => Builder
}

function builder(): Builder {
  const b: Builder = {
    describe: () => b,
    optional: () => b,
    min: () => b,
    max: () => b,
  }
  return b
}

type ToolConfig = { description?: string; args?: unknown; execute: (...a: any[]) => any }

export const tool = Object.assign((config: ToolConfig) => config, {
  schema: {
    string: () => builder(),
    number: () => builder(),
    boolean: () => builder(),
  },
})

export type { ToolConfig }
