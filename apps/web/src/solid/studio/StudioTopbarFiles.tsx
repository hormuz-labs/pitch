import { Files } from 'lucide-solid'

export function StudioTopbarFiles(props: { count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Files (${props.count})`}
      class={`preview-pane-tab${props.active ? ' is-active' : ''}`}
      onClick={props.onClick}
    >
      <Files size={15} />
      <span class="preview-pane-tab__label">Files</span>
      <small class="preview-pane-tab__count">{props.count}</small>
    </button>
  )
}
