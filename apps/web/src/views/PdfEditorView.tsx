import { useAuth } from '@clerk/clerk-react'
import { toPng } from 'html-to-image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { PdfProgressWidget } from '../components/PdfProgressWidget'
import { PitchLogoAnimation } from '../components/PitchLogoAnimation'
import { api } from '../lib/api'
import {
  type BlockType,
  type ChartKind,
  createBlockHTML,
  createChartConfig,
  createIconBlockHTML,
  createImageBlockHTML,
  createQrBlockHTML,
  createSlideHTML,
  createTableHTML,
  ICONS,
  type LayerMode,
  layerStyle,
  type SlideTemplate,
  searchBlocks,
} from '../lib/slideBlocks'
import type { Project } from '../types'

interface PdfEditorViewProps {
  projects: Project[]
  setPdfSlides?: (slides: { id: number; title: string; srcDoc?: string }[]) => void
  activePdfSlide?: number
  setActivePdfSlide?: (slide: number) => void
  setOnScrollToPdfSlide?: (scrollFn: ((index: number) => void) | null) => void
  setOnAddPdfSlide?: (fn: ((template: string) => void) | null) => void
  setOnReorderPdfSlides?: (fn: ((from: number, to: number) => void) | null) => void
  setOnSetPdfSlideBg?: (fn: ((index: number, color: string) => void) | null) => void
  setOnDeletePdfSlide?: (fn: ((index: number) => void) | null) => void
}

const normalizeColor = (col: string): string => {
  if (!col) return ''
  const trimmed = col.trim().toLowerCase()
  if (trimmed === 'transparent' || trimmed === 'rgba(0, 0, 0, 0)') return 'transparent'
  if (trimmed.startsWith('#')) return trimmed
  const match = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/)
  if (match) {
    const r = parseInt(match[1], 10)
    const g = parseInt(match[2], 10)
    const b = parseInt(match[3], 10)
    const a = match[4] ? parseFloat(match[4]) : 1
    if (a === 0) return 'transparent'
    const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
    return hex
  }
  return trimmed
}

const BG_PRESETS = ['transparent', '#ffffff', '#000000', '#0a0a0a', '#0f172a', '#1f2937', '#f3f4f6']

