import { Clock3, RectangleHorizontal, X } from 'lucide-solid'
import { Show } from 'solid-js'

export function NewProjectPreferences(props: {
  ratio: string
  duration: number | null
  onResetRatio: () => void
  onResetDuration: () => void
}) {
  return (
    <Show when={props.ratio !== '16:9' || props.duration}>
      <div class="new-prompt-tokens" aria-label="Project preferences">
        <Show when={props.ratio !== '16:9'}>
          <button
            type="button"
            aria-label={`Remove aspect ratio ${props.ratio}`}
            onClick={props.onResetRatio}
          >
            <RectangleHorizontal size={13} />
            <span>{props.ratio}</span>
            <X size={11} />
          </button>
        </Show>
        <Show when={props.duration}>
          {duration => (
            <button
              type="button"
              aria-label={`Remove duration ${duration()} seconds`}
              onClick={props.onResetDuration}
            >
              <Clock3 size={13} />
              <span>{duration()}s</span>
              <X size={11} />
            </button>
          )}
        </Show>
      </div>
    </Show>
  )
}
