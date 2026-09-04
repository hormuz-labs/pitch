/**
 * Deck build tools — pi extension for the studio's deck flow. These tools run
 * on the HOST because the agent's own bash lives in a Gondolin VM with no
 * browser and no network (it does have node), and every step below needs one
 * or both. They wrap the executable steps of the ppt-generator / ppt-enhancer
 * pipeline:
 *
 *   pdf_parse          parse an uploaded PDF/PPTX into build/parsed-slides.json
                      (+ build/input-images/ for a preserved PPTX)
   pdf_scaffold       copy the builder (+ inject the chosen template's
 *                      layouts/CSS) into <workspace>/build/, ready for CONFIG
 *                      authoring
 *   pdf_scrape_images  fetch Pinterest/Unsplash images (Gemini fallback) for the
 *                      deck's keywords into <workspace>/build/images/<keyword>/
 *   pdf_build          run build/pdf-builder.js (Playwright HTML→PDF + DOM QA +
 *                      slide screenshots) and promote build/output.html to
 *                      <workspace>/deck.html — the deck the studio previews
 *
 * The build directory is `<ctx.cwd>/build` — the session's cwd is the project
 * workspace, mounted at /workspace inside the agent's VM, so the agent edits
 * `build/pdf-builder.js` and reads `build/qa-renders/*.png` with its built-in
 * tools. The skill scripts themselves are unchanged: the scraper still writes
 * under <repo>/pptx/ppt-<topic>/ and the builder still copies its outputs to
 * $WORKSPACE_ROOT/pptx/ppt-<jobId>/, so these tools point those at scratch
 * locations and move the results into the workspace.
 */

import { execFile, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { hostAction } from '../lib/studio-host.ts'

const execFileAsync = promisify(execFile)
const BIG_BUFFER = 64 * 1024 * 1024

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')
const SKILLS_DIR = path.join(REPO_ROOT, '.pi', 'skills')
const PPT_SKILL = path.join(SKILLS_DIR, 'ppt-generator')
const TEMPLATE_SKILL = path.join(SKILLS_DIR, 'template-ppt')
/** Where scrape_images.js writes (path.resolve(__dirname, '../../../../pptx') from ppt-generator/reference). */
const SCRAPER_PPTX_DIR = path.join(REPO_ROOT, 'pptx')

function text(out: string) {
  return { content: [{ type: 'text' as const, text: out }], details: {} }
}

/** The session's cwd is the project workspace. */
function workspaceDir(ctx: any): string {
  return ctx?.cwd || process.env.WORKSPACE_DIR || process.cwd()
}

function buildDirOf(ctx: any): string {
  return path.join(workspaceDir(ctx), 'build')
}

/**
 * The skill scripts are plain Node programs (playwright, CommonJS requires).
 * The studio itself may run under Bun, so prefer a real `node` on PATH and
 * fall back to the current runtime only when none is installed.
 */
function nodeBinary(): string {
  if (process.env.STUDIO_NODE) return process.env.STUDIO_NODE
  if (/\/node$/.test(process.execPath)) return process.execPath
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (dir && fs.existsSync(path.join(dir, 'node'))) return path.join(dir, 'node')
  }
  return process.execPath
}
const NODE = nodeBinary()

// Playwright may be installed globally (Dockerfile.base: `npm install -g
// playwright`) or in the repo's node_modules — scripts running from the
// workspace (outside any package) resolve it via NODE_PATH. Cached; failures
// just leave the global root out.
let globalNodeModules: string | null | undefined
function npmGlobalRoot(): string | null {
  if (globalNodeModules === undefined) {
    try {
      globalNodeModules = execFileSync('npm', ['root', '-g'], { encoding: 'utf-8' }).trim() || null
    } catch {
      globalNodeModules = null
    }
  }
  return globalNodeModules
}

function nodeEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra }
  const roots = [path.join(REPO_ROOT, 'node_modules'), npmGlobalRoot(), env.NODE_PATH].filter(
    (p): p is string => Boolean(p),
  )
  env.NODE_PATH = roots.join(path.delimiter)
  return env
}

const TEMPLATE_DIRS: Record<string, string> = {
  BRUTALIST_NEWSPAPER: 'brutalist-newspaper',
  MINIMAL_CORPORATE: 'minimal-corporate',
  DARK_TECH: 'dark-tech',
  COMIC_POP: 'comic-pop',
  TECH_DUEL: 'tech-duel',
  STARTUP_AMPLIFY: 'startup-amplify',
}

// Mirrors of the scraper's own slug functions, so we know where it wrote.
function slugifyKeyword(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 40)
}
function slugifyTopic(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
}

