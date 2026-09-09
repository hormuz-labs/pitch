import { createMemo, createSignal, For, onMount, Show } from 'solid-js'
import type { Ask } from './types'

const LETTERS = 'ABCDEFGH'
export function AskStepper(props: { ask: Ask; disabled: boolean; onSend: (text: string) => void }) {
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
  const send = (text: string) => {
    if (locked()) return
    setSent(true)
    props.onSend(text)
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
      class={`ask${locked() ? ' locked' : ''}`}
      ref={el}
      tabIndex={locked() ? -1 : 0}
      onKeyDown={onKey}
    >
      <div class="ask-steps">
        <For each={questions()}>
          {(x, i) => (
            <button
              type="button"
              class={`ask-step${i() === step() ? ' on' : ''}${(picked()[x.id] ?? []).length ? ' done' : ''}`}
              disabled={locked() || i() > step()}
              onClick={() => setStep(i())}
              title={x.question}
            >
              {x.id}
            </button>
          )}
        </For>
        <button
          type="button"
          class={`ask-step${confirming() ? ' on' : ''}`}
          disabled={locked() || !summary().length}
          onClick={() => setStep(questions().length)}
        >
          ✓
        </button>
        <Show when={props.ask.intro && !locked()}>
          <span class="ask-intro">{props.ask.intro}</span>
        </Show>
      </div>
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
                      onClick={() =>
                        send('You decide — take your own first option for each and get started.')
                      }
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
