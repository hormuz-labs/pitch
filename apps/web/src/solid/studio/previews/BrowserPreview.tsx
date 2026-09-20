import { BrowserViewer } from '../BrowserViewer'
import type { ProjectStore } from '../useProject'
export function BrowserPreview(props: { store: ProjectStore; streamId: string }) {
  return (
    <div class="browser-preview">
      <div class="browser-preview-screen">
        <BrowserViewer streamId={props.streamId} viewOnly />
      </div>
      <div class="preview-updating">
        <span class="spinner" /> Recording · {props.store.status}
      </div>
    </div>
  )
}
