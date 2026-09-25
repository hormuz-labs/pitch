import { BrowserViewer } from '../BrowserViewer'
export function BrowserPreview(props: { streamId: string }) {
  return (
    <div class="browser-preview">
      <div class="browser-preview-screen">
        <BrowserViewer streamId={props.streamId} viewOnly />
      </div>
    </div>
  )
}
