import { describe, expect, it } from 'vitest'
import { buildDemoJobInput } from '../apps/worker/src/utils/demo-job-input'

describe('buildDemoJobInput', () => {
  it('keeps prepared assets on the standard demo-generator without inventing an empty URL instruction', () => {
    const input = buildDemoJobInput({
      hasPreparedAssets: true,
      assetCount: 2,
      url: '',
      instructions: 'Explain the quarterly results.',
      script: '',
    })

    expect(input.agent).toBe('demo-generator')
    expect(input.prompt).toContain('2 prepared asset(s)')
    expect(input.prompt).toContain('Display every prepared page in manifest order at least once')
    expect(input.prompt).toContain('Never jump over pages')
    expect(input.prompt).toContain('Shorten narration instead of skipping a page')
    expect(input.prompt).toContain('demo_analyze_slide')
    expect(input.prompt).toMatch(/every page.*before narrat/i)
    expect(input.prompt).toMatch(/Gemini.*rendered slide pixels/i)
    expect(input.prompt).toMatch(/OCR.*fallback/i)
    expect(input.prompt).toContain('Explain the quarterly results.')
    expect(input.prompt).not.toContain('Go to .')
  })
})
