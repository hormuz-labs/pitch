/**
 * Launch films — pi extension wrapping the launch-video skill's
 * executable scripts (recon, screenshot, harvest, tts, align, sync, cues/check,
 * sfx, mix, audit, capture) plus two small host helpers (find_audio,
 * verify_duration). Every .mjs in that folder backs exactly one tool; the two
 * maintainer scripts that build the shared SFX library live in the repo's
 * scripts/ instead, since the agent never runs them.
 *
 * Every tool runs with the session's cwd — the job's sandboxed workspace — so
 * relative paths (audio/, renders/, audit/) resolve inside it.
 */

import { execFile, execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import {
  ASSETS_DIR,
  ENGINE_DIR,
  MUSIC_DIR,
  relativeIn,
  resolveIn,
  workspaceOf,
} from '../lib/paths.ts'

const execFileAsync = promisify(execFile)

/**
 * The skill scripts are plain Node programs (playwright, ffmpeg spawns). The
 * studio itself may run under Bun, so prefer a real `node` on PATH and fall
 * back to the current runtime only when none is installed.
 */
function nodeBinary(): string {
  if (process.env.STUDIO_NODE) return process.env.STUDIO_NODE
  if (/\/node$/.test(process.execPath)) return process.execPath
  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (dir && existsSync(join(dir, 'node'))) return join(dir, 'node')
  }
  return process.execPath
}
const NODE = nodeBinary()

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPTS = join(HERE, '..', 'skills', 'launch-video', 'scripts')
const MAX_BUFFER = 16 * 1024 * 1024
const AUDIO_RE = /\.(mp3|wav|m4a|aac|flac|ogg)$/i

function text(out: string) {
  return { content: [{ type: 'text' as const, text: out }], details: {} }
}

