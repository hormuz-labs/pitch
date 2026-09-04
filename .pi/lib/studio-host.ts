/**
 * Bridge from pi tools to the studio's host actions. The API process
 * registers actions (apps/api/src/lib/studio/host-actions.ts) before it
 * creates a session; the flow extensions below call them by name with the
 * session's workspace as authority.
 */
export async function hostAction(
  cwd: string,
  name: string,
  params: Record<string, unknown>,
): Promise<string> {
  const g = globalThis as any
  const host = g.__pitchStudioHost
  if (!host) throw new Error('This tool only works inside the studio (no host registered).')
  return host.call(cwd, name, params)
}

export function text(out: string) {
  return { content: [{ type: 'text' as const, text: out }], details: {} }
}
