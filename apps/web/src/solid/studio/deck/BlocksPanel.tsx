import { ChartBar, Image as ImageIcon, QrCode, Table, X } from 'lucide-solid'
import { createMemo, createSignal, For, Show } from 'solid-js'
import {
  type BlockType,
  type ChartKind,
  createBlockHTML,
  createChartConfig,
  createIconBlockHTML,
  createImageBlockHTML,
  createQrBlockHTML,
  createTableHTML,
  ICONS,
  searchBlocks,
} from './blocks'
import type { DeckSession } from './deckSession'

const GROUP_ORDER = ['Text', 'Lists', 'Smart layouts', 'Callouts']

/**
 * The chart markup the old editor appended: a data-chart wrapper (the bridge
 * selects/drags the wrapper) plus an inline init script that polls for
 * Chart.js, so the chart renders both now and when the saved deck reopens.
 */
export function createChartBlockHTML(kind: ChartKind): string {
  const canvasId = `chart_${Math.random().toString(36).slice(2, 9)}`
  const config = JSON.stringify(createChartConfig(kind))
  return (
    `<div data-pitch-block="1" data-chart="1" style="position:relative;width:600px;height:340px;margin:16px 0;">` +
    `<canvas id="${canvasId}" style="pointer-events:none;"></canvas></div>` +
    `<script>(function(){function go(){var el=document.getElementById('${canvasId}');` +
    `if(el&&window.Chart){new window.Chart(el, ${config});}else{setTimeout(go,60);}}go();})();</script>`
  )
}

/**
 * Insert panel: searchable block registry plus the special pickers (table
 * grid, chart kinds, icon grid, image URL/file, QR text). Every choice posts
 * deck_insert_html; the bridge appends to the active slide.
 */