export const PdfEditorView = ({
  projects,
  setPdfSlides,
  setActivePdfSlide,
  setOnScrollToPdfSlide,
  setOnAddPdfSlide,
  setOnReorderPdfSlides,
  setOnSetPdfSlideBg,
  setOnDeletePdfSlide,
}: PdfEditorViewProps) => {
  const navigate = useNavigate()
  const { id } = useParams()
  const { getToken } = useAuth()

  const selectedProject = projects.find(p => p.id === id)

  const [htmlContent, setHtmlContent] = useState<string>('')
  const [loadingHtml, setLoadingHtml] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [slides, setSlides] = useState<{ id: number; title: string; srcDoc?: string }[]>([])
  const [activeSlide, setActiveSlide] = useState<number>(0)
  const [scale, setScale] = useState(1)
  const [docHeight, setDocHeight] = useState(720)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [railPanel, setRailPanel] = useState<
    null | 'search' | 'text' | 'tables' | 'media' | 'smart' | 'charts' | 'slide'
  >(null)
  const [mediaUrl, setMediaUrl] = useState('')
  const [qrText, setQrText] = useState('')
  const [blockSearch, setBlockSearch] = useState('')
  const [tableHover, setTableHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  // When the user requests the server PDF while it's still regenerating in the
  // background, we flip this on, show "Preparing…", and auto-download once ready.
  const [awaitingServerPdf, setAwaitingServerPdf] = useState(false)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const scaleRef = useRef(1)
  const loadedHtmlUrlRef = useRef<string>('')
  const insertFileInputRef = useRef<HTMLInputElement>(null)
  const addSlideRef = useRef<(t: string) => void>(() => {})
  const reorderRef = useRef<(f: number, t: number) => void>(() => {})
  const setSlideBgRef = useRef<(index: number, color: string) => void>(() => {})
  const deleteSlideRef = useRef<(index: number) => void>(() => {})
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const activeImageRef = useRef<{ id: string; src: string } | null>(null)

  // Scroll active slide into view within the outer canvas (slides flow as a tall scaled document)
  const scrollToSlide = useCallback((index: number) => {
    setActiveSlide(index)
    const iframe = iframeRef.current
    const main = containerRef.current
    if (!iframe?.contentDocument || !main) return

    const targetSlide = iframe.contentDocument.getElementById(
      `slide-node-${index}`,
    ) as HTMLElement | null
    if (targetSlide) {
      // Map the slide's position inside the (unscaled) iframe to the scaled outer canvas.
      const top = targetSlide.offsetTop * scaleRef.current
      main.scrollTo({ top: Math.max(0, top - 24), behavior: 'smooth' })
    }
  }, [])

  // Canva-like color extraction and bulk states
  const [, setSlideColorsHash] = useState<number>(0)

  // Styling editor states
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null)
  const [selectedColor, setSelectedColor] = useState<string>('')
  const [selectedFontSize, setSelectedFontSize] = useState<string>('')
  const [toolbarPos, setToolbarPos] = useState<{
    top: number
    left: number
    bottom: number
  } | null>(null)
  const [textFormat, setTextFormat] = useState<{
    bold: boolean
    italic: boolean
    underline: boolean
    align: string
  }>({ bold: false, italic: false, underline: false, align: 'left' })
  const [layerMode, setLayerMode] = useState<LayerMode>('inline')
  const [selBox, setSelBox] = useState<{
    cx: number
    cy: number
    w: number
    h: number
    angle: number
  } | null>(null)
  const [highlightColor, setHighlightColor] = useState('#fde047')
  const [showHint, setShowHint] = useState(
    () => localStorage.getItem('pdfEditorHintDismissed') !== '1',
  )
  const [selectedBulletColor, setSelectedBulletColor] = useState<string>('')
  const [selectedBorderColor, setSelectedBorderColor] = useState<string>('')
  const [chartData, setChartData] = useState<number[]>([])
  const [chartLabels, setChartLabels] = useState<string[]>([])
  const [chartBgColor, setChartBgColor] = useState<string>('')
  const [chartBorderColor, setChartBorderColor] = useState<string>('')

  // Build a standalone srcDoc per slide for the left thumbnail rail (head styles + that slide only).
  // Scripts are intentionally omitted so 10+ mini iframes stay cheap; charts render blank in previews.
  useEffect(() => {
    // TopHeader renders #pdf-editor-header-actions when isPdfEditorPage is true
    setPortalTarget(document.getElementById('pdf-editor-header-actions'))
  }, [])

  // Synchronize slides list (with live preview srcDocs) to the main Sidebar context
  useEffect(() => {
    if (setPdfSlides) setPdfSlides(slides)
  }, [slides, setPdfSlides])

  // Synchronize active slide selection to the main Sidebar context
  useEffect(() => {
    if (setActivePdfSlide) {
      setActivePdfSlide(activeSlide)
    }
  }, [activeSlide, setActivePdfSlide])

  // Expose scroll callback to the main Sidebar context
  useEffect(() => {
    if (setOnScrollToPdfSlide) {
      setOnScrollToPdfSlide(() => (index: number) => {
        scrollToSlide(index)
      })
    }
    return () => {
      if (setOnScrollToPdfSlide) {
        setOnScrollToPdfSlide(null)
      }
    }
  }, [setOnScrollToPdfSlide, scrollToSlide])

  // Expose add-slide, reorder, delete callbacks to the Sidebar (stable wrappers → latest via refs)
  useEffect(() => {
    // Wrap in an outer () => so React stores the function instead of treating it as a state updater
    setOnAddPdfSlide?.(() => (t: string) => addSlideRef.current(t))
    setOnReorderPdfSlides?.(() => (f: number, to: number) => reorderRef.current(f, to))
    setOnSetPdfSlideBg?.(
      () => (index: number, color: string) => setSlideBgRef.current(index, color),
    )
    setOnDeletePdfSlide?.(() => (index: number) => deleteSlideRef.current(index))
    return () => {
      setOnAddPdfSlide?.(null)
      setOnReorderPdfSlides?.(null)
      setOnSetPdfSlideBg?.(null)
      setOnDeletePdfSlide?.(null)
    }
  }, [setOnAddPdfSlide, setOnReorderPdfSlides, setOnSetPdfSlideBg, setOnDeletePdfSlide])

  // Reset parent navigation state upon unmount
  useEffect(() => {
    return () => {
      if (setPdfSlides) setPdfSlides([])
      if (setActivePdfSlide) setActivePdfSlide(0)
      if (setOnScrollToPdfSlide) setOnScrollToPdfSlide(null)
    }
  }, [setPdfSlides, setActivePdfSlide, setOnScrollToPdfSlide])

  // 1. Scale each 1280-wide slide to fit the canvas width (slides flow vertically -> outer scroll)
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return
      const width = containerRef.current.clientWidth
      // Fit width with comfortable side gutters; cap so cards never blow up past ~1080px wide
      const fit = (width - 96) / 1280
      const calculatedScale = Math.min(fit, 1080 / 1280)
      const next = calculatedScale > 0.2 ? calculatedScale : 0.2
      scaleRef.current = next
      setScale(next)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Map a selected element's (unscaled, iframe-local) rect to fixed screen coords for the toolbar.
  const computeToolbarPosFor = (el: HTMLElement) => {
    const iframe = iframeRef.current
    if (!iframe) return null
    const hostRect = iframe.getBoundingClientRect() // reflects the scale transform
    const elRect = el.getBoundingClientRect()
    return {
      top: hostRect.top + elRect.top * scaleRef.current,
      left: hostRect.left + (elRect.left + elRect.width / 2) * scaleRef.current,
      bottom: hostRect.top + elRect.bottom * scaleRef.current,
    }
  }

  // Unrotated element size — offsetWidth/Height for HTML, getBoundingClientRect for SVG (no offset*)
  const elSize = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    return { w: el.offsetWidth || r.width, h: el.offsetHeight || r.height }
  }

  const currentAngleDeg = (el: HTMLElement) => {
    const m = (el.style.transform || '').match(/rotate\(([-\d.]+)deg\)/)
    return m ? parseFloat(m[1]) : 0
  }

  // Screen-space oriented box for the selection overlay (center + unrotated size + angle).
  const computeSelBox = (el: HTMLElement) => {
    const iframe = iframeRef.current
    if (!iframe) return null
    const hostRect = iframe.getBoundingClientRect()
    const r = el.getBoundingClientRect() // AABB; its center is the element's true center under rotation
    const s = scaleRef.current
    const { w, h } = elSize(el)
    return {
      cx: hostRect.left + (r.left + r.width / 2) * s,
      cy: hostRect.top + (r.top + r.height / 2) * s,
      w: w * s,
      h: h * s,
      angle: currentAngleDeg(el),
    }
  }

  // 1b. Position the floating toolbar + selection box for the selected element (skip charts)
  useEffect(() => {
    if (!selectedEl || selectedEl.tagName === 'CANVAS') {
      setToolbarPos(null)
      setSelBox(null)
      return
    }

    const updatePos = () => {
      const pos = computeToolbarPosFor(selectedEl)
      if (pos) setToolbarPos(pos)
      const box = computeSelBox(selectedEl)
      if (box) setSelBox(box)
    }

    updatePos()

    // Read current formatting of the selected element
    const cs = window.getComputedStyle(selectedEl)
    setTextFormat({
      bold: (parseInt(cs.fontWeight, 10) || 400) >= 600,
      italic: cs.fontStyle === 'italic',
      underline: cs.textDecorationLine?.includes('underline') ?? false,
      align: selectedEl.style.textAlign || cs.textAlign || 'left',
    })

    // Detect current layer mode from positioning + stacking
    if (cs.position === 'absolute') {
      setLayerMode((parseInt(cs.zIndex, 10) || 0) >= 10 ? 'front' : 'back')
    } else {
      setLayerMode('inline')
    }

    const iframeDoc = iframeRef.current?.contentDocument
    const mainEl = containerRef.current
    iframeDoc?.addEventListener('scroll', updatePos, true)
    mainEl?.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      iframeDoc?.removeEventListener('scroll', updatePos, true)
      mainEl?.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [selectedEl])

  // 1c. Track which slide is in view as the canvas scrolls -> highlight in the thumbnail rail
  useEffect(() => {
    const main = containerRef.current
    if (!main || !htmlContent) return

    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const doc = iframeRef.current?.contentDocument
        if (!doc) return
        const viewMid = (main.scrollTop + main.clientHeight / 2) / scaleRef.current
        const slideEls = doc.querySelectorAll('.slide')
        let current = 0
        slideEls.forEach((el, i) => {
          const top = (el as HTMLElement).offsetTop
          if (viewMid >= top) current = i
        })
        setActiveSlide(prev => (prev === current ? prev : current))
      })
    }

    main.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      main.removeEventListener('scroll', onScroll)
    }
  }, [htmlContent])

  // 2. Fetch the raw presentation HTML from storage.
  // Guard: skip re-fetch when the URL hasn't changed (e.g. SSE update after save)
  // so that a completed drag-reorder or any in-progress edit is never overwritten.
  useEffect(() => {
    if (selectedProject?.status !== 'COMPLETED') return

    const htmlUrl = selectedProject.parameters?.htmlUrl
    if (!htmlUrl) {
      setLoadingHtml(false)
      return
    }

    if (htmlUrl === loadedHtmlUrlRef.current) return
    loadedHtmlUrlRef.current = htmlUrl

    setLoadingHtml(true)
    fetch(htmlUrl)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch presentation HTML')
        return res.text()
      })
      .then(text => {
        setHtmlContent(text)
        setLoadingHtml(false)
      })
      .catch(err => {
        console.error('Error fetching presentation HTML:', err)
        setLoadingHtml(false)
      })
  }, [selectedProject])

  // Make a single text element editable + selectable (shared by initial load and inserted blocks)
  const wireTextEl = (el: Element, doc: Document) => {
    el.setAttribute('contenteditable', 'true')
    el.setAttribute('spellcheck', 'false')

    el.addEventListener('click', e => {
      e.stopPropagation()

      doc
        .querySelectorAll('.selected-for-styling')
        .forEach(item => item.classList.remove('selected-for-styling'))
      el.classList.add('selected-for-styling')

      const htmlEl = el as HTMLElement
      setSelectedEl(htmlEl)
      setSelectedColor(htmlEl.style.color || window.getComputedStyle(htmlEl).color)
      setSelectedFontSize(htmlEl.style.fontSize || window.getComputedStyle(htmlEl).fontSize)

      const computedStyle = window.getComputedStyle(htmlEl)
      const hasBorder =
        parseFloat(computedStyle.borderLeftWidth) > 0 ||
        parseFloat(computedStyle.borderTopWidth) > 0
      if (hasBorder) {
        const borderCol =
          htmlEl.style.borderLeftColor ||
          htmlEl.style.borderTopColor ||
          computedStyle.borderLeftColor ||
          computedStyle.borderTopColor
        setSelectedBorderColor(normalizeColor(borderCol))
      } else {
        setSelectedBorderColor('')
      }

      if (htmlEl.tagName === 'LI') {
        const bulColor =
          htmlEl.style.getPropertyValue('--primary') ||
          window.getComputedStyle(htmlEl).getPropertyValue('--primary')
        setSelectedBulletColor(bulColor.trim())
      } else {
        setSelectedBulletColor('')
      }

      const parentSlide = el.closest('.slide')
      if (parentSlide) {
        const index = parseInt(
          (parentSlide.getAttribute('id') || '').replace('slide-node-', ''),
          10,
        )
        if (!Number.isNaN(index)) setActiveSlide(index)
      }
    })

    el.addEventListener('input', () => {
      setSaveStatus('idle')
      setSlideColorsHash(prev => prev + 1)
    })
  }

  // Select a non-text element (image, icon, table, callout…) so its toolbar (layer/drag/delete) shows
  const selectElement = (el: HTMLElement, doc: Document) => {
    doc
      .querySelectorAll('.selected-for-styling')
      .forEach(item => item.classList.remove('selected-for-styling'))
    el.classList.add('selected-for-styling')
    setSelectedEl(el)
    setSelectedBorderColor('')
    // If this is a chart wrapper, load its chart data into the editor popover
    if (el.hasAttribute('data-chart')) {
      const canvas = el.querySelector('canvas')
      if (canvas) loadChartData(canvas as HTMLCanvasElement, doc)
    }
    const parentSlide = el.closest('.slide')
    if (parentSlide) {
      const index = parseInt((parentSlide.getAttribute('id') || '').replace('slide-node-', ''), 10)
      if (!Number.isNaN(index)) setActiveSlide(index)
    }
  }

  const wireSelectableEl = (el: HTMLElement, doc: Document) => {
    el.addEventListener('click', e => {
      e.stopPropagation()
      selectElement(el, doc)
    })
  }

  // Images: click selects (toolbar offers Replace/layer/drag/delete) — replacement no longer auto-fires
  const wireImageEl = (img: HTMLImageElement, doc: Document) => {
    if (!img.id) img.id = `editable-img-${Math.random().toString(36).slice(2, 9)}`
    img.addEventListener('click', e => {
      e.stopPropagation()
      selectElement(img, doc)
    })
  }

  // Resolve the chart canvas from whatever is selected (the canvas itself, or our chart wrapper)
  const getSelectedCanvas = (): HTMLCanvasElement | null => {
    if (!selectedEl) return null
    if (selectedEl.tagName === 'CANVAS') return selectedEl as HTMLCanvasElement
    return selectedEl.querySelector('canvas')
  }

  // Load a canvas's chart data into the editor popover state
  const loadChartData = (canvas: HTMLCanvasElement, doc: Document) => {
    const iframeWin = doc.defaultView as any
    const chart = iframeWin?.Chart?.getChart(canvas)
    if (chart?.data.datasets?.[0]) {
      const dataset = chart.data.datasets[0]
      setChartData([...(dataset.data || [])] as number[])
      setChartLabels([...(chart.data.labels || [])] as string[])
      const bgCol = Array.isArray(dataset.backgroundColor)
        ? dataset.backgroundColor[0]
        : dataset.backgroundColor
      setChartBgColor(normalizeColor(bgCol || '#3b82f6'))
      const borderCol = Array.isArray(dataset.borderColor)
        ? dataset.borderColor[0]
        : dataset.borderColor
      setChartBorderColor(normalizeColor(borderCol || '#2563eb'))
    }
  }

  // Native (AI-generated) chart canvases: click selects the canvas + loads its data
  const wireCanvasEl = (canvas: HTMLCanvasElement, doc: Document) => {
    if (!canvas.id) canvas.id = `chart_${Math.random().toString(36).slice(2, 9)}`
    canvas.addEventListener('click', e => {
      e.stopPropagation()
      doc
        .querySelectorAll('.selected-for-styling')
        .forEach(item => item.classList.remove('selected-for-styling'))
      canvas.classList.add('selected-for-styling')
      setSelectedEl(canvas as HTMLElement)
      loadChartData(canvas, doc)
      const parentSlide = canvas.closest('.slide')
      if (parentSlide) {
        const index = parseInt(
          (parentSlide.getAttribute('id') || '').replace('slide-node-', ''),
          10,
        )
        if (!Number.isNaN(index)) setActiveSlide(index)
      }
    })
  }

  // Slide-level click: select the slide (reads its id at click time so it survives reordering)
  const wireSlideEl = (slideEl: Element, doc: Document) => {
    slideEl.addEventListener('click', () => {
      const idx = parseInt((slideEl.getAttribute('id') || '').replace('slide-node-', ''), 10)
      if (!Number.isNaN(idx)) setActiveSlide(idx)
      doc
        .querySelectorAll('.selected-for-styling')
        .forEach(item => item.classList.remove('selected-for-styling'))
      setSelectedEl(null)
      setSelectedBorderColor('')
      setChartData([])
      setChartLabels([])
      setChartBgColor('')
      setChartBorderColor('')
    })
  }

  // Re-tag slide ids, refresh titles, and rebuild live preview srcDocs (excludes editor-only CSS).
  // Called after load and after any structural change (insert / add slide / reorder).
  const rebuildSlidesFromDom = () => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const headClone = doc.head.cloneNode(true) as HTMLElement
    headClone.querySelector('#pitch-editor-style')?.remove()
    const headHtml = headClone.innerHTML
    const meta = Array.from(doc.querySelectorAll('.slide')).map((el, i) => {
      el.setAttribute('id', `slide-node-${i}`)
      const h = el.querySelector('h1, .main-title')
      const title = h?.textContent?.trim() || `Slide ${i + 1}`
      const clone = el.cloneNode(true) as HTMLElement
      clone.classList.remove('selected-for-styling')
      clone
        .querySelectorAll('.selected-for-styling')
        .forEach(n => n.classList.remove('selected-for-styling'))
      clone.querySelectorAll('[contenteditable]').forEach(n => n.removeAttribute('contenteditable'))
      const srcDoc = `<!DOCTYPE html><html><head>${headHtml}<style>html,body{margin:0;padding:0;overflow:hidden;pointer-events:none;}.slide{margin:0!important;box-shadow:none!important;border-radius:0!important;}</style></head><body>${clone.outerHTML}</body></html>`
      return { id: i, title, srcDoc }
    })
    setSlides(meta)
  }

  // 3. Inject interactive handlers (contentEditable & image upload click) once iframe loads
  const handleIframeLoad = () => {
    const iframe = iframeRef.current
    if (!iframe?.contentDocument) return

    const doc = iframe.contentDocument

    // Inject styles for helper overlays in editor mode (stripped before saving)
    const style = doc.createElement('style')
    style.id = 'pitch-editor-style'
    style.textContent = `
      [contenteditable="true"] {
        transition: box-shadow 0.15s ease, background-color 0.15s ease;
        border-radius: 4px;
        cursor: text;
      }
      [contenteditable="true"]:hover {
        box-shadow: 0 0 0 1.5px #6366f1 !important;
        background-color: rgba(99, 102, 241, 0.06) !important;
      }
      [contenteditable="true"]:focus {
        box-shadow: 0 0 0 2px #4f46e5 !important;
        background-color: rgba(99, 102, 241, 0.04) !important;
        outline: none;
      }
      .selected-for-styling {
        box-shadow: 0 0 0 2px #10b981 !important; /* Premium emerald selection */
        border-radius: 4px;
      }
      img, canvas {
        transition: box-shadow 0.15s ease, opacity 0.15s ease;
      }
      img:hover, canvas:hover {
        box-shadow: 0 0 0 2px #6366f1 !important;
        cursor: pointer;
        opacity: 0.92;
      }
      /* Gamma-style stacked slide cards on a neutral canvas */
      html, body {
        background: transparent !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .slide {
        margin: 0 0 32px 0 !important;
        border-radius: 18px !important;
        overflow: hidden !important;
        box-shadow: 0 1px 2px rgba(16,24,40,0.06), 0 12px 32px rgba(16,24,40,0.12) !important;
      }
      .slide:last-child { margin-bottom: 0 !important; }
    `
    doc.head.appendChild(style)

    // Make text contentEditable
    const selectors =
      'h1, p, li, .subtitle, .stat-num, .stat-label, .stat-desc, .si-card-heading, .si-card-body, .main-title, .chart-source'
    doc.querySelectorAll(selectors).forEach(el => wireTextEl(el, doc))

    // Tag + wire slide elements, then build the slide list with live preview srcDocs
    doc.querySelectorAll('.slide').forEach(slideEl => wireSlideEl(slideEl, doc))
    rebuildSlidesFromDom()

    // Make images clickable for replacement
    doc.querySelectorAll('img').forEach(img => wireImageEl(img as HTMLImageElement, doc))

    // Make canvases clickable for chart customization
    doc.querySelectorAll('canvas').forEach(canvas => wireCanvasEl(canvas as HTMLCanvasElement, doc))

    // Trigger initial color extraction
    setSlideColorsHash(prev => prev + 1)

    // Measure the full stacked-document height so the outer canvas can scroll all slides.
    const measure = () => {
      const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 720)
      setDocHeight(h)
    }
    measure()
    // Re-measure after fonts/images settle
    setTimeout(measure, 300)
    if ((doc as any).fonts?.ready) {
      ;(doc as any).fonts.ready.then(measure).catch(() => {})
    }
  }

  // 4. Handle image file replacement and load as base64 DataURL
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !activeImageRef.current || !iframeRef.current?.contentDocument) return

    const reader = new FileReader()
    reader.onload = () => {
      const base64Data = reader.result as string
      const targetImg = iframeRef.current?.contentDocument?.getElementById(
        activeImageRef.current!.id,
      ) as HTMLImageElement
      if (targetImg) {
        targetImg.src = base64Data
        setSaveStatus('idle') // changes unsaved
        setSlideColorsHash(prev => prev + 1) // update used colors
      }
    }
    reader.readAsDataURL(file)
    // Reset file input value to allow selecting same file again
    e.target.value = ''
  }

  // 4b. Insert new blocks into the active slide --------------------------------
  const remeasureDoc = () => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    setDocHeight(Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 720))
  }

  const insertHtmlIntoActiveSlide = (html: string) => {
    const doc = iframeRef.current?.contentDocument
    if (!doc || !html) return
    const slide = doc.getElementById(`slide-node-${activeSlide}`)
    if (!slide) return
    const host = (slide.querySelector('.content') as HTMLElement) || (slide as HTMLElement)

    const wrap = doc.createElement('div')
    wrap.innerHTML = html.trim()
    const node = wrap.firstElementChild as HTMLElement | null
    if (!node) return
    host.appendChild(node)

    node.setAttribute('data-pitch-block', '1')

    // Wire editability identically to native slide content
    const TEXT_SEL = 'h1,h2,h3,h4,p,li,blockquote,span,strong,td,th,.subtitle'
    if (node.matches(TEXT_SEL)) wireTextEl(node, doc)
    node.querySelectorAll(TEXT_SEL).forEach(el => wireTextEl(el, doc))
    if (node.tagName === 'IMG') wireImageEl(node as HTMLImageElement, doc)
    node.querySelectorAll('img').forEach(img => wireImageEl(img as HTMLImageElement, doc))
    // Container/visual blocks (icon svg, table, list, divider, callout) are selectable for drag/layer/delete
    if (!node.matches(TEXT_SEL) && node.tagName !== 'IMG') wireSelectableEl(node, doc)

    setSaveStatus('idle')
    setSlideColorsHash(p => p + 1)
    requestAnimationFrame(() => {
      remeasureDoc()
      rebuildSlidesFromDom()
      node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  // ── Slides: add (from a template) and reorder ───────────────────────────────
  const addSlide = (template: SlideTemplate) => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const wrap = doc.createElement('div')
    wrap.innerHTML = createSlideHTML(template).trim()
    const slideEl = wrap.firstElementChild as HTMLElement | null
    if (!slideEl) return

    // Insert right after the active slide (or at the end)
    const current = doc.getElementById(`slide-node-${activeSlide}`)
    if (current?.parentElement) current.insertAdjacentElement('afterend', slideEl)
    else doc.body.appendChild(slideEl)

    // Wire the new slide and its editable content
    wireSlideEl(slideEl, doc)
    slideEl
      .querySelectorAll('h1, p, li, .subtitle, .main-title, h3')
      .forEach(el => wireTextEl(el, doc))
    slideEl.querySelectorAll('img').forEach(img => wireImageEl(img as HTMLImageElement, doc))

    const newIndex = activeSlide + 1
    setSaveStatus('idle')
    requestAnimationFrame(() => {
      rebuildSlidesFromDom()
      remeasureDoc()
      scrollToSlide(newIndex)
    })
  }

  const reorderSlides = (from: number, to: number) => {
    const doc = iframeRef.current?.contentDocument
    if (!doc || from === to) return
    const nodes = Array.from(doc.querySelectorAll('.slide'))
    const moving = nodes[from]
    if (!moving) return
    const ref = nodes[to]
    if (!ref || !moving.parentElement) return
    // Insert before `ref` when moving up, after when moving down
    if (from < to) ref.insertAdjacentElement('afterend', moving)
    else ref.insertAdjacentElement('beforebegin', moving)
    setSaveStatus('idle')
    requestAnimationFrame(() => {
      rebuildSlidesFromDom()
      remeasureDoc()
      setActiveSlide(to)
      scrollToSlide(to)
    })
  }

  // Set any slide's background colour by index
  const setSlideBgAt = (index: number, color: string) => {
    const doc = iframeRef.current?.contentDocument
    const slide = doc?.getElementById(`slide-node-${index}`) as HTMLElement | null
    if (!slide) return
    slide.style.backgroundColor = color
    setSaveStatus('idle')
    setSlideColorsHash(p => p + 1)
    requestAnimationFrame(rebuildSlidesFromDom)
  }

  const deleteSlide = (index: number) => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const nodes = Array.from(doc.querySelectorAll('.slide'))
    if (nodes.length <= 1) return // never delete the last slide
    const target = nodes[index]
    if (!target?.parentElement) return
    target.parentElement.removeChild(target)
    const nextActive = Math.min(index, nodes.length - 2)
    setSaveStatus('idle')
    requestAnimationFrame(() => {
      rebuildSlidesFromDom()
      remeasureDoc()
      setActiveSlide(nextActive)
      scrollToSlide(nextActive)
    })
  }

  // Keep refs pointed at the latest closures so the stable callbacks registered below stay fresh
  addSlideRef.current = (t: string) => addSlide(t as SlideTemplate)
  reorderRef.current = reorderSlides
  setSlideBgRef.current = setSlideBgAt
  deleteSlideRef.current = deleteSlide

  // Change the active slide's background colour (right-rail Slide panel)
  const changeSlideBgColor = (color: string) => setSlideBgAt(activeSlide, color)
  const activeSlideBg = (): string => {
    const doc = iframeRef.current?.contentDocument
    const slide = doc?.getElementById(`slide-node-${activeSlide}`) as HTMLElement | null
    if (!slide) return ''
    return normalizeColor(slide.style.backgroundColor || '')
  }

  // ── Free positioning + layering ────────────────────────────────────────────
  // Convert an element to absolute positioning within its slide, preserving its
  // current on-screen position, then apply the requested stacking layer.
  const applyFloating = (el: HTMLElement, mode: 'front' | 'back') => {
    const slide = el.closest('.slide') as HTMLElement | null
    if (!slide) return
    const win = el.ownerDocument.defaultView
    const wasAbsolute = win ? win.getComputedStyle(el).position === 'absolute' : false

    if (!wasAbsolute) {
      // Capture position relative to the slide (both rects are unscaled iframe coords)
      const slideRect = slide.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const left = elRect.left - slideRect.left
      const top = elRect.top - slideRect.top
      if (el.parentElement !== slide) slide.appendChild(el)
      el.style.left = `${Math.round(left)}px`
      el.style.top = `${Math.round(top)}px`
      el.style.margin = '0'
    } else if (el.parentElement !== slide) {
      slide.appendChild(el)
    }
    const ls = layerStyle(mode)
    el.style.position = ls.position
    el.style.zIndex = ls.zIndex
  }

  const setLayer = (mode: LayerMode) => {
    if (!selectedEl) return
    const el = selectedEl
    if (mode === 'inline') {
      const slide = el.closest('.slide') as HTMLElement | null
      const content = (slide?.querySelector('.content') as HTMLElement | null) || slide
      el.style.position = ''
      el.style.zIndex = ''
      el.style.left = ''
      el.style.top = ''
      el.style.margin = ''
      if (content && el.parentElement !== content) content.appendChild(el)
    } else {
      applyFloating(el, mode)
    }
    setLayerMode(mode)
    setSaveStatus('idle')
    requestAnimationFrame(() => {
      remeasureDoc()
      const pos = computeToolbarPosFor(el)
      if (pos) setToolbarPos(pos)
    })
  }

  // ── Google-Slides-style direct manipulation (move / resize / rotate) ─────────

  const refreshOverlays = (el: HTMLElement) => {
    const box = computeSelBox(el)
    if (box) setSelBox(box)
    const pos = computeToolbarPosFor(el)
    if (pos) setToolbarPos(pos)
  }

  // Convert to a floating layer + give an explicit size so it can be moved/resized freely.
  const ensureFloatingForManip = (el: HTMLElement) => {
    const win = el.ownerDocument.defaultView
    if (win?.getComputedStyle(el).position !== 'absolute') {
      applyFloating(el, layerMode === 'back' ? 'back' : 'front')
      if (layerMode === 'inline') setLayerMode('front')
    }
    const { w, h } = elSize(el)
    if (!el.style.width) el.style.width = `${Math.round(w)}px`
    if (!el.style.height) el.style.height = `${Math.round(h)}px`
  }

  // Capture pointer on the grabbed handle so dragging keeps working over the iframe.
  const beginPointerDrag = (
    e: React.PointerEvent,
    onMove: (ev: PointerEvent) => void,
    onEnd?: () => void,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => onMove(ev)
    const up = () => {
      try {
        target.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      setSaveStatus('idle')
      requestAnimationFrame(remeasureDoc)
      onEnd?.()
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }

  const onBoxMovePointerDown = (e: React.PointerEvent) => {
    const el = selectedEl
    if (!el) return
    ensureFloatingForManip(el)
    const startLeft = parseFloat(el.style.left) || 0
    const startTop = parseFloat(el.style.top) || 0
    const sx = e.clientX,
      sy = e.clientY
    beginPointerDrag(e, ev => {
      el.style.left = `${Math.round(startLeft + (ev.clientX - sx) / scaleRef.current)}px`
      el.style.top = `${Math.round(startTop + (ev.clientY - sy) / scaleRef.current)}px`
      refreshOverlays(el)
    })
  }

  type ResizeDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  const onResizePointerDown = (dir: ResizeDir) => (e: React.PointerEvent) => {
    const el = selectedEl
    if (!el) return
    ensureFloatingForManip(el)
    const sz = elSize(el)
    const startW = parseFloat(el.style.width) || sz.w
    const startH = parseFloat(el.style.height) || sz.h
    const startLeft = parseFloat(el.style.left) || 0
    const startTop = parseFloat(el.style.top) || 0
    const a = (currentAngleDeg(el) * Math.PI) / 180
    const cos = Math.cos(a),
      sin = Math.sin(a)
    const sx = e.clientX,
      sy = e.clientY
    beginPointerDrag(e, ev => {
      const dxs = (ev.clientX - sx) / scaleRef.current
      const dys = (ev.clientY - sy) / scaleRef.current
      // Project the screen delta onto the element's local (rotated) axes
      const dx = dxs * cos + dys * sin
      const dy = -dxs * sin + dys * cos
      let w = startW,
        h = startH,
        left = startLeft,
        top = startTop
      if (dir.includes('e')) w = Math.max(24, startW + dx)
      if (dir.includes('s')) h = Math.max(24, startH + dy)
      if (dir.includes('w')) {
        w = Math.max(24, startW - dx)
        left = startLeft + dxs
      }
      if (dir.includes('n')) {
        h = Math.max(24, startH - dy)
        top = startTop + dys
      }
      el.style.width = `${Math.round(w)}px`
      el.style.height = `${Math.round(h)}px`
      el.style.left = `${Math.round(left)}px`
      el.style.top = `${Math.round(top)}px`
      refreshOverlays(el)
    })
  }

  const onRotatePointerDown = (e: React.PointerEvent) => {
    const el = selectedEl
    if (!el) return
    ensureFloatingForManip(el)
    const box = computeSelBox(el)
    if (!box) return
    const { cx, cy } = box
    beginPointerDrag(e, ev => {
      const deg = Math.round((Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90)
      el.style.transform = `rotate(${deg}deg)`
      refreshOverlays(el)
    })
  }

  const deleteSelectedElement = () => {
    if (!selectedEl) return
    selectedEl.remove()
    deselectElement()
    setSaveStatus('idle')
    requestAnimationFrame(remeasureDoc)
  }

  const replaceSelectedImage = () => {
    if (selectedEl?.tagName !== 'IMG') return
    const img = selectedEl as HTMLImageElement
    activeImageRef.current = { id: img.id, src: img.src }
    fileInputRef.current?.click()
  }

  const insertBlock = (type: BlockType) => insertHtmlIntoActiveSlide(createBlockHTML(type))
  const insertTable = (rows: number, cols: number) =>
    insertHtmlIntoActiveSlide(createTableHTML(rows, cols))

  // Insert a live Chart.js chart. Ensures the library is present, then appends a canvas plus a
  // self-initializing script (it polls for Chart) so the chart also renders when the saved deck reopens.
  const insertChart = (kind: ChartKind) => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const slide = doc.getElementById(`slide-node-${activeSlide}`)
    if (!slide) return
    const host = (slide.querySelector('.content') as HTMLElement) || (slide as HTMLElement)

    const canvasId = `chart_${Math.random().toString(36).slice(2, 9)}`
    const wrap = doc.createElement('div')
    wrap.setAttribute('data-pitch-block', '1')
    wrap.setAttribute('data-chart', '1') // marks this as a draggable/resizable chart container
    wrap.style.cssText = 'position:relative;width:600px;height:340px;margin:16px 0;'
    // pointer-events:none on the canvas so clicks select the wrapper (for move/resize), not the canvas
    wrap.innerHTML = `<canvas id="${canvasId}" style="pointer-events:none;"></canvas>`
    host.appendChild(wrap)

    const config = createChartConfig(kind)
    const initScript = doc.createElement('script')
    initScript.textContent =
      `(function(){function go(){var el=document.getElementById('${canvasId}');` +
      `if(el&&window.Chart){new window.Chart(el, ${JSON.stringify(config)});}else{setTimeout(go,60);}}go();})();`

    const start = () => {
      wrap.appendChild(initScript) // executing this node renders the chart now
      wireSelectableEl(wrap, doc) // select the wrapper → move / resize / rotate / layer / delete
      setSaveStatus('idle')
      requestAnimationFrame(() => {
        rebuildSlidesFromDom()
        remeasureDoc()
        wrap.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }

    const win = doc.defaultView as any
    if (win?.Chart) {
      start()
    } else if (doc.getElementById('pitch-chartjs')) {
      doc.getElementById('pitch-chartjs')!.addEventListener('load', start, { once: true })
    } else {
      const lib = doc.createElement('script')
      lib.id = 'pitch-chartjs'
      lib.src = 'https://cdn.jsdelivr.net/npm/chart.js@4'
      lib.addEventListener('load', start, { once: true })
      doc.head.appendChild(lib)
    }
  }
  const insertIcon = (name: string) => insertHtmlIntoActiveSlide(createIconBlockHTML(name))

  const insertImageUrl = () => {
    const html = createImageBlockHTML(mediaUrl.trim())
    if (!html) {
      alert('That image URL looks invalid or unsafe. Use an http(s) image link.')
      return
    }
    insertHtmlIntoActiveSlide(html)
    setMediaUrl('')
  }

  const insertQr = async () => {
    if (!qrText.trim()) return
    try {
      const html = await createQrBlockHTML(qrText.trim())
      if (html) insertHtmlIntoActiveSlide(html)
      setQrText('')
    } catch (err) {
      console.error('QR generation failed:', err)
      alert('Could not generate the QR code.')
    }
  }

  // Upload a brand-new image (distinct from replacing an existing one)
  const handleInsertFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const html = createImageBlockHTML(reader.result as string, file.name)
      if (html) insertHtmlIntoActiveSlide(html)
    }
    reader.readAsDataURL(file)
  }

  // 5. Save modified HTML back to storage
  const handleSave = async () => {
    const iframe = iframeRef.current
    if (!iframe?.contentDocument) return

    setSaveStatus('saving')

    try {
      // Clean up dynamic editing styles/attributes before saving
      const cloneDoc = iframe.contentDocument.cloneNode(true) as Document
      cloneDoc.getElementById('pitch-editor-style')?.remove() // editor-only CSS must not leak into the saved PDF
      cloneDoc
        .querySelectorAll('.selected-for-styling')
        .forEach(el => el.classList.remove('selected-for-styling'))
      const editables = cloneDoc.querySelectorAll('[contenteditable="true"]')
      editables.forEach(el => el.removeAttribute('contenteditable'))

      const finalHtml = `<!DOCTYPE html>\n${cloneDoc.documentElement.outerHTML}`

      const token = await getToken()
      await api.post(`/pdf-jobs/${id}/save`, token!, { html: finalHtml })

      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (err) {
      console.error('Failed to save presentation changes:', err)
      setSaveStatus('error')
    }
  }

  // Trigger an actual browser download of the high-quality server-rendered PDF.
  const triggerServerPdfDownload = () => {
    const url = selectedProject?.pdfUrl
    if (!url) return
    const cacheBusted = `${url}${url.includes('?') ? '&' : '?'}t=${new Date(selectedProject!.updatedAt).getTime()}`
    const a = document.createElement('a')
    a.href = cacheBusted
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
  }

  // "Download PDF": if a fresh server PDF is still being regenerated, wait for it
  // (show a "Preparing…" state); otherwise download immediately.
  const downloadServerPdf = () => {
    setExportMenuOpen(false)
    if (selectedProject?.parameters?.pdfGenerating) {
      setAwaitingServerPdf(true) // effect below downloads once it's ready
    } else {
      triggerServerPdfDownload()
    }
  }

  // Once the background regeneration finishes (pdfGenerating flips false), auto-download.
  useEffect(() => {
    if (!awaitingServerPdf) return
    if (selectedProject && !selectedProject.parameters?.pdfGenerating) {
      setAwaitingServerPdf(false)
      triggerServerPdfDownload()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    awaitingServerPdf,
    selectedProject?.parameters?.pdfGenerating,
    selectedProject?.pdfUrl,
    triggerServerPdfDownload,
    selectedProject,
  ])

  // 6b. Client-side export of the CURRENT (edited) slides ----------------------
  const captureSlides = async (): Promise<string[] | null> => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return null
    const slideEls = Array.from(doc.querySelectorAll('.slide')) as HTMLElement[]
    if (!slideEls.length) return null
    // Hide selection outline so it isn't baked into the export
    doc
      .querySelectorAll('.selected-for-styling')
      .forEach(el => el.classList.remove('selected-for-styling'))
    const shots: string[] = []
    for (const el of slideEls) {
      shots.push(
        await toPng(el, {
          width: 1280,
          height: 720,
          pixelRatio: 2,
          cacheBust: true,
          style: { margin: '0', borderRadius: '0', boxShadow: 'none' },
        }),
      )
    }
    return shots
  }

  const exportSlidesAsPng = async () => {
    setExporting(true)
    try {
      const shots = await captureSlides()
      if (!shots) return
      shots.forEach((url, i) => {
        const a = document.createElement('a')
        a.href = url
        a.download = `slide-${i + 1}.png`
        a.click()
      })
    } catch (err) {
      console.error('PNG export failed:', err)
      alert('Could not export images.')
    } finally {
      setExporting(false)
      setExportMenuOpen(false)
    }
  }

  // 7. Styling mutators

  // Run an inline formatting command on the CURRENT TEXT SELECTION inside the iframe
  // (so bold/italic/underline/colour affect only the highlighted letters, not the whole block).
  const execInline = (cmd: string, value?: string) => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    try {
      doc.execCommand('styleWithCSS', false, 'true')
    } catch {
      /* not supported */
    }
    doc.execCommand(cmd, false, value)
    setSaveStatus('idle')
    setSlideColorsHash(prev => prev + 1)
    // Reflect the new toggle state from the live selection
    try {
      setTextFormat(f => ({
        ...f,
        bold: doc.queryCommandState('bold'),
        italic: doc.queryCommandState('italic'),
        underline: doc.queryCommandState('underline'),
      }))
    } catch {
      /* queryCommandState unsupported */
    }
  }

  const changeSelectedColor = (newColor: string) => {
    setSelectedColor(newColor)
    execInline('foreColor', newColor) // applies to the highlighted text range
  }

  const changeHighlight = (color: string) => {
    setHighlightColor(color)
    execInline('hiliteColor', color) // text background / highlight on the selection
  }

  const toggleStrike = () => execInline('strikeThrough')
  const toggleSuperscript = () => execInline('superscript')
  const clearFormatting = () => {
    execInline('removeFormat')
    execInline('unlink')
  }

  const insertInlineCode = () => {
    const doc = iframeRef.current?.contentDocument
    const text = doc?.getSelection()?.toString()
    if (!doc || !text) return
    const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    doc.execCommand(
      'insertHTML',
      false,
      `<code style="font-family:ui-monospace,monospace;background:rgba(0,0,0,0.08);padding:1px 6px;border-radius:4px;font-size:0.9em;">${safe}</code>`,
    )
    setSaveStatus('idle')
  }

  const toggleLink = () => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const sel = doc.getSelection()
    const node = sel?.anchorNode
    const anchor =
      node && (node.nodeType === 3 ? node.parentElement : (node as HTMLElement))?.closest('a')
    if (anchor) {
      execInline('unlink')
      return
    }
    const url = window.prompt('Link URL:', 'https://')
    if (url) execInline('createLink', url)
  }

  // Change the block type of the selected element (Normal text / Heading 1–3)
  const setBlockType = (tag: 'p' | 'h1' | 'h2' | 'h3') => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    doc.execCommand('formatBlock', false, tag.toUpperCase())
    setSaveStatus('idle')
  }

  const changeSelectedFontSize = (increase: boolean) => {
    if (!selectedEl) return
    const currentSizeStr = selectedEl.style.fontSize || window.getComputedStyle(selectedEl).fontSize
    const currentSize = parseFloat(currentSizeStr) || 16
    const newSize = increase ? currentSize + 2 : Math.max(8, currentSize - 2)
    selectedEl.style.fontSize = `${newSize}px`
    setSelectedFontSize(`${newSize}px`)
    setSaveStatus('idle')
  }

  const toggleBold = () => execInline('bold')
  const toggleItalic = () => execInline('italic')
  const toggleUnderline = () => execInline('underline')

  const setTextAlign = (align: 'left' | 'center' | 'right') => {
    if (!selectedEl) return
    selectedEl.style.textAlign = align
    setTextFormat(f => ({ ...f, align }))
    setSaveStatus('idle')
  }

  const changeSelectedBulletColor = (newColor: string) => {
    if (selectedEl?.tagName !== 'LI') return
    selectedEl.style.setProperty('--primary', newColor)
    setSelectedBulletColor(newColor)
    setSaveStatus('idle')
    setSlideColorsHash(prev => prev + 1)
  }

  const deselectElement = () => {
    if (iframeRef.current?.contentDocument) {
      iframeRef.current.contentDocument
        .querySelectorAll('.selected-for-styling')
        .forEach(el => el.classList.remove('selected-for-styling'))
    }
    setSelectedEl(null)
    setSelectedBorderColor('')
    setChartData([])
    setChartLabels([])
    setChartBgColor('')
    setChartBorderColor('')
  }

  const changeSelectedBorderColor = (newColor: string) => {
    if (!selectedEl) return
    selectedEl.style.borderLeftColor = newColor
    selectedEl.style.borderTopColor = newColor
    selectedEl.style.borderRightColor = newColor
    selectedEl.style.borderBottomColor = newColor
    selectedEl.style.borderColor = newColor
    setSelectedBorderColor(newColor)
    setSaveStatus('idle')
    setSlideColorsHash(prev => prev + 1)
  }

  const findChartScript = (canvas: HTMLCanvasElement): HTMLScriptElement | null => {
    const doc = canvas.ownerDocument
    if (!doc) return null

    // 1. Try matching script that mentions the canvas ID
    if (canvas.id) {
      const scripts = doc.querySelectorAll('script:not([src])')
      for (let i = 0; i < scripts.length; i++) {
        const s = scripts[i] as HTMLScriptElement
        if (s.textContent?.includes(canvas.id)) {
          return s
        }
      }
    }

    // 2. Fallback: search for nearby script tag sibling to parent container or same slide
    let parent = canvas.parentElement
    while (parent && !parent.classList.contains('slide')) {
      const sibling = parent.nextElementSibling
      if (sibling && sibling.tagName === 'SCRIPT') {
        return sibling as HTMLScriptElement
      }
      parent = parent.parentElement
    }

    return null
  }

  const updateChartScript = (
    scriptEl: HTMLScriptElement,
    newData: number[],
    newLabels: string[],
    newBgColor: string,
    newBorderColor: string,
  ) => {
    let text = scriptEl.textContent || ''
    console.log('[updateChartScript] Before replacement text:', text)

    // Replace labels: support optional single/double/no quotes around keys and optional single/double quotes around values
    text = text.replace(
      /(["']?labels["']?\s*:\s*\[[^\]]*\])/,
      `"labels":${JSON.stringify(newLabels)}`,
    )

    // Replace data: support optional single/double/no quotes around keys and optional single/double quotes around values
    text = text.replace(/(["']?data["']?\s*:\s*\[[^\]]*\])/, `"data":${JSON.stringify(newData)}`)

    // Replace backgroundColor: support optional single/double/no quotes around keys and optional single/double quotes around values (including arrays)
    text = text.replace(
      /(["']?backgroundColor["']?\s*:\s*(["'][^"']*["']|\[[^\]]*\]))/,
      `"backgroundColor":${JSON.stringify(newBgColor)}`,
    )

    // Replace borderColor: support optional single/double/no quotes around keys and optional single/double quotes around values (including arrays)
    text = text.replace(
      /(["']?borderColor["']?\s*:\s*(["'][^"']*["']|\[[^\]]*\]))/,
      `"borderColor":${JSON.stringify(newBorderColor)}`,
    )

    console.log('[updateChartScript] After replacement text:', text)
    scriptEl.textContent = text
  }

  const updateChartDataValue = (index: number, val: number) => {
    const canvas = getSelectedCanvas()
    if (!canvas) return
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    const iframeWin = doc?.defaultView as any
    if (!iframeWin?.Chart) return

    const chart = iframeWin.Chart.getChart(canvas)
    if (chart?.data.datasets?.[0]) {
      const newData = [...chart.data.datasets[0].data]
      newData[index] = val
      chart.data.datasets[0].data = newData
      chart.update()
      setChartData(newData as number[])

      const scriptEl = findChartScript(canvas)
      if (scriptEl) {
        updateChartScript(
          scriptEl,
          newData as number[],
          chart.data.labels as string[],
          Array.isArray(chart.data.datasets[0].backgroundColor)
            ? (chart.data.datasets[0].backgroundColor[0] as string)
            : (chart.data.datasets[0].backgroundColor as string),
          Array.isArray(chart.data.datasets[0].borderColor)
            ? (chart.data.datasets[0].borderColor[0] as string)
            : (chart.data.datasets[0].borderColor as string),
        )
      }
      setSaveStatus('idle')
      setSlideColorsHash(prev => prev + 1)
    }
  }

  const updateChartLabelValue = (index: number, label: string) => {
    const canvas = getSelectedCanvas()
    if (!canvas) return
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    const iframeWin = doc?.defaultView as any
    if (!iframeWin?.Chart) return

    const chart = iframeWin.Chart.getChart(canvas)
    if (chart?.data.labels) {
      const newLabels = [...chart.data.labels]
      newLabels[index] = label
      chart.data.labels = newLabels
      chart.update()
      setChartLabels(newLabels as string[])

      const scriptEl = findChartScript(canvas)
      if (scriptEl) {
        updateChartScript(
          scriptEl,
          chart.data.datasets[0].data as number[],
          newLabels as string[],
          Array.isArray(chart.data.datasets[0].backgroundColor)
            ? (chart.data.datasets[0].backgroundColor[0] as string)
            : (chart.data.datasets[0].backgroundColor as string),
          Array.isArray(chart.data.datasets[0].borderColor)
            ? (chart.data.datasets[0].borderColor[0] as string)
            : (chart.data.datasets[0].borderColor as string),
        )
      }
      setSaveStatus('idle')
      setSlideColorsHash(prev => prev + 1)
    }
  }

  const updateChartColors = (bgColor: string, borderColor: string) => {
    const canvas = getSelectedCanvas()
    if (!canvas) return
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    const iframeWin = doc?.defaultView as any
    if (!iframeWin?.Chart) {
      console.warn('[updateChartColors] Chart or iframe window not found')
      return
    }

    const chart = iframeWin.Chart.getChart(canvas)
    if (chart?.data.datasets?.[0]) {
      console.log('[updateChartColors] Setting chart colors:', bgColor, borderColor)
      chart.data.datasets[0].backgroundColor = bgColor
      chart.data.datasets[0].borderColor = borderColor
      chart.update()
      setChartBgColor(bgColor)
      setChartBorderColor(borderColor)

      const scriptEl = findChartScript(canvas)
      console.log('[updateChartColors] Found script tag:', !!scriptEl)
      if (scriptEl) {
        updateChartScript(
          scriptEl,
          chart.data.datasets[0].data as number[],
          chart.data.labels as string[],
          bgColor,
          borderColor,
        )
      }
      setSaveStatus('idle')
      setSlideColorsHash(prev => prev + 1)
    } else {
      console.warn('[updateChartColors] No chart instance or dataset found for canvas')
    }
  }

  if (!selectedProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-12">
        <div className="w-48 sm:w-64 mb-8">
          <PitchLogoAnimation startAnimation={true} loop={true} />
        </div>
        <p className="font-bold text-gray-900 tracking-tight leading-none text-xl mb-4 animate-pulse">
          Loading presentation…
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors cursor-pointer mt-2"
        >
          Cancel
        </button>
      </div>
    )
  }

  const isProcessing =
    selectedProject.status === 'PROCESSING' || selectedProject.status === 'PENDING'
  const isFailed = selectedProject.status === 'FAILED'

  // Render the progress updates when processing
  if (isProcessing) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto w-full">
        <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 text-center space-y-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Generating your presentation slide deck…
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              This typically takes 2–4 minutes. Hang tight!
            </p>
          </div>
          <PdfProgressWidget project={selectedProject} />
        </div>
      </div>
    )
  }

  if (isFailed) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto w-full">
        <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 text-center space-y-6">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">PDF Generation Failed</h2>
            <p className="text-sm text-gray-500 mt-1">
              {selectedProject.error || 'Something went wrong during generation.'}
            </p>
          </div>
          <PdfProgressWidget project={selectedProject} />
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-150 select-none">
      {/* ── Portaled Editor Actions (Export + Save; currency stays right-most) ── */}
      {portalTarget &&
        createPortal(
          <>
            {/* Export dropdown */}
            <div className="relative">
              <button
                onClick={() => setExportMenuOpen(v => !v)}
                disabled={exporting}
                className="h-9 px-3 inline-flex items-center gap-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                aria-haspopup="menu"
                aria-expanded={exportMenuOpen}
              >
                {exporting ? (
                  <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin shrink-0" />
                ) : (
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                )}
                <span className="hidden sm:inline">{exporting ? 'Exporting…' : 'Export'}</span>
              </button>
              {exportMenuOpen && !exporting && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                  <div
                    role="menu"
                    className="absolute right-0 top-10 z-50 w-52 bg-white rounded-xl shadow-2xl border border-gray-200 p-1.5 animate-in fade-in zoom-in-95 duration-150"
                  >
                    {(selectedProject.pdfUrl || selectedProject.parameters?.pdfGenerating) && (
                      <button
                        role="menuitem"
                        onClick={downloadServerPdf}
                        className="w-full flex items-center gap-2.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg px-2.5 py-2 cursor-pointer transition-colors"
                      >
                        <span className="w-6 h-6 flex items-center justify-center rounded-md bg-red-50 text-red-600 text-[10px] font-bold shrink-0">
                          PDF
                        </span>
                        <span className="flex flex-col leading-tight">
                          Download PDF
                          <span className="text-[10px] text-gray-400 font-normal">
                            High-quality, selectable text
                          </span>
                        </span>
                      </button>
                    )}
                    <button
                      role="menuitem"
                      onClick={exportSlidesAsPng}
                      className="w-full flex items-center gap-2.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg px-2.5 py-2 cursor-pointer transition-colors"
                    >
                      <span className="w-6 h-6 flex items-center justify-center rounded-md bg-violet-50 text-violet-600 shrink-0">
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="9" cy="9" r="2" />
                          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                        </svg>
                      </span>
                      Export slides as PNG
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Save (icon-only on mobile, label on ≥sm) */}
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              title={saveStatus === 'error' ? 'Failed to save — tap to retry' : 'Save'}
              className={`h-9 px-2.5 sm:px-4 rounded-lg text-xs font-bold transition-all duration-300 border-none cursor-pointer flex items-center gap-1.5 shadow-sm shrink-0 ${
                saveStatus === 'saving'
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : saveStatus === 'saved'
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : saveStatus === 'error'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
              }`}
            >
              {saveStatus === 'saving' ? (
                <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-gray-600 rounded-full animate-spin shrink-0" />
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  {saveStatus === 'saved' ? (
                    <polyline points="20 6 9 17 4 12" />
                  ) : saveStatus === 'error' ? (
                    <>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </>
                  ) : (
                    <>
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </>
                  )}
                </svg>
              )}
              <span className="hidden sm:inline">
                {saveStatus === 'saving'
                  ? 'Saving…'
                  : saveStatus === 'saved'
                    ? 'Saved!'
                    : saveStatus === 'error'
                      ? 'Failed to Save'
                      : 'Save'}
              </span>
            </button>
          </>,
          portalTarget,
        )}

      {/* ── Editor Workspace ──────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative bg-gray-100">
        {/* Center canvas: slides flow vertically as Gamma-style stacked cards */}
        <main
          ref={containerRef}
          className="flex-1 overflow-auto flex flex-col items-center py-6 sm:py-10 px-3 sm:px-6 relative"
        >
          {loadingHtml ? (
            <div className="m-auto flex flex-col items-center gap-3 text-center">
              <span className="w-8 h-8 border-3 border-gray-200 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-xs font-semibold text-gray-500">Loading presentation slides…</p>
            </div>
          ) : htmlContent ? (
            <div
              style={{
                width: 1280 * scale,
                height: docHeight * scale,
                transition: 'width 0.1s ease-out, height 0.1s ease-out',
              }}
              className="relative shrink-0"
            >
              <iframe
                ref={iframeRef}
                srcDoc={htmlContent}
                onLoad={handleIframeLoad}
                style={{
                  width: 1280,
                  height: docHeight,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  border: 'none',
                  background: 'transparent',
                }}
                title="Presentation Preview"
                sandbox="allow-same-origin allow-scripts"
              />
            </div>
          ) : (
            <div className="m-auto text-center p-8 border border-dashed border-gray-200 rounded-2xl bg-white max-w-sm">
              <p className="text-sm font-semibold text-gray-600">Failed to render presentation</p>
              <p className="text-xs text-gray-400 mt-1">
                We couldn't retrieve the slide builder templates for this project.
              </p>
            </div>
          )}
        </main>

        {/* ── Right Tool Rail + Popovers ───────────────────────────────────── */}
        {!loadingHtml && htmlContent && (
          <>
            {/* Search popover — find any block by name */}
            {railPanel === 'search' && (
              <div
                role="dialog"
                aria-label="Search blocks"
                className="absolute right-[64px] top-4 z-30 w-72 max-w-[calc(100vw-76px)] bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 animate-in fade-in slide-in-from-right-2 duration-150 max-h-[calc(100%-2rem)] overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-gray-800">Search blocks</h4>
                  <button
                    onClick={() => setRailPanel(null)}
                    className="text-gray-400 hover:text-gray-600 cursor-pointer"
                    aria-label="Close panel"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <input
                  type="text"
                  value={blockSearch}
                  onChange={e => setBlockSearch(e.target.value)}
                  placeholder="Search all blocks…"
                  aria-label="Search all blocks"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 mb-3"
                />
                <div className="flex flex-col gap-1">
                  {searchBlocks(blockSearch).map(b => (
                    <button
                      key={b.type}
                      onClick={() => insertBlock(b.type)}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/60 transition-colors cursor-pointer text-left"
                    >
                      <span className="text-xs font-semibold text-gray-700">{b.label}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">
                        {b.group}
                      </span>
                    </button>
                  ))}
                  {searchBlocks(blockSearch).length === 0 && (
                    <p className="text-xs text-gray-400 py-2 text-center">
                      No blocks match “{blockSearch}”.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Insert: Smart layouts */}
            {railPanel === 'smart' && (
              <div
                role="dialog"
                aria-label="Insert smart layouts"
                className="absolute right-[64px] top-4 z-30 w-72 max-w-[calc(100vw-76px)] bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 animate-in fade-in slide-in-from-right-2 duration-150 max-h-[calc(100%-2rem)] overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-bold text-gray-800">Smart layouts</h4>
                  <button
                    onClick={() => setRailPanel(null)}
                    className="text-gray-400 hover:text-gray-600 cursor-pointer"
                    aria-label="Close panel"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 font-medium mb-3">
                  Visual blocks for organizing ideas & numbers.
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ['stats', 'Stats'],
                      ['bar-stats', 'Bar stats'],
                      ['process', 'Process steps'],
                      ['timeline', 'Timeline'],
                      ['columns', 'Two columns'],
                      ['pros-cons', 'Pros & cons'],
                    ] as [BlockType, string][]
                  ).map(([t, label]) => (
                    <button
                      key={t}
                      onClick={() => insertBlock(t)}
                      className="px-2 py-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/60 transition-colors cursor-pointer text-[11px] font-semibold text-gray-700"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Insert: Data charts */}
            {railPanel === 'charts' && (
              <div
                role="dialog"
                aria-label="Insert data charts"
                className="absolute right-[64px] top-4 z-30 w-64 max-w-[calc(100vw-76px)] bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 animate-in fade-in slide-in-from-right-2 duration-150"
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-bold text-gray-800">Charts</h4>
                  <button
                    onClick={() => setRailPanel(null)}
                    className="text-gray-400 hover:text-gray-600 cursor-pointer"
                    aria-label="Close panel"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 font-medium mb-3">
                  Live Chart.js — click the chart to edit its data.
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      [
                        'bar',
                        'Bar',
                        '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
                      ],
                      ['line', 'Line', '<polyline points="3 17 9 11 13 15 21 7"/>'],
                      [
                        'pie',
                        'Pie',
                        '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
                      ],
                    ] as [ChartKind, string, string][]
                  ).map(([k, label, path]) => (
                    <button
                      key={k}
                      onClick={() => {
                        insertChart(k)
                      }}
                      className="flex flex-col items-center gap-1.5 px-1 py-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/60 transition-colors cursor-pointer text-[11px] font-semibold text-gray-700"
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-indigo-600"
                        dangerouslySetInnerHTML={{ __html: path }}
                      />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Slide background */}
            {railPanel === 'slide' && (
              <div
                role="dialog"
                aria-label="Slide background"
                className="absolute right-[64px] top-4 z-30 w-64 max-w-[calc(100vw-76px)] bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 animate-in fade-in slide-in-from-right-2 duration-150"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-gray-800">
                    Slide {activeSlide + 1} background
                  </h4>
                  <button
                    onClick={() => setRailPanel(null)}
                    className="text-gray-400 hover:text-gray-600 cursor-pointer"
                    aria-label="Close panel"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {BG_PRESETS.map(col => {
                    const isSel = normalizeColor(activeSlideBg()) === normalizeColor(col)
                    return (
                      <button
                        key={col}
                        onClick={() => changeSlideBgColor(col)}
                        style={{ backgroundColor: col === 'transparent' ? 'transparent' : col }}
                        className={`w-7 h-7 rounded-full border border-gray-300 shadow-sm transition-all hover:scale-110 flex items-center justify-center ${isSel ? 'ring-2 ring-indigo-500 scale-110' : ''}`}
                        title={col}
                      >
                        {col === 'transparent' && (
                          <span className="text-[11px] text-gray-400">∅</span>
                        )}
                      </button>
                    )
                  })}
                  <div
                    className="relative w-7 h-7 rounded-full overflow-hidden border border-gray-300 shadow-sm hover:scale-110 transition-transform cursor-pointer flex items-center justify-center"
                    style={{
                      background:
                        'conic-gradient(from 0deg, red, yellow, green, cyan, blue, magenta, red)',
                    }}
                    title="Custom colour"
                  >
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none text-[11px] text-white font-black drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                      +
                    </span>
                    <input
                      type="color"
                      onChange={e => changeSlideBgColor(e.target.value)}
                      className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                      aria-label="Custom slide background colour"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Chart editor popover (auto-shows while a chart is selected) */}
            {(selectedEl?.tagName === 'CANVAS' || selectedEl?.hasAttribute('data-chart')) && (
              <div className="absolute right-[64px] bottom-4 z-30 w-80 max-w-[calc(100vw-76px)] bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 animate-in fade-in slide-in-from-right-2 duration-150 max-h-[calc(100%-2rem)] overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg uppercase tracking-wider">
                    Chart
                  </h4>
                  <button
                    onClick={deselectElement}
                    className="text-gray-400 hover:text-gray-600 cursor-pointer"
                    title="Done"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-medium">Fill</span>
                    <div
                      className="relative w-6 h-6 rounded-full border border-gray-300 shadow-sm cursor-pointer"
                      style={{ backgroundColor: chartBgColor || '#3b82f6' }}
                    >
                      <input
                        type="color"
                        value={
                          chartBgColor.startsWith('#') && chartBgColor.length === 7
                            ? chartBgColor
                            : '#3b82f6'
                        }
                        onChange={e => updateChartColors(e.target.value, chartBorderColor)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-medium">Border</span>
                    <div
                      className="relative w-6 h-6 rounded-full border border-gray-300 shadow-sm cursor-pointer"
                      style={{ backgroundColor: chartBorderColor || '#2563eb' }}
                    >
                      <input
                        type="color"
                        value={
                          chartBorderColor.startsWith('#') && chartBorderColor.length === 7
                            ? chartBorderColor
                            : '#2563eb'
                        }
                        onChange={e => updateChartColors(chartBgColor, e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
                {chartData.length > 0 && (
                  <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto pr-1">
                    {chartData.map((val, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs"
                      >
                        <input
                          type="text"
                          value={chartLabels[idx] || ''}
                          onChange={e => updateChartLabelValue(idx, e.target.value)}
                          className="flex-1 border-none outline-none font-semibold text-gray-700 bg-transparent text-[11px]"
                          placeholder="Label"
                        />
                        <span className="text-gray-300">:</span>
                        <input
                          type="number"
                          value={val}
                          onChange={e => updateChartDataValue(idx, parseFloat(e.target.value) || 0)}
                          className="w-14 border-none outline-none font-bold text-gray-900 bg-transparent text-[11px]"
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Insert: Text & structure */}
            {railPanel === 'text' && (
              <div
                role="dialog"
                aria-label="Insert text and structure blocks"
                className="absolute right-[64px] top-4 z-30 w-72 max-w-[calc(100vw-76px)] bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 animate-in fade-in slide-in-from-right-2 duration-150 max-h-[calc(100%-2rem)] overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-bold text-gray-800">Text & structure</h4>
                  <button
                    onClick={() => setRailPanel(null)}
                    className="text-gray-400 hover:text-gray-600 cursor-pointer"
                    aria-label="Close panel"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 font-medium mb-3">
                  Adds to slide {activeSlide + 1}.
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ['title', 'Title'],
                      ['heading1', 'Head 1'],
                      ['heading2', 'Head 2'],
                      ['heading3', 'Head 3'],
                      ['heading4', 'Head 4'],
                      ['paragraph', 'Text'],
                      ['blockquote', 'Quote'],
                      ['label', 'Label'],
                      ['divider', 'Divider'],
                      ['bulleted', 'Bullets'],
                      ['numbered', 'Numbered'],
                      ['todo', 'To-do'],
                    ] as [BlockType, string][]
                  ).map(([t, label]) => (
                    <button
                      key={t}
                      onClick={() => insertBlock(t)}
                      className="flex flex-col items-center justify-center gap-1 px-1 py-2.5 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/60 transition-colors cursor-pointer text-[11px] font-semibold text-gray-700"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Insert: Tables & callouts */}
            {railPanel === 'tables' && (
              <div
                role="dialog"
                aria-label="Insert tables and callout boxes"
                className="absolute right-[64px] top-4 z-30 w-72 max-w-[calc(100vw-76px)] bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 animate-in fade-in slide-in-from-right-2 duration-150 max-h-[calc(100%-2rem)] overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-bold text-gray-800">Tables & callouts</h4>
                  <button
                    onClick={() => setRailPanel(null)}
                    className="text-gray-400 hover:text-gray-600 cursor-pointer"
                    aria-label="Close panel"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-2 mb-1.5">
                  Table — {tableHover.r || 0} × {tableHover.c || 0}
                </p>
                <div
                  className="inline-grid gap-1 p-1 rounded-lg bg-gray-50 border border-gray-200"
                  style={{ gridTemplateColumns: 'repeat(8, 18px)' }}
                  onMouseLeave={() => setTableHover({ r: 0, c: 0 })}
                  role="grid"
                  aria-label="Pick table size"
                >
                  {Array.from({ length: 6 * 8 }).map((_, i) => {
                    const r = Math.floor(i / 8) + 1
                    const c = (i % 8) + 1
                    const active = r <= tableHover.r && c <= tableHover.c
                    return (
                      <button
                        key={i}
                        onMouseEnter={() => setTableHover({ r, c })}
                        onClick={() => insertTable(r, c)}
                        aria-label={`Insert ${r} by ${c} table`}
                        className={`w-[18px] h-[18px] rounded-sm border transition-colors cursor-pointer ${active ? 'bg-indigo-500 border-indigo-500' : 'bg-white border-gray-300 hover:border-indigo-300'}`}
                      />
                    )
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">
                  Hover to size, click to insert (up to 6 × 8).
                </p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-3 mb-1.5">
                  Callout boxes
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ['callout-note', 'Note'],
                      ['callout-info', 'Info'],
                      ['callout-warning', 'Warning'],
                      ['callout-success', 'Success'],
                      ['callout-caution', 'Caution'],
                      ['callout-question', 'Question'],
                    ] as [BlockType, string][]
                  ).map(([t, label]) => (
                    <button
                      key={t}
                      onClick={() => insertBlock(t)}
                      className="px-1 py-2.5 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/60 transition-colors cursor-pointer text-[11px] font-semibold text-gray-700"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Insert: Media */}
            {railPanel === 'media' && (
              <div
                role="dialog"
                aria-label="Insert media"
                className="absolute right-[64px] top-4 z-30 w-72 max-w-[calc(100vw-76px)] bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 animate-in fade-in slide-in-from-right-2 duration-150 max-h-[calc(100%-2rem)] overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-gray-800">Media</h4>
                  <button
                    onClick={() => setRailPanel(null)}
                    className="text-gray-400 hover:text-gray-600 cursor-pointer"
                    aria-label="Close panel"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <button
                  onClick={() => insertFileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/60 transition-colors cursor-pointer text-xs font-semibold text-gray-700 mb-3"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Upload image
                </button>

                <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">
                  Image from URL
                </label>
                <div className="flex gap-1.5 mb-3">
                  <input
                    type="url"
                    value={mediaUrl}
                    onChange={e => setMediaUrl(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') insertImageUrl()
                    }}
                    placeholder="https://…"
                    aria-label="Image URL"
                    className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                  />
                  <button
                    onClick={insertImageUrl}
                    className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 transition-colors cursor-pointer shrink-0"
                  >
                    Add
                  </button>
                </div>

                <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">
                  QR code
                </label>
                <div className="flex gap-1.5 mb-3">
                  <input
                    type="text"
                    value={qrText}
                    onChange={e => setQrText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') insertQr()
                    }}
                    placeholder="Link or text…"
                    aria-label="QR code content"
                    className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                  />
                  <button
                    onClick={insertQr}
                    className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 transition-colors cursor-pointer shrink-0"
                  >
                    Add
                  </button>
                </div>

                <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1.5">
                  Icons
                </label>
                <div className="grid grid-cols-6 gap-1">
                  {ICONS.map(name => (
                    <button
                      key={name}
                      onClick={() => insertIcon(name)}
                      title={`Insert ${name} icon`}
                      aria-label={`Insert ${name} icon`}
                      className="aspect-square flex items-center justify-center rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/60 transition-colors cursor-pointer text-indigo-600"
                      dangerouslySetInnerHTML={{
                        __html: createIconBlockHTML(name)
                          .replace('width="48" height="48"', 'width="18" height="18"')
                          .replace(/margin:[^;]+;/, ''),
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* The vertical rail */}
            <div className="w-[56px] shrink-0 bg-white border-l border-gray-200 flex flex-col items-center py-4 gap-1.5 z-20 overflow-y-auto">
              <div
                className="text-[10px] font-bold text-gray-500 bg-gray-100 rounded-md px-1.5 py-1 mb-1 tabular-nums shrink-0"
                title={`Slide ${activeSlide + 1} of ${slides.length || 1}`}
              >
                {activeSlide + 1}
                <span className="text-gray-300">/</span>
                {slides.length || 1}
              </div>

              {/* Search */}
              <button
                onClick={() => setRailPanel(p => (p === 'search' ? null : 'search'))}
                className={`w-10 h-10 flex items-center justify-center rounded-xl cursor-pointer transition-colors shrink-0 ${railPanel === 'search' ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200' : 'text-gray-500 hover:bg-gray-100'}`}
                title="Search all blocks"
                aria-label="Search all blocks"
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>

              <div className="w-7 h-px bg-gray-200 my-1 shrink-0" />

              {/* Insert group */}
              <button
                onClick={() => setRailPanel(p => (p === 'text' ? null : 'text'))}
                className={`w-10 h-10 flex items-center justify-center rounded-xl cursor-pointer transition-colors shrink-0 ${railPanel === 'text' ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200' : 'text-gray-500 hover:bg-gray-100'}`}
                title="Insert text & structure"
                aria-label="Insert text and structure blocks"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 7V5h16v2" />
                  <path d="M9 19h6" />
                  <path d="M12 5v14" />
                </svg>
              </button>
              <button
                onClick={() => setRailPanel(p => (p === 'tables' ? null : 'tables'))}
                className={`w-10 h-10 flex items-center justify-center rounded-xl cursor-pointer transition-colors shrink-0 ${railPanel === 'tables' ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200' : 'text-gray-500 hover:bg-gray-100'}`}
                title="Insert tables & callouts"
                aria-label="Insert tables and callout boxes"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
                </svg>
              </button>
              <button
                onClick={() => setRailPanel(p => (p === 'media' ? null : 'media'))}
                className={`w-10 h-10 flex items-center justify-center rounded-xl cursor-pointer transition-colors shrink-0 ${railPanel === 'media' ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200' : 'text-gray-500 hover:bg-gray-100'}`}
                title="Insert media (image, QR, icons)"
                aria-label="Insert media"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                </svg>
              </button>

              {/* Smart layouts */}
              <button
                onClick={() => setRailPanel(p => (p === 'smart' ? null : 'smart'))}
                className={`w-10 h-10 flex items-center justify-center rounded-xl cursor-pointer transition-colors shrink-0 ${railPanel === 'smart' ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200' : 'text-gray-500 hover:bg-gray-100'}`}
                title="Insert smart layouts (stats, bars, timeline…)"
                aria-label="Insert smart layouts"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </button>

              {/* Data charts */}
              <button
                onClick={() => setRailPanel(p => (p === 'charts' ? null : 'charts'))}
                className={`w-10 h-10 flex items-center justify-center rounded-xl cursor-pointer transition-colors shrink-0 ${railPanel === 'charts' ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200' : 'text-gray-500 hover:bg-gray-100'}`}
                title="Insert a data chart (bar, line, pie)"
                aria-label="Insert data chart"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                  <path d="M22 12A10 10 0 0 0 12 2v10z" />
                </svg>
              </button>

              <div className="w-7 h-px bg-gray-200 my-1 shrink-0" />

              {/* Slide background */}
              <button
                onClick={() => setRailPanel(p => (p === 'slide' ? null : 'slide'))}
                className={`w-10 h-10 flex items-center justify-center rounded-xl cursor-pointer transition-colors shrink-0 ${railPanel === 'slide' ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200' : 'text-gray-500 hover:bg-gray-100'}`}
                title="Slide background colour"
                aria-label="Slide background colour"
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Floating Element Toolbar (text formatting + layer/drag/delete) ──── */}
      {toolbarPos &&
        selectedEl &&
        selectedEl.tagName !== 'CANVAS' &&
        createPortal(
          (() => {
            const placeBelow = toolbarPos.top < 230
            const tag = selectedEl.tagName.toLowerCase()
            const isChart = selectedEl.hasAttribute('data-chart')
            const selKind: 'text' | 'image' | 'icon' | 'block' = isChart
              ? 'block'
              : tag === 'img'
                ? 'image'
                : tag === 'svg'
                  ? 'icon'
                  : 'text'
            const label = isChart
              ? 'Chart'
              : selKind === 'image'
                ? 'Image'
                : selKind === 'icon'
                  ? 'Icon'
                  : selectedEl.tagName === 'LI'
                    ? 'List'
                    : /^H[1-6]$/.test(selectedEl.tagName)
                      ? 'Heading'
                      : 'Text'
            return (
              <div
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.preventDefault()} // keep iframe selection / avoid blur jumps
                className="fixed z-[60] flex flex-wrap items-center justify-center gap-1 bg-gray-900 text-white rounded-xl shadow-2xl px-1.5 py-1.5 border border-gray-700 animate-in fade-in zoom-in-95 duration-150 max-w-[96vw]"
                style={{
                  top: placeBelow ? toolbarPos.bottom + 10 : toolbarPos.top - 10,
                  left: toolbarPos.left,
                  transform: placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
                }}
              >
                {/* Element type label */}
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-2">
                  {label}
                </span>
                <span className="w-px h-5 bg-gray-700" />

                {selKind === 'text' && (
                  <>
                    {/* Block type */}
                    <select
                      onChange={e => setBlockType(e.target.value as 'p' | 'h1' | 'h2' | 'h3')}
                      onMouseDown={e => e.stopPropagation()}
                      defaultValue=""
                      aria-label="Text style"
                      className="h-7 bg-gray-800 text-gray-200 text-[11px] font-semibold rounded-lg px-1.5 border border-gray-700 outline-none cursor-pointer hover:bg-gray-700 transition-colors"
                      title="Text style"
                    >
                      <option value="" disabled>
                        Style
                      </option>
                      <option value="p">Normal text</option>
                      <option value="h1">Heading 1</option>
                      <option value="h2">Heading 2</option>
                      <option value="h3">Heading 3</option>
                    </select>
                    <span className="w-px h-5 bg-gray-700" />

                    {/* Font size */}
                    <button
                      onClick={() => changeSelectedFontSize(false)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 text-gray-200 text-base font-bold cursor-pointer transition-colors"
                      title="Decrease size"
                      aria-label="Decrease font size"
                    >
                      −
                    </button>
                    <span className="text-[11px] font-mono font-semibold text-gray-200 min-w-[34px] text-center tabular-nums">
                      {selectedFontSize ? parseInt(selectedFontSize, 10) : '—'}
                    </span>
                    <button
                      onClick={() => changeSelectedFontSize(true)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 text-gray-200 text-base font-bold cursor-pointer transition-colors"
                      title="Increase size"
                      aria-label="Increase font size"
                    >
                      +
                    </button>
                    <span className="w-px h-5 bg-gray-700" />

                    {/* Bold / Italic / Underline */}
                    <button
                      onClick={toggleBold}
                      aria-pressed={textFormat.bold}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer transition-colors font-bold text-sm ${textFormat.bold ? 'bg-indigo-500 text-white' : 'hover:bg-gray-700 text-gray-200'}`}
                      title="Bold"
                    >
                      B
                    </button>
                    <button
                      onClick={toggleItalic}
                      aria-pressed={textFormat.italic}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer transition-colors italic text-sm font-serif ${textFormat.italic ? 'bg-indigo-500 text-white' : 'hover:bg-gray-700 text-gray-200'}`}
                      title="Italic"
                    >
                      I
                    </button>
                    <button
                      onClick={toggleUnderline}
                      aria-pressed={textFormat.underline}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer transition-colors text-sm underline ${textFormat.underline ? 'bg-indigo-500 text-white' : 'hover:bg-gray-700 text-gray-200'}`}
                      title="Underline"
                    >
                      U
                    </button>
                    <button
                      onClick={toggleStrike}
                      className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer transition-colors text-sm line-through hover:bg-gray-700 text-gray-200"
                      title="Strikethrough"
                    >
                      S
                    </button>
                    <span className="w-px h-5 bg-gray-700" />

                    {/* Code / superscript / link / clear */}
                    <button
                      onClick={insertInlineCode}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 text-gray-200 cursor-pointer transition-colors"
                      title="Inline code"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                      </svg>
                    </button>
                    <button
                      onClick={toggleSuperscript}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 text-gray-200 cursor-pointer transition-colors text-xs font-bold"
                      title="Superscript"
                    >
                      x²
                    </button>
                    <button
                      onClick={toggleLink}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 text-gray-200 cursor-pointer transition-colors"
                      title="Link / unlink"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    </button>
                    <button
                      onClick={clearFormatting}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 text-gray-200 cursor-pointer transition-colors"
                      title="Clear formatting"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 7V4h16v3" />
                        <path d="M5 20h6" />
                        <path d="M13 4 8 20" />
                        <line x1="15" y1="15" x2="20" y2="20" />
                        <line x1="20" y1="15" x2="15" y2="20" />
                      </svg>
                    </button>
                    <span className="w-px h-5 bg-gray-700" />

                    {/* Alignment */}
                    {(['left', 'center', 'right'] as const).map(al => (
                      <button
                        key={al}
                        onClick={() => setTextAlign(al)}
                        aria-pressed={textFormat.align === al}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer transition-colors ${textFormat.align === al ? 'bg-indigo-500 text-white' : 'hover:bg-gray-700 text-gray-200'}`}
                        title={`Align ${al}`}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <line x1="3" y1="6" x2="21" y2="6" />
                          <line
                            x1="3"
                            y1="12"
                            x2={al === 'left' ? '15' : al === 'center' ? '18' : '21'}
                            y2="12"
                            transform={
                              al === 'center'
                                ? 'translate(-1.5 0)'
                                : al === 'right'
                                  ? 'translate(0 0)'
                                  : ''
                            }
                          />
                          <line
                            x1={al === 'right' ? '9' : al === 'center' ? '6' : '3'}
                            y1="18"
                            x2={al === 'right' ? '21' : al === 'center' ? '18' : '15'}
                            y2="18"
                          />
                        </svg>
                      </button>
                    ))}
                    <span className="w-px h-5 bg-gray-700" />

                    {/* Text color */}
                    <div
                      className="relative w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 cursor-pointer transition-colors"
                      title="Text color"
                    >
                      <span className="text-[13px] font-bold leading-none">A</span>
                      <span
                        className="absolute bottom-1 left-1/2 -translate-x-1/2 w-3.5 h-1 rounded-sm"
                        style={{ backgroundColor: selectedColor || '#ffffff' }}
                      />
                      <input
                        type="color"
                        aria-label="Text color"
                        value={
                          normalizeColor(selectedColor).startsWith('#') &&
                          normalizeColor(selectedColor).length === 7
                            ? normalizeColor(selectedColor)
                            : '#ffffff'
                        }
                        onChange={e => changeSelectedColor(e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>

                    {/* Highlight color */}
                    <div
                      className="relative w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 cursor-pointer transition-colors"
                      title="Highlight"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m9 11-6 6v3h3l6-6" />
                        <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
                      </svg>
                      <span
                        className="absolute bottom-1 left-1/2 -translate-x-1/2 w-3.5 h-1 rounded-sm"
                        style={{ backgroundColor: highlightColor }}
                      />
                      <input
                        type="color"
                        aria-label="Highlight color"
                        value={highlightColor}
                        onChange={e => changeHighlight(e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>

                    {/* Bullet color (list items only) */}
                    {selectedEl.tagName === 'LI' && (
                      <div
                        className="relative w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 cursor-pointer transition-colors"
                        title="Bullet color"
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: selectedBulletColor || '#ffffff' }}
                        />
                        <input
                          type="color"
                          aria-label="Bullet color"
                          value={
                            normalizeColor(selectedBulletColor).startsWith('#') &&
                            normalizeColor(selectedBulletColor).length === 7
                              ? normalizeColor(selectedBulletColor)
                              : '#ffffff'
                          }
                          onChange={e => changeSelectedBulletColor(e.target.value)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                      </div>
                    )}

                    {/* Border/accent color (only when element has a border) */}
                    {selectedBorderColor && (
                      <div
                        className="relative w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 cursor-pointer transition-colors"
                        title="Border / accent color"
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect
                            x="3"
                            y="3"
                            width="18"
                            height="18"
                            rx="2"
                            style={{ stroke: selectedBorderColor }}
                          />
                        </svg>
                        <input
                          type="color"
                          aria-label="Border color"
                          value={
                            normalizeColor(selectedBorderColor).startsWith('#') &&
                            normalizeColor(selectedBorderColor).length === 7
                              ? normalizeColor(selectedBorderColor)
                              : '#000000'
                          }
                          onChange={e => changeSelectedBorderColor(e.target.value)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                      </div>
                    )}
                    <span className="w-px h-5 bg-gray-700" />
                  </>
                )}

                {selKind === 'image' && (
                  <>
                    <button
                      onClick={replaceSelectedImage}
                      className="px-2 h-7 flex items-center gap-1 rounded-lg hover:bg-gray-700 text-gray-200 text-xs font-semibold cursor-pointer transition-colors"
                      title="Replace image"
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      Replace
                    </button>
                    <span className="w-px h-5 bg-gray-700" />
                  </>
                )}

                {/* Layer control */}
                <div role="group" aria-label="Layer" className="flex items-center gap-0.5">
                  {(
                    [
                      ['inline', 'Inline', 'In'],
                      ['front', 'Bring to front', 'Front'],
                      ['back', 'Send behind text', 'Back'],
                    ] as [LayerMode, string, string][]
                  ).map(([m, title, short]) => (
                    <button
                      key={m}
                      onClick={() => setLayer(m)}
                      aria-pressed={layerMode === m}
                      title={title}
                      className={`px-1.5 h-7 flex items-center justify-center rounded-lg cursor-pointer transition-colors text-[10px] font-bold uppercase tracking-wide ${layerMode === m ? 'bg-indigo-500 text-white' : 'hover:bg-gray-700 text-gray-300'}`}
                    >
                      {short}
                    </button>
                  ))}
                </div>
                <span className="w-px h-5 bg-gray-700" />

                {/* Delete */}
                <button
                  onClick={deleteSelectedElement}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/80 text-gray-200 hover:text-white cursor-pointer transition-colors"
                  title="Delete element"
                  aria-label="Delete element"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>

                <span className="w-px h-5 bg-gray-700" />
                <button
                  onClick={deselectElement}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white cursor-pointer transition-colors"
                  title="Done"
                  aria-label="Deselect"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )
          })(),
          document.body,
        )}

      {/* ── Selection box: drag border to move, handles to resize, knob to rotate ── */}
      {selBox &&
        selectedEl &&
        selectedEl.tagName !== 'CANVAS' &&
        createPortal(
          <div
            className="fixed z-[55] pointer-events-none"
            style={{
              left: selBox.cx,
              top: selBox.cy,
              width: selBox.w,
              height: selBox.h,
              transform: `translate(-50%, -50%) rotate(${selBox.angle}deg)`,
            }}
          >
            {/* outline */}
            <div className="absolute inset-0 border-2 border-indigo-500 rounded-[2px]" />

            {/* draggable border bars (move) */}
            {(
              [
                { k: 'top', s: { top: -5, left: 8, right: 8, height: 10 } },
                { k: 'bottom', s: { bottom: -5, left: 8, right: 8, height: 10 } },
                { k: 'left', s: { left: -5, top: 8, bottom: 8, width: 10 } },
                { k: 'right', s: { right: -5, top: 8, bottom: 8, width: 10 } },
              ] as { k: string; s: React.CSSProperties }[]
            ).map(({ k, s }) => (
              <div
                key={k}
                onPointerDown={onBoxMovePointerDown}
                className="absolute pointer-events-auto cursor-move touch-none"
                style={s}
              />
            ))}

            {/* resize handles */}
            {(
              [
                ['nw', { top: -6, left: -6, cursor: 'nwse-resize' }],
                ['n', { top: -6, left: '50%', marginLeft: -6, cursor: 'ns-resize' }],
                ['ne', { top: -6, right: -6, cursor: 'nesw-resize' }],
                ['e', { top: '50%', right: -6, marginTop: -6, cursor: 'ew-resize' }],
                ['se', { bottom: -6, right: -6, cursor: 'nwse-resize' }],
                ['s', { bottom: -6, left: '50%', marginLeft: -6, cursor: 'ns-resize' }],
                ['sw', { bottom: -6, left: -6, cursor: 'nesw-resize' }],
                ['w', { top: '50%', left: -6, marginTop: -6, cursor: 'ew-resize' }],
              ] as [ResizeDir, React.CSSProperties][]
            ).map(([dir, st]) => (
              <div
                key={dir}
                onPointerDown={onResizePointerDown(dir)}
                className="absolute w-3 h-3 bg-white border-2 border-indigo-500 rounded-[3px] shadow-sm pointer-events-auto touch-none"
                style={st}
                role="slider"
                aria-label={`Resize ${dir}`}
              />
            ))}

            {/* rotate handle */}
            <div
              className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
              style={{ top: -30 }}
            >
              <div className="w-px h-5 bg-indigo-500 mx-auto" />
              <div
                onPointerDown={onRotatePointerDown}
                className="w-4 h-4 -mt-0.5 bg-white border-2 border-indigo-500 rounded-full shadow-sm pointer-events-auto cursor-grab active:cursor-grabbing touch-none"
                role="slider"
                aria-label="Rotate"
                title="Rotate"
              />
            </div>
          </div>,
          document.body,
        )}

      {/* ── Onboarding hint ──────────────────────────────────────────────── */}
      {!loadingHtml && htmlContent && showHint && !selectedEl && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-900 text-white text-xs font-medium px-4 py-2.5 rounded-xl shadow-2xl border border-gray-700 animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-[92vw]">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-indigo-400 shrink-0"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          <span>
            <span className="font-bold">Click any text</span> to edit it inline, or a chart/image to
            customize. A toolbar appears for formatting.
          </span>
          <button
            onClick={() => {
              setShowHint(false)
              localStorage.setItem('pdfEditorHintDismissed', '1')
            }}
            className="ml-1 text-gray-400 hover:text-white transition-colors cursor-pointer shrink-0"
            title="Got it"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Hidden file input for replacing an existing image */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      {/* Hidden file input for inserting a brand-new image */}
      <input
        type="file"
        ref={insertFileInputRef}
        onChange={handleInsertFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* "Preparing your PDF…" — shown while waiting for the background regeneration to finish */}
      {awaitingServerPdf &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl px-7 py-6 flex flex-col items-center gap-3 max-w-xs mx-4 text-center">
              <span className="w-9 h-9 border-[3px] border-gray-200 border-t-indigo-600 rounded-full animate-spin" />
              <div>
                <p className="text-sm font-bold text-gray-900">Preparing your PDF…</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Generating a high-quality file. It’ll download automatically when ready.
                </p>
              </div>
              <button
                onClick={() => setAwaitingServerPdf(false)}
                className="mt-1 text-xs font-semibold text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
