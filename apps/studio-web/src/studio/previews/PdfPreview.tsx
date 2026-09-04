/**
 * A PDF, and the pages you select on.
 *
 * Same contract as every other preview: point at the part you want changed,
 * then say what should change. A PDF in an iframe is the browser's own viewer
 * — there is no DOM to click and no way to ask it what the user is looking at
 * — so the unit of selection is the PAGE, picked from a strip of rendered
 * page images underneath.
 *
 * A page target carries the file's workspace-relative path AND the page
 * number, which together are enough for the agent to act: read that page,
 * rebuild it, pull it out.
 */
import { useEffect, useState } from 'react'
import type { ProjectStore } from '../useProject'

/** Enough pages to find your way around without rendering a whole book. */
const MAX_PAGES = 60

export function PdfPreview({ store, src }: { store: ProjectStore; src: string }) {
  const s = store
  const [page, setPage] = useState(1)
  const thumbBase = `/projects/${s.project?.id ?? ''}/assets/thumb`

  // The description carries the PDF's own path and page count. It is not read
  // off the asset shelf, because a deck's build/output.pdf is previewable
  // without being material anyone would point at.
  const preview = s.project?.description.preview
  const pdf = preview?.kind === 'pdf' ? preview : null
  const pages = Math.min(pdf?.pages ?? 0, MAX_PAGES)

  useEffect(() => {
    setPage(1)
  }, [src])

  const pick = (n: number) => {
    setPage(n)
    if (!pdf) return
    s.addTarget({
      sceneId: null,
      tagName: 'page',
      className: '',
      id: '',
      text: '',
      selector: `${pdf.path}#page=${n}`,
      asset: pdf.path,
      page: n,
    })
  }

  return (
    <div className="pdf-preview">
      {/* `#page=` is honoured by every built-in PDF viewer; keying on it
          reloads the frame so picking a page actually moves the document. */}
      <iframe key={`${src}#${page}`} src={`${src}#page=${page}`} title="PDF preview" />

      {pages > 1 && (
        <div className="pdf-pages">
          <div className="pdf-pages-hint">
            {`Page ${page} of ${pdf?.pages}`} · click a page to reference it
          </div>
          <div className="strip">
            {Array.from({ length: pages }, (_, i) => i + 1).map(n => (
              <button
                type="button"
                key={n}
                className={`pdf-page${n === page ? ' on' : ''}`}
                title={`Page ${n}`}
                onClick={() => pick(n)}
              >
                <span className="pdf-page-thumb">
                  {pdf && (
                    <img
                      src={
                        store.mediaUrl(
                          `${thumbBase}?path=${encodeURIComponent(pdf.path)}&at=${n}`,
                        ) ?? ''
                      }
                      alt={`Page ${n}`}
                      loading="lazy"
                      draggable={false}
                    />
                  )}
                </span>
                <span className="pdf-page-num">{n}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {s.busy && (
        <div className="preview-updating">
          <span className="spinner" /> {s.status}
        </div>
      )}
    </div>
  )
}
