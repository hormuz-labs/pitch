import { CornerUpLeft } from 'lucide-solid'
import { createSignal, For, Show } from 'solid-js'
import type { Entry } from './types'

export function PendingMessages(props: {
  entries: Entry[]
  busy: boolean
  onSteer: (entryId: string) => Promise<void>
}) {
  const pending = () =>
    props.entries.filter(
      entry => entry.role === 'user' && ['queued', 'steering'].includes(entry.pending ?? ''),
    )
  return (
    <Show when={pending().length}>
      <section class="composer-queue" aria-label="Pending messages">
        <For each={pending()}>
          {entry => {
            const [sending, setSending] = createSignal(false)
            const [error, setError] = createSignal('')
            const steer = async () => {
              if (sending()) return
              setSending(true)
              setError('')
              try {
                await props.onSteer(entry.id)
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not steer. Try again.')
              } finally {
                setSending(false)
              }
            }
            return (
              <div class="composer-queue-item">
                <div class="composer-queue-copy">
                  <span class="queued-label">
                    {entry.pending === 'steering' ? 'Steering' : 'Queued'}
                  </span>
                  <span class="message-copy" title={entry.text}>
                    {entry.text}
                  </span>
                </div>
                <Show
                  when={entry.pending === 'queued'}
                  fallback={<span class="message-state">Joining current run…</span>}
                >
                  <button
                    type="button"
                    class="message-steer"
                    disabled={!props.busy || sending() || entry.id.startsWith('local-')}
                    title="Push this message into the current run at the next agent boundary"
                    aria-label={`Steer now: ${entry.text}`}
                    onClick={() => void steer()}
                  >
                    <CornerUpLeft size={13} />
                    <span>{sending() ? 'Sending…' : 'Steer now'}</span>
                  </button>
                </Show>
                <Show when={error()}>
                  <span class="composer-queue-error" role="alert">
                    {error()}
                  </span>
                </Show>
              </div>
            )
          }}
        </For>
      </section>
    </Show>
  )
}
