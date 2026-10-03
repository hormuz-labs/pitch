/**
 * `ask_user` is the only tool whose ARGUMENTS are the thing the user sees:
 * the studio draws them as buttons instead of running anything. So the parse
 * is the contract — a malformed call must degrade to nothing rather than put
 * an unanswerable card in the thread.
 */
import { describe, expect, it } from 'vitest'
import { parseAsk, resolveAskSelections } from '../apps/api/src/studio/session.js'

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
          options: [
            { id: 'cinematic', label: 'Cinematic', hint: 'Designed motion', recommended: true },
            { id: 'teaser', label: 'Teaser' },
          ],
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

  it('keeps stable bindings and option ids for structured answers', () => {
    const ask = parseAsk({
      questions: [
        question({
          bind: 'videoType',
          options: [
            { id: 'product-walkthrough', label: 'Product walkthrough' },
            { id: 'teaser', label: 'Teaser' },
          ],
        }),
      ],
    })
    expect(ask?.questions[0]).toMatchObject({
      bind: 'videoType',
      options: [{ id: 'product-walkthrough' }, { id: 'teaser' }, { id: 'auto' }],
    })
  })

  it("writes the studio's plain words onto a kind question, not the agent's", () => {
    const ask = parseAsk({
      questions: [
        question({
          bind: 'videoType',
          options: [
            { id: 'kinetic-type', label: 'Kinetic typography', hint: 'Type-led motion' },
            { id: 'my-own-idea', label: 'Founder story' },
            { id: 'auto', label: 'You decide' },
          ],
        }),
      ],
    })
    expect(ask?.questions[0].options).toEqual([
      {
        id: 'kinetic-type',
        label: 'Let the words do it',
        hint: 'Big animated words carry the message, with little product on screen',
        recommended: true,
      },
      { id: 'my-own-idea', label: 'Founder story' },
      { id: 'auto', label: 'Let Pitch choose', hint: 'Pitch picks what fits your product best' },
    ])
  })

  it('recommends nothing on a multi question', () => {
    const ask = parseAsk({ questions: [question({ multi: true })] })
    expect(ask?.questions[0].options.some(o => o.recommended)).toBe(false)
  })
})

describe('resolveAskSelections', () => {
  const ask = parseAsk({
    questions: [
      question({
        bind: 'videoType',
        options: [
          { id: 'walkthrough', label: 'Walkthrough' },
          { id: 'teaser', label: 'Teaser' },
        ],
      }),
      question({
        id: 'features',
        question: 'What should it cover?',
        multi: true,
        options: [
          { id: 'search', label: 'Search' },
          { id: 'sharing', label: 'Sharing' },
        ],
      }),
    ],
  })!

  it('passes a freeform answer verbatim without inventing a structured binding', () => {
    expect(
      resolveAskSelections(ask, {
        askEntryId: 'ask-1',
        selections: [
          { questionId: 'kind', optionIds: [], customText: 'A founder-led manifesto' },
          { questionId: 'features', optionIds: ['search'], customText: 'Offline mode' },
        ],
      }),
    ).toEqual({
      text: 'What kind of launch video? → A founder-led manifesto\nWhat should it cover? → Search, Offline mode',
      options: {},
    })
  })

  it('retains structured bindings for listed choices', () => {
    expect(
      resolveAskSelections(ask, {
        askEntryId: 'ask-1',
        selections: [
          { questionId: 'kind', optionIds: ['teaser'] },
          { questionId: 'features', optionIds: ['sharing'] },
        ],
      }).options,
    ).toEqual({ videoType: 'teaser' })
  })

  it('stores no kind when the user lets Pitch choose', () => {
    const kind = parseAsk({
      questions: [
        question({ bind: 'videoType', options: [{ id: 'teaser' }, { id: 'cinematic' }] }),
      ],
    })!
    expect(
      resolveAskSelections(kind, {
        askEntryId: 'ask-1',
        selections: [{ questionId: 'kind', optionIds: ['auto'] }],
      }),
    ).toEqual({ text: 'What kind of launch video? → Let Pitch choose', options: {} })
  })

  it('requires exactly one answer for single-choice questions', () => {
    expect(() =>
      resolveAskSelections(ask, {
        askEntryId: 'ask-1',
        selections: [
          { questionId: 'kind', optionIds: ['teaser'], customText: 'Both' },
          { questionId: 'features', optionIds: ['search'] },
        ],
      }),
    ).toThrow('Choose an answer for What kind of launch video?')
  })
})
