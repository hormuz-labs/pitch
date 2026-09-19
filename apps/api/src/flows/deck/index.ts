/**
 * Slide deck: generate from a topic, enhance an uploaded PDF/PPTX, and edit
 * the result by chat — one agent, one workspace. The deck is `deck.html`
 * (one `.slide` per 1280×720 page) built by the slide-deck builder from
 * `build/pdf-builder.js` through the pdf_* host tools; `deck_render` looks at
 * pages, `deck_publish` uploads the HTML and a fresh PDF as the outputs.
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import * as storage from '@saas/storage'
import { nodeBinary } from '../../lib/node.js'
import { addOutput } from '../../projects/service.js'
import { getBrowser } from '../../projects/thumbnails.js'
import { localPageUrl, serveLocalFiles } from '../../render/utils/manager-browser.js'
import { registerHostAction } from '../../studio/host-actions.js'
import { ROOT_DIR, SKILLS_DIR, type Workspace } from '../../studio/paths.js'
import type { Slide, TurnInput, UploadRef } from '../types.js'

const execFileAsync = promisify(execFile)
const logger = createLogger('studio:deck')

const RELEVANT = /^(deck\.html|build\/output\.(html|pdf)|renders\/.+)$/
const PARSER = path.join(SKILLS_DIR, 'slide-deck', 'scripts', 'parse_presentation.js')
const DECK_UPLOAD = /\.(pdf|pptx)$/i

type EnhanceMode = 'recreate' | 'preserve'

// ── deck.html inspection (no browser) ─────────────────────────────────────────

const TAG_OPEN = /<([a-z][\w-]*)\b[^>]*?\bclass\s*=\s*(["'])([^"']*)\2[^>]*>/gi

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** The `.slide` elements of a deck document, in order, with their first heading as title. */
export function parseSlides(html: string): Slide[] {
  const starts: number[] = []
  for (const m of html.matchAll(TAG_OPEN)) {
    if (m[3].split(/\s+/).includes('slide')) starts.push(m.index ?? 0)
  }
  return starts.map((start, i) => {
    const chunk = html.slice(start, starts[i + 1] ?? html.length)
    const heading = chunk.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)
    const title = heading ? stripTags(heading[1]).slice(0, 80) : null
    return { index: i + 1, title: title || null }
  })
}

async function readDeck(ws: Workspace): Promise<string | null> {
  const file = path.join(ws.dir, 'deck.html')
  if (!existsSync(file)) return null
  return readFile(file, 'utf8')
}