function listFiles(dir: string): string[] {
  return fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f))
        .sort()
    : []
}

export default function pdfTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'pdf_scaffold',
    label: 'Scaffold deck build',
    description:
      'Set up the deck build directory `build/` in your workspace: copies pdf-builder-template.js in as ' +
      "build/pdf-builder.js (with the template's layouts/CSS injected when a template is given), stages " +
      'the DOM-QA script, and pre-fills CONFIG.jobId. Call this ONCE, after loading the skill and before ' +
      'scraping images or authoring the CONFIG; then edit the CONFIG object inside build/pdf-builder.js ' +
      'with the built-in edit tool. Refuses to overwrite an existing build/pdf-builder.js unless `force` ' +
      'is true (that discards the CONFIG you authored).',
    parameters: Type.Object({
      template: Type.Optional(
        Type.String({
          description:
            'Optional template id: BRUTALIST_NEWSPAPER | MINIMAL_CORPORATE | DARK_TECH | COMIC_POP | ' +
            "TECH_DUEL | STARTUP_AMPLIFY. When set, the template's skill.md layouts/CSS are injected into the builder.",
        }),
      ),
      force: Type.Optional(
        Type.Boolean({
          description: 'Overwrite an existing build/pdf-builder.js (default false).',
        }),
      ),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceDir(ctx)
      const buildDir = buildDirOf(ctx)
      const builderOut = path.join(buildDir, 'pdf-builder.js')
      try {
        if (fs.existsSync(builderOut) && !args.force) {
          return text(
            `build/pdf-builder.js already exists — edit its CONFIG instead, or call pdf_scaffold with force: true to start over.`,
          )
        }
        fs.mkdirSync(path.join(buildDir, 'reference'), { recursive: true })

        const builderTemplate = path.join(PPT_SKILL, 'pdf-builder-template.js')
        if (!fs.existsSync(builderTemplate))
          return text(`ERROR: builder template not found at ${builderTemplate}`)
        fs.copyFileSync(
          path.join(PPT_SKILL, 'reference', 'qa-dom.js'),
          path.join(buildDir, 'reference', 'qa-dom.js'),
        )

        let injected = false
        if (args.template) {
          const dirName = TEMPLATE_DIRS[args.template]
          if (!dirName) {
            return text(
              `ERROR: unknown template "${args.template}". Known: ${Object.keys(TEMPLATE_DIRS).join(', ')}`,
            )
          }
          const templateSkillMd = path.join(TEMPLATE_SKILL, 'templates', dirName, 'skill.md')
          if (!fs.existsSync(templateSkillMd))
            return text(`ERROR: template skill.md not found at ${templateSkillMd}`)
          const injector = path.join(TEMPLATE_SKILL, 'scripts', 'inject_template.js')
          await execFileAsync(NODE, [injector, builderTemplate, templateSkillMd, builderOut], {
            cwd: REPO_ROOT,
            env: nodeEnv(),
            maxBuffer: BIG_BUFFER,
          })
          injected = true
        } else {
          fs.copyFileSync(builderTemplate, builderOut)
        }

        // CONFIG.jobId only names the builder's courtesy copy folder; pre-fill
        // it with the workspace name so the agent never has to think about it.
        const jobId = path.basename(ws)
        const src = fs.readFileSync(builderOut, 'utf8')
        const patched = src.replace(/jobId:\s*(['"])\1/, `jobId: '${jobId.replace(/'/g, '')}'`)
        if (patched !== src) fs.writeFileSync(builderOut, patched, 'utf8')

        return text(
          `Build directory ready: build/ (in your workspace)\n` +
            `- builder: build/pdf-builder.js${injected ? ` (template ${args.template} injected)` : ''} — CONFIG.jobId is pre-filled${args.template ? `; set CONFIG.template to "${args.template}"` : ''}\n` +
            `- DOM QA: build/reference/qa-dom.js (runs inside pdf_build)\n` +
            `Next: pdf_scrape_images for your keywords, author the CONFIG object in build/pdf-builder.js ` +
            `(image paths relative to build/, e.g. getBase64Image('images/<keyword>/pinterest_01.jpg')), then pdf_build.`,
        )
      } catch (e) {
        return text(`ERROR: scaffold failed — ${e instanceof Error ? e.message : String(e)}`)
      }
    },
  })

  pi.registerTool({
    name: 'pdf_scrape_images',
    label: 'Scrape deck images',
    description:
      'Fetch images for the deck (this is the ONLY way to get images — your bash has no network). Runs the ' +
      'Pinterest → Unsplash → Gemini-fallback scraper for each keyword and writes the files under ' +
      'build/images/<keyword-slug>/ in your workspace; the result lists exactly what landed. Reference those ' +
      "files from the CONFIG relative to build/ (getBase64Image('images/<keyword-slug>/<file>')).",
    parameters: Type.Object({
      keywords: Type.Array(Type.String(), {
        description:
          'Concise search keywords, one per image topic (e.g. ["istanbul skyline", "coffee shop"]).',
      }),
      richPrompts: Type.Optional(
        Type.Record(Type.String(), Type.String(), {
          description:
            'Optional map of keyword → rich image prompt, passed to the Gemini fallback ' +
            '(--rich-prompt keyword::prompt). Only used if scraping comes up short.',
        }),
      ),
      engineOrder: Type.Optional(
        Type.String({
          description:
            'Which sources to try, in order, comma-separated from pinterest, unsplash, gemini. ' +
            'Default is pinterest,unsplash,gemini. Templates whose image_source is "gemini-only" ' +
            'want "gemini,pinterest" so the look is generated rather than scraped.',
        }),
      ),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      const script = path.join(PPT_SKILL, 'reference', 'scrape_images.js')
      if (!fs.existsSync(script)) return text(`ERROR: scraper not found at ${script}`)
      const keywords: string[] = (args.keywords ?? [])
        .map((k: unknown) => String(k).trim())
        .filter(Boolean)
      if (!keywords.length) return text('ERROR: provide at least one keyword')

      // The scraper writes to <repo>/pptx/ppt-<topic-slug>/images/<keyword-slug>/;
      // give it a unique scratch topic and move the results into the workspace.
      const scratchTopic = `s${Math.random().toString(36).slice(2, 8)}-${path.basename(workspaceDir(ctx))}`
      const scratchDir = path.join(SCRAPER_PPTX_DIR, `ppt-${slugifyTopic(scratchTopic)}`)
      const imagesDir = path.join(buildDirOf(ctx), 'images')

      const scriptArgs = [script, '--topic', scratchTopic, '--keywords', ...keywords]
      for (const [kw, prompt] of Object.entries(args.richPrompts || {})) {
        scriptArgs.push('--rich-prompt', `${kw}::${prompt}`)
      }
      if (args.engineOrder) {
        const order = String(args.engineOrder)
          .split(',')
          .map(e => e.trim().toLowerCase())
          .filter(e => ['pinterest', 'unsplash', 'gemini'].includes(e))
        if (!order.length) return text('ERROR: engineOrder must name pinterest, unsplash or gemini')
        scriptArgs.push('--engine-order', order.join(','))
      }
      let log = ''
      let failure: string | null = null
      try {
        const { stdout, stderr } = await execFileAsync(NODE, scriptArgs, {
          cwd: REPO_ROOT,
          env: nodeEnv(),
          maxBuffer: BIG_BUFFER,
          timeout: 8 * 60 * 1000,
        })
        log = `${stdout}\n${stderr}`.trim()
      } catch (e: any) {
        log = `${e.stdout || ''}\n${e.stderr || ''}`.trim()
        failure = e.message
      }

      const lines: string[] = []
      try {
        fs.mkdirSync(imagesDir, { recursive: true })
        for (const kw of keywords) {
          const slug = slugifyKeyword(kw)
          const src = path.join(scratchDir, 'images', slug)
          const dst = path.join(imagesDir, slug)
          if (fs.existsSync(src)) fs.cpSync(src, dst, { recursive: true, force: true })
          const files = listFiles(dst)
          lines.push(
            `- "${kw}" → build/images/${slug}/ : ${files.length ? files.join(', ') : 'NO IMAGES (pick another keyword or drop the image)'}`,
          )
        }
      } finally {
        fs.rmSync(scratchDir, { recursive: true, force: true })
      }

      const head = failure
        ? `Scraper exited with an error (${failure}); partial results:`
        : 'Images written:'
      return text(
        `${head}\n${lines.join('\n')}\n\n--- scraper output (tail) ---\n${log.slice(-3000)}`,
      )
    },
  })

  pi.registerTool({
    name: 'pdf_parse',
    label: 'Parse a presentation',
    description:
      'Parse an uploaded PDF or PPTX in the workspace into build/parsed-slides.json — the structured ' +
      'slide text the enhance workflow outlines from — and, for a PPTX in preserve mode, extract its ' +
      'embedded images into build/input-images/. An attached deck is normally parsed for you before your ' +
      'first turn, so call this ONLY when build/parsed-slides.json is missing, or when the user changes ' +
      'the mode (recreate ⇄ preserve) after the fact. It rewrites the file, so never call it to "check".',
    parameters: Type.Object({
      file: Type.String({
        description:
          'Workspace-relative .pdf or .pptx, e.g. "input/pitch.pdf" or "uploads/deck.pptx"',
      }),
      mode: Type.Optional(
        Type.Union([Type.Literal('recreate'), Type.Literal('preserve')], {
          description:
            'recreate (default) rebuilds the design from scratch and keeps only the content; ' +
            'preserve keeps the slide count, the headings and the original embedded images.',
        }),
      ),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(ctx.cwd, 'pdf_parse', { file: args.file, mode: args.mode }))
    },
  })

  pi.registerTool({
    name: 'pdf_build',
    label: 'Build deck',
    description:
      'Build the deck from build/pdf-builder.js (the ONLY way to run it — the builder needs Playwright ' +
      'and the network, and your VM has neither). ' +
      'Renders the CONFIG slides via Playwright: writes build/output.html + build/output.pdf, runs the DOM QA ' +
      '(build/qa-report.json), screenshots every slide into build/qa-renders/, and on success copies ' +
      'output.html to deck.html — the deck the studio previews. Re-run after each CONFIG fix — the QA loop ' +
      'is: read build/qa-renders/*.png with the built-in read tool, patch the CONFIG/layouts with edit, then ' +
      'pdf_build again. Note: rebuilding overwrites deck.html, so hand edits made to deck.html are lost.',
    parameters: Type.Object({}),
    async execute(_id, _args: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceDir(ctx)
      const buildDir = buildDirOf(ctx)
      const builder = path.join(buildDir, 'pdf-builder.js')
      if (!fs.existsSync(builder))
        return text('ERROR: build/pdf-builder.js not found — run pdf_scaffold first.')
      if (!fs.existsSync(path.join(buildDir, 'reference', 'qa-dom.js'))) {
        fs.mkdirSync(path.join(buildDir, 'reference'), { recursive: true })
        fs.copyFileSync(
          path.join(PPT_SKILL, 'reference', 'qa-dom.js'),
          path.join(buildDir, 'reference', 'qa-dom.js'),
        )
      }
      // The builder copies its outputs to $WORKSPACE_ROOT/pptx/ppt-<jobId>/
      // (falling back to the git root); point that at scratch and drop it.
      const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-deck-build-'))
      const pdfPath = path.join(buildDir, 'output.pdf')
      const htmlPath = path.join(buildDir, 'output.html')
      const qaDir = path.join(buildDir, 'qa-renders')
      try {
        fs.rmSync(pdfPath, { force: true })
        const { stdout, stderr } = await execFileAsync(NODE, ['pdf-builder.js'], {
          cwd: buildDir,
          env: nodeEnv({ WORKSPACE_ROOT: scratchRoot }),
          maxBuffer: BIG_BUFFER,
          timeout: 10 * 60 * 1000,
        })
        const out = `${stdout}\n${stderr}`.trim()
        const renders = fs.existsSync(qaDir)
          ? fs
              .readdirSync(qaDir)
              .filter(f => f.endsWith('.png'))
              .sort(
                (a, b) =>
                  Number.parseInt(a.replace(/\D/g, ''), 10) -
                  Number.parseInt(b.replace(/\D/g, ''), 10),
              )
          : []

        const ok = fs.existsSync(pdfPath) && fs.existsSync(htmlPath)
        if (ok) fs.copyFileSync(htmlPath, path.join(ws, 'deck.html'))

        return text(
          `Build ${ok ? 'finished' : 'did not produce both outputs'}.\n` +
            `- build/output.pdf: ${fs.existsSync(pdfPath) ? 'OK' : 'MISSING'}\n` +
            `- build/output.html: ${fs.existsSync(htmlPath) ? 'OK' : 'MISSING'}\n` +
            `- deck.html: ${ok ? 'updated from build/output.html (the studio preview reloads)' : 'unchanged'}\n` +
            `- qa-renders: ${renders.length} slide screenshot(s) in build/qa-renders/` +
            `${renders.length ? ` — ${renders.join(', ')}` : ''}\n` +
            `${renders.length ? '\nRead each PNG (build/qa-renders/<file>) with the read tool for Visual QA; patch build/pdf-builder.js and re-run pdf_build on any defect. When every slide is clean, deck_publish.\n' : ''}` +
            `\n--- build output (tail) ---\n${out.slice(-4000)}`,
        )
      } catch (e: any) {
        const out = `${e.stdout || ''}\n${e.stderr || ''}`.trim()
        return text(
          `ERROR: build failed — ${e.message}\n(DOM QA failures are listed below; fix them in build/pdf-builder.js and run pdf_build again. deck.html was not updated.)\n${out.slice(-3000)}`,
        )
      } finally {
        fs.rmSync(scratchRoot, { recursive: true, force: true })
      }
    },
  })
}
