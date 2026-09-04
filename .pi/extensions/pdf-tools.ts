/**
 * Deck build tools — pi extension for the studio's deck flow. These tools run
 * on the HOST because the agent's own bash lives in a Gondolin VM with no
 * browser and no network (it does have node), and every step below needs one
 * or both. They wrap the executable steps of the slide-deck
 * pipeline:
 *
 *   pdf_parse          parse an uploaded PDF/PPTX into build/parsed-slides.json
                      (+ build/input-images/ for a preserved PPTX)
   pdf_scaffold       copy the builder (+ inject the chosen template's
 *                      layouts/CSS) into <workspace>/build/, ready for the config
 *                      authoring
 *   pdf_scrape_images  fetch Pinterest/Unsplash images (Gemini fallback) for the
 *                      deck's keywords into <workspace>/build/images/<keyword>/
 *   pdf_build          run build/pdf-builder.js (Playwright HTML→PDF + DOM QA +
 *                      slide screenshots) and promote build/output.html to
 *                      <workspace>/deck.html — the deck the studio previews
 *
 * The build directory is `<ctx.cwd>/build` — the session's cwd is the project
 * workspace, mounted at /workspace inside the agent's VM, so the agent edits
 * `build/deck-config.js` and reads `build/qa-renders/*.jpg` with its built-in
 * tools. The skill scripts themselves are unchanged: the scraper still writes
 * under <repo>/pptx/ppt-<topic>/ and the builder still copies its outputs to
 * $WORKSPACE_ROOT/pptx/ppt-<jobId>/, so these tools point those at scratch
 * locations and move the results into the workspace.
 */

