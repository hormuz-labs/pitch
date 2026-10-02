/**
 * The one transcriber: whisper.cpp's word tokens into the transcript shape
 * the recording tools have always saved.
 */
import { mkdtempSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  awaitWhisperModel,
  defaultWhisperThreads,
  findWhisperModel,
  parseWhisperJson,
  pendingWhisperModel,
  speechWindows,
  wordsToSegments,
} from '../.pi/lib/whisper'

// Verbatim from `whisper-cli -ml 1 -sow -oj` on a real narration take.
const RAW = {
  transcription: [
    { timestamps: { from: '', to: '' }, offsets: { from: 0, to: 270 }, text: '' },
    { timestamps: { from: '', to: '' }, offsets: { from: 270, to: 280 }, text: ' You' },
    { timestamps: { from: '', to: '' }, offsets: { from: 280, to: 960 }, text: ' shipped' },
    { timestamps: { from: '', to: '' }, offsets: { from: 960, to: 1320 }, text: ' your' },
    { timestamps: { from: '', to: '' }, offsets: { from: 1320, to: 2120 }, text: ' product' },
    { timestamps: { from: '', to: '' }, offsets: { from: 2120, to: 2130 }, text: '.' },
    { timestamps: { from: '', to: '' }, offsets: { from: 3200, to: 3400 }, text: ' Now' },
    { timestamps: { from: '', to: '' }, offsets: { from: 3400, to: 3680 }, text: ' you' },
    { timestamps: { from: '', to: '' }, offsets: { from: 3680, to: 4080 }, text: ' need' },
    { timestamps: { from: '', to: '' }, offsets: { from: 4080, to: 4150 }, text: ' a' },
    { timestamps: { from: '', to: '' }, offsets: { from: 4150, to: 4610 }, text: ' de' },
    { timestamps: { from: '', to: '' }, offsets: { from: 4610, to: 4800 }, text: 'mo.' },
  ],
}

describe('parseWhisperJson', () => {
  it('drops empty tokens and glues sub-word pieces and punctuation onto the word', () => {
    const words = parseWhisperJson(RAW)
    expect(words.map(w => w.word)).toEqual([
      'You',
      'shipped',
      'your',
      'product.',
      'Now',
      'you',
      'need',
      'a',
      'demo.',
    ])
    expect(words[3]).toEqual({ word: 'product.', start: 1.32, end: 2.13 })
    expect(words[8]).toEqual({ word: 'demo.', start: 4.15, end: 4.8 })
  })
})

describe('speechWindows', () => {
  it('isolates utterances across long gaps with short phoneme handles', () => {
    const log =
      'silence_start: 0\nsilence_end: 2\nsilence_start: 6\nsilence_end: 20\nsilence_start: 24'
    expect(speechWindows(log, 30)).toEqual([
      [1.85, 6.15],
      [19.85, 24.15],
    ])
    expect(speechWindows('', 8)).toEqual([[0, 8]])
    expect(speechWindows('silence_start: 0', 8)).toEqual([])
    expect(speechWindows('silence_start: 0\nsilence_end: 8', 8)).toEqual([])
  })
})

describe('wordsToSegments', () => {
  it('breaks at sentence ends and silences, keeping the words', () => {
    const segments = wordsToSegments(parseWhisperJson(RAW))
    expect(segments.map(s => s.text)).toEqual(['You shipped your product.', 'Now you need a demo.'])
    expect(segments[0]).toMatchObject({ start: 0.27, end: 2.13 })
    expect(segments[1].words).toHaveLength(5)
  })

  it('breaks a long run of words so a segment stays readable', () => {
    const words = Array.from({ length: 60 }, (_, i) => ({
      word: `w${i}`,
      start: i * 0.3,
      end: i * 0.3 + 0.25,
    }))
    const segments = wordsToSegments(words)
    expect(segments.length).toBeGreaterThan(1)
    expect(segments.every(s => s.words.length <= 28)).toBe(true)
    expect(segments.flatMap(s => s.words)).toHaveLength(60)
  })
})

describe('findWhisperModel', () => {
  it('locates installed models or respects explicit WHISPER_MODEL env override', () => {
    const orig = process.env.WHISPER_MODEL
    try {
      delete process.env.WHISPER_MODEL
      const found = findWhisperModel()
      // If a model is installed in /usr/local/share/whisper.cpp/models, ~/.cache, or docker-data, it finds it
      if (found) {
        expect(found).toMatch(/\.bin$/)
      }

      // Explicit override takes precedence
      process.env.WHISPER_MODEL = '/nonexistent/whisper.bin'
      expect(findWhisperModel()).toBe(found) // Falls back if explicit does not exist
    } finally {
      if (orig !== undefined) process.env.WHISPER_MODEL = orig
      else delete process.env.WHISPER_MODEL
    }
  })
})

describe('a model the render pod is still downloading', () => {
  const withModel = async (fn: (model: string) => Promise<void> | void) => {
    const orig = process.env.WHISPER_MODEL
    const dir = mkdtempSync(path.join(tmpdir(), 'whisper-pending-'))
    process.env.WHISPER_MODEL = path.join(dir, 'ggml-test.bin')
    try {
      await fn(process.env.WHISPER_MODEL)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      if (orig !== undefined) process.env.WHISPER_MODEL = orig
      else delete process.env.WHISPER_MODEL
    }
  }

  it('counts a growing part file as pending and a stalled one as dead', () =>
    withModel(model => {
      expect(pendingWhisperModel()).toBeNull()
      writeFileSync(`${model}.part`, '')
      expect(pendingWhisperModel()).toBe(model)
      const stale = new Date(Date.now() - 120_000)
      utimesSync(`${model}.part`, stale, stale)
      expect(pendingWhisperModel()).toBeNull()
    }))

  // Only meaningful where no other model is installed for findWhisperModel to fall back to.
  const installed = (() => {
    const orig = process.env.WHISPER_MODEL
    delete process.env.WHISPER_MODEL
    const found = findWhisperModel()
    if (orig !== undefined) process.env.WHISPER_MODEL = orig
    return found
  })()
  it.skipIf(installed)('waits for the download to land', () =>
    withModel(async model => {
      writeFileSync(`${model}.part`, '')
      setTimeout(() => renameSync(`${model}.part`, model), 1200)
      expect(await awaitWhisperModel({ timeoutMs: 10_000 })).toBe(model)
    }),
  )
})

describe('defaultWhisperThreads', () => {
  it('uses WHISPER_THREADS when provided', () => {
    const orig = process.env.WHISPER_THREADS
    try {
      process.env.WHISPER_THREADS = '12'
      expect(defaultWhisperThreads()).toBe(12)
    } finally {
      if (orig !== undefined) process.env.WHISPER_THREADS = orig
      else delete process.env.WHISPER_THREADS
    }
  })

  it('calculates optimal thread count for machine when env var is absent', () => {
    const orig = process.env.WHISPER_THREADS
    try {
      delete process.env.WHISPER_THREADS
      const threads = defaultWhisperThreads()
      expect(threads).toBeGreaterThanOrEqual(1)
      expect(threads).toBeLessThanOrEqual(12)
    } finally {
      if (orig !== undefined) process.env.WHISPER_THREADS = orig
      else delete process.env.WHISPER_THREADS
    }
  })
})
