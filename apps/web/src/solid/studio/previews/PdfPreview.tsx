import { createEffect, createSignal, For, Show } from 'solid-js'
import type { ProjectStore } from '../useProject'
export function PdfPreview(props: { store: ProjectStore; src: string }) {
  const s = props.store,
    [page, setPage] = createSignal(1)
  createEffect(() => {
    props.src
    setPage(1)
  })
  const pdf = () => {
      const p = s.project?.description.preview
      return p?.kind === 'pdf' ? p : null
    },
    pages = () => Math.min(pdf()?.pages ?? 0, 60),
    pick = (n: number) => {
      setPage(n)
      const p = pdf()
      if (p)
        s.addTarget({
          sceneId: null,
          tagName: 'page',
          className: '',
          id: '',
          text: '',
          selector: `${p.path}#page=${n}`,
          asset: p.path,
          page: n,
        })
    }
  return (
    <div class="pdf-preview">
      <iframe src={`${props.src}#page=${page()}`} title="PDF preview" />
      <Show when={pages() > 1}>
        <div class="pdf-pages">
          <div class="pdf-pages-hint">
            Page {page()} of {pdf()?.pages} · click a page to reference it
          </div>
          <div class="strip">
            <For each={Array.from({ length: pages() }, (_, i) => i + 1)}>
              {n => (
                <button class={`pdf-page${n === page() ? ' on' : ''}`} onClick={() => pick(n)}>
                  <span class="pdf-page-thumb">
                    <img
                      src={
                        s.mediaUrl(
                          `/projects/${s.project?.id ?? ''}/assets/thumb?path=${encodeURIComponent(pdf()!.path)}&at=${n}`,
                        ) ?? ''
                      }
                      alt={`Page ${n}`}
                      loading="lazy"
                      draggable={false}
                    />
                  </span>
                  <span class="pdf-page-num">{n}</span>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={s.busy}>
        <div class="preview-updating">
          <span class="spinner" /> {s.status}
        </div>
      </Show>
    </div>
  )
}
