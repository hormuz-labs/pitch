/**
 * `ask_user` is the only tool whose ARGUMENTS are the thing the user sees:
 * the studio draws them as buttons instead of running anything. So the parse
 * is the contract — a malformed call must degrade to nothing rather than put
 * an unanswerable card in the thread.
 */
import { describe, expect, it } from 'vitest'
import { parseAsk } from '../apps/api/src/studio/session.js'

const question = (over: Record<string, unknown> = {}) => ({
  id: 'kind',
  question: 'What kind of launch video?',
  options: [{ label: 'Cinematic', hint: 'Designed motion' }, { label: 'Teaser' }],
  ...over,
})

describe('parseAsk', () => {
  it('keeps a well-formed question with its hints and intro', () => {
    const ask = parseAsk({ intro: '  Two quick things.  ', questions: [question()] })
    expect(ask).toEqual({
      intro: 'Two quick things.',
      questions: [
        {
          id: 'kind',
          question: 'What kind of launch video?',
          options: [{ label: 'Cinematic', hint: 'Designed motion' }, { label: 'Teaser' }],
        },
      ],
    })
  })

  it('marks a multi question and caps the options at six', () => {
    const options = Array.from({ length: 9 }, (_, i) => ({ label: `f${i}` }))
    const ask = parseAsk({ questions: [question({ multi: true, options })] })
    expect(ask?.questions[0].multi).toBe(true)
    expect(ask?.questions[0].options).toHaveLength(6)
  })

  it('drops a question that cannot be answered by clicking', () => {
    // One option is not a choice, and a blank question has nothing to ask.
    expect(parseAsk({ questions: [question({ options: [{ label: 'Only' }] })] })).toBeNull()
    expect(parseAsk({ questions: [question({ question: '   ' })] })).toBeNull()
    expect(
      parseAsk({ questions: [question({ options: [{ label: ' ' }, { label: '' }] })] }),
    ).toBeNull()
  })

  it('is null when there is nothing to show', () => {
    expect(parseAsk(undefined)).toBeNull()
    expect(parseAsk({ questions: [] })).toBeNull()
    expect(parseAsk({ questions: 'what kind?' })).toBeNull()
  })

  it('asks at most three things — more is an interrogation, not a brief', () => {
    const ask = parseAsk({
      questions: [1, 2, 3, 4, 5].map(n => question({ id: `q${n}` })),
    })
    expect(ask?.questions.map(q => q.id)).toEqual(['q1', 'q2', 'q3'])
  })
})
