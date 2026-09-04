/**
 * Test helper: collect the tools an extension registers without booting pi,
 * and call them the way pi would (params + a context carrying `cwd`).
 */
import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent'

export interface CollectedTool {
  definition: ToolDefinition<any, any, any>
  /** Run the tool and return its text output. */
  run(params: Record<string, unknown>, cwd: string): Promise<string>
}

export function collectTools(extension: (pi: ExtensionAPI) => void): Record<string, CollectedTool> {
  const tools: Record<string, CollectedTool> = {}
  const fakePi = {
    registerTool(def: ToolDefinition<any, any, any>) {
      tools[def.name] = {
        definition: def,
        async run(params, cwd) {
          const result: any = await def.execute(
            'test-call',
            params as any,
            new AbortController().signal,
            undefined as any,
            { cwd } as any,
          )
          const content = Array.isArray(result?.content) ? result.content : []
          return content
            .map((c: any) => (c?.type === 'text' ? c.text : ''))
            .filter(Boolean)
            .join('\n')
        },
      }
    },
    on() {},
    registerCommand() {},
    registerShortcut() {},
    registerFlag() {},
    getFlag() {
      return undefined
    },
    registerMessageRenderer() {},
    registerMarkdownTransformer() {},
    registerEntryRenderer() {},
  }
  extension(fakePi as unknown as ExtensionAPI)
  return tools
}