// ── workspace seeding ─────────────────────────────────────────────────────────

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not download ${url} (${res.status})`)
  await mkdir(path.dirname(dest), { recursive: true })
  await writeFile(dest, Buffer.from(await res.arrayBuffer()))
}

/**
 * Download an uploaded PDF/PPTX to input/<name> and run the skill's parser.
 * The parser writes parsed-slides.json (+ input-images/ for preserve+pptx)
 * next to its input, so the results are moved into build/ and the extracted
 * image paths rewritten relative to build/ — where the builder runs.
 */
export async function parseUpload(
  ws: Workspace,
  upload: UploadRef,
  mode: EnhanceMode,
): Promise<{ file: string; slides: number }> {
  const name = path.basename(upload.name).replace(/[^\w.-]+/g, '_') || 'input.pdf'
  const inputPath = path.join(ws.dir, 'input', name)
  await download(upload.url, inputPath)
  return parsePresentation(ws, inputPath, mode)
}

/**
 * Parse a PDF/PPTX that is already in the workspace. Split out of parseUpload
 * because the agent needs it too: an enhance mode is chosen at creation, but
 * the user can change their mind mid-conversation ("keep the original
 * layout"), and a pre-parse that failed used to leave no way back.
 */
export async function parsePresentation(
  ws: Workspace,
  inputPath: string,
  mode: EnhanceMode,
): Promise<{ file: string; slides: number }> {
  const name = path.basename(inputPath)
  const inputDir = path.dirname(inputPath)
  const buildDir = path.join(ws.dir, 'build')
  await mkdir(buildDir, { recursive: true })

  const { stdout, stderr } = await execFileAsync(
    nodeBinary(),
    [PARSER, '--input', inputPath, '--jobId', ws.name, '--mode', mode],
    {
      cwd: ROOT_DIR,
      env: { ...process.env, NODE_PATH: path.join(ROOT_DIR, 'node_modules') },
      maxBuffer: 16 * 1024 * 1024,
    },
  )
  if (stderr) logger.warn({ workspace: ws.internal, err: stderr.slice(0, 500) }, 'parser stderr')
  logger.info({ workspace: ws.internal, out: stdout.slice(0, 300) }, 'presentation parsed')

  const parsedSrc = path.join(inputDir, 'parsed-slides.json')
  if (!existsSync(parsedSrc)) throw new Error('The parser did not produce parsed-slides.json')
  const imagesSrc = path.join(inputDir, 'input-images')
  const imagesDst = path.join(buildDir, 'input-images')
  if (existsSync(imagesSrc)) {
    await rm(imagesDst, { recursive: true, force: true })
    await rename(imagesSrc, imagesDst)
  }
  const slides = JSON.parse(await readFile(parsedSrc, 'utf8')) as Array<Record<string, any>>
  for (const s of slides) {
    if (Array.isArray(s.extractedImages))
      s.extractedImages = s.extractedImages.map((p: string) => `input-images/${path.basename(p)}`)
  }
  await writeFile(
    path.join(buildDir, 'parsed-slides.json'),
    JSON.stringify(slides, null, 2),
    'utf8',
  )
  await rm(parsedSrc, { force: true })
  return { file: path.relative(ws.dir, inputPath), slides: slides.length }
}

export function deckUpload(uploads: UploadRef[]): UploadRef | undefined {
  return uploads.find(
    u =>
      DECK_UPLOAD.test(u.name) || u.type === 'application/pdf' || u.type.includes('presentationml'),
  )
}

export function modeOf(options: Record<string, any>): EnhanceMode {
  return options.mode === 'preserve' ? 'preserve' : 'recreate'
}

// ── host actions ──────────────────────────────────────────────────────────────

async function renderSlides(ws: Workspace, wanted?: number[]): Promise<string> {
  const html = await readDeck(ws)
  if (!html) return 'deck.html does not exist yet — nothing to render.'
  const browser = await getBrowser()
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  try {
    // The browser is in another container: it cannot see ws.dir, and
    // page.setContent never completes over a CDP connection. Serve deck.html
    // into it and navigate instead.
    await serveLocalFiles(page)
    await page.goto(localPageUrl(path.join(ws.dir, 'deck.html')), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    // Headed Chrome lays out classic scrollbars, which creep into a slide
    // screenshot; the published deck.html is not touched.
    await page
      .addStyleTag({
        content: 'html{scrollbar-width:none}::-webkit-scrollbar{width:0;height:0;display:none}',
      })
      .catch(() => {})
    await page.waitForTimeout(1200)
    const count: number = await page.evaluate(() => document.querySelectorAll('.slide').length)
    if (count === 0) return 'deck.html has no .slide elements — nothing to render.'
    const outDir = path.join(ws.dir, 'renders')
    await mkdir(outDir, { recursive: true })
    const targets = (
      wanted?.length ? wanted : Array.from({ length: count }, (_, i) => i + 1)
    ).filter(n => n >= 1 && n <= count)
    const lines: string[] = []
    for (const n of targets) {
      const el = page.locator('.slide').nth(n - 1)
      // JPEG: the agent reads these, and every read rides along on each later
      // model request — a quality-82 JPEG is a sixth of the PNG.
      const rel = `renders/slide-${String(n).padStart(2, '0')}.jpg`
      await el.screenshot({ path: path.join(ws.dir, rel), type: 'jpeg', quality: 82 })
      const overflow = await el.evaluate(node => {
        const r = node.getBoundingClientRect()
        const bad: string[] = []
        node.querySelectorAll('*').forEach(child => {
          const c = (child as HTMLElement).getBoundingClientRect()
          if (c.width === 0 || c.height === 0) return
          if (
            c.right > r.right + 1 ||
            c.bottom > r.bottom + 1 ||
            c.left < r.left - 1 ||
            c.top < r.top - 1
          ) {
            const tag = child.tagName.toLowerCase()
            const cls = (child as HTMLElement).className?.toString().split(' ')[0]
            bad.push(cls ? `${tag}.${cls}` : tag)
          }
        })
        return [...new Set(bad)].slice(0, 6)
      })
      lines.push(
        `slide ${n}: ${rel}${overflow.length ? `  ⚠ overflows the page: ${overflow.join(', ')}` : ''}`,
      )
    }
    return `${count} slides in deck.html\n${lines.join('\n')}`
  } finally {
    await page.close().catch(() => {})
  }
}

/**
 * Render deck.html to build/output.pdf: one 1280×720 page per .slide. Just
 * the render — no storage upload, no outputs. The export action calls this
 * after flushing the live editor, so downloads always use current HTML without
 * making ordinary autosaves wait for a browser and PDF generation.
 */
export async function renderDeckPdf(wsDir: string): Promise<void> {
  const deck = path.join(wsDir, 'deck.html')
  if (!existsSync(deck)) return
  const out = path.join(wsDir, 'build', 'output.pdf')
  await mkdir(path.dirname(out), { recursive: true })
  const browser = await getBrowser()
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  try {
    await serveLocalFiles(page)
    await page.goto(localPageUrl(deck), {
      waitUntil: 'load',
      timeout: 30000,
    })
    // Old saves may contain runtime inspector nodes from before serialization
    // stripped them. Never let editor-only target boxes reach a PDF export.
    await page.addStyleTag({
      content: '#studio-inspect-overlay,[data-studio-box]{display:none!important}',
    })
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
    await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
    await page.waitForTimeout(1500)
    await page.pdf({ path: out, width: '1280px', height: '720px', printBackground: true })
  } finally {
    await page.close().catch(() => {})
  }
}

/** Render deck.html to build/output.pdf and return the path. */
async function renderPdf(ws: Workspace): Promise<string> {
  await renderDeckPdf(ws.dir)
  return path.join(ws.dir, 'build', 'output.pdf')
}

async function publish(ws: Workspace, summary: string): Promise<string> {
  const html = await readDeck(ws)
  if (!html) throw new Error('deck.html does not exist — build or write the deck first')
  if (parseSlides(html).length === 0)
    throw new Error('deck.html has no .slide pages — refusing to publish')
  const row = await db.prisma.project.findFirst({
    where: { userId: ws.userId, name: ws.name },
  })
  if (!row) throw new Error('This workspace is not bound to a deck project')

  const pdfPath = await renderPdf(ws)
  const prefix = `pitch/${ws.userId}/${ws.name}/deck`
  const htmlUrl = await storage.uploadFile(path.join(ws.dir, 'deck.html'), undefined, prefix)
  const pdfUrl = await storage.uploadFile(pdfPath, undefined, prefix)
  const createdAt = new Date().toISOString()
  await addOutput(ws.userId, row.id, {
    kind: 'html',
    url: htmlUrl,
    label: 'Deck (HTML)',
    createdAt,
  })
  await addOutput(ws.userId, row.id, { kind: 'pdf', url: pdfUrl, label: 'Deck (PDF)', createdAt })
  await writeFile(path.join(ws.dir, '.source-url'), htmlUrl, 'utf8').catch(() => {})
  logger.info({ workspace: ws.internal, projectId: row.id }, 'deck published')
  return `Published: PDF and HTML are now the project's outputs. ${summary ?? ''}`.trim()
}

