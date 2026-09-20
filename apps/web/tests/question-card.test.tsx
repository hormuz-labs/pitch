import { fireEvent, render, screen } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import { QuestionCard } from '../src/solid/studio/Ask'

const ask = {
  intro: 'A short introduction.',
  questions: [
    {
      id: 'style',
      question: 'Which style?',
      options: [
        { id: 'bold', label: 'Bold', hint: 'High energy' },
        { id: 'calm', label: 'Calm' },
      ],
    },
    {
      id: 'timing',
      question: 'When should it start?',
      options: [{ id: 'now', label: 'Now' }],
    },
  ],
}

describe('QuestionCard', () => {
  it('confirms each answer before advancing and allows question navigation', () => {
    render(() => <QuestionCard entryId="ask-1" ask={ask} disabled={false} onSend={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Bold/ }))
    expect(screen.getByText('Which style?')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('When should it start?')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Go to question 1' }))
    expect(screen.getByText('Which style?')).toBeTruthy()
  })

  it('sends a custom Other response after review', () => {
    const onSend = vi.fn()
    render(() => <QuestionCard entryId="ask-1" ask={ask} disabled={false} onSend={onSend} />)

    fireEvent.input(screen.getByPlaceholderText('Describe what you have in mind…'), {
      target: { value: 'Use hand-drawn animation' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: /Now/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(onSend).toHaveBeenCalledWith(expect.stringContaining('Use hand-drawn animation'), {
      askEntryId: 'ask-1',
      selections: [
        { questionId: 'style', optionIds: [], customText: 'Use hand-drawn animation' },
        { questionId: 'timing', optionIds: ['now'] },
      ],
    })
    expect(screen.getByRole('status').textContent).toContain('Answers sent')
    expect(screen.getByText('Use hand-drawn animation')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    fireEvent.keyDown(screen.getByText('Your direction is set.'), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)
  })
})