export function BlocksPanel(props: { session: DeckSession; onClose: () => void }) {
  const session = props.session
  const [query, setQuery] = createSignal('')
  const [tableSize, setTableSize] = createSignal({ r: 0, c: 0 })
  const [imageUrl, setImageUrl] = createSignal('')
  const [qrText, setQrText] = createSignal('')
  let imageFile: HTMLInputElement | undefined

  const results = createMemo(() => searchBlocks(query()))
  const groups = createMemo(() => {
    const list = results()
    return GROUP_ORDER.map(name => ({ name, blocks: list.filter(b => b.group === name) })).filter(
      g => g.blocks.length > 0,
    )
  })
  const searching = () => query().trim().length > 0

  const insert = (html: string) => {
    if (html) session.post({ type: 'deck_insert_html', html })
  }
  const insertBlock = (type: BlockType) => insert(createBlockHTML(type))
  const insertImageUrl = () => {
    const html = createImageBlockHTML(imageUrl().trim())
    if (!html) {
      window.alert('That image URL looks invalid or unsafe. Use an http(s) image link.')
      return
    }
    insert(html)
    setImageUrl('')
  }
  const onImageFile = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') insert(createImageBlockHTML(reader.result, file.name))
    }
    reader.readAsDataURL(file)
  }
  const insertQr = async () => {
    const text = qrText().trim()
    if (!text) return
    try {
      insert(await createQrBlockHTML(text))
      setQrText('')
    } catch {
      window.alert('Could not generate the QR code.')
    }
  }

  return (
    <div
      class="deck-editor-insert"
      role="dialog"
      aria-label="Insert block"
      onMouseDown={e => e.stopPropagation()}
    >
      <div class="deck-editor-insert-head">
        <input
          class="deck-editor-insert-search"
          type="search"
          placeholder="Search blocks…"
          aria-label="Search blocks"
          value={query()}
          onInput={e => setQuery(e.currentTarget.value)}
        />
        <button
          type="button"
          class="deck-editor-tool"
          title="Close"
          aria-label="Close insert panel"
          onClick={props.onClose}
        >
          <X size={14} />
        </button>
      </div>
      <div class="deck-editor-insert-body deck-editor-scrollable">
        <For each={groups()}>
          {group => (
            <div class="deck-editor-insert-group">
              <p class="deck-editor-insert-heading">{group.name}</p>
              <div class="deck-editor-insert-grid">
                <For each={group.blocks}>
                  {block => (
                    <button
                      type="button"
                      class="deck-editor-insert-block"
                      onClick={() => insertBlock(block.type)}
                    >
                      {block.label}
                    </button>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
        <Show when={!searching()}>
          <div class="deck-editor-insert-group">
            <p class="deck-editor-insert-heading">
              <Table size={12} /> Table — {tableSize().r || 0} × {tableSize().c || 0}
            </p>
            <div
              class="deck-editor-table-grid"
              role="grid"
              aria-label="Pick table size"
              onMouseLeave={() => setTableSize({ r: 0, c: 0 })}
            >
              <For each={Array.from({ length: 6 * 8 })}>
                {(_, i) => {
                  const r = () => Math.floor(i() / 8) + 1
                  const c = () => (i() % 8) + 1
                  return (
                    <button
                      type="button"
                      role="gridcell"
                      class={`deck-editor-table-cell${
                        r() <= tableSize().r && c() <= tableSize().c ? ' is-active' : ''
                      }`}
                      aria-label={`Insert ${r()} by ${c()} table`}
                      onMouseEnter={() => setTableSize({ r: r(), c: c() })}
                      onClick={() => insert(createTableHTML(r(), c()))}
                    />
                  )
                }}
              </For>
            </div>
          </div>
          <div class="deck-editor-insert-group">
            <p class="deck-editor-insert-heading">
              <ChartBar size={12} /> Chart
            </p>
            <div class="deck-editor-insert-grid">
              <For each={['bar', 'line', 'pie'] as ChartKind[]}>
                {kind => (
                  <button
                    type="button"
                    class="deck-editor-insert-block"
                    onClick={() => insert(createChartBlockHTML(kind))}
                  >
                    {kind[0].toUpperCase() + kind.slice(1)} chart
                  </button>
                )}
              </For>
            </div>
          </div>
          <div class="deck-editor-insert-group">
            <p class="deck-editor-insert-heading">Icons</p>
            <div class="deck-editor-insert-grid">
              <For each={ICONS}>
                {name => (
                  <button
                    type="button"
                    class="deck-editor-insert-block"
                    title={`Insert ${name} icon`}
                    onClick={() => insert(createIconBlockHTML(name))}
                  >
                    {name}
                  </button>
                )}
              </For>
            </div>
          </div>
          <div class="deck-editor-insert-group">
            <p class="deck-editor-insert-heading">
              <ImageIcon size={12} /> Image
            </p>
            <div class="deck-editor-insert-row">
              <input
                class="deck-editor-insert-input"
                type="url"
                placeholder="https://… image URL"
                aria-label="Image URL"
                value={imageUrl()}
                onInput={e => setImageUrl(e.currentTarget.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') insertImageUrl()
                }}
              />
              <button
                type="button"
                class="deck-editor-insert-block"
                onClick={insertImageUrl}
                disabled={!imageUrl().trim()}
              >
                Insert
              </button>
              <button
                type="button"
                class="deck-editor-insert-block"
                onClick={() => imageFile?.click()}
              >
                Upload
              </button>
              <input
                ref={imageFile}
                type="file"
                accept="image/*"
                hidden
                aria-label="Choose image file"
                onChange={onImageFile}
              />
            </div>
          </div>
          <div class="deck-editor-insert-group">
            <p class="deck-editor-insert-heading">
              <QrCode size={12} /> QR code
            </p>
            <div class="deck-editor-insert-row">
              <input
                class="deck-editor-insert-input"
                type="text"
                placeholder="Text or URL to encode"
                aria-label="QR code text"
                value={qrText()}
                onInput={e => setQrText(e.currentTarget.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void insertQr()
                }}
              />
              <button
                type="button"
                class="deck-editor-insert-block"
                onClick={() => void insertQr()}
                disabled={!qrText().trim()}
              >
                Insert
              </button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