async function runScript(name: string, args: string[], cwd: string, timeoutMs = 1_200_000) {
  try {
    const { stdout, stderr } = await execFileAsync(NODE, [join(SCRIPTS, name), ...args], {
      cwd,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
      timeout: timeoutMs,
    })
    return `${stdout}\n${stderr}`.trim()
  } catch (err) {
    // A failing script's own diagnosis lives in its output, not in "Command
    // failed with exit code 1" — surface it, or the agent invents a workaround.
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const detail = `${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim() || e.message || String(err)
    throw new Error(detail)
  }
}

// ── The engine's schema, served in pieces ─────────────────────────────────────
//
// engine/schema.md is 11.6KB and the agent used to read all of it to write a
// film that touches four shot types. Read once, it is then re-sent on every
// later model request — the single largest document in a run after SKILL.md.
// So it is a tool: ask for the types you are actually using.

const SCHEMA_PATH = join(ENGINE_DIR, 'schema.md')

/**
 * The `## Types` table, as type name → its row.
 *
 * Scoped to that one section: schema.md has several tables whose first cell is
 * a backticked name, and matching them all offered `dur` and `bg` as shot
 * types.
 */
function schemaTypes(md: string): Map<string, string> {
  const out = new Map<string, string>()
  const start = md.indexOf('\n## Types')
  if (start === -1) return out
  const rest = md.slice(start + 1)
  const end = rest.indexOf('\n## ', 1)
  for (const line of (end === -1 ? rest : rest.slice(0, end)).split('\n')) {
    const m = line.match(/^\|\s*`([a-z-]+)`\s*\|(.*)\|\s*$/)
    if (m) out.set(m[1], line)
  }
  return out
}

/**
 * The DOM classes each built-in type mounts, read from the engine's own
 * factories: `beats.sel` and the studio's element targets name them, and the
 * agent used to read all 30KB of factories.js (four times, in one film) to
 * find out what they were.
 */
function factoryClasses(): Map<string, string[]> {
  const out = new Map<string, string[]>()
  let js: string
  try {
    js = readFileSync(join(ENGINE_DIR, 'js', 'factories.js'), 'utf8')
  } catch {
    return out
  }
  const registry = js.match(/"[a-z-]+":\s*\{\s*mount:\s*([A-Za-z]+)/g) ?? []
  for (const entry of registry) {
    const m = entry.match(/"([a-z-]+)":\s*\{\s*mount:\s*([A-Za-z]+)/)
    if (!m) continue
    const [, type, fn] = m
    const start = js.indexOf(`function ${fn}(`)
    if (start === -1) continue
    const end = js.indexOf('\n  function ', start + 1)
    const body = js.slice(start, end === -1 ? undefined : end)
    const classes = new Set<string>()
    for (const c of body.matchAll(/class(?:Name\s*=\s*|=)["'`]([^"'`$]+)["'`]/g)) {
      for (const name of c[1].split(/\s+/)) if (name) classes.add(`.${name}`)
    }
    out.set(type, [...classes])
  }
  return out
}

/**
 * `## ` and `### ` sections, as heading (lowercased, no punctuation) → body.
 * The `### ui-frame` block lives under Types, and the agent asks for it by
 * name — so sub-headings are sections too.
 */
function schemaSections(md: string): Map<string, string> {
  const out = new Map<string, string>()
  let name = 'intro'
  let buf: string[] = []
  for (const line of md.split('\n')) {
    const m = line.match(/^##+\s+(.+?)\s*$/)
    if (m) {
      out.set(name, buf.join('\n').trim())
      name = m[1]
        .toLowerCase()
        .replace(/[^a-z ]/g, '')
        .trim()
      buf = [line]
    } else buf.push(line)
  }
  out.set(name, buf.join('\n').trim())
  return out
}

export default function htmlMotionTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'motion_tts',
    label: 'Motion TTS',
    description:
      'Record the narration: ONE continuous Gemini TTS read of the whole script → audio/vo.wav (the text saved beside it as audio/vo.txt). One call per film, never one per shot. Then set audio.vo in shots.js, motion_align, cue every shot, motion_sync.',
    parameters: Type.Object({
      text: Type.Optional(
        Type.String({
          description:
            'The whole script, as one flowing paragraph (60–110 words for a 25–40s film).',
        }),
      ),
      script: Type.Optional(
        Type.String({
          description: 'Path to a text file holding the whole script (alternative to text).',
        }),
      ),
      out: Type.Optional(Type.String({ description: 'Output WAV path (default audio/vo.wav)' })),
      voice: Type.Optional(
        Type.Union(
          [
            Type.Literal('Aoede'),
            Type.Literal('Kore'),
            Type.Literal('Leda'),
            Type.Literal('Charon'),
          ],
          { description: 'Default Aoede (bright). Kore=warm, Leda=sleek, Charon=deep male.' },
        ),
      ),
      style: Type.Optional(
        Type.String({
          description:
            'One delivery direction for the whole read (emotion, register, pace). Never ask for fast or brisk.',
        }),
      ),
      model: Type.Optional(
        Type.String({
          description:
            'Gemini TTS model id. Default gemini-2.5-flash-preview-tts (most continuous); gemini-3.1-flash-tts-preview is more expressive with longer sentence breaks.',
        }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      if (!p.text && !p.script)
        return text('motion_tts needs `text` (the whole script) or `script` (a file path).')
      const a = ['--out=' + relativeIn(ws, p.out || 'audio/vo.wav', 'write')]
      if (p.script) a.push('--script=' + relativeIn(ws, p.script))
      else a.push('--text=' + p.text)
      if (p.voice) a.push('--voice=' + p.voice)
      if (p.style) a.push('--style=' + p.style)
      if (p.model) a.push('--model=' + p.model)
      return text(await runScript('tts.mjs', a, ws))
    },
  })

  pi.registerTool({
    name: 'motion_align',
    label: 'Align Narration',
    description:
      'Word-level timestamps for the continuous narration read (local whisper.cpp) → audio/vo-words.json. ' +
      'Aligns the known script (audio/vo.txt) to the recording so every word has an onset. Required before ' +
      'motion_sync and by motion_audit whenever shots.js has audio.vo.',
    parameters: Type.Object({
      vo: Type.Optional(Type.String({ description: 'Narration WAV (default audio/vo.wav)' })),
      script: Type.Optional(
        Type.String({ description: 'Script text file (default: the .txt beside the WAV)' }),
      ),
      out: Type.Optional(Type.String({ description: 'Output JSON (default audio/vo-words.json)' })),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const a = ['--vo=' + relativeIn(ws, p.vo || 'audio/vo.wav')]
      if (p.script) a.push('--script=' + relativeIn(ws, p.script))
      if (p.out) a.push('--out=' + relativeIn(ws, p.out, 'write'))
      try {
        return text(await runScript('align.mjs', a, ws, 300_000))
      } catch (err: any) {
        return text(`${err.stdout || ''}\n${err.stderr || err.message || err}`.trim())
      }
    },
  })

  pi.registerTool({
    name: 'motion_sync',
    label: 'Sync Picture to Narration',
    description:
      'Cut the picture to the words: reads shot/beat/line/more `cue` phrases against audio/vo-words.json and retimes shots.js so each lands ~0.12s before its word. write=true edits shots.js (backup shots.js.bak) and re-times audio/sfx-cues.json; otherwise it prints the plan. Run after every script or cue change.',
    parameters: Type.Object({
      write: Type.Optional(
        Type.Boolean({ description: 'Apply to shots.js (default false = plan only)' }),
      ),
      lead: Type.Optional(
        Type.Number({ description: 'Seconds a visual lands before its word (default 0.12)' }),
      ),
      shots: Type.Optional(Type.String({ description: 'Shot list (default shots.js)' })),
      words: Type.Optional(
        Type.String({ description: 'Word timeline (default audio/vo-words.json)' }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const a: string[] = []
      if (p.write) a.push('--write')
      if (p.lead !== undefined) a.push('--lead=' + p.lead)
      if (p.shots) a.push('--shots=' + relativeIn(ws, p.shots, 'write'))
      if (p.words) a.push('--words=' + relativeIn(ws, p.words))
      try {
        return text(await runScript('sync.mjs', a, ws, 120_000))
      } catch (err: any) {
        return text(`${err.stdout || ''}\n${err.stderr || err.message || err}`.trim())
      }
    },
  })

  pi.registerTool({
    name: 'motion_render',
    label: 'Motion Render',
    description:
      'Render index.html to MP4 by deterministic seek-and-capture. With from/to (fps 30, no audio) to look closely at ONE shot while polishing. A full render only when the user asks for an MP4 in chat — the studio previews the live page and has its own Export button — then out_res and fps 60, after motion_audit passes.',
    parameters: Type.Object({
      out: Type.String({
        description:
          'Output MP4 inside the workspace, e.g. renders/shot3-check.mp4 or renders/launch-1080p.mp4',
      }),
      page: Type.Optional(Type.String({ description: 'Page to render (default index.html)' })),
      fps: Type.Optional(
        Type.Integer({
          minimum: 1,
          description: 'Frames/sec: 30 for a shot check, 60 for a deliverable',
        }),
      ),
      out_res: Type.Optional(
        Type.Union([Type.Literal('720p'), Type.Literal('1080p'), Type.Literal('4k')], {
          description: 'Deliverable resolution (default 1080p). Overrides scale.',
        }),
      ),
      scale: Type.Optional(
        Type.Integer({
          minimum: 1,
          description: 'Capture scale when out_res is not given: 1=1080p (default), 2=4K',
        }),
      ),
      width: Type.Optional(Type.Integer({ description: 'Viewport width (default 1920)' })),
      height: Type.Optional(Type.Integer({ description: 'Viewport height (default 1080)' })),
      workers: Type.Optional(
        Type.Integer({ minimum: 1, description: 'Parallel browser workers (default auto ≤6)' }),
      ),
      from: Type.Optional(Type.Number({ minimum: 0, description: 'Segment start (s)' })),
      to: Type.Optional(Type.Number({ minimum: 0, description: 'Segment end (s)' })),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const a: string[] = []
      if (p.page) a.push(relativeIn(ws, p.page))
      a.push('--out=' + relativeIn(ws, p.out, 'write'))
      if (p.out_res) a.push('--out-res=' + p.out_res)
      else if (p.scale === undefined) a.push('--scale=1')
      for (const k of ['fps', 'scale', 'width', 'height', 'workers', 'from', 'to'] as const) {
        if (p[k] !== undefined) a.push(`--${k}=` + p[k])
      }
      return text(await runScript('capture.mjs', a, ws))
    },
  })

  pi.registerTool({
    name: 'motion_audit',
    label: 'Motion Audit',
    description:
      'The gate. Loads index.html?audit (drift and ambient off), samples every 0.25s and scores the film: shot-list lint (8–16 shots, type beats ≤ 3.2s, hook ≤ 3s), the narration contract (one read in audio.vo, every shot cued and landing 0–0.35s before its word), factory overruns, event density (≥ 0.7/s, no quiet stretch > 1.5s), seek determinism, overlap, harvested logo used. Prints a per-shot ev/s table; any ❌ fails — fix and re-run. Writes one frame per second to audit/.',
    parameters: Type.Object({
      page: Type.Optional(Type.String({ description: 'Page to audit (default index.html)' })),
      step: Type.Optional(Type.Number({ description: 'Sample step in seconds (default 0.25)' })),
      max_quiet: Type.Optional(
        Type.Number({
          description: 'Longest allowed stretch without an on-screen event, seconds (default 1.5)',
        }),
      ),
      min_eps: Type.Optional(
        Type.Number({ description: 'Minimum events per second over the film (default 0.7)' }),
      ),
      out: Type.Optional(Type.String({ description: 'Output frame dir (default audit)' })),
      allow_missing_logo: Type.Optional(
        Type.Boolean({ description: 'Only when the film genuinely shows no logo' }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const a: string[] = []
      if (p.page) a.push(relativeIn(ws, p.page))
      if (p.step) a.push('--step=' + p.step)
      if (p.max_quiet) a.push('--max-quiet=' + p.max_quiet)
      if (p.min_eps) a.push('--min-eps=' + p.min_eps)
      if (p.out) a.push('--out=' + relativeIn(ws, p.out, 'write'))
      if (p.allow_missing_logo) a.push('--allow-missing-logo')
      try {
        return text(await runScript('audit.mjs', a, ws))
      } catch (err: any) {
        // A failed gate is a result, not a crash: hand the scorecard back verbatim.
        const out = `${err?.stdout ?? ''}\n${err?.stderr ?? ''}`.trim()
        if (out) return text(out)
        throw err
      }
    },
  })

  pi.registerTool({
    name: 'motion_screenshot',
    label: 'Motion Screenshot',
    description:
      'Capture a reference screenshot for Phase-0 recon: from a live URL, or a synthetic HTML ' +
      'template. For brand recon -> recon/screenshots/. Not for video frames.',
    parameters: Type.Object({
      out: Type.String({
        description: 'Output PNG path, conventionally recon/screenshots/<name>.png',
      }),
      url: Type.Optional(Type.String({ description: 'Live URL to capture' })),
      html: Type.Optional(Type.String({ description: 'Local HTML template path to capture' })),
      width: Type.Optional(Type.Integer({ description: 'Viewport width (default 1920)' })),
      height: Type.Optional(Type.Integer({ description: 'Viewport height (default 1080)' })),
      selector: Type.Optional(
        Type.String({ description: 'CSS selector; capture just that element' }),
      ),
      fullPage: Type.Optional(Type.Boolean({ description: 'Full height scroll capture' })),
      wait: Type.Optional(Type.Integer({ description: 'Ms to wait after load' })),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      if (!p.url && !p.html) {
        throw new Error("Provide either 'url' or 'html' to motion_screenshot.")
      }
      if (p.url && !/^https?:\/\//i.test(p.url)) {
        throw new Error('url must be an http(s) URL.')
      }
      const a = ['--out=' + relativeIn(ws, p.out, 'write')]
      if (p.url) a.push('--url=' + p.url)
      if (p.html) a.push('--html=' + relativeIn(ws, p.html))
      if (p.width) a.push('--width=' + p.width)
      if (p.height) a.push('--height=' + p.height)
      if (p.selector) a.push('--selector=' + p.selector)
      if (p.fullPage) a.push('--fullPage=true')
      if (p.wait) a.push('--wait=' + p.wait)
      return text(await runScript('screenshot.mjs', a, ws))
    },
  })

  pi.registerTool({
    name: 'motion_recon',
    label: 'Measure Brand',
    description:
      "Measure the product's brand from the live page in a real browser: body bg/ink/font, :root custom properties, headline and body type, the primary CTA's computed styles, surfaces, saturated colours, theme-color and the page copy → recon/brand-tokens.md + .json; self-hosts the brand's web fonts into assets/fonts/ with a ready brand.fonts snippet. Run on the home page and 1–2 product pages (different out paths).",
    parameters: Type.Object({
      url: Type.String({ description: 'Page to measure (http/https)' }),
      out: Type.Optional(
        Type.String({
          description: 'Markdown output (default recon/brand-tokens.md; the JSON lands beside it)',
        }),
      ),
      fonts: Type.Optional(
        Type.Boolean({
          description: "Download the brand's web fonts into assets/fonts/ (default true)",
        }),
      ),
      fonts_dir: Type.Optional(
        Type.String({ description: 'Where font files go (default assets/fonts)' }),
      ),
      cdp: Type.Optional(
        Type.String({ description: 'CDP URL of an existing browser, for bot-walled sites' }),
      ),
      width: Type.Optional(Type.Integer({ description: 'Viewport width (default 1440)' })),
      wait: Type.Optional(
        Type.Integer({
          description: 'Extra ms to wait after load for animations/fonts (default 1500)',
        }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      if (!/^https?:\/\//i.test(p.url)) throw new Error('url must be an http(s) URL.')
      const a = ['--url=' + p.url]
      if (p.out) a.push('--out=' + relativeIn(ws, p.out, 'write'))
      if (p.fonts === false) a.push('--no-fonts')
      else if (p.fonts_dir) a.push('--fonts=' + relativeIn(ws, p.fonts_dir, 'write'))
      if (p.cdp) a.push('--cdp=' + p.cdp)
      if (p.width) a.push('--width=' + p.width)
      if (p.wait) a.push('--wait=' + p.wait)
      try {
        return text(await runScript('recon.mjs', a, ws, 240_000))
      } catch (err: any) {
        const out = `${err?.stdout ?? ''}\n${err?.stderr ?? ''}`.trim()
        if (out) return text(out)
        throw err
      }
    },
  })

  pi.registerTool({
    name: 'motion_harvest',
    label: 'Harvest Assets',
    description:
      "Phase 0: pull the product site's OWN logo SVGs, screenshots, photos and video posters into " +
      'assets/harvested/ with a provenance manifest at recon/harvested.json (source URL, size, the ' +
      'section each sat under). Runs on the host with a real browser. Use these files in shots.js.',
    parameters: Type.Object({
      url: Type.String({ description: 'Page to harvest (http/https)' }),
      cdp: Type.Optional(
        Type.String({ description: 'CDP URL of an existing browser, for bot-walled sites' }),
      ),
      min_px: Type.Optional(
        Type.Integer({ description: 'Ignore images smaller than this on both axes (default 240)' }),
      ),
      max: Type.Optional(
        Type.Integer({ minimum: 1, description: 'Max assets to download (default 48)' }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      if (!/^https?:\/\//i.test(p.url)) throw new Error('url must be an http(s) URL.')
      const a = ['--url=' + p.url]
      if (p.cdp) a.push('--cdp=' + p.cdp)
      if (p.min_px) a.push('--min-px=' + p.min_px)
      if (p.max) a.push('--max=' + p.max)
      return text(await runScript('harvest.mjs', a, ws, 300_000))
    },
  })

  pi.registerTool({
    name: 'motion_check',
    label: 'Check Cut',
    description:
      "Fast compile check (seconds, not the audit): loads index.html and reports page errors, shot count, real duration, every shot's start time and any factory overrun (> 1.6× fails the audit). Run after every batch of shots you save.",
    parameters: Type.Object({
      page: Type.Optional(Type.String({ description: 'Page to load (default index.html)' })),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const a: string[] = ['--check']
      if (p.page) a.push(relativeIn(ws, p.page))
      try {
        return text(await runScript('cues.mjs', a, ws, 120_000))
      } catch (err: any) {
        const out = `${err?.stdout ?? ''}\n${err?.stderr ?? ''}`.trim()
        if (out) return text(out)
        throw err
      }
    },
  })

  pi.registerTool({
    name: 'motion_cues',
    label: 'Timeline Cues',
    description:
      "Export the compiled timeline's real shot start times to audio/cues.json by loading index.html " +
      'in a browser. Use before writing the SFX cue sheet or mixing narration.',
    parameters: Type.Object({
      page: Type.Optional(Type.String({ description: 'Page to load (default index.html)' })),
      out: Type.Optional(Type.String({ description: 'Output JSON (default audio/cues.json)' })),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const a: string[] = []
      if (p.page) a.push(relativeIn(ws, p.page))
      if (p.out) a.push('--out=' + relativeIn(ws, p.out, 'write'))
      return text(await runScript('cues.mjs', a, ws, 120_000))
    },
  })

  pi.registerTool({
    name: 'motion_sfx',
    label: 'Sound Effects',
    description:
      'Query the curated SFX manifest or build the SFX bus. mode=list: the event vocabulary. ' +
      'mode=query: ranked, measured clips for an event. mode=build: render audio/sfx_bus.wav from ' +
      'audio/sfx-cues.json, placing every cue by its measured onset. The build must finish with no ' +
      'placement warnings.',
    parameters: Type.Object({
      mode: Type.Union([Type.Literal('list'), Type.Literal('query'), Type.Literal('build')]),
      event: Type.Optional(
        Type.String({ description: 'query: event name (pop, whoosh_deep, impact, …)' }),
      ),
      max: Type.Optional(Type.Number({ description: 'query: cap clip length in seconds' })),
      limit: Type.Optional(
        Type.Integer({ minimum: 1, description: 'query: max results (default 12)' }),
      ),
      cues: Type.Optional(
        Type.String({ description: 'build: cue sheet path (default audio/sfx-cues.json)' }),
      ),
      duration: Type.Optional(
        Type.Number({ description: 'build: film duration in seconds (__DURATION())' }),
      ),
      out: Type.Optional(
        Type.String({ description: 'build: output WAV (default audio/sfx_bus.wav)' }),
      ),
      dry_run: Type.Optional(
        Type.Boolean({ description: 'build: report placements without rendering' }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const a: string[] = []
      if (p.mode === 'list') a.push('query', '--list')
      else if (p.mode === 'query') {
        if (!p.event) throw new Error('query needs an event.')
        a.push('query', '--event=' + p.event)
        if (p.max !== undefined) a.push('--max=' + p.max)
        if (p.limit) a.push('--limit=' + p.limit)
      } else {
        a.push('build')
        if (p.cues) a.push('--cues=' + relativeIn(ws, p.cues))
        if (p.duration !== undefined) a.push('--duration=' + p.duration)
        if (p.out) a.push('--out=' + relativeIn(ws, p.out, 'write'))
        if (p.dry_run) a.push('--dry-run')
      }
      return text(await runScript('sfx.mjs', a, ws, 300_000))
    },
  })

  pi.registerTool({
    name: 'motion_mix',
    label: 'Mix Audio',
    description:
      'Final mixdown to audio/mix.wav: the continuous narration read (shots.js audio.vo, placed at audio.voStart) over the music bed ' +
      'with ducking and a frequency carve, plus the SFX bus, then verified by extraction — fails if ' +
      'the voice is not clearly above the bed. Pass music_only for a film without narration.',
    parameters: Type.Object({
      duration: Type.Number({ description: 'Film duration in seconds (__DURATION())' }),
      music: Type.Optional(Type.String({ description: 'Music bed path, e.g. audio/music.mp3' })),
      sfx: Type.Optional(Type.String({ description: 'SFX bus path, e.g. audio/sfx_bus.wav' })),
      music_only: Type.Optional(Type.Boolean({ description: 'No narration in this film' })),
      bed_db: Type.Optional(
        Type.Number({ description: 'Bed attenuation in dB (default -13, or -10 music-only)' }),
      ),
      duck: Type.Optional(Type.Number({ description: 'Ducking depth in dB (default 9)' })),
      vo_map: Type.Optional(
        Type.String({ description: 'Explicit VO placement JSON instead of shots.js' }),
      ),
      out: Type.Optional(Type.String({ description: 'Output WAV (default audio/mix.wav)' })),
      dry_run: Type.Optional(Type.Boolean({ description: 'Plan only' })),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const a = ['--duration=' + p.duration]
      if (p.music) a.push('--music=' + relativeIn(ws, p.music))
      if (p.sfx) a.push('--sfx=' + relativeIn(ws, p.sfx))
      if (p.music_only) a.push('--music-only')
      if (p.bed_db !== undefined) a.push('--bed-db=' + p.bed_db)
      if (p.duck !== undefined) a.push('--duck=' + p.duck)
      if (p.vo_map) a.push('--vo-map=' + relativeIn(ws, p.vo_map))
      if (p.out) a.push('--out=' + relativeIn(ws, p.out, 'write'))
      if (p.dry_run) a.push('--dry-run')
      return text(await runScript('mix.mjs', a, ws, 600_000))
    },
  })

  pi.registerTool({
    name: 'motion_find_audio',
    label: 'Find Audio',
    description:
      "List the curated music library (the one the studio's Music picker shows), newest first, or another directory. A bed the user picked is already in audio/. Pass src + copy_to (workspace-relative) to import a listed file.",
    parameters: Type.Object({
      dir: Type.Optional(
        Type.String({ description: "Directory to scan (default: the repo's assets/music)" }),
      ),
      max: Type.Optional(Type.Integer({ minimum: 1, description: 'Max entries (default 15)' })),
      src: Type.Optional(
        Type.String({ description: 'Absolute path of a previously listed file to import' }),
      ),
      copy_to: Type.Optional(
        Type.String({ description: 'Workspace-relative destination, e.g. audio/bed.mp3' }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      if (p.src || p.copy_to) {
        if (!p.src || !p.copy_to) {
          throw new Error('To import audio, provide both src and copy_to.')
        }
        const srcAbs = resolveIn(ws, p.src)
        if (!AUDIO_RE.test(srcAbs) || !existsSync(srcAbs)) {
          throw new Error(`Not an existing audio file: ${p.src}`)
        }
        const dest = resolveIn(ws, p.copy_to, 'write')
        mkdirSync(dirname(dest), { recursive: true })
        copyFileSync(srcAbs, dest)
        return text(`Imported ${p.src} -> ${p.copy_to}`)
      }

      const root = p.dir ? resolveIn(ws, p.dir) : MUSIC_DIR
      const max = p.max ?? 15
      if (!existsSync(root)) return text(`Directory not found: ${root}`)
      const found: Array<{ p: string; ms: number; mtime: Date }> = []
      const entries = readdirSync(root).filter(e => !e.startsWith('.'))
      for (const file of entries.filter(e => AUDIO_RE.test(e))) {
        const fp = join(root, file)
        const st = statSync(fp)
        found.push({ p: fp, ms: st.size / 1e6, mtime: st.mtime })
      }
      for (const d of entries.filter(e => !AUDIO_RE.test(e))) {
        const dp = join(root, d)
        let sub: string[]
        try {
          sub = readdirSync(dp)
        } catch {
          continue
        }
        for (const f of sub.filter(e => !e.startsWith('.') && AUDIO_RE.test(e))) {
          if (found.length >= max) break
          const fp = join(dp, f)
          const st = statSync(fp)
          found.push({ p: fp, ms: st.size / 1e6, mtime: st.mtime })
        }
        if (found.length >= max) break
      }
      if (found.length === 0) return text(`No audio files found under ${root}`)
      const lines = found
        .map(
          f =>
            `${f.p}  [${f.ms.toFixed(1)} MB]  ${f.mtime.toISOString().slice(0, 16).replace('T', ' ')}`,
        )
        .join('\n')
      return text(`Audio candidates under ${root}:\n${lines}`)
    },
  })

  pi.registerTool({
    name: 'motion_verify_duration',
    label: 'Verify Duration',
    description:
      'ffprobe the duration of a rendered MP4 to confirm it matches the timeline length, not the ' +
      'audio length. Use after any final render.',
    parameters: Type.Object({
      file: Type.String({ description: 'MP4 path to probe (workspace-relative)' }),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const abs = resolveIn(ws, p.file)
      if (!existsSync(abs)) throw new Error(`File not found: ${abs}`)
      const dur = execFileSync(
        'ffprobe',
        ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', abs],
        { encoding: 'utf8' },
      ).trim()
      return text(`${p.file}: ${Number(dur).toFixed(3)}s`)
    },
  })

  pi.registerTool({
    name: 'motion_schema',
    label: 'Shot schema',
    description:
      "The engine's shot schema in pieces: no arguments → the shot-type list and the sections; `types` → the exact fields of those types and the DOM classes each mounts; `section` → one of: density layer, narration spine, common shot fields, ui-frame, custom shot types, rules. Use this instead of reading engine files.",
    parameters: Type.Object({
      types: Type.Optional(
        Type.Array(Type.String(), {
          description:
            'Shot types to describe, e.g. ["word-cut","pile"]. Unknown names are reported.',
        }),
      ),
      section: Type.Optional(
        Type.String({
          description: 'One section by heading, e.g. "custom shot types" or "rules".',
        }),
      ),
    }),
    async execute(_id, p: any) {
      let md: string
      try {
        md = readFileSync(SCHEMA_PATH, 'utf8')
      } catch (err) {
        return text(`Could not read the engine schema: ${(err as Error).message}`)
      }
      const types = schemaTypes(md)
      const sections = schemaSections(md)

      if (p.section) {
        const key = String(p.section)
          .toLowerCase()
          .replace(/[^a-z ]/g, '')
          .trim()
        const hit =
          sections.get(key) ??
          [...sections.entries()].find(([k]) => k.includes(key) || key.includes(k))?.[1]
        if (!hit)
          return text(`No section "${p.section}". Sections: ${[...sections.keys()].join(', ')}`)
        return text(hit)
      }

      if (p.types?.length) {
        const rows: string[] = []
        const missing: string[] = []
        const classes = factoryClasses()
        for (const t of p.types) {
          const name = String(t).replace(/^`|`$/g, '')
          const row = types.get(name)
          if (!row) {
            missing.push(String(t))
            continue
          }
          const mounted = classes.get(name)
          rows.push(
            mounted?.length ? `${row.replace(/\|\s*$/, '')} DOM: ${mounted.join(' ')} |` : row,
          )
        }
        const common = sections.get('common shot fields') ?? ''
        const uiFrameKey = [...sections.keys()].find(k => k.startsWith('uiframe'))
        const uiFrame =
          p.types.some((t: string) => /ui-frame/.test(t)) && uiFrameKey
            ? `\n\n${sections.get(uiFrameKey)}`
            : ''
        return text(
          [
            common,
            '',
            '| type | Fields |',
            '|---|---|',
            ...rows,
            uiFrame,
            missing.length
              ? `\n⚠ not shot types: ${missing.join(', ')} — the list is ${[...types.keys()].join(', ')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
        )
      }

      return text(
        `Shot types (motion_schema({ types: [...] }) for their fields):\n  ${[...types.keys()].join(', ')}\n\n` +
          `Sections (motion_schema({ section: "..." })):\n  ${[...sections.keys()].filter(k => k !== 'intro').join(', ')}`,
      )
    },
  })

  pi.registerTool({
    name: 'motion_scaffold',
    label: 'Scaffold the page',
    description:
      'Write index.html — the thin shell that loads the GSAP vendor bundle, shots.js and the engine, ' +
      'in the one order that works. Call this once before your first shots.js instead of writing the ' +
      'page by hand; the script order is the whole of it. Pass custom: true when you have ' +
      'added js/shots.custom.js.',
    parameters: Type.Object({
      title: Type.Optional(
        Type.String({ description: 'Page <title>; defaults to the project name.' }),
      ),
      custom: Type.Optional(
        Type.Boolean({ description: 'Load js/shots.custom.js as well (default false).' }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const out = resolveIn(ws, 'index.html', 'write')
      const title = String(p.title ?? basename(ws)).replace(/[<>]/g, '')
      // The whole licensed GSAP set, from the shared assets mount. The
      // compiler registers whatever it finds on window, so loading all of
      // them is what makes them real for a custom shot type — they were
      // vendored into every project and then never loaded.
      const plugins = [
        'gsap.min.js',
        'CustomEase.min.js',
        'CustomWiggle.min.js',
        'CustomBounce.min.js',
        'SplitText.min.js',
        'TextPlugin.min.js',
        'ScrambleTextPlugin.min.js',
        'Physics2DPlugin.min.js',
        'PhysicsPropsPlugin.min.js',
        'MotionPathPlugin.min.js',
        'MorphSVGPlugin.min.js',
        'DrawSVGPlugin.min.js',
        'Flip.min.js',
        'EasePack.min.js',
        'Draggable.min.js',
        'InertiaPlugin.min.js',
        'Observer.min.js',
        'CSSRulePlugin.min.js',
        'EaselPlugin.min.js',
        'PixiPlugin.min.js',
        'ScrollTrigger.min.js',
        'ScrollSmoother.min.js',
        'ScrollToPlugin.min.js',
      ]
      const html = [
        '<!DOCTYPE html>',
        '<html lang="en"><head><meta charset="UTF-8"><title>' + title + '</title>',
        '<link rel="stylesheet" href="../../engine/css/shots.css"></head>',
        '<body>',
        '  <div id="viewport"><div id="camera"></div></div>',
        ...plugins.map(f => `  <script src="../../assets/gsap/${f}"></script>`),
        '  <script src="shots.js"></script>',
        '  <script src="../../engine/js/icons.js"></script>',
        '  <script src="../../engine/js/factories.js"></script>',
        ...(p.custom ? ['  <script src="js/shots.custom.js"></script>'] : []),
        '  <script src="../../engine/js/compiler.js"></script>',
        '</body></html>',
        '',
      ].join('\n')
      writeFileSync(out, html)
      const vendor = existsSync(join(ASSETS_DIR, 'gsap', 'gsap.min.js'))
      return text(
        `index.html written (${plugins.length} GSAP plugins${p.custom ? ' + js/shots.custom.js' : ''}).\n` +
          (vendor
            ? 'GSAP loads from the shared ../../assets/gsap/.'
            : '⚠ assets/gsap/gsap.min.js is missing — the page will not compile. Say so and stop.') +
          '\nNext: write shots.js, then motion_check.',
      )
    },
  })
}
