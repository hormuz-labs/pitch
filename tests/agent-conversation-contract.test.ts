import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ASK_USER_DESCRIPTION } from '../.pi/extensions/ask-tools.js'
import { buildContext, TURN_REQUEST_CONTRACT } from '../apps/api/src/agent/index.js'
import { systemPrompt } from '../apps/api/src/agent/toolkit.js'
import type { Workspace } from '../apps/api/src/studio/paths.js'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })))
function workspace(): Workspace {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-contract-'))
  dirs.push(dir)
  return { flow: 'studio', userId: 'user_1', name: 'hello', internal: 'studio--user_1--hello', dir }
}

describe('agent conversation contract', () => {
  it('keeps conversational messages out of the production pipeline', async () => {
    const prompt = (await systemPrompt()).replace(/\*\*/g, '').replace(/\s+/g, ' ')

    expect(prompt).toContain('Greetings, thanks, small talk and capability questions on their own')
    expect(prompt).toContain('not actionable briefs')
    expect(prompt).toContain(
      'Do not read a skill, call `ask_user`, call another tool or start work',
    )
    expect(prompt).toContain('first actionable request')
    expect(prompt).toContain('those turns do not consume it')
    expect(prompt).toContain('continues the brief; use the conversation to understand it')
  })

  it.each([true, false])('does not let UI defaults imply an outcome when first=%s', async first => {
    const context = await buildContext(workspace(), {
      first,
      options: { skill: 'launch-video', aspectRatio: '16:9' },
    })

    expect(context).toContain(TURN_REQUEST_CONTRACT)
    expect(context).toContain('preferences or UI defaults, not a request')
    expect(context).toContain('Conversational turns do not consume the first actionable request')
    expect(context).not.toContain('Options the user chose')
  })

  it('limits ask_user to consequential omissions in explicit outcome requests', () => {
    expect(ASK_USER_DESCRIPTION).toContain(
      'only after the user explicitly requests a named outcome',
    )
    expect(ASK_USER_DESCRIPTION).toContain('a consequential missing choice')
    expect(ASK_USER_DESCRIPTION).toContain(
      'Greetings, thanks, small talk and capability questions on their own are not briefs',
    )
    expect(ASK_USER_DESCRIPTION).toContain('without calling this tool')
  })
})
