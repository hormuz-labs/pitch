import { For, Show } from 'solid-js'
import { AskStepper } from './Ask'
import type { Entry } from './types'

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
const lastQuiet = (list: Entry[]) => {
  const e = list.at(-1)
  return (
    !e ||
    (!(e.role === 'tool' && e.tool?.status === 'running') &&
      (e.role === 'user' || e.role === 'tool' || e.role === 'question'))
  )
}
export function Thread(props: {
  entries: Entry[]
  busy: boolean
  onAnswer?: (text: string) => void
}) {
  const open = () =>
    [...props.entries].reverse().find(e => e.role === 'question' || e.role === 'user')
  return (
    <div class="thread">
      <For each={props.entries}>
        {e => (
          <Show
            when={e.role === 'question'}
            fallback={
              <Show
                when={e.role === 'tool'}
                fallback={
                  <Show
                    when={e.role === 'thinking'}
                    fallback={
                      <Show when={e.text.trim()}>
                        {e.role === 'assistant' ? (
                          <div class="msg assistant md">
                            <AgentMarkdown text={e.text} />
                          </div>
                        ) : (
                          <div class={`msg ${e.role}`}>{e.text}</div>
                        )}
                      </Show>
                    }
                  >
                    <Show when={e.text.trim()}>
                      <div class="log-line thinking-line">
                        <span class="log-icon">∴</span>
                        <span class="log-text">{e.text}</span>
                      </div>
                    </Show>
                  </Show>
                }
              >
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
            }
          >
            <Show when={e.ask}>
              <AskStepper
                ask={e.ask!}
                disabled={!props.onAnswer || props.busy || e.id !== open()?.id}
                onSend={t => props.onAnswer?.(t)}
              />
            </Show>
          </Show>
        )}
      </For>
      <Show when={props.busy && lastQuiet(props.entries)}>
        <div class="log-line working">
          <span class="log-icon">
            <span class="spinner" />
          </span>
          <span class="log-text">working…</span>
        </div>
      </Show>
    </div>
  )
}
