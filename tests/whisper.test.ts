/**
 * The one transcriber: whisper.cpp's word tokens into the transcript shape
 * the recording tools have always saved.
 */
import { describe, expect, it } from 'vitest'
import { parseWhisperJson, wordsToSegments } from '../.pi/lib/whisper'

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