import { execFile, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { REPO_ROOT, SKILLS_DIR, workspaceOf } from '../lib/paths.ts'
import { hostAction } from '../lib/studio-host.ts'

const execFileAsync = promisify(execFile)
const BIG_BUFFER = 64 * 1024 * 1024

const DECK_SKILL = path.join(SKILLS_DIR, 'slide-deck')
/** Where scrape_images.js writes (path.resolve(__dirname, '../../../../pptx') from slide-deck/reference). */
const SCRAPER_PPTX_DIR = path.join(REPO_ROOT, 'pptx')

function text(out: string) {
  return { content: [{ type: 'text' as const, text: out }], details: {} }
}

const workspaceDir = workspaceOf

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

/**
 * The studio browser library, as a file:// URL the deck scripts can `import()`.
 *
 * They cannot reach it by a relative path: pdf_scaffold copies the builder into
 * <workspace>/build/, so "../lib/browser.mjs" would point at the workspace. And
 * they cannot reach it by a bare specifier either — NODE_PATH is a CommonJS
 * mechanism and these are ESM imports. So the tool that runs them says where it
 * is.
 */
const BROWSER_LIB = pathToFileURL(
  path.join(SKILLS_DIR, 'launch-video', 'scripts', 'lib', 'browser.mjs'),
).href

function nodeEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra, STUDIO_BROWSER_LIB: BROWSER_LIB }
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
      "Set up build/ in the workspace: writes build/deck-config.js (the theme + slides file YOU author; jobId and template pre-filled), build/pdf-builder.js (the renderer — with a template's layouts and CSS injected when one is given — which you never edit) and the DOM-QA script. Call once, before scraping images or authoring the config. Refuses to overwrite an existing deck-config.js unless force is true.",
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
      const configOut = path.join(buildDir, 'deck-config.js')
      try {
        if (fs.existsSync(configOut) && !args.force) {
          return text(
            `build/deck-config.js already exists — edit it instead, or call pdf_scaffold with force: true to start over.`,
          )
        }
        fs.mkdirSync(path.join(buildDir, 'reference'), { recursive: true })

        const builderTemplate = path.join(DECK_SKILL, 'pdf-builder-template.js')
        if (!fs.existsSync(builderTemplate))
          return text(`ERROR: builder template not found at ${builderTemplate}`)
        fs.copyFileSync(
          path.join(DECK_SKILL, 'reference', 'qa-dom.js'),
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
          const templateSkillMd = path.join(DECK_SKILL, 'templates', dirName, 'skill.md')
          if (!fs.existsSync(templateSkillMd))
            return text(`ERROR: template skill.md not found at ${templateSkillMd}`)
          const injector = path.join(DECK_SKILL, 'scripts', 'inject_template.js')
          await execFileAsync(NODE, [injector, builderTemplate, templateSkillMd, builderOut], {
            cwd: REPO_ROOT,
            env: nodeEnv(),
            maxBuffer: BIG_BUFFER,
          })
          injected = true
        } else {
          fs.copyFileSync(builderTemplate, builderOut)
        }

        // The config is the small file the agent authors; the builder it never
        // touches. jobId only names the builder's courtesy copy folder, so it
        // and the template id are pre-filled from what we already know.
        const jobId = path.basename(ws).replace(/'/g, '')
        const skeleton = fs.readFileSync(path.join(DECK_SKILL, 'deck-config-template.js'), 'utf8')
        fs.writeFileSync(
          configOut,
          skeleton
            .replace(/jobId:\s*'',/, `jobId: '${jobId}',`)
            .replace(/template:\s*'',/, `template: '${args.template ?? ''}',`),
          'utf8',
        )

        return text(
          `Build directory ready: build/ (in your workspace)\n` +
            `- build/deck-config.js — YOUR file: the theme and the slides (jobId${args.template ? ' and template' : ''} pre-filled)\n` +
            `- build/pdf-builder.js${injected ? ` (template ${args.template} injected)` : ''} — the renderer; never edit it\n` +
            `- build/reference/qa-dom.js — the DOM QA pdf_build runs\n` +
            `Next: pdf_scrape_images for your keywords, author build/deck-config.js ` +
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
      'Fetch images for the deck — the only way; your shell has no network. Runs the Pinterest → Unsplash → Gemini scraper per keyword and writes build/images/<keyword-slug>/ in the workspace; the result lists exactly what landed. Reference those files from the config relative to build/.',
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
      const script = path.join(DECK_SKILL, 'reference', 'scrape_images.js')
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
      'Parse an uploaded PDF or PPTX into build/parsed-slides.json (and, for a PPTX in preserve mode, its embedded images into build/input-images/). An attached deck is parsed before your first turn: call this only when that file is missing or the mode changed. It rewrites the file.',
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
      'Build the deck from build/deck-config.js via build/pdf-builder.js in a real browser (the only way to run it): writes build/output.html + output.pdf, runs the DOM QA (build/qa-report.json), screenshots every slide into build/qa-renders/, and on success copies output.html to deck.html — the deck the studio previews. Re-run after each config fix. Rebuilding overwrites deck.html, so hand edits made there are lost.',
    parameters: Type.Object({}),
    async execute(_id, _args: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceDir(ctx)
      const buildDir = buildDirOf(ctx)
      const builder = path.join(buildDir, 'pdf-builder.js')
      if (!fs.existsSync(builder) || !fs.existsSync(path.join(buildDir, 'deck-config.js')))
        return text(
          'ERROR: build/deck-config.js or build/pdf-builder.js is missing — run pdf_scaffold first.',
        )
      if (!fs.existsSync(path.join(buildDir, 'reference', 'qa-dom.js'))) {
        fs.mkdirSync(path.join(buildDir, 'reference'), { recursive: true })
        fs.copyFileSync(
          path.join(DECK_SKILL, 'reference', 'qa-dom.js'),
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
              .filter(f => /\.(jpe?g|png)$/i.test(f))
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
            `${renders.length ? '\nRead each render (build/qa-renders/<file>) with the read tool for Visual QA; patch build/deck-config.js and re-run pdf_build on any defect. When every slide is clean, deck_publish.\n' : ''}` +
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
