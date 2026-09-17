import { CornerUpLeft, Pencil } from 'lucide-solid'
import { createMemo, For, Show } from 'solid-js'
import { QuestionCard } from './Ask'
import { agentActivity } from './agent-activity'
import { ReasoningSteps } from './ReasoningSteps'
import { ThinkingOrb } from './ThinkingOrb'
import type { AskAnswer, Entry } from './types'

type Inline = { kind: 'text' | 'strong' | 'em' | 'code' | 'link'; text: string; href?: string }
function inline(text: string): Inline[] {
  const out: Inline[] = []
  const re = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g
  let at = 0
  let m = re.exec(text)
  while (m) {
    if (m.index > at) out.push({ kind: 'text', text: text.slice(at, m.index) })
    out.push(
      m[2]
        ? { kind: 'link', text: m[2], href: m[3] }
        : m[4]
          ? { kind: 'code', text: m[4] }
          : m[5]
            ? { kind: 'strong', text: m[5] }
            : { kind: 'em', text: m[6] },
    )
    at = re.lastIndex
    m = re.exec(text)
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) })
  return out
}
function InlineText(props: { text: string }) {
  return (
    <For each={inline(props.text)}>
      {t => (
        <Show when={t.kind !== 'text'} fallback={t.text}>
          <Show
            when={t.kind === 'strong'}
            fallback={
              <Show
                when={t.kind === 'em'}
                fallback={
                  <Show
                    when={t.kind === 'code'}
                    fallback={
                      <a href={t.href} target="_blank" rel="noreferrer noopener">
                        {t.text}
                      </a>
                    }
                  >
                    <code>{t.text}</code>
                  </Show>
                }
              >
                <em>{t.text}</em>
              </Show>
            }
          >
            <strong>{t.text}</strong>
          </Show>
        </Show>
      )}
    </For>
  )
}
function AgentMarkdown(props: { text: string }) {
  const blocks = () => props.text.split(/\n{2,}/)
  return (
    <For each={blocks()}>
      {block => {
        const lines = block.split('\n')
        if (lines.every(x => /^\s*[-*+] /.test(x)))
          return (
            <ul>
              <For each={lines}>
                {x => (
                  <li>
                    <InlineText text={x.replace(/^\s*[-*+] /, '')} />
                  </li>
                )}
              </For>
            </ul>
          )
        if (lines.every(x => /^\s*\d+\. /.test(x)))
          return (
            <ol>
              <For each={lines}>
                {x => (
                  <li>
                    <InlineText text={x.replace(/^\s*\d+\. /, '')} />
                  </li>
                )}
              </For>
            </ol>
          )
        if (/^```/.test(block)) {
          const body = block.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')
          return (
            <pre>
              <code>{body}</code>
            </pre>
          )
        }
        if (
          lines.length > 1 &&
          /^\s*\|?.+\|.+\|?\s*$/.test(lines[0]) &&
          /^\s*\|?\s*:?-+/.test(lines[1])
        ) {
          const cells = (line: string) =>
            line
              .trim()
              .replace(/^\||\|$/g, '')
              .split('|')
              .map(x => x.trim())
          const headings = cells(lines[0])
          return (
            <div class="md-scroll">
              <table>
                <thead>
                  <tr>
                    <For each={headings}>
                      {cell => (
                        <th>
                          <InlineText text={cell} />
                        </th>
                      )}
                    </For>
                  </tr>
                </thead>
                <tbody>
                  <For each={lines.slice(2)}>
                    {line => (
                      <tr>
                        <For each={cells(line)}>
                          {cell => (
                            <td>
                              <InlineText text={cell} />
                            </td>
                          )}
                        </For>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          )
        }
        if (lines.every(x => /^\s*>/.test(x)))
          return (
            <blockquote>
              <For each={lines}>
                {x => (
                  <>
                    <InlineText text={x.replace(/^\s*>\s?/, '')} />
                    <br />
                  </>
                )}
              </For>
            </blockquote>
          )
        if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(block)) return <hr />
        const h = /^(#{1,6})\s+(.+)/.exec(block)
        if (h)
          return (
            <p class={`md-h${h[1].length}`}>
              <InlineText text={h[2]} />
            </p>
          )
        return (
          <p>
            <For each={lines}>
              {(line, i) => (
                <>
                  <InlineText text={line} />
                  <Show when={i() < lines.length - 1}>
                    <br />
                  </Show>
                </>
              )}
            </For>
          </p>
        )
      }}
    </For>
  )
}
export function Thread(props: {
  entries: Entry[]
  busy: boolean
  onAnswer?: (text: string, opts?: { answer?: AskAnswer }) => void
  onEdit?: (entry: Entry) => void
  onSteer?: (entry: Entry) => void
}) {
  const open = () =>
    [...props.entries].reverse().find(e => e.role === 'question' || e.role === 'user')
  const activity = createMemo(() => agentActivity(props.entries, props.busy))
  const activeTurn = createMemo(() => {
    const entries = props.entries.filter(entry => !entry.pending)
    const prompt = entries.findLastIndex(entry => entry.role === 'user')
    return entries.slice(prompt + 1)
  })
  const activeEntryIds = createMemo(() => new Set(activeTurn().map(entry => entry.id)))
  return (
    <div class="thread">
      <For each={props.entries.filter(e => e.role !== 'thinking')}>
        {e => (
          <Show
            when={e.role === 'question'}
            fallback={
              <Show
                when={e.role === 'credit'}
                fallback={
                  <Show
                    when={e.role === 'tool'}
                    fallback={
                      <Show when={e.text.trim()}>
                        {e.role === 'assistant' ? (
                          <div class="msg assistant md">
                            <AgentMarkdown text={e.text} />
                          </div>
                        ) : (
                          <div class={`user-message${e.pending === 'queued' ? ' is-queued' : ''}`}>
                            <div class={`msg ${e.role}`}>
                              <Show when={e.pending === 'queued'}>
                                <span class="queued-label">Queued</span>
                              </Show>
                              <span class="message-copy">{e.text}</span>
                              <Show when={e.pending && e.pending !== 'queued'}>
                                {pending => <span class="message-state">{pending()}</span>}
                              </Show>
                            </div>
                            <Show when={e.pending === 'queued'}>
                              <button class="message-steer" onClick={() => props.onSteer?.(e)}>
                                <CornerUpLeft size={12} />
                                <span>Steer now</span>
                              </button>
                            </Show>
                            <Show
                              when={
                                e.role === 'user' &&
                                e.sessionEntryId &&
                                e.checkpointId &&
                                !props.busy
                              }
                            >
                              <button
                                class="message-edit"
                                aria-label="Edit and resend from this message"
                                title="Edit and resend from here"
                                onClick={() => props.onEdit?.(e)}
                              >
                                <Pencil size={12} />
                              </button>
                            </Show>
                          </div>
                        )}
                      </Show>
                    }
                  >
                    <Show when={!props.busy || !activeEntryIds().has(e.id)}>
                      <div class={`log-line tool ${e.tool?.status === 'error' ? 'error' : ''}`}>
                        <span class="log-icon">
                          {e.tool?.status === 'running' ? (
                            <span class="spinner" />
                          ) : e.tool?.status === 'error' ? (
                            '✕'
                          ) : (
                            '✓'
                          )}
                        </span>
                        <span class="log-text">{e.text}</span>
                      </div>
                    </Show>
                  </Show>
                }
              >
                <div class="credit-exhausted" role="alert">
                  <strong>Credits ran out</strong>
                  <span>{e.text}</span>
                  <a href="/pricing">Add one-time credits</a>
                </div>
              </Show>
            }
          >
            <Show when={e.ask}>
              <QuestionCard
                entryId={e.id}
                ask={e.ask!}
                disabled={!props.onAnswer || e.id !== open()?.id}
                onSend={(text, answer) => props.onAnswer?.(text, { answer })}
              />
            </Show>
          </Show>
        )}
      </For>
      <Show when={activity()}>
        {state => (
          <div class="agent-work" role="status" aria-live="polite">
            <div class="agent-activity">
              <ThinkingOrb state={state()} size={64} />
              <span>
                {state() === 'listening'
                  ? 'Listening…'
                  : state() === 'searching'
                    ? 'Searching…'
                    : 'Thinking…'}
              </span>
            </div>
            <Show when={props.busy}>
              <ReasoningSteps entries={activeTurn()} active />
            </Show>
          </div>
        )}
      </Show>
    </div>
  )
}
