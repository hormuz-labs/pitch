import { createMemo, createSignal, For, onMount, Show } from 'solid-js'
import type { Ask } from './types'

const LETTERS = 'ABCDEFGH'
export function QuestionCard(props: {
  entryId: string
  ask: Ask
  disabled: boolean
  onSend: (
    text: string,
    answer: {
      askEntryId: string
      selections: Array<{ questionId: string; optionIds: string[] }>
    },
  ) => void
}) {
  const [step, setStep] = createSignal(0),
    [picked, setPicked] = createSignal<Record<string, string[]>>({}),
    [sent, setSent] = createSignal(false)
  let el: HTMLDivElement | undefined
  const locked = () => sent() || props.disabled,
    questions = () => props.ask.questions,
    q = () => questions()[step()],
    confirming = () => step() >= questions().length
  const summary = createMemo(() =>
    questions()
      .filter(x => (picked()[x.id] ?? []).length)
      .map(x => `${x.question} → ${(picked()[x.id] ?? []).join(', ')}`),
  )
  const answer = () => ({
    askEntryId: props.entryId,
    selections: questions().map(question => ({
      questionId: question.id,
      optionIds: question.options
        .filter(option => (picked()[question.id] ?? []).includes(option.label))
        .map(option => option.id),
    })),
  })
  const send = (text: string) => {
    if (locked()) return
    setSent(true)
    props.onSend(text, answer())
  }
  const choose = (label: string) => {
    const cur = q()
    if (locked() || !cur) return
    if (cur.multi) {
      setPicked(p => ({
        ...p,
        [cur.id]: (p[cur.id] ?? []).includes(label)
          ? (p[cur.id] ?? []).filter(x => x !== label)
          : [...(p[cur.id] ?? []), label],
      }))
      return
    }
    setPicked(p => ({ ...p, [cur.id]: [label] }))
    setStep(v => v + 1)
  }
  const onKey = (e: KeyboardEvent) => {
    if (locked()) return
    if (e.key === 'Enter') {
      e.preventDefault()
      if (confirming()) send(summary().join('\n'))
      else if (q()?.multi && (picked()[q()!.id] ?? []).length) setStep(v => v + 1)
      return
    }
    if (e.key === 'Backspace' && step() > 0) {
      e.preventDefault()
      setStep(v => v - 1)
      return
    }
    const i = LETTERS.indexOf(e.key.toUpperCase())
    if (!confirming() && q() && i >= 0 && i < q()!.options.length) {
      e.preventDefault()
      choose(q()!.options[i].label)
    }
  }
  onMount(() => queueMicrotask(() => !locked() && el?.focus({ preventScroll: true })))
  return (
    <div
      class={`ask question-card${locked() ? ' locked' : ''}`}
      ref={el}
      tabIndex={locked() ? -1 : 0}
      onKeyDown={onKey}
    >
      <div class="ask-head">
        <span class="ask-progress">
          {confirming() ? 'Review answers' : `Question ${step() + 1} of ${questions().length}`}
        </span>
        <div class="ask-dots" aria-hidden="true">
          <For each={questions()}>
            {(x, i) => (
              <span
                class={`ask-dot${i() === step() ? ' on' : ''}${(picked()[x.id] ?? []).length ? ' done' : ''}`}
              />
            )}
          </For>
        </div>
      </div>
      <Show when={props.ask.intro && !locked()}>
        <p class="ask-intro">{props.ask.intro}</p>
      </Show>
      <Show
        when={confirming()}
        fallback={
          <Show when={q()} keyed>
            {cur => (
              <>
                <p class="ask-q">
                  {cur.question}
                  <Show when={cur.multi}>
                    <span class="ask-any"> · any</span>
                  </Show>
                </p>
                <ul class="ask-list">
                  <For each={cur.options}>
                    {(o, i) => (
                      <li>
                        <button
                          type="button"
                          class={`ask-row${(picked()[cur.id] ?? []).includes(o.label) ? ' on' : ''}`}
                          disabled={locked()}
                          onClick={() => choose(o.label)}
                        >
                          <span class="ask-key">{LETTERS[i()]}</span>
                          <span class="ask-text">{o.label}</span>
                          <Show when={o.hint}>
                            <span class="ask-hint">{o.hint}</span>
                          </Show>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
                <Show when={!locked()}>
                  <div class="ask-actions">
                    <Show when={cur.multi}>
                      <button
                        type="button"
                        class="ask-send"
                        disabled={!(picked()[cur.id] ?? []).length}
                        onClick={() => setStep(v => v + 1)}
                      >
                        Next
                      </button>
                    </Show>
                    <button
                      type="button"
                      class="ask-flat"
                      onClick={() => {
                        setPicked(
                          Object.fromEntries(
                            questions().map(question => [question.id, [question.options[0].label]]),
                          ),
                        )
                        queueMicrotask(() =>
                          send('You decide — take your own first option for each and get started.'),
                        )
                      }}
                    >
                      You decide
                    </button>
                  </div>
                </Show>
              </>
            )}
          </Show>
        }
      >
        <p class="ask-q">{locked() ? 'Answered' : 'Send this?'}</p>
        <ul class="ask-summary">
          <For each={summary()}>{line => <li>{line}</li>}</For>
        </ul>
        <Show when={!locked()}>
          <div class="ask-actions">
            <button type="button" class="ask-send" onClick={() => send(summary().join('\n'))}>
              Send
            </button>
            <button
              type="button"
              class="ask-flat"
              onClick={() => setStep(Math.max(0, questions().length - 1))}
            >
              Back
            </button>
          </div>
        </Show>
      </Show>
    </div>
  )
}
