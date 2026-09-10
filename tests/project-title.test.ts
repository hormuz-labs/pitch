import { describe, expect, it } from 'vitest'
import { projectTitle, replaceLegacyUrlTitle } from '../apps/api/src/projects/title'

describe('project titles', () => {
  it('uses a concise version of the first message instead of its URL', () => {
    expect(
      projectTitle(
        'Create a polished demo video for https://www.heyclicky.com/pricing with narration',
      ),
    ).toBe('Polished demo video for Heyclicky with')
  })

  it('makes bare domains readable and removes conversational filler', () => {
    expect(
      projectTitle('Can you analyze the onboarding on supermemory.ai and suggest improvements?'),
    ).toBe('Analyze the onboarding on Supermemory and')
  })

  it('reduces creation requests to an output and subject', () => {
    expect(projectTitle('Make me a launch video for https://zeri.com with narration')).toBe(
      'Launch video for Zeri with narration',
    )
    expect(projectTitle('Can you make a PDF for the quarterly report using these files?')).toBe(
      'PDF for quarterly report using',
    )
    expect(projectTitle('make me a demo')).toBe('Demo')
  })

  it('uses an upload name when the first message is empty', () => {
    expect(projectTitle('', ['quarterly-results.pdf'])).toBe('quarterly-results.pdf')
  })

  it('improves URL-only legacy titles without changing custom titles', () => {
    const prompt = 'Make a launch film for https://agentcard.sh with a dark visual style'
    expect(replaceLegacyUrlTitle('agentcard.sh', prompt)).toBe('Launch film for Agentcard with a')
    expect(replaceLegacyUrlTitle('Agent Card Launch', prompt)).toBe('Agent Card Launch')
  })

  it('upgrades titles made by both previous prompt-based rules', () => {
    const prompt = 'Make me a launch video for https://zeri.com with narration'
    expect(replaceLegacyUrlTitle('Make me a launch video for Zeri with', prompt)).toBe(
      'Launch video for Zeri with narration',
    )
    expect(replaceLegacyUrlTitle(prompt, prompt)).toBe('Launch video for Zeri with narration')
  })
})
