import { BrowserViewer } from '../BrowserViewer'
import type { ProjectStore } from '../useProject'
export function BrowserPreview(props: { store: ProjectStore; profileId: string }) {
  return (
    <div class="browser-preview">
      <div class="browser-preview-screen">
        <BrowserViewer profileId={props.profileId} viewOnly />
      </div>
      <div class="preview-updating">
        <span class="spinner" /> Recording · {props.store.status}
      </div>
    </div>
  )
}
