import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import demoCommands from '../.pi/cli/demo.ts'
import { collectCommands } from '../.pi/lib/testing.ts'

const { 'analyze-slide': demo_analyze_slide, narrate: demo_narrate } = collectCommands(demoCommands)

const originalPath = process.env.PATH
const originalApiKey = process.env.GEMINI_API_KEY
const originalGroundingModel = process.env.GEMINI_GROUNDING_MODEL

afterEach(() => {
  process.env.PATH = originalPath
  if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = originalApiKey
  if (originalGroundingModel === undefined) delete process.env.GEMINI_GROUNDING_MODEL
  else process.env.GEMINI_GROUNDING_MODEL = originalGroundingModel
  vi.unstubAllGlobals()
})

describe('demo_analyze_slide', () => {
  it('analyzes the current rendered slide once and reuses its cached narration plan', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-analysis-tool-'))
    const recordings = path.join(base, 'recording')
    const bin = path.join(base, 'bin')
    fs.mkdirSync(recordings, { recursive: true })
    fs.mkdirSync(bin, { recursive: true })
    fs.writeFileSync(
      path.join(recordings, 'slideshow-progress.json'),
      JSON.stringify({ totalSlides: 2, currentSlide: 0, visitedSlides: [0], narratedSlides: [] }),
    )
    const playwright = path.join(bin, 'playwright-cli')
    fs.writeFileSync(
      playwright,
      '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do\n  if [ "$1" = "--filename" ]; then printf image > "$2"; exit 0; fi\n  shift\ndone\nexit 1\n',
    )
    fs.chmodSync(playwright, 0o755)
    process.env.PATH = `${bin}:${originalPath ?? ''}`
    process.env.GEMINI_API_KEY = 'test-key'
    process.env.GEMINI_GROUNDING_MODEL = 'gemini-test'

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    title: 'Scanned results',
                    summary: 'A visual comparison of two outcomes.',
                    confidence: 0.9,
                    narration_points: [
                      {
                        narration: 'The green result reaches 93 percent.',
                        visual_query: 'the complete green 93 percent result',
                        confidence: 0.92,
                        box_2d: [300, 200, 500, 450],
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchImpl)

    const first = await demo_analyze_slide.run({}, base)
    const second = await demo_analyze_slide.run({}, base)
    const firstOutput = JSON.parse(first)
    const secondOutput = JSON.parse(second)

    expect(firstOutput).toMatchObject({
      status: 'slide_analyzed',
      slideIndex: 0,
      cached: false,
      analysis: {
        title: 'Scanned results',
        narrationPoints: [
          {
            narration: 'The green result reaches 93 percent.',
            rect: { leftPct: 20, topPct: 30, widthPct: 25, heightPct: 20 },
          },
        ],
      },
    })
    expect(secondOutput).toMatchObject({
      status: 'slide_analyzed',
      slideIndex: 0,
      cached: true,
    })
    expect(
      JSON.parse(fs.readFileSync(path.join(recordings, 'slideshow-progress.json'), 'utf-8')),
    ).toMatchObject({ analyzedSlides: [0] })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('blocks slideshow narration until the current rendered page is analyzed', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-analysis-required-'))
    const recordings = path.join(base, 'recording')
    fs.mkdirSync(recordings, { recursive: true })
    fs.writeFileSync(
      path.join(recordings, 'demo-config.json'),
      JSON.stringify({ startTime: Date.now(), voiceName: 'Puck' }),
    )
    fs.writeFileSync(
      path.join(recordings, 'slideshow-progress.json'),
      JSON.stringify({
        totalSlides: 2,
        currentSlide: 0,
        visitedSlides: [0],
        analyzedSlides: [],
        narratedSlides: [],
      }),
    )

    const result = await demo_narrate.run({ text: 'This must not reach text to speech.' }, base)

    expect(JSON.parse(result)).toMatchObject({
      status: 'slide_analysis_required',
      error: 'Analyze slide 1 of 2 before narrating.',
    })
  })
})
