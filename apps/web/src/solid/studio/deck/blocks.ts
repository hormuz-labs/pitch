// Pure HTML factories for blocks the deck editor can insert into a slide.
// Kept framework-free and side-effect-free so the markup contract is unit-testable.
//
// `qrcode` is loaded on demand inside createQrBlockHTML rather than imported at
// the top: this module is imported eagerly for SLIDE_TEMPLATES, so a static
// import would put the whole qrcode chunk into the entry graph of every route —
// including the public landing page, which never renders a QR code.

// Layering model for free-positioned elements relative to a slide's text layer
// (the template's `.content` sits at z-index:10, so front=above, back=below).
export type LayerMode = 'inline' | 'front' | 'back'

export function layerStyle(mode: LayerMode): { position: string; zIndex: string } {
  switch (mode) {
    case 'inline':
      return { position: '', zIndex: '' }
    case 'front':
      return { position: 'absolute', zIndex: '50' }
    case 'back':
      return { position: 'absolute', zIndex: '1' }
  }
}

export type BlockType =
  | 'paragraph'
  | 'title'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'blockquote'
  | 'label'
  | 'bulleted'
  | 'numbered'
  | 'todo'
  | 'divider'
  | 'stats'
  | 'bar-stats'
  | 'process'
  | 'timeline'
  | 'columns'
  | 'pros-cons'
  | 'callout-note'
  | 'callout-info'
  | 'callout-warning'
  | 'callout-success'
  | 'callout-caution'
  | 'callout-question'

export function createBlockHTML(type: BlockType): string {
  switch (type) {
    case 'paragraph':
      return `<p style="font-size:20px;line-height:1.6;margin:16px 0;color:var(--secondary,inherit);">Add your text here</p>`
    case 'title':
      return `<h1 class="main-title" style="margin:16px 0;">Title</h1>`
    case 'heading1':
      return `<h1 style="font-size:40px;font-weight:700;margin:20px 0 12px;">Heading 1</h1>`
    case 'heading2':
      return `<h2 style="font-size:32px;font-weight:700;margin:18px 0 10px;color:var(--accent,inherit);">Heading 2</h2>`
    case 'heading3':
      return `<h3 style="font-size:26px;font-weight:600;margin:16px 0 8px;color:var(--accent,inherit);">Heading 3</h3>`
    case 'heading4':
      return `<h4 style="font-size:22px;font-weight:600;margin:14px 0 8px;color:var(--accent,inherit);">Heading 4</h4>`
    case 'blockquote':
      return `<blockquote style="border-left:4px solid var(--primary,#6366f1);padding:8px 0 8px 20px;margin:16px 0;font-size:22px;font-style:italic;color:var(--secondary,inherit);">Quote</blockquote>`
    case 'label':
      return `<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:var(--primary,#6366f1);color:#fff;font-size:13px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin:8px 0;">Label</span>`
    case 'bulleted':
      return `<ul style="font-size:20px;line-height:1.7;margin:16px 0;padding-left:28px;color:var(--secondary,inherit);"><li>First item</li><li>Second item</li><li>Third item</li></ul>`
    case 'numbered':
      return `<ol style="font-size:20px;line-height:1.7;margin:16px 0;padding-left:28px;color:var(--secondary,inherit);"><li>First item</li><li>Second item</li><li>Third item</li></ol>`
    case 'todo':
      return `<ul style="list-style:none;font-size:20px;line-height:1.9;margin:16px 0;padding-left:4px;color:var(--secondary,inherit);"><li style="display:flex;align-items:center;gap:10px;"><input type="checkbox" style="width:18px;height:18px;" />To-do item</li><li style="display:flex;align-items:center;gap:10px;"><input type="checkbox" style="width:18px;height:18px;" />Another item</li></ul>`
    case 'divider':
      return `<hr style="border:none;border-top:2px solid var(--primary,#e5e7eb);opacity:0.4;margin:24px 0;" />`
    case 'stats':
      return buildStats()
    case 'bar-stats':
      return buildBarStats()
    case 'process':
      return buildProcess()
    case 'timeline':
      return buildTimeline()
    case 'columns':
      return buildColumns()
    case 'pros-cons':
      return buildProsCons()
    case 'callout-note':
      return buildCallout('note')
    case 'callout-info':
      return buildCallout('info')
    case 'callout-warning':
      return buildCallout('warning')
    case 'callout-success':
      return buildCallout('success')
    case 'callout-caution':
      return buildCallout('caution')
    case 'callout-question':
      return buildCallout('question')
  }
}

