/**
 * A PDF, in the browser's own viewer.
 *
 * This exists so that dropping a PDF lands on something you can read while
 * you decide what to ask for, instead of an empty stage. There is no element
 * selection here — a PDF is not a document the agent edits in place; it asks
 * the agent to rebuild it as a deck, and then the deck preview takes over.
 */
import type { ProjectStore } from '../useProject'

export function PdfPreview({ store, src }: { store: ProjectStore; src: string }) {
  const s = store
  return (
    <div className="pdf-preview">
      <iframe src={src} title="PDF preview" />
      {s.busy && (
        <div className="preview-updating">
          <span className="spinner" /> {s.status}
        </div>
      )}
    </div>
  )
}
