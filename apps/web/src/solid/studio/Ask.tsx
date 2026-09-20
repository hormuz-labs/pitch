import { Check } from 'lucide-solid'
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
      selections: Array<{ questionId: string; optionIds: string[]; customText?: string }>
    },
  ) => void
}) {
  const [step, setStep] = createSignal(0),
    [picked, setPicked] = createSignal<Record<string, string[]>>({}),
    [custom, setCustom] = createSignal<Record<string, string>>({}),
    [sent, setSent] = createSignal(false)
  let el: HTMLDivElement | undefined
  const locked = () => sent() || props.disabled,
    questions = () => props.ask.questions,
    q = () => questions()[step()],
    confirming = () => step() >= questions().length
  const responses = createMemo(() =>
    questions()
      .filter(x => (picked()[x.id] ?? []).length || custom()[x.id]?.trim())
      .map(x => {
        const values = [
          ...(picked()[x.id] ?? []),
          ...(custom()[x.id]?.trim() ? [custom()[x.id].trim()] : []),
        ]
        return { question: x.question, value: values.join(', ') }
      }),
  )
  const summary = () =>
    responses()
      .map(x => `${x.question} → ${x.value}`)
      .join('\n')
  const answer = () => ({
    askEntryId: props.entryId,
    selections: questions().map(question => ({
      questionId: question.id,
      optionIds: question.options
        .filter(option => (picked()[question.id] ?? []).includes(option.label))
        .map(option => option.id),
      ...(custom()[question.id]?.trim() ? { customText: custom()[question.id].trim() } : {}),
    })),
  })
  const send = (text: string) => {
    if (locked()) return
    goToStep(questions().length)
    setSent(true)
    props.onSend(text, answer())
  }
  const goToStep = (next: number) => setStep(Math.max(0, Math.min(next, questions().length)))
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
    setCustom(values => ({ ...values, [cur.id]: '' }))
    setPicked(p => ({ ...p, [cur.id]: [label] }))
  }
  const hasAnswer = (question = q()) =>
    Boolean(question && ((picked()[question.id] ?? []).length || custom()[question.id]?.trim()))
  const setOther = (value: string) => {
    const cur = q()
    if (!cur || locked()) return
    setCustom(values => ({ ...values, [cur.id]: value }))
    if (!cur.multi && value) setPicked(values => ({ ...values, [cur.id]: [] }))
  }
  const onKey = (e: KeyboardEvent) => {
    if (locked()) return
    if (e.key === 'Enter') {
      e.preventDefault()
      if (confirming()) send(summary())
      else if (hasAnswer()) goToStep(step() + 1)
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
      class={`ask question-card${locked() ? ' locked' : ''}${sent() ? ' answered' : ''}`}
      ref={el}
      tabIndex={locked() ? -1 : 0}
      onKeyDown={onKey}
    >
      <div class="ask-head">
        <span class="ask-progress">
          {sent()
            ? 'Answers sent'
            : confirming()
              ? 'Review answers'
              : `Question ${step() + 1} of ${questions().length}`}
        </span>
        <div class="ask-dots" aria-label="Question navigation">
          <For each={questions()}>
            {(x, i) => (
              <button
                type="button"
                class={`ask-dot${i() === step() ? ' on' : ''}${
                  (picked()[x.id] ?? []).length || custom()[x.id]?.trim() ? ' done' : ''
                }`}
                aria-label={`Go to question ${i() + 1}`}
                aria-current={i() === step() ? 'step' : undefined}
                disabled={locked()}
                onClick={() => goToStep(i())}
              />
            )}
          </For>
        </div>
      </div>
      <Show when={props.ask.intro}>
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
                    <span class="ask-any">Select any</span>
                  </Show>
                </p>
                <ul class={`ask-list ${cur.multi ? 'is-multiple' : 'is-single'}`}>
                  <For each={cur.options}>
                    {(o, i) => (
                      <li>
                        <button
                          type="button"
                          class={`ask-row${(picked()[cur.id] ?? []).includes(o.label) ? ' on' : ''}`}
                          aria-pressed={(picked()[cur.id] ?? []).includes(o.label)}
                          disabled={locked()}
                          onClick={() => choose(o.label)}
                        >
                          <span class="ask-key" aria-hidden="true">
                            <Show
                              when={(picked()[cur.id] ?? []).includes(o.label)}
                              fallback={LETTERS[i()]}
                            >
                              <Check size={12} strokeWidth={2.5} />
                            </Show>
                          </span>
                          <span class="ask-text">{o.label}</span>
                          <Show when={o.hint}>
                            <span class="ask-hint">{o.hint}</span>
                          </Show>
                        </button>
                      </li>
                    )}
                  </For>
                  <li class="ask-other">
                    <label class={`ask-row${custom()[cur.id]?.trim() ? ' on' : ''}`}>
                      <span class="ask-key">{LETTERS[cur.options.length]}</span>
                      <span class="ask-other-field">
                        <span class="ask-text">Something else</span>
                        <input
                          type="text"
                          value={custom()[cur.id] ?? ''}
                          disabled={locked()}
                          maxLength={500}
                          placeholder="Describe what you have in mind…"
                          onInput={event => setOther(event.currentTarget.value)}
                          onKeyDown={event => {
                            event.stopPropagation()
                            if (event.key === 'Enter' && event.currentTarget.value.trim()) {
                              event.preventDefault()
                              goToStep(step() + 1)
                            }
                          }}
                        />
                      </span>
                    </label>
                  </li>
                </ul>
                <Show when={!locked()}>
                  <div class="ask-actions">
                    <div class="ask-nav">
                      <Show when={step() > 0}>
                        <button type="button" class="ask-flat" onClick={() => goToStep(step() - 1)}>
                          Previous
                        </button>
                      </Show>
                      <button
                        type="button"
                        class="ask-send"
                        disabled={!hasAnswer(cur)}
                        onClick={() => goToStep(step() + 1)}
                      >
                        {step() === questions().length - 1 ? 'Review' : 'Next'}
                      </button>
                    </div>
                    <button
                      type="button"
                      class="ask-flat"
                      onClick={() => {
                        setPicked(
                          Object.fromEntries(
                            questions().map(question => [question.id, [question.options[0].label]]),
                          ),
                        )
                        setCustom({})
                        queueMicrotask(() =>
                          send(
                            'Let the agent decide — choose the best option for each question and get started.',
                          ),
                        )
                      }}
                    >
                      Let agent decide
                    </button>
                  </div>
                </Show>
              </>
            )}
          </Show>
        }
      >
        <p class="ask-q">{sent() ? 'Your direction is set.' : 'Ready to move forward?'}</p>
        <ul class="ask-summary">
          <For each={responses()}>
            {response => (
              <li>
                <span class="ask-summary-question">{response.question}</span>
                <span class="ask-summary-value">{response.value}</span>
              </li>
            )}
          </For>
        </ul>
        <Show
          when={!locked()}
          fallback={
            <Show when={sent()}>
              <div class="ask-receipt" role="status">
                <Check size={14} aria-hidden="true" />
                Answers sent
              </div>
            </Show>
          }
        >
          <div class="ask-actions">
            <button type="button" class="ask-send" onClick={() => send(summary())}>
              Send
            </button>
            <button type="button" class="ask-flat" onClick={() => goToStep(questions().length - 1)}>
              Back
            </button>
          </div>
        </Show>
      </Show>
    </div>
  )
}