type CalloutKind = 'note' | 'info' | 'warning' | 'success' | 'caution' | 'question'

const CALLOUT_STYLES: Record<CalloutKind, { accent: string; bg: string; label: string }> = {
  note: { accent: '#64748b', bg: '#f1f5f9', label: 'Note' },
  info: { accent: '#2563eb', bg: '#eff6ff', label: 'Info' },
  warning: { accent: '#d97706', bg: '#fffbeb', label: 'Warning' },
  success: { accent: '#16a34a', bg: '#f0fdf4', label: 'Success' },
  caution: { accent: '#dc2626', bg: '#fef2f2', label: 'Caution' },
  question: { accent: '#7c3aed', bg: '#f5f3ff', label: 'Question' },
}

function buildCallout(kind: CalloutKind): string {
  const { accent, bg, label } = CALLOUT_STYLES[kind]
  return (
    `<div role="note" style="display:flex;gap:12px;align-items:flex-start;border-left:4px solid ${accent};background:${bg};border-radius:10px;padding:16px 18px;margin:16px 0;">` +
    `<span aria-hidden="true" style="width:10px;height:10px;border-radius:999px;background:${accent};margin-top:8px;flex:0 0 auto;"></span>` +
    `<div style="flex:1;"><strong style="display:block;color:${accent};font-size:13px;letter-spacing:0.4px;text-transform:uppercase;margin-bottom:4px;">${label}</strong>` +
    `<span style="font-size:18px;line-height:1.5;color:#1f2937;">Add your ${label.toLowerCase()} text here.</span></div></div>`
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────
// Curated inline-SVG path data (24x24, stroke-based) keyed by name.
const ICON_PATHS: Record<string, string> = {
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  heart:
    '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  target:
    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  rocket:
    '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  globe:
    '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  lightbulb:
    '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  chart:
    '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
}

export const ICONS: string[] = Object.keys(ICON_PATHS)

export function createIconBlockHTML(name: string, color = 'var(--primary,#6366f1)'): string {
  const path = ICON_PATHS[name]
  if (!path) return ''
  return `<svg role="img" aria-label="${escapeAttr(name)} icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;margin:12px 0;vertical-align:middle;">${path}</svg>`
}

// ── QR codes ─────────────────────────────────────────────────────────────────
export async function createQrBlockHTML(text: string): Promise<string> {
  const value = text.trim()
  if (!value) return ''
  const QRCode = await import('qrcode')
  const dataUrl = await QRCode.toDataURL(value, { margin: 1, width: 320 })
  return `<img src="${dataUrl}" alt="QR code for ${escapeAttr(value)}" style="display:block;width:180px;height:180px;border-radius:8px;margin:16px 0;" />`
}

/** Escape a string for safe use inside a double-quoted HTML attribute. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** True for URLs safe to drop into src (blocks javascript:, vbscript:, etc.). */
function isSafeUrl(url: string): boolean {
  const trimmed = url.trim()
  if (/^(https?:|data:image\/|\/|\.|#)/i.test(trimmed)) return true
  // Relative paths without a scheme are fine; reject anything with a dangerous scheme.
  return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
}

export function createImageBlockHTML(src: string, alt = 'Image'): string {
  if (!src || !isSafeUrl(src)) return ''
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" style="display:block;max-width:100%;height:auto;border-radius:12px;margin:16px 0;" />`
}

const clampDim = (n: number) => Math.max(1, Math.min(20, Math.floor(n) || 1))

/** Build a table of any size (rows × cols). First row is a styled header. */
export function createTableHTML(rowCount: number, colCount: number): string {
  const rowsN = clampDim(rowCount)
  const colsN = clampDim(colCount)
  const cellBase =
    'border:1px solid var(--primary,#cbd5e1);padding:10px 14px;font-size:16px;text-align:left;'
  const rows: string[] = []
  for (let r = 0; r < rowsN; r++) {
    const cells: string[] = []
    for (let c = 0; c < colsN; c++) {
      if (r === 0) {
        cells.push(
          `<th style="${cellBase}font-weight:700;background:var(--primary,#6366f1);color:#fff;">Header ${c + 1}</th>`,
        )
      } else {
        cells.push(`<td style="${cellBase}color:var(--secondary,inherit);">Cell</td>`)
      }
    }
    rows.push(`<tr>${cells.join('')}</tr>`)
  }
  return `<table style="border-collapse:collapse;width:100%;margin:16px 0;">${rows.join('')}</table>`
}

// ── Smart layouts (infographic blocks — pure HTML/CSS, text editable) ────────
function buildStats(): string {
  const item = (num: string, label: string) =>
    `<div data-stat style="flex:1;text-align:center;"><div style="font-size:52px;font-weight:800;color:var(--accent,#111827);line-height:1;">${num}</div><div style="font-size:16px;color:var(--secondary,#6b7280);margin-top:8px;">${label}</div></div>`
  return `<div style="display:flex;gap:24px;margin:20px 0;">${item('75%', 'Faster delivery')}${item('3×', 'More output')}${item('120+', 'Happy clients')}</div>`
}

function buildBarStats(): string {
  const bar = (label: string, pct: number) =>
    `<div data-bar style="margin:12px 0;"><div style="display:flex;justify-content:space-between;font-size:15px;color:var(--secondary,#374151);margin-bottom:4px;"><span>${label}</span><span>${pct}%</span></div><div style="height:12px;border-radius:999px;background:rgba(0,0,0,0.08);overflow:hidden;"><div style="height:100%;width:${pct}%;background:var(--primary,#6366f1);border-radius:999px;"></div></div></div>`
  return `<div style="margin:20px 0;">${bar('Category A', 80)}${bar('Category B', 60)}${bar('Category C', 45)}</div>`
}

function buildProcess(): string {
  const step = (n: number, title: string) =>
    `<div data-step style="flex:1;text-align:center;"><div style="width:44px;height:44px;border-radius:999px;background:var(--primary,#6366f1);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;">${n}</div><div style="font-size:16px;font-weight:600;color:var(--secondary,#374151);">${title}</div></div>`
  return `<div style="display:flex;gap:20px;align-items:flex-start;margin:20px 0;">${step(1, 'Plan')}${step(2, 'Build')}${step(3, 'Ship')}</div>`
}

function buildTimeline(): string {
  const entry = (when: string, what: string) =>
    `<li data-tl style="position:relative;padding:0 0 18px 24px;border-left:2px solid var(--primary,#6366f1);"><span aria-hidden="true" style="position:absolute;left:-7px;top:2px;width:12px;height:12px;border-radius:999px;background:var(--primary,#6366f1);"></span><strong style="display:block;font-size:15px;color:var(--accent,#111827);">${when}</strong><span style="font-size:15px;color:var(--secondary,#6b7280);">${what}</span></li>`
  return `<ul style="list-style:none;margin:20px 0;padding:0;">${entry('2024', 'Founded')}${entry('2025', 'Series A')}${entry('2026', 'Global launch')}</ul>`
}

function buildColumns(): string {
  const col = () =>
    `<div data-col style="flex:1;"><h3 style="font-size:22px;font-weight:700;color:var(--accent,#111827);margin:0 0 8px;">Heading</h3><p style="font-size:17px;line-height:1.6;color:var(--secondary,#6b7280);margin:0;">Add supporting text in this column.</p></div>`
  return `<div style="display:flex;gap:32px;margin:20px 0;">${col()}${col()}</div>`
}

function buildProsCons(): string {
  const box = (title: string, accent: string, items: string[]) =>
    `<div style="flex:1;border:1px solid ${accent}33;background:${accent}0d;border-radius:12px;padding:16px 18px;"><strong style="display:block;color:${accent};text-transform:uppercase;letter-spacing:0.4px;font-size:13px;margin-bottom:8px;">${title}</strong><ul style="margin:0;padding-left:20px;font-size:16px;line-height:1.7;color:#1f2937;">${items.map(i => `<li>${i}</li>`).join('')}</ul></div>`
  return `<div style="display:flex;gap:20px;margin:20px 0;">${box('Pros', '#16a34a', ['Benefit one', 'Benefit two'])}${box('Cons', '#dc2626', ['Drawback one', 'Drawback two'])}</div>`
}

// ── Data charts (Chart.js configs) ───────────────────────────────────────────
export type ChartKind = 'bar' | 'line' | 'pie'
export interface ChartConfig {
  type: ChartKind
  data: { labels: string[]; datasets: Record<string, unknown>[] }
  options: Record<string, unknown>
}

export function createChartConfig(kind: ChartKind): ChartConfig {
  const labels = ['Q1', 'Q2', 'Q3', 'Q4']
  const data = [12, 19, 8, 15]
  const palette = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444']
  const dataset: Record<string, unknown> = { label: 'Series 1', data }
  if (kind === 'pie') {
    dataset.backgroundColor = palette
    dataset.borderColor = '#ffffff'
    dataset.borderWidth = 2
  } else {
    dataset.backgroundColor = '#6366f1'
    dataset.borderColor = '#4f46e5'
    dataset.borderWidth = 2
    if (kind === 'line') {
      dataset.fill = false
      dataset.tension = 0.35
    }
  }
  return {
    type: kind,
    data: { labels, datasets: [dataset] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: kind === 'pie' } },
    },
  }
}

// ── New-slide templates ──────────────────────────────────────────────────────
// Each renders a full `.slide` (the deck CSS sizes it to 1280×720 and applies --bg).
export type SlideTemplate = 'blank' | 'title' | 'title-content' | 'two-column' | 'section'

export const SLIDE_TEMPLATES: { id: SlideTemplate; label: string }[] = [
  { id: 'blank', label: 'Blank' },
  { id: 'title', label: 'Title' },
  { id: 'title-content', label: 'Title + content' },
  { id: 'two-column', label: 'Two columns' },
  { id: 'section', label: 'Section header' },
]

export function createSlideHTML(template: SlideTemplate): string {
  const slide = (inner: string, extraContentStyle = '') =>
    `<div class="slide" style="width:1280px;height:720px;position:relative;overflow:hidden;"><div class="content" style="padding:80px;height:100%;box-sizing:border-box;${extraContentStyle}">${inner}</div></div>`

  switch (template) {
    case 'title':
      return slide(
        `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">` +
          `<h1 class="main-title" style="margin:0;">Presentation title</h1>` +
          `<p class="subtitle" style="margin-top:16px;">Add a subtitle</p></div>`,
      )
    case 'title-content':
      return slide(
        `<h1>Slide title</h1><p style="font-size:22px;line-height:1.6;">Add your content here.</p>`,
      )
    case 'two-column':
      return slide(
        `<h1>Slide title</h1>` +
          `<div style="display:flex;gap:48px;margin-top:24px;">` +
          `<div data-col style="flex:1;"><h3 style="font-size:24px;margin:0 0 10px;">Column one</h3><p style="font-size:19px;line-height:1.6;margin:0;">Text…</p></div>` +
          `<div data-col style="flex:1;"><h3 style="font-size:24px;margin:0 0 10px;">Column two</h3><p style="font-size:19px;line-height:1.6;margin:0;">Text…</p></div></div>`,
      )
    case 'section':
      return slide(
        `<div style="height:100%;display:flex;flex-direction:column;justify-content:center;">` +
          `<span style="display:inline-block;width:60px;height:6px;background:var(--primary,#6366f1);border-radius:999px;margin-bottom:24px;"></span>` +
          `<h1 style="font-size:64px;border:none;padding:0;margin:0;">Section name</h1></div>`,
      )
    default:
      return slide('')
  }
}

// ── Searchable block registry ────────────────────────────────────────────────
export interface BlockEntry {
  type: BlockType
  label: string
  group: string
  keywords: string
}

export const ALL_BLOCKS: BlockEntry[] = [
  { type: 'title', label: 'Title', group: 'Text', keywords: 'title cover main heading' },
  { type: 'heading1', label: 'Heading 1', group: 'Text', keywords: 'h1 heading header' },
  { type: 'heading2', label: 'Heading 2', group: 'Text', keywords: 'h2 heading header subheading' },
  { type: 'heading3', label: 'Heading 3', group: 'Text', keywords: 'h3 heading header' },
  { type: 'heading4', label: 'Heading 4', group: 'Text', keywords: 'h4 heading header' },
  { type: 'paragraph', label: 'Text', group: 'Text', keywords: 'paragraph body text copy' },
  { type: 'blockquote', label: 'Quote', group: 'Text', keywords: 'quote blockquote citation' },
  { type: 'label', label: 'Label', group: 'Text', keywords: 'label tag pill chip badge' },
  {
    type: 'bulleted',
    label: 'Bulleted list',
    group: 'Lists',
    keywords: 'bullet list unordered points',
  },
  {
    type: 'numbered',
    label: 'Numbered list',
    group: 'Lists',
    keywords: 'number ordered list steps',
  },
  { type: 'todo', label: 'To-do list', group: 'Lists', keywords: 'todo checklist checkbox tasks' },
  { type: 'divider', label: 'Divider', group: 'Text', keywords: 'divider hr line separator rule' },
  {
    type: 'stats',
    label: 'Stats',
    group: 'Smart layouts',
    keywords: 'stats numbers metrics kpi figures',
  },
  {
    type: 'bar-stats',
    label: 'Bar stats',
    group: 'Smart layouts',
    keywords: 'bar bars chart graph progress percent',
  },
  {
    type: 'process',
    label: 'Process steps',
    group: 'Smart layouts',
    keywords: 'process steps flow stages timeline',
  },
  {
    type: 'timeline',
    label: 'Timeline',
    group: 'Smart layouts',
    keywords: 'timeline history milestones dates',
  },
  {
    type: 'columns',
    label: 'Two columns',
    group: 'Smart layouts',
    keywords: 'columns split two layout',
  },
  {
    type: 'pros-cons',
    label: 'Pros & cons',
    group: 'Smart layouts',
    keywords: 'pros cons compare versus advantages',
  },
  { type: 'callout-note', label: 'Note', group: 'Callouts', keywords: 'callout note box' },
  {
    type: 'callout-info',
    label: 'Info',
    group: 'Callouts',
    keywords: 'callout info information box',
  },
  {
    type: 'callout-warning',
    label: 'Warning',
    group: 'Callouts',
    keywords: 'callout warning caution box',
  },
  {
    type: 'callout-success',
    label: 'Success',
    group: 'Callouts',
    keywords: 'callout success done box',
  },
  {
    type: 'callout-caution',
    label: 'Caution',
    group: 'Callouts',
    keywords: 'callout caution danger box',
  },
  {
    type: 'callout-question',
    label: 'Question',
    group: 'Callouts',
    keywords: 'callout question faq box',
  },
]

export function searchBlocks(query: string): BlockEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return ALL_BLOCKS
  return ALL_BLOCKS.filter(
    b =>
      b.label.toLowerCase().includes(q) ||
      b.keywords.includes(q) ||
      b.group.toLowerCase().includes(q),
  )
}
