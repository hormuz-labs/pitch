/**
 * HTML Motion Video — pi extension wrapping the html-motion-video skill's
 * executable scripts (recon, screenshot, harvest, tts, align, sync, cues/check,
 * sfx, mix, audit, capture) plus two small host helpers (find_audio,
 * verify_duration). sfx-index.mjs and sfx-vendor.mjs are maintainer scripts
 * that build the shared SFX library and are deliberately not tools.
 *
 * Every tool runs with the session's cwd — the job's sandboxed workspace — so
 * relative paths (audio/, renders/, audit/) resolve inside it.
 */

import { execFile, execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from '@sinclair/typebox'

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
const SCRIPTS = join(HERE, '..', 'skills', 'html-motion-video', 'scripts')
const MAX_BUFFER = 16 * 1024 * 1024
const AUDIO_RE = /\.(mp3|wav|m4a|aac|flac|ogg)$/i
const REPO_ROOT = resolve(HERE, '..', '..')

function text(out: string) {
  return { content: [{ type: 'text' as const, text: out }], details: {} }
}

/**
 * These scripts run on the host, but the agent only knows guest paths. A raw
 * host path in an error ("/app/projects/studio--user_xxx--foo/audio/x.json")
 * has already cost an agent several turns guessing at the mapping, so rewrite
 * every mount back to the name the agent's own shell uses.
 */
function toGuestPaths(out: string, cwd: string): string {
  let s = out.split(cwd).join('/workspace')
  for (const [guest, host] of [
    ['/engine', join(REPO_ROOT, 'engine')],
    ['/.pi/skills', join(REPO_ROOT, '.pi', 'skills')],
    ['/assets', join(REPO_ROOT, 'assets')],
  ] as const) {
    s = s.split(host).join(guest)
  }
  return s
}

async function runScript(name: string, args: string[], cwd: string, timeoutMs = 1_200_000) {
  try {
    const { stdout, stderr } = await execFileAsync(NODE, [join(SCRIPTS, name), ...args], {
      cwd,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
      timeout: timeoutMs,
    })
    return toGuestPaths(`${stdout}\n${stderr}`.trim(), cwd)
  } catch (err) {
    // A failing script's own diagnosis lives in its output, not in "Command
    // failed with exit code 1" — surface it, or the agent invents a workaround.
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const detail = `${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim() || e.message || String(err)
    throw new Error(toGuestPaths(detail, cwd))
  }
}

const PROJECTS_DIR = join(REPO_ROOT, 'projects')
const READ_ROOTS = [
  join(REPO_ROOT, 'engine'),
  join(REPO_ROOT, '.pi', 'skills'),
  join(REPO_ROOT, 'assets'),
]

function within(child: string, parent: string): boolean {
  const c = resolve(child)
  return c === parent || c.startsWith(parent + '/')
}

/**
 * Resolve a path the agent handed us and refuse anything outside its
 * workspace. These tools run on the HOST (the agent's own shell and file
 * tools live in a VM), so they must not become a side door: writes stay in
 * the workspace; reads may also touch the shared references.
 */
function resolvePath(cwd: string, p: string, mode: 'read' | 'write' = 'write'): string {
  // The VM mounts the workspace at /workspace and the shared references at
  // /engine, /.pi/skills and /assets — map guest paths back to the host.
  let mapped = p
  if (p === '/workspace' || p.startsWith('/workspace/'))
    mapped = join(cwd, p.slice('/workspace'.length))
  else if (p === '/engine' || p.startsWith('/engine/')) mapped = join(REPO_ROOT, p.slice(1))
  else if (p.startsWith('/.pi/skills')) mapped = join(REPO_ROOT, p.slice(1))
  else if (p === '/assets' || p.startsWith('/assets/')) mapped = join(REPO_ROOT, p.slice(1))
  const abs = resolve(cwd, mapped)
  if (/^\.env(\..*)?$/.test(abs.split('/').pop() ?? '')) {
    throw new Error(`Refusing to touch ${p}: secrets are off limits.`)
  }
  const inWorkspace = within(abs, cwd)
  if (mode === 'write' && !inWorkspace) {
    throw new Error(`Refusing to write outside the workspace: ${p}`)
  }
  if (mode === 'read' && !inWorkspace) {
    const shared = READ_ROOTS.some(r => within(abs, r))
    if (!shared || within(abs, PROJECTS_DIR)) {
      throw new Error(`Refusing to read outside the workspace or shared references: ${p}`)
    }
  }
  return abs
}

/** Workspace-relative form of a validated path, for scripts that run with cwd = workspace. */
function rel(cwd: string, p: string, mode: 'read' | 'write' = 'write'): string {
  const abs = resolvePath(cwd, p, mode)
  return within(abs, cwd) ? abs.slice(cwd.length + 1) || '.' : abs
}

export default function htmlMotionTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'motion_tts',
    label: 'Motion TTS',
    description:
      'Gemini TTS narration — ONE continuous read of the whole script (default out audio/vo.wav; the exact ' +
      'text is saved beside it as audio/vo.txt). Narration is a direction.md decision (Axis 8), never a ' +
      "default. Never generate one clip per shot: separate clips restart the voice's intonation and leave " +
      'dead air between lines (the robotic sound). Next: set audio.vo to the WAV in shots.js, motion_align, ' +
      'put `cue` phrases on shots/beats/lines, motion_sync.',
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
            "One delivery direction for the whole read: emotion, register, 'natural unhurried conversational pace, one continuous flowing read'. Never ask for fast/brisk — 1.9–2.4 words/s sounds human; the picture carries the energy.",
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
      if (!p.text && !p.script)
        return text('motion_tts needs `text` (the whole script) or `script` (a file path).')
      const a = ['--out=' + rel(ctx.cwd, p.out || 'audio/vo.wav')]
      if (p.script) a.push('--script=' + rel(ctx.cwd, p.script, 'read'))
      else a.push('--text=' + p.text)
      if (p.voice) a.push('--voice=' + p.voice)
      if (p.style) a.push('--style=' + p.style)
      if (p.model) a.push('--model=' + p.model)
      return text(await runScript('tts.mjs', a, ctx.cwd))
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
      const a = ['--vo=' + rel(ctx.cwd, p.vo || 'audio/vo.wav', 'read')]
      if (p.script) a.push('--script=' + rel(ctx.cwd, p.script, 'read'))
      if (p.out) a.push('--out=' + rel(ctx.cwd, p.out))
      try {
        return text(await runScript('align.mjs', a, ctx.cwd, 300_000))
      } catch (err: any) {
        return text(`${err.stdout || ''}\n${err.stderr || err.message || err}`.trim())
      }
    },
  })

  pi.registerTool({
    name: 'motion_sync',
    label: 'Sync Picture to Narration',
    description:
      'Cut the picture to the words: reads shot `cue` phrases (and beat/line/more cues) against audio/vo-words.json, ' +
      'retimes every shot so it lands ~0.12s before its cue word, fills beat `at`, `lineAt`, `moreAt`, and with ' +
      'write=true edits the numbers in shots.js (backup shots.js.bak) and re-times audio/sfx-cues.json. ' +
      'Without write it prints the plan. Run after every copy or cue change, then motion_cues → motion_sfx → motion_mix → motion_audit.',
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
      const a: string[] = []
      if (p.write) a.push('--write')
      if (p.lead !== undefined) a.push('--lead=' + p.lead)
      if (p.shots) a.push('--shots=' + rel(ctx.cwd, p.shots))
      if (p.words) a.push('--words=' + rel(ctx.cwd, p.words, 'read'))
      try {
        return text(await runScript('sync.mjs', a, ctx.cwd, 120_000))
      } catch (err: any) {
        return text(`${err.stdout || ''}\n${err.stderr || err.message || err}`.trim())
      }
    },
  })

  pi.registerTool({
    name: 'motion_render',
    label: 'Motion Render',
    description:
      'Render index.html to MP4 via deterministic multi-worker seek-and-capture. ' +
      'Use it for a close look at ONE shot (from/to, fps 30, no audio) while polishing. ' +
      'The studio previews the live HTML and has its own Export button for deliverables, so only ' +
      'run a full render when the user explicitly asks you for an MP4 in chat; then write ' +
      'renders/launch-<res>.mp4 with out_res set, at fps 60, after motion_audit passes.',
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
      const a: string[] = []
      if (p.page) a.push(rel(ctx.cwd, p.page, 'read'))
      a.push('--out=' + rel(ctx.cwd, p.out))
      if (p.out_res) a.push('--out-res=' + p.out_res)
      else if (p.scale === undefined) a.push('--scale=1')
      for (const k of ['fps', 'scale', 'width', 'height', 'workers', 'from', 'to'] as const) {
        if (p[k] !== undefined) a.push(`--${k}=` + p[k])
      }
      return text(await runScript('capture.mjs', a, ctx.cwd))
    },
  })

  pi.registerTool({
    name: 'motion_audit',
    label: 'Motion Audit',
    description:
      'The philosophy gate. Loads index.html?audit (drift and ambient OFF so only designed ' +
      'events count), samples every 0.25s and scores the film: shot-list lint (8–16 shots, ' +
      'type beats ≤ 3.2s, hook ≤ 3s), the narration contract (ONE continuous read in audio.vo, ' +
      'every shot cued and landing 0–0.35s before its word, per-shot clips FAIL), factory overruns, event density (≥ 0.7 ' +
      'events/s and no quiet stretch longer than 1.5s), static holds, scene overlap, seek ' +
      'determinism, harvested logo used. Prints a per-shot table with ev/s so you can see ' +
      'which shot is lazy. GATE — the build FAILS on any ❌; fix and re-run, never argue. ' +
      'Writes one frame per second to ./audit/.',
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
      const a: string[] = []
      if (p.page) a.push(rel(ctx.cwd, p.page, 'read'))
      if (p.step) a.push('--step=' + p.step)
      if (p.max_quiet) a.push('--max-quiet=' + p.max_quiet)
      if (p.min_eps) a.push('--min-eps=' + p.min_eps)
      if (p.out) a.push('--out=' + rel(ctx.cwd, p.out))
      if (p.allow_missing_logo) a.push('--allow-missing-logo')
      try {
        return text(await runScript('audit.mjs', a, ctx.cwd))
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
      if (!p.url && !p.html) {
        throw new Error("Provide either 'url' or 'html' to motion_screenshot.")
      }
      if (p.url && !/^https?:\/\//i.test(p.url)) {
        throw new Error('url must be an http(s) URL.')
      }
      const a = ['--out=' + rel(ctx.cwd, p.out)]
      if (p.url) a.push('--url=' + p.url)
      if (p.html) a.push('--html=' + rel(ctx.cwd, p.html, 'read'))
      if (p.width) a.push('--width=' + p.width)
      if (p.height) a.push('--height=' + p.height)
      if (p.selector) a.push('--selector=' + p.selector)
      if (p.fullPage) a.push('--fullPage=true')
      if (p.wait) a.push('--wait=' + p.wait)
      return text(await runScript('screenshot.mjs', a, ctx.cwd))
    },
  })

  pi.registerTool({
    name: 'motion_recon',
    label: 'Measure Brand',
    description:
      'Phase 0.1/0.3/0.4 in one call: load the product site in a real browser and MEASURE its brand — ' +
      'body bg/ink/font, every --custom-property on :root, headline and body type (family, weight, size, ' +
      "tracking), the primary CTA's computed styles, surfaces by area, saturated colors by use, theme-color, " +
      'and the page copy (title, description, headings, CTA labels, nav, paragraphs). Writes ' +
      "recon/brand-tokens.md + .json, and self-hosts the brand's own web-font files into assets/fonts/ with a " +
      'ready brand.fonts snippet. Run it on the home page and 1–2 product pages (different out paths). Every ' +
      'hex and font in direction.md must come from here — never restyle a site from memory.',
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
      if (!/^https?:\/\//i.test(p.url)) throw new Error('url must be an http(s) URL.')
      const a = ['--url=' + p.url]
      if (p.out) a.push('--out=' + rel(ctx.cwd, p.out))
      if (p.fonts === false) a.push('--no-fonts')
      else if (p.fonts_dir) a.push('--fonts=' + rel(ctx.cwd, p.fonts_dir))
      if (p.cdp) a.push('--cdp=' + p.cdp)
      if (p.width) a.push('--width=' + p.width)
      if (p.wait) a.push('--wait=' + p.wait)
      try {
        return text(await runScript('recon.mjs', a, ctx.cwd, 240_000))
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
      if (!/^https?:\/\//i.test(p.url)) throw new Error('url must be an http(s) URL.')
      const a = ['--url=' + p.url]
      if (p.cdp) a.push('--cdp=' + p.cdp)
      if (p.min_px) a.push('--min-px=' + p.min_px)
      if (p.max) a.push('--max=' + p.max)
      return text(await runScript('harvest.mjs', a, ctx.cwd, 300_000))
    },
  })

  pi.registerTool({
    name: 'motion_check',
    label: 'Check Cut',
    description:
      'Fast compile check while building shot by shot (seconds, not the full audit): loads index.html in a ' +
      "headless browser and reports page errors, shot count, real duration, every shot's start time and any " +
      "factory overrun (a timeline longer than its shot's dur — the compiler compresses it; > 1.6× fails the " +
      'audit). Run it after every batch of shots you save. The studio preview reloads on its own when you ' +
      'save; this is your own confirmation that the page compiles.',
    parameters: Type.Object({
      page: Type.Optional(Type.String({ description: 'Page to load (default index.html)' })),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const a: string[] = ['--check']
      if (p.page) a.push(rel(ctx.cwd, p.page, 'read'))
      try {
        return text(await runScript('cues.mjs', a, ctx.cwd, 120_000))
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
      const a: string[] = []
      if (p.page) a.push(rel(ctx.cwd, p.page, 'read'))
      if (p.out) a.push('--out=' + rel(ctx.cwd, p.out))
      return text(await runScript('cues.mjs', a, ctx.cwd, 120_000))
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
      const a: string[] = []
      if (p.mode === 'list') a.push('query', '--list')
      else if (p.mode === 'query') {
        if (!p.event) throw new Error('query needs an event.')
        a.push('query', '--event=' + p.event)
        if (p.max !== undefined) a.push('--max=' + p.max)
        if (p.limit) a.push('--limit=' + p.limit)
      } else {
        a.push('build')
        if (p.cues) a.push('--cues=' + rel(ctx.cwd, p.cues, 'read'))
        if (p.duration !== undefined) a.push('--duration=' + p.duration)
        if (p.out) a.push('--out=' + rel(ctx.cwd, p.out))
        if (p.dry_run) a.push('--dry-run')
      }
      return text(await runScript('sfx.mjs', a, ctx.cwd, 300_000))
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
      const a = ['--duration=' + p.duration]
      if (p.music) a.push('--music=' + rel(ctx.cwd, p.music, 'read'))
      if (p.sfx) a.push('--sfx=' + rel(ctx.cwd, p.sfx, 'read'))
      if (p.music_only) a.push('--music-only')
      if (p.bed_db !== undefined) a.push('--bed-db=' + p.bed_db)
      if (p.duck !== undefined) a.push('--duck=' + p.duck)
      if (p.vo_map) a.push('--vo-map=' + rel(ctx.cwd, p.vo_map, 'read'))
      if (p.out) a.push('--out=' + rel(ctx.cwd, p.out))
      if (p.dry_run) a.push('--dry-run')
      return text(await runScript('mix.mjs', a, ctx.cwd, 600_000))
    },
  })

  pi.registerTool({
    name: 'motion_find_audio',
    label: 'Find Audio',
    description:
      "List the curated music library (assets/music at the repo root, the same one the studio's " +
      'Music picker shows) sorted by recency, or another directory the user names. If the user ' +
      'picked a bed in the studio it is already in audio/ — use that. Pass copy_to (a ' +
      'workspace-relative path like audio/music.mp3) with src to import a listed file.',
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
      if (p.src || p.copy_to) {
        if (!p.src || !p.copy_to) {
          throw new Error('To import audio, provide both src and copy_to.')
        }
        const srcAbs = resolvePath(ctx.cwd, p.src, 'read')
        if (!AUDIO_RE.test(srcAbs) || !existsSync(srcAbs)) {
          throw new Error(`Not an existing audio file: ${p.src}`)
        }
        const dest = resolvePath(ctx.cwd, p.copy_to)
        mkdirSync(dirname(dest), { recursive: true })
        copyFileSync(srcAbs, dest)
        return text(`Imported ${p.src} -> ${p.copy_to}`)
      }

      const root = p.dir ? resolvePath(ctx.cwd, p.dir, 'read') : join(REPO_ROOT, 'assets', 'music')
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
      const abs = resolvePath(ctx.cwd, p.file, 'read')
      if (!existsSync(abs)) throw new Error(`File not found: ${abs}`)
      const dur = execFileSync(
        'ffprobe',
        ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', abs],
        { encoding: 'utf8' },
      ).trim()
      return text(`${p.file}: ${Number(dur).toFixed(3)}s`)
    },
  })
}
