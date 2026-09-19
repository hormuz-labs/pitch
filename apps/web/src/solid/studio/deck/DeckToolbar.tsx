import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChartBar,
  Code,
  Highlighter,
  Italic,
  Link,
  Link2Off,
  Minus,
  Plus,
  RemoveFormatting,
  Replace,
  Strikethrough,
  Superscript,
  Trash2,
  Underline,
} from 'lucide-solid'
import { For, type JSX, Show } from 'solid-js'
import type { LayerMode } from './blocks'
import type { DeckSel, DeckSession } from './deckSession'

const KIND_LABEL: Record<DeckSel['kind'], string> = {
  text: 'Text',
  image: 'Image',
  chart: 'Chart',
  block: 'Block',
}

const fontSizePx = (value: string | undefined) => {
  const n = Number.parseFloat(value ?? '')
  return Number.isFinite(n) ? n : 16
}

const colorInputValue = (color: string | undefined, fallback: string) =>
  color?.startsWith('#') && color.length === 7 ? color : fallback

/**
 * Floating formatting toolbar for the current deck selection. Pure chrome:
 * every action is a bridge message posted through the session; the bridge
 * owns the DOM. Positioned by DeckEditor.
 */
export function DeckToolbar(props: {
  session: DeckSession
  chartOpen: boolean
  onToggleChart: () => void
}) {
  const session = props.session
  let fileInput: HTMLInputElement | undefined
  const exec = (cmd: string, value?: string) =>
    session.post({ type: 'deck_exec', cmd, ...(value !== undefined ? { value } : {}) })
  const style = (style: Record<string, string>) => session.post({ type: 'deck_style', style })
  const sel = () => session.sel()

  const changeFontSize = (increase: boolean) => {
    const current = fontSizePx(sel()?.styles.fontSize)
    const next = increase ? current + 2 : Math.max(8, current - 2)
    style({ fontSize: `${next}px` })
  }
  const setBlockType = (tag: string) => {
    if (tag) exec('formatBlock', tag.toUpperCase())
  }
  const insertInlineCode = () =>
    exec(
      'insertHTML',
      '<code style="font-family:ui-monospace,monospace;background:rgba(0,0,0,0.08);padding:1px 6px;border-radius:4px;font-size:0.9em;">code</code>',
    )
  const insertLink = () => {
    const url = window.prompt('Link URL:', 'https://')
    if (url) exec('createLink', url)
  }
  const clearFormatting = () => {
    exec('removeFormat')
    exec('unlink')
  }
  const replaceImage = () => fileInput?.click()
  const onReplaceFile = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string')
        session.post({ type: 'deck_replace_image', src: reader.result })
    }
    reader.readAsDataURL(file)
  }
  const layer = (mode: LayerMode) => session.post({ type: 'deck_layer', mode })

  const toggle = (
    label: string,
    icon: () => JSX.Element,
    onClick: () => void,
    active?: () => boolean,
  ) => (
    <button
      type="button"
      class={`deck-editor-tool${active?.() ? ' is-active' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active?.() ?? false}
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
    >
      {icon()}
    </button>
  )

  return (
    <div
      class="deck-editor-toolbar"
      role="toolbar"
      aria-label="Deck element tools"
      onMouseDown={e => e.preventDefault()}
    >
      <span class="deck-editor-toolbar-kind">{KIND_LABEL[sel()?.kind ?? 'block']}</span>
      <span class="deck-editor-toolbar-sep" />
      <Show when={sel()?.kind === 'text'}>
        <select
          class="deck-editor-select"
          aria-label="Text style"
          title="Text style"
          value={
            ['p', 'h1', 'h2', 'h3'].includes(sel()?.styles.blockTag ?? '')
              ? sel()!.styles.blockTag
              : ''
          }
          onMouseDown={e => e.stopPropagation()}
          onChange={e => setBlockType(e.currentTarget.value)}
        >
          <option value="" disabled>
            Style
          </option>
          <option value="p">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
        <span class="deck-editor-toolbar-sep" />
        <button
          type="button"
          class="deck-editor-tool"
          title="Decrease font size"
          aria-label="Decrease font size"
          onMouseDown={e => e.preventDefault()}
          onClick={() => changeFontSize(false)}
        >
          <Minus size={14} />
        </button>
        <span class="deck-editor-font-size">{fontSizePx(sel()?.styles.fontSize)}</span>
        <button
          type="button"
          class="deck-editor-tool"
          title="Increase font size"
          aria-label="Increase font size"
          onMouseDown={e => e.preventDefault()}
          onClick={() => changeFontSize(true)}
        >
          <Plus size={14} />
        </button>
        <span class="deck-editor-toolbar-sep" />
        {toggle(
          'Bold',
          () => (
            <Bold size={14} />
          ),
          () => exec('bold'),
          () => !!sel()?.styles.bold,
        )}
        {toggle(
          'Italic',
          () => (
            <Italic size={14} />
          ),
          () => exec('italic'),
          () => !!sel()?.styles.italic,
        )}
        {toggle(
          'Underline',
          () => (
            <Underline size={14} />
          ),
          () => exec('underline'),
          () => !!sel()?.styles.underline,
        )}
        {toggle(
          'Strikethrough',
          () => (
            <Strikethrough size={14} />
          ),
          () => exec('strikeThrough'),
          () => !!sel()?.styles.strike,
        )}
        <span class="deck-editor-toolbar-sep" />
        <For each={['left', 'center', 'right'] as const}>
          {align =>
            toggle(
              `Align ${align}`,
              () =>
                align === 'left' ? (
                  <AlignLeft size={14} />
                ) : align === 'center' ? (
                  <AlignCenter size={14} />
                ) : (
                  <AlignRight size={14} />
                ),
              () => style({ textAlign: align }),
              () => sel()?.styles.align === align,
            )
          }
        </For>
        <span class="deck-editor-toolbar-sep" />
        <label class="deck-editor-tool deck-editor-color" title="Text color">
          <span class="deck-editor-color-glyph">A</span>
          <span
            class="deck-editor-color-swatch"
            style={{ background: colorInputValue(sel()?.styles.color, '#111111') }}
          />
          <input
            type="color"
            aria-label="Text color"
            value={colorInputValue(sel()?.styles.color, '#111111')}
            onChange={e => exec('foreColor', e.currentTarget.value)}
          />
        </label>
        <label class="deck-editor-tool deck-editor-color" title="Highlight">
          <Highlighter size={14} />
          <span class="deck-editor-color-swatch" style={{ background: '#fde047' }} />
          <input
            type="color"
            aria-label="Highlight color"
            value="#fde047"
            onChange={e => exec('hiliteColor', e.currentTarget.value)}
          />
        </label>
        <Show when={sel()?.styles.blockTag === 'li'}>
          <label class="deck-editor-tool deck-editor-color" title="Bullet color">
            <span
              class="deck-editor-color-dot"
              style={{ background: colorInputValue(sel()?.styles.bulletColor, '#6366f1') }}
            />
            <input
              type="color"
              aria-label="Bullet color"
              value={colorInputValue(sel()?.styles.bulletColor, '#6366f1')}
              onChange={e => style({ '--primary': e.currentTarget.value })}
            />
          </label>
        </Show>
        <Show when={!!sel()?.styles.borderColor}>
          <label class="deck-editor-tool deck-editor-color" title="Border / accent color">
            <span
              class="deck-editor-color-box"
              style={{ 'border-color': colorInputValue(sel()?.styles.borderColor, '#000000') }}
            />
            <input
              type="color"
              aria-label="Border color"
              value={colorInputValue(sel()?.styles.borderColor, '#000000')}
              onChange={e => style({ borderColor: e.currentTarget.value })}
            />
          </label>
        </Show>
        <span class="deck-editor-toolbar-sep" />
        {toggle(
          'Link',
          () => (
            <Link size={14} />
          ),
          insertLink,
        )}
        {toggle(
          'Unlink',
          () => (
            <Link2Off size={14} />
          ),
          () => exec('unlink'),
        )}
        {toggle(
          'Inline code',
          () => (
            <Code size={14} />
          ),
          insertInlineCode,
        )}
        {toggle(
          'Superscript',
          () => (
            <Superscript size={14} />
          ),
          () => exec('superscript'),
        )}
        {toggle(
          'Clear formatting',
          () => (
            <RemoveFormatting size={14} />
          ),
          clearFormatting,
        )}
        <span class="deck-editor-toolbar-sep" />
      </Show>
      <Show when={sel()?.kind === 'image'}>
        <button
          type="button"
          class="deck-editor-tool deck-editor-tool-text"
          title="Replace image"
          onClick={replaceImage}
        >
          <Replace size={14} />
          <span>Replace</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          aria-label="Choose replacement image"
          onChange={onReplaceFile}
        />
        <span class="deck-editor-toolbar-sep" />
      </Show>
      <Show when={sel()?.kind === 'chart'}>
        <button
          type="button"
          class={`deck-editor-tool deck-editor-tool-text${props.chartOpen ? ' is-active' : ''}`}
          title="Edit chart data"
          aria-pressed={props.chartOpen}
          onClick={props.onToggleChart}
        >
          <ChartBar size={14} />
          <span>Edit data</span>
        </button>
        <span class="deck-editor-toolbar-sep" />
      </Show>
      <div class="deck-editor-layers" role="group" aria-label="Layer">
        <For each={['inline', 'front', 'back'] as LayerMode[]}>
          {mode => (
            <button
              type="button"
              class="deck-editor-layer"
              title={
                mode === 'inline'
                  ? 'Inline'
                  : mode === 'front'
                    ? 'Bring to front'
                    : 'Send behind text'
              }
              aria-label={`Layer ${mode}`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => layer(mode)}
            >
              {mode === 'inline' ? 'Inline' : mode === 'front' ? 'Front' : 'Back'}
            </button>
          )}
        </For>
      </div>
      <span class="deck-editor-toolbar-sep" />
      <button
        type="button"
        class="deck-editor-tool deck-editor-tool-danger"
        title="Delete element"
        aria-label="Delete element"
        onMouseDown={e => e.preventDefault()}
        onClick={() => session.post({ type: 'deck_delete_el' })}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
