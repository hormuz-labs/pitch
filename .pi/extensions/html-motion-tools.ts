/**
 * Launch films — pi extension wrapping the Node programs in
 * .pi/scripts/launch-video (recon, screenshot, tts, align, sync, cues/check,
 * sfx, mix, audit, review, capture) plus two small host helpers (find_audio,
 * verify_duration). Every .mjs in that folder backs exactly one tool. They
 * live outside .pi/skills on purpose: the skills directory is readable by the
 * agent, and 200KB of host-side code is nothing it should ever read.
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
import { promisify } from 'node:util'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import {
  ASSETS_DIR,
  ENGINE_DIR,
  MUSIC_DIR,
  relativeIn,
  resolveIn,
  SCRIPTS_DIR,
  workspaceOf,
} from '../lib/paths.ts'
import { GSAP_PLUGINS, refreshShell, rewriteBlock, writeShell } from '../lib/shell.ts'
import { type ReconTokens, starterShots } from '../lib/starter-shots.ts'

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

const SCRIPTS = join(SCRIPTS_DIR, 'launch-video')
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
          {
            description:
              'Choose for the brand, never by habit: Aoede bright, Kore warm, Leda sleek, Charon deep. Two films should not share a voice by default.',
          },
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
            'Gemini TTS model id. Default gemini-2.5-flash-preview-tts (most continuous); gemini-3.1-flash-tts-preview is more expressive with longer sentence breaks. A take that comes back rushed or truncated is re-recorded once with the other model before you see it — one call is the whole job.',
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
      'Render index.html to MP4 by deterministic seek-and-capture. To LOOK at shots use motion_review (frames, not video); render a from/to segment (fps 30, no audio) only when the motion itself is in doubt — a shutter (motion blur) is one such case. A full render only when the user asks for an MP4 in chat — the studio previews the live page and has its own Export button — then out_res and fps 60, after motion_audit and motion_review pass. Shutter, samples, depth and codec default to the film\'s `render` block in shots.js and the look to its `grade` block (motion_schema({ section: "render and grade" })); the flags here override for one render.',
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
      samples: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: 16,
          description:
            'Captures averaged per frame (motion blur). 1 = none; 4 with shutter 0.5 is a 180° film shutter. Overrides render.samples.',
        }),
      ),
      shutter: Type.Optional(
        Type.Number({
          minimum: 0,
          maximum: 1,
          description:
            'Fraction of the frame interval the shutter is open (0.5 = 180°; 1 = frame blending). Overrides render.shutter.',
        }),
      ),
      depth: Type.Optional(
        Type.Union([Type.Literal(8), Type.Literal(10)], {
          description:
            '10-bit output stops soft gradients banding (default 8). Overrides render.depth.',
        }),
      ),
      codec: Type.Optional(
        Type.Union([Type.Literal('h264'), Type.Literal('hevc')], {
          description:
            'h264 plays everywhere; hevc for 10-bit deliverables on Apple devices. Overrides render.codec.',
        }),
      ),
      frames: Type.Optional(
        Type.Union([Type.Literal('jpeg'), Type.Literal('png')], {
          description:
            'Intermediate frame format: jpeg (default, q92) or png (lossless, slower, more disk) for a film that lives on soft gradients.',
        }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const a: string[] = []
      if (p.page) a.push(relativeIn(ws, p.page))
      a.push('--out=' + relativeIn(ws, p.out, 'write'))
      if (p.out_res) a.push('--out-res=' + p.out_res)
      else if (p.scale === undefined) a.push('--scale=1')
      for (const k of [
        'fps',
        'scale',
        'width',
        'height',
        'workers',
        'from',
        'to',
        'samples',
        'shutter',
        'depth',
        'codec',
        'frames',
      ] as const) {
        if (p[k] !== undefined) a.push(`--${k}=` + p[k])
      }
      return text(await runScript('capture.mjs', a, ws))
    },
  })

  pi.registerTool({
    name: 'motion_review',
    label: 'Look at the Film',
    description:
      "Your eyes on the film. Seeks the compiled page at three moments per shot (entrance settled, second act, exit starting), stamps each frame with its shot and time, and tiles them into contact sheets you receive as images — the whole film on 3–4 sheets. It also measures, at every frame, each run of hero type against the mask holding it (or the stage edge) and lists what is clipped, in px, with the fix; and, at the settled frame, the ground — a shot sitting on a colour that is none of the brand's is named (`bg: \"ink\"` passes). Look for: words over a busy image, elements overlapping or half off-canvas, an empty frame, three identical frames (no second act), a colour or typeface that is not in recon/brand-tokens.md, a UI screenshot that never changes. What is on the stage — one thing or three forms — is the lab effect's composition and yours; the review does not count it. The frames carry the film's `grade` block. Fix in shots.js, then re-run with `shots` for the ones you touched — not another motion_audit, unless a dur, a cue or a beat changed. Run after motion_audit passes and after every shot edit; frames in review/ are for you, not the user.",
    parameters: Type.Object({
      shots: Type.Optional(
        Type.Array(Type.String(), { description: 'Only these shot ids (default: every shot)' }),
      ),
      per_shot: Type.Optional(
        Type.Integer({ minimum: 1, maximum: 6, description: 'Frames per shot (default 3)' }),
      ),
      times: Type.Optional(
        Type.Array(Type.Number(), { description: 'Extra moments to include, in seconds' }),
      ),
      page: Type.Optional(Type.String({ description: 'Page to review (default index.html)' })),
      out: Type.Optional(Type.String({ description: 'Sheet directory (default review)' })),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const outRel = p.out || 'review'
      const a: string[] = []
      if (p.page) a.push(relativeIn(ws, p.page))
      a.push(`--out=${relativeIn(ws, outRel, 'write')}`)
      if (p.shots?.length) a.push(`--shots=${p.shots.join(',')}`)
      if (p.per_shot) a.push(`--per-shot=${p.per_shot}`)
      if (p.times?.length) a.push(`--times=${p.times.join(',')}`)
      const out = await runScript('review.mjs', a, ws, 300_000)
      const dir = resolveIn(ws, outRel)
      const sheets = existsSync(dir)
        ? readdirSync(dir)
            .filter(f => /^sheet-\d+\.jpg$/.test(f))
            .sort()
        : []
      const MAX_SHEETS = 8
      const shown = sheets.slice(0, MAX_SHEETS)
      const note =
        sheets.length > MAX_SHEETS
          ? `\n(${sheets.length} sheets; showing the first ${MAX_SHEETS} — review the rest with \`shots\`.)`
          : ''
      return {
        content: [
          { type: 'text' as const, text: out + note },
          ...shown.map(f => ({
            type: 'image' as const,
            data: readFileSync(join(dir, f)).toString('base64'),
            mimeType: 'image/jpeg',
          })),
        ],
        details: { sheets: shown.map(f => `${outRel}/${f}`) },
      }
    },
  })

  pi.registerTool({
    name: 'motion_audit',
    label: 'Motion Audit',
    description:
      "The gate. Loads index.html?audit (drift and ambient off), samples every 0.25s and scores the film: the shot-list rules (shot count, scene lengths, the hook, breaths, a bare stage), the narration contract (one read in audio.vo, every shot cued and landing 0–0.35s before its word), factory overruns, seek determinism and overlap. Pacing is a ⚠️ note, not a ❌: a stretch with nothing new past 1.5s or a film under 0.7 events/s names the reference films' numbers — answer it with a beat or a cut, or keep the hold and say why in direction.md. Prints a per-shot ev/s table; a ❌ fails — fix and re-run; a ⚠️ alone needs no re-run, and a pacing note answered in direction.md is closed. After a fix that changes a dur, a cue or a beat, re-run with `shots` for the shots you touched: it samples only their stretch on the same grid (a 5s shot is ~8s, the film ~30s) and replaces their frames in audit/. Several tabs sample the film at once. Writes one frame per second to audit/. Not for audio-only changes: a breath or a mix level needs motion_cues and motion_mix, not the gate.",
    parameters: Type.Object({
      page: Type.Optional(Type.String({ description: 'Page to audit (default index.html)' })),
      shots: Type.Optional(
        Type.Array(Type.String(), {
          description: 'Only these shot ids — the re-check after a fix (default: the whole film)',
        }),
      ),
      step: Type.Optional(Type.Number({ description: 'Sample step in seconds (default 0.25)' })),
      max_quiet: Type.Optional(
        Type.Number({
          description:
            'The stretch without an on-screen event the pacing note starts at, seconds (default 1.5; a note, not a failure)',
        }),
      ),
      min_eps: Type.Optional(
        Type.Number({
          description:
            'Events per second over the film the pacing note starts under (default 0.7; a note, not a failure)',
        }),
      ),
      out: Type.Optional(Type.String({ description: 'Output frame dir (default audit)' })),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const a: string[] = []
      if (p.page) a.push(relativeIn(ws, p.page))
      if (p.shots?.length) a.push(`--shots=${p.shots.join(',')}`)
      if (p.step) a.push('--step=' + p.step)
      if (p.max_quiet) a.push('--max-quiet=' + p.max_quiet)
      if (p.min_eps) a.push('--min-eps=' + p.min_eps)
      if (p.out) a.push('--out=' + relativeIn(ws, p.out, 'write'))
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
      'Capture the product: from a live URL, or a synthetic HTML template. For brand recon -> recon/screenshots/; ' +
      'for a shot, `selector` crops to the one control the copy is about, at 2× — a whole desktop is never the subject of a shot. With `layers`, cuts the screen into a ' +
      'base plate plus each floating piece (modal, sticky header, sidebar, toast) on transparency and writes ' +
      '<out>.layers.json with the `layers` field for a parallax ui-frame — out under assets/harvested/ in that case.',
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
      layers: Type.Optional(
        Type.String({
          description:
            '"auto" (fixed/sticky elements, dialogs, header/nav/aside) or a comma-separated list of CSS selectors to lift into layers.',
        }),
      ),
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
      if (p.layers) a.push('--layers=' + p.layers)
      return text(await runScript('screenshot.mjs', a, ws))
    },
  })

  pi.registerTool({
    name: 'motion_recon',
    label: 'Measure Brand',
    description:
      "Measure the product's brand from the live page in a real browser: body bg/ink/font, :root custom properties, headline and body type, the primary CTA's computed styles, surfaces, saturated colours, theme-color and the page copy → recon/brand-tokens.md + .json; saves the logo from the header verbatim into assets/logo/ (inline SVG as-is) and self-hosts the brand's web fonts into assets/fonts/ with a ready brand.fonts snippet. Run on the home page and 1–2 product pages (different out paths).",
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
    name: 'motion_image',
    label: 'Generate Image',
    description:
      'For the site that has no imagery: generate ONE brand-locked still with a Gemini image model — a background plate for a type beat, an object for the hook (the thing the product is about, or its metaphor), a texture for the stage, a flat illustration of the mechanism, or a matching icon set. The palette is read from recon/brand-tokens.json and written into the prompt; pass files from assets/ as refs for material and mood. It refuses screens, logos, people and text — a generated screenshot is a fabricated product. You receive the image: look at it; off-brand or off-subject, regenerate once with a sharper subject, then move on. Files land in assets/generated/ with a sidecar and recon/generated.json.',
    parameters: Type.Object({
      kind: Type.Union(
        [
          Type.Literal('plate'),
          Type.Literal('object'),
          Type.Literal('illustration'),
          Type.Literal('texture'),
          Type.Literal('icons'),
        ],
        {
          description:
            'plate: full-frame abstract background · object: one physical thing on a plain ground · illustration: flat shapes/arrows of the mechanism · texture: an edge-to-edge surface · icons: 6–12 matching icons',
        },
      ),
      subject: Type.String({
        description:
          'What is in the frame and what it is made of, in direction.md\'s language (e.g. "a brass key resting on grey felt, soft top light"). No UI, logos, people or words.',
      }),
      out: Type.String({ description: 'Output path, e.g. assets/generated/hook-object.png' }),
      aspect: Type.Optional(
        Type.Union(
          [
            Type.Literal('16:9'),
            Type.Literal('1:1'),
            Type.Literal('9:16'),
            Type.Literal('4:3'),
            Type.Literal('3:4'),
          ],
          { description: 'Frame shape (default 16:9)' },
        ),
      ),
      style: Type.Optional(
        Type.String({
          description:
            'The rendering style from direction.md (flat vector, paper cut-out, studio photo, clay, isometric line…)',
        }),
      ),
      refs: Type.Optional(
        Type.Array(Type.String(), {
          description:
            'Harvested images whose colour, material and mood the result should match (workspace paths, png/jpg/webp, up to 3)',
        }),
      ),
      model: Type.Optional(
        Type.String({
          description:
            'Gemini image model id (default gemini-3.1-flash-image; gemini-3-pro-image for a hero plate)',
        }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const a = [
        `--kind=${p.kind}`,
        `--subject=${p.subject}`,
        `--out=${relativeIn(ws, p.out, 'write')}`,
      ]
      if (p.aspect) a.push(`--aspect=${p.aspect}`)
      if (p.style) a.push(`--style=${p.style}`)
      if (p.refs?.length)
        a.push(
          `--ref=${p.refs
            .slice(0, 3)
            .map((r: string) => relativeIn(ws, r))
            .join(',')}`,
        )
      if (p.model) a.push(`--model=${p.model}`)
      let out: string
      try {
        out = await runScript('image.mjs', a, ws, 180_000)
      } catch (err: any) {
        return text(String(err?.message || err))
      }
      const file = out.match(/🖼\s+(\S+)/)?.[1]
      const abs = file ? resolveIn(ws, file) : null
      if (!abs || !existsSync(abs)) return text(out)
      const mimeType = /\.jpe?g$/i.test(abs) ? 'image/jpeg' : 'image/png'
      return {
        content: [
          { type: 'text' as const, text: out },
          { type: 'image' as const, data: readFileSync(abs).toString('base64'), mimeType },
        ],
        details: { file },
      }
    },
  })

  pi.registerTool({
    name: 'motion_check',
    label: 'Check Cut',
    description:
      "Fast compile check (seconds, not the audit): links any new js/shots/*.js and css/shots/*.css into index.html, then loads it and reports page errors, shot count, real duration, every shot's start time, any factory overrun worth a fix (over 1.1×; over 1.6× fails the audit) and the shot-list warnings the audit will raise — a shot that holds past 1.5s, text that only enters, a whole desktop as the subject, boundaries nothing crosses (no actor posed on both sides, no carry, no flood or zoom — over a third and the film reads as slides). Run after every batch of shots you save and act on the warnings then.",
    parameters: Type.Object({
      page: Type.Optional(Type.String({ description: 'Page to load (default index.html)' })),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const a: string[] = ['--check']
      if (p.page) a.push(relativeIn(ws, p.page))
      const linked = p.page ? [] : refreshShell(ws)
      const head = linked.length ? `${linked.join('\n')}\n` : ''
      try {
        return text(head + (await runScript('cues.mjs', a, ws, 120_000)))
      } catch (err: any) {
        const out = `${err?.stdout ?? ''}\n${err?.stderr ?? ''}`.trim()
        if (out) return text(head + out)
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
      'mode=query: ranked, measured clips — pass every event the film needs in one call (event: "impact,whoosh_deep,chime"), not one call per event. ' +
      'mode=build: render audio/sfx_bus.wav from audio/sfx-cues.json, placing every cue by its measured onset. ' +
      'Budget per 30s: ~6 signature cues (every event but tick/pop/click/type/data), one per shot, and up to ~14 micro-texture; write the sheet to that budget so the build passes first time. The build must finish with no placement warnings.',
    parameters: Type.Object({
      mode: Type.Union([Type.Literal('list'), Type.Literal('query'), Type.Literal('build')]),
      event: Type.Optional(
        Type.String({
          description:
            "query: event name(s), comma-separated (pop, whoosh_deep, impact, …) — all the film's events in one call",
        }),
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
      "The engine's shot schema in pieces: no arguments → the shot-type list and the sections; `types` → the exact fields of those types and the DOM classes each mounts; `section` → one section, or SEVERAL AT ONCE as an array — ask for everything you need in one call, not six — from: density layer (stage, exits, beats), actors (one object across shots), narration spine, common shot fields (cuts incl. flood and zoom-out), ui-frame, materials, render and grade, custom shot types, rules. Use this instead of reading engine files.",
    parameters: Type.Object({
      types: Type.Optional(
        Type.Array(Type.String(), {
          description:
            'Shot types to describe, e.g. ["word-cut","pile"]. Unknown names are reported.',
        }),
      ),
      section: Type.Optional(
        Type.Union([Type.String(), Type.Array(Type.String())], {
          description:
            'A section by heading, e.g. "custom shot types", or several: ["rules", "actors"].',
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

      // One section or several: a film needs the stage, the actors and the
      // rules before it can write a shot, and asking for them one at a time
      // is three round trips carrying the whole conversation each.
      const wanted: string[] = Array.isArray(p.section)
        ? p.section.map(String)
        : p.section
          ? [String(p.section)]
          : []
      if (wanted.length) {
        const out: string[] = []
        for (const want of wanted) {
          const key = want
            .toLowerCase()
            .replace(/[^a-z ]/g, '')
            .trim()
          const hit =
            sections.get(key) ??
            [...sections.entries()].find(([k]) => k.includes(key) || key.includes(k))?.[1]
          out.push(
            hit ?? `No section "${want}". Sections: ${[...sections.keys()].join(', ')}`,
          )
        }
        return text(out.join('\n\n'))
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
      'Write index.html — the thin shell that loads the GSAP vendor bundle, three.js and lottie-web, shots.js, the engine and ' +
      'every project shot type in js/shots/*.js and css/shots/*.css, in the one order that works — and, when there is none yet, ' +
      'a starter shots.js with the brand from recon (bg, ink, accent, the font and its self-hosted files) and a PLACEHOLDER ' +
      'opening shot built from the site\'s own h1, so the preview is never blank: replace it with your hook and keep adding ' +
      'one shot at a time. Call this once instead of writing the page by hand. New type files after that need no ' +
      'scaffold call: motion_check links them. Pass rive: true when a shot uses a .riv file.',
    parameters: Type.Object({
      title: Type.Optional(
        Type.String({ description: 'Page <title>; defaults to the project name.' }),
      ),
      custom: Type.Optional(
        Type.Boolean({
          description:
            'No longer needed: every js/shots/*.js and css/shots/*.css is linked, and js/shots.custom.js when it exists.',
        }),
      ),
      rive: Type.Optional(
        Type.Boolean({
          description:
            'Load the Rive runtime (3MB) for `rive` shots or ShotKit.rive (default false).',
        }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      resolveIn(ws, 'index.html', 'write')
      const title = String(p.title ?? basename(ws))
      const files = writeShell(ws, { title, rive: Boolean(p.rive) })
      const vendor = existsSync(join(ASSETS_DIR, 'gsap', 'gsap.min.js'))

      // The starter shots.js: the file's shape plus the measured brand, never
      // over a shots.js the agent has already written.
      const shotsPath = resolveIn(ws, 'shots.js', 'write')
      let starter = ''
      if (!existsSync(shotsPath)) {
        let tokens: ReconTokens | null = null
        try {
          tokens = JSON.parse(readFileSync(resolveIn(ws, 'recon/brand-tokens.json'), 'utf8'))
        } catch {
          tokens = null
        }
        writeFileSync(shotsPath, starterShots(tokens))
        starter = tokens
          ? '\nshots.js written with the brand recon measured and a placeholder opener from the site\'s h1 — it is playing now; replace it with your hook.'
          : '\nshots.js written with a PLACEHOLDER brand (no recon/brand-tokens.json yet): run motion_recon, then put the measured values in brand.'
      }
      const linked = [...files.styles, ...files.scripts]
      return text(
        `index.html written (${GSAP_PLUGINS.length} GSAP plugins, three.js, lottie-web${p.rive ? ', rive' : ''}${linked.length ? ` + ${linked.join(', ')}` : ''}).\n` +
          (vendor
            ? 'GSAP loads from the shared ../../assets/gsap/.'
            : '⚠ assets/gsap/gsap.min.js is missing — the page will not compile. Say so and stop.') +
          starter +
          '\nCustom shot types: one per file, js/shots/<type>.js (+ css/shots/<type>.css); motion_check links each new one.' +
          '\nNext: replace the placeholder opener and add ONE shot at a time — save and motion_check after each, so the user is watching a film that runs.',
      )
    },
  })

  // A rewrite of a big file is the expensive shape — a minute of output and
  // a file the agent then cannot edit, because it no longer knows its text.
  pi.on('tool_call', async (event: any, ctx: any) => {
    if (event.toolName !== 'write') return undefined
    const rel = String(event.input?.path ?? event.input?.file_path ?? '')
    if (!rel) return undefined
    const ws = workspaceOf(ctx)
    try {
      resolveIn(ws, rel, 'write')
    } catch {
      return undefined // the write tool refuses it with its own reason
    }
    const reason = rewriteBlock(ws, rel)
    return reason ? { block: true, reason } : undefined
  })
}
