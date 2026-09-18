import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

  it.each([15, 30, 60])(
    'treats a saved %ss runtime as a target on subsequent turns',
    async durationSeconds => {
      const ws = workspace()
      writeFileSync(
        path.join(ws.dir, 'project.json'),
        JSON.stringify({ options: { durationSeconds } }),
      )
      const context = await buildContext(ws, { first: false })
      expect(context).toContain(`Target runtime: about ${durationSeconds} seconds`)
      expect(context).toContain("user's current brief takes precedence")
      expect(context).toContain('shorter or moderately longer is welcome')
      expect(context).toContain('Honor an explicitly exact duration, maximum or delivery slot')
      expect(context).not.toContain('Required output duration: exactly')
    },
  )

  it('uses the new turn duration over the saved preference', async () => {
    const ws = workspace()
    writeFileSync(
      path.join(ws.dir, 'project.json'),
      JSON.stringify({ options: { durationSeconds: 15 } }),
    )
    const context = await buildContext(ws, { first: false, options: { durationSeconds: 45 } })
    expect(context).toContain('Target runtime: about 45 seconds')
    expect(context).not.toContain('Target runtime: about 15 seconds')
  })

  it.each([true, false])(
    'gives attached files to the agent using their real workspace paths when first=%s',
    async first => {
      const ws = workspace()
      mkdirSync(path.join(ws.dir, 'uploads'), { recursive: true })
      writeFileSync(path.join(ws.dir, 'uploads', 'my_logo.png'), 'image')
      writeFileSync(
        path.join(ws.dir, 'project.json'),
        JSON.stringify({
          options: {},
          uploads: [
            {
              url: 'https://storage.example/my-logo',
              name: 'my logo.png',
              type: 'image/png',
              size: 5,
            },
          ],
        }),
      )

      const context = await buildContext(ws, { first, options: {} })

      expect(context).toContain('uploads/my_logo.png (image/png)')
      expect(context).not.toContain('uploads/my logo.png')
      expect(context).toContain('source materials attached by the user')
      expect(context).toContain('inspect relevant images or documents with the read tool')
    },
  )

  it('does not tell the agent that a failed or missing upload exists', async () => {
    const ws = workspace()
    mkdirSync(path.join(ws.dir, 'uploads'), { recursive: true })
    writeFileSync(
      path.join(ws.dir, 'project.json'),
      JSON.stringify({
        options: {},
        uploads: [
          {
            url: 'https://storage.example/missing',
            name: 'missing image.png',
            type: 'image/png',
            size: 5,
          },
        ],
      }),
    )

    const context = await buildContext(ws, { first: true, options: {} })

    expect(context).not.toContain('uploads/missing_image.png')
    expect(context).toContain('The workspace is empty.')
    expect(context).not.toContain('source materials attached by the user')
  })

  it.each([undefined, 0, -15, Number.NaN, Number.POSITIVE_INFINITY])(
    'does not manufacture a target from %s',
    async durationSeconds => {
      const context = await buildContext(workspace(), { first: true, options: { durationSeconds } })
      expect(context).not.toContain('Target runtime:')
    },
  )
})