registerHostAction('pdf_parse', async (ws, p) => {
  const rel = String(p.file ?? '')
  if (!rel || path.isAbsolute(rel) || rel.includes('..'))
    throw new Error('file must be a workspace-relative path to the uploaded PDF or PPTX')
  if (!DECK_UPLOAD.test(rel)) throw new Error('only .pdf and .pptx files can be parsed')
  const abs = path.resolve(ws.dir, rel)
  if (!abs.startsWith(`${path.resolve(ws.dir)}${path.sep}`))
    throw new Error(`path escapes the workspace: "${rel}"`)
  if (!existsSync(abs)) throw new Error(`no such file in the workspace: ${rel}`)
  const mode: EnhanceMode = p.mode === 'preserve' ? 'preserve' : 'recreate'
  const { slides } = await parsePresentation(ws, abs, mode)
  return (
    `Parsed ${rel} in ${mode} mode: ${slides} slide(s) → build/parsed-slides.json` +
    `${existsSync(path.join(ws.dir, 'build', 'input-images')) ? ' (+ build/input-images/)' : ''}. ` +
    'Read the JSON before outlining; its image paths are relative to build/.'
  )
})

registerHostAction('deck_render', async (ws, p) => {
  return renderSlides(ws, Array.isArray(p.slides) ? p.slides.map(Number) : undefined)
})

