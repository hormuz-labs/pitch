/**
 * Test helper: a module's commands by verb, callable the way the CLI calls
 * them (params + a context carrying `cwd`), with the text they return.
 */
import type { CommandSpec } from '../cli/registry.ts'

export interface CollectedCommand {
  spec: CommandSpec
  /** Run the command and return its text output. */
  run(params: Record<string, unknown>, cwd: string): Promise<string>
}

export function collectCommands(module: () => CommandSpec[]): Record<string, CollectedCommand> {
  const out: Record<string, CollectedCommand> = {}
  for (const spec of module()) {
    out[spec.verb] = {
      spec,
      async run(params, cwd) {
        const result: any = await spec.execute(
          'test-call',
          params,
          new AbortController().signal,
          undefined,
          { cwd },
        )
        const content = Array.isArray(result?.content) ? result.content : []
        return content
          .map((c: any) => (c?.type === 'text' ? c.text : ''))
          .filter(Boolean)
          .join('\n')
      },
    }
  }
  return out
}