registerHostAction('deck_publish', async (ws, p) => {
  return publish(ws, typeof p.summary === 'string' ? p.summary : '')
})

// ── the flow ──────────────────────────────────────────────────────────────────

function legend(turn: TurnInput): string {
  let out = ''
  if (turn.slide) out += `The user is looking at slide ${turn.slide} (1-based). `
  if (turn.targets?.length) {
    out += `\n\nTarget elements (referenced below as [n]):\n${turn.targets
      .map((t, i) => {
        const attrs = (t.className ? ` class="${t.className}"` : '') + (t.id ? ` id="${t.id}"` : '')
        return [
          `[${i + 1}] <${t.tagName ?? 'element'}${attrs}>`,
          t.slide ? `in slide ${t.slide}` : turn.slide ? `in slide ${turn.slide}` : null,
          t.text ? `text "${t.text}"` : null,
          t.selector ? `selector: ${t.selector}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      })
      .join('\n')}\n`
  }
  return out
}

function generateBrief(options: Record<string, any>): string {
  const slideCount = Number(options.slideCount) || 10
  const headings: string[] = Array.isArray(options.headings)
    ? options.headings.map(String)
    : Array.isArray(options.slideHeadings)
      ? options.slideHeadings.map(String)
      : []
  return (
    `GENERATE a new deck from the user's topic${options.topic ? ` ("${options.topic}")` : ''}. ` +
    `Slides requested: ${slideCount}. ` +
    (headings.length
      ? `Preferred slide headings, in order: ${JSON.stringify(headings)}. `
      : 'Slide headings: choose them from the topic structure. ') +
    (options.template
      ? `Template id: "${options.template}" — read the slide-deck skill, then the template's spec_lock.md and skill.md, and pass the id to pdf_scaffold. `
      : 'No template selected — follow the slide-deck skill. ') +
    'Workflow: load the skill → outline → pdf_scaffold → pdf_scrape_images → author build/deck-config.js → pdf_build → read every build/qa-renders PNG and fix until clean → deck_publish once. '
  )
}

function enhanceBrief(ws: Workspace, options: Record<string, any>): string {
  const mode = modeOf(options)
  const parsed = path.join(ws.dir, 'build', 'parsed-slides.json')
  let slides = 0
  let inputFile = ''
  try {
    if (existsSync(parsed)) slides = (JSON.parse(readFileSync(parsed, 'utf8')) as unknown[]).length
  } catch {
    slides = 0
  }
  if (typeof options.inputFile === 'string') inputFile = options.inputFile
  const hasImages = existsSync(path.join(ws.dir, 'build', 'input-images'))
  return (
    `ENHANCE the uploaded presentation${inputFile ? ` (${inputFile})` : ''} in "${mode}" mode following the slide-deck skill's enhance workflow exactly. ` +
    (existsSync(parsed)
      ? `The upload is already parsed: build/parsed-slides.json holds ${slides} slide(s) — read it first, never re-parse. `
      : 'The upload could not be parsed automatically: read input/ with your file tools and reconstruct the outline yourself. ') +
    (mode === 'preserve'
      ? `Keep the slide count and section headings. ${hasImages ? 'Extracted images are in build/input-images/ (paths in the JSON are relative to build/); list them, skip files under 5 KB, and scrape a supplementary image only where nothing usable exists. ' : 'No images could be extracted (PDF input) — scrape one image per slide that needs one. '}`
      : 'Redesign freely with fresh images and a premium palette, but every original point must survive. ') +
    `The user's message is the enhancement brief (tone, audience, extra asks). ` +
    'Workflow: load the skill → read the parsed slides → pdf_scaffold → images → author build/deck-config.js → pdf_build → read every build/qa-renders PNG and fix until clean → deck_publish once. '
  )
}
