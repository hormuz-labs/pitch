/**
 * Launch films — `pitch motion` commands wrapping the Node programs in
 * .pi/scripts/launch-video (recon, screenshot, tts, align, sync, cues/check,
 * sfx, mix, audit, review, footage, stock) plus two small host helpers
 * (find_audio, verify_duration). MP4 capture is owned by the user-triggered exporter. Scripts
 * live outside .pi/skills on purpose: the skills directory is readable by the
 * agent, and 200KB of host-side code is nothing it should ever read.
 *
 * Every tool runs with the session's cwd — the job's sandboxed workspace — so
 * relative paths (audio/, renders/, audit/) resolve inside it.
 */

import { execFile, execFileSync } from 'node:child_process'
import { randomInt } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { promisify } from 'node:util'
import { Type } from '@sinclair/typebox'
import { projectAudioConfig, TTS_PROVIDERS, type TtsProvider } from '../lib/audio-config.ts'
import {
  ASSETS_DIR,
  ENGINE_DIR,
  MUSIC_DIR,
  relativeIn,
  resolveIn,
  SCRIPTS_DIR,
  workspaceOf,
} from '../lib/paths.ts'
import { GSAP_PLUGINS, refreshShell, writeShell } from '../lib/shell.ts'
import { type ReconTokens, starterShots } from '../lib/starter-shots.ts'
import { hostAction } from '../lib/studio-host.ts'
import { cachedValidation } from '../lib/validation-cache.ts'
import type { CommandSpec } from './registry.ts'

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

function validateFilm(name: string, args: string[], ws: string, out: string) {
  const audio = join(ws, 'audio')
  const narration = existsSync(audio)
    ? readdirSync(audio)
        .filter(f => /^vo[.-]|^vo[_-]/.test(f))
        .map(f => join(audio, f))
    : []
  return cachedValidation({
    workspace: ws,
    key: JSON.stringify([name, args]),
    inputs: [
      ...['index.html', 'shots.js', 'js', 'css', 'assets', 'recon', 'uploads', 'vendor'].map(f =>
        join(ws, f),
      ),
      ...args.filter(a => !a.startsWith('--')).map(f => join(ws, f)),
      ...narration,
      ...['gsap', 'three', 'lottie', 'rive', 'p5', 'fonts'].map(f => join(ASSETS_DIR, f)),
      ENGINE_DIR,
      SCRIPTS,
    ],
    outputs: [resolveIn(ws, out)],
    run: () => runScript(name, args, ws, 300_000),
  })
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

export default function motionCommands(): CommandSpec[] {
  const commands: CommandSpec[] = []
  commands.push({
    verb: 'tts',
    description:
      'Record the spoken story before authoring shot timings: one continuous read of the whole script, saved with its text beside it (audio/vo.txt). ' +
      'One call per film, never one per shot. Which service reads it — Gemini TTS (→ audio/vo.wav) or ElevenLabs (→ audio/vo.mp3) — ' +
      "is set in the studio's audio config, not by you; --provider overrides it for one read. " +
      'Then set audio.vo in shots.js to the file this prints, pitch motion align, cue every shot, pitch motion sync.',
    parameters: Type.Object({
      text: Type.Optional(
        Type.String({
          description:
            'The complete spoken story, with natural sentences and pauses. It should make sense on its own, not read like a list of shot captions.',
        }),
      ),
      script: Type.Optional(
        Type.String({
          description: 'Path to a text file holding the whole script (alternative to text).',
        }),
      ),
      out: Type.Optional(
        Type.String({
          description: 'Output path (default audio/vo.wav for Gemini, audio/vo.mp3 for ElevenLabs)',
        }),
      ),
      provider: Type.Optional(
        Type.Union([Type.Literal('gemini'), Type.Literal('elevenlabs')], {
          description: 'Override the configured service for this read.',
        }),
      ),
      voice: Type.Optional(
        Type.String({
          description:
            'Gemini: Aoede bright, Kore warm, Leda sleek, Charon deep — choose for the brand, never by habit. ' +
            'ElevenLabs: a voice id from pitch motion voices. Default: the configured voice.',
        }),
      ),
      style: Type.Optional(
        Type.String({
          description:
            'Gemini only: a short situational direction (emotion, pace, pitch — e.g. "warm and enthusiastic", "speaking rapidly") for text before the first {…} turn. ' +
            'On Gemini 3.8, direct each turn in the script instead: a line opening with {dry and sarcastic, speaking rapidly} styles the text up to the next {…}, and <sigh>, <laugh>, <short pause> are momentary vocal events; all turns are one continuous read. ' +
            'Never put the voice identity (age, gender, accent) in a style. On ElevenLabs v3 write delivery as audio tags in the script, e.g. [warmly].',
        }),
      ),
      model: Type.Optional(
        Type.String({
          description:
            'Gemini: gemini-3.8-flash-tts (default, most expressive) or gemini-2.5-flash-preview-tts (most continuous); a rushed take is re-recorded once with the other. ' +
            'ElevenLabs: eleven_v3 (default), eleven_multilingual_v2, eleven_flash_v2_5.',
        }),
      ),
      stability: Type.Optional(
        Type.Number({ minimum: 0, maximum: 1, description: 'ElevenLabs: 0 varied … 1 steady' }),
      ),
      similarity: Type.Optional(
        Type.Number({ minimum: 0, maximum: 1, description: 'ElevenLabs: adherence to the voice' }),
      ),
      expressiveness: Type.Optional(
        Type.Number({ minimum: 0, maximum: 1, description: 'ElevenLabs: style exaggeration' }),
      ),
      speed: Type.Optional(
        Type.Number({
          minimum: 0.7,
          maximum: 1.2,
          description: 'ElevenLabs: never use speed to rescue an overlong script',
        }),
      ),
      pace: Type.Optional(
        Type.Union([Type.Literal('narration'), Type.Literal('ad')], {
          description:
            'narration (default, 1.9–2.4 words/s) or ad (the brisker short-form ad read, 2.7–3.5); match shots.js audio.pace',
        }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      if (!p.text && !p.script)
        return text('pitch motion tts needs `text` (the whole script) or `script` (a file path).')
      let options = {}
      try {
        options = JSON.parse(readFileSync(join(ws, 'project.json'), 'utf8')).options ?? {}
      } catch {
        /* Workspaces created outside the studio use operator defaults. */
      }
      const config = projectAudioConfig(options).tts
      const provider: TtsProvider = TTS_PROVIDERS.includes(p.provider)
        ? p.provider
        : config.provider

      if (provider === 'elevenlabs') {
        const defaults = config.elevenlabs
        const out = relativeIn(ws, p.out || 'audio/vo.mp3', 'write')
        const result = await hostAction(ws, 'elevenlabs_voiceover', {
          script: p.script ? relativeIn(ws, p.script) : undefined,
          text: p.text,
          voiceId: p.voice || defaults.voice || '',
          model: p.model || defaults.model,
          stability: p.stability,
          similarity: p.similarity,
          style: p.expressiveness,
          speed: p.speed,
          out,
        })
        return text(result)
      }

      const defaults = config.gemini
      const a = ['--out=' + relativeIn(ws, p.out || 'audio/vo.wav', 'write')]
      if (p.script) a.push('--script=' + relativeIn(ws, p.script))
      else a.push('--text=' + p.text)
      const voice = p.voice || defaults.voice
      const model = p.model || defaults.model
      if (voice) a.push('--voice=' + voice)
      if (p.style) a.push('--style=' + p.style)
      if (model) a.push('--model=' + model)
      if (p.pace) a.push('--pace=' + p.pace)
      return text(await runScript('tts.mjs', a, ws))
    },
  })

  commands.push({
    verb: 'voices',
    description:
      "The ElevenLabs voices the studio's account can use, one line each: name, id, labels. Search by accent, tone, language or use case, choose the one direction.md calls for, and pass its id as --voice to pitch motion tts. Only meaningful when narration is on ElevenLabs.",
    parameters: Type.Object({
      search: Type.Optional(
        Type.String({ description: 'Filter, e.g. "british calm" or "narration"' }),
      ),
      limit: Type.Optional(
        Type.Integer({ minimum: 1, maximum: 100, description: 'Max voices (default 30)' }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(
        await hostAction(workspaceOf(ctx), 'elevenlabs_voices', {
          search: p.search,
          limit: p.limit,
        }),
      )
    },
  })

  commands.push({
    verb: 'music',
    description:
      'Generate a bespoke instrumental bed, when nothing in the curated library (pitch motion find-audio) fits. Billed; one call per film. ' +
      'Default provider lyria (Lyria 3.5): one prompt — identity line (genre and era, BPM and feel, instruments plus one unexpected, mood), then timestamped sections ("[0:00 - 0:03] Intro: …") from the music plan. ' +
      'Provider elevenlabs (music_v2): styles (6–7) and sections, each ending at a film second (until), at least 3s: ' +
      '[{"label":"Intro","until":3.1,"text":"filtered drums, no bass","avoid":["808","bass"]},…]; exact length, but it follows the sections loosely (one drop, no breakdown, in vocal-free takes). Never name an artist or a song. ' +
      'Neither keeps the clock exactly, so the tool measures where the bass really drops out and slams back and, with drop_at, trims the head so a drop lands on that film second (the turn word). ' +
      "It cuts the bed to the film's duration with a fade, keeps the raw take, and reports every drop in film time.",
    parameters: Type.Object({
      provider: Type.Optional(
        Type.Union([Type.Literal('elevenlabs'), Type.Literal('lyria')], {
          description:
            'lyria (default: follows the arrangement) or elevenlabs (exact length, loose sections)',
        }),
      ),
      styles: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "elevenlabs: the bed's identity, 6–7 styles (genre and era, BPM, instruments, mood)",
        }),
      ),
      avoid: Type.Optional(
        Type.Array(Type.String(), {
          description: 'elevenlabs: styles to keep out of every section',
        }),
      ),
      sections: Type.Optional(
        Type.Array(
          Type.Object({
            label: Type.String(),
            until: Type.Number({ description: 'Film second the section ends on' }),
            text: Type.Optional(Type.String({ description: 'What enters, leaves or builds' })),
            styles: Type.Optional(Type.Array(Type.String())),
            avoid: Type.Optional(Type.Array(Type.String())),
          }),
          { description: 'elevenlabs: the music plan, in order, each at least 3s' },
        ),
      ),
      prompt: Type.Optional(
        Type.String({
          description:
            'lyria: the brief with timestamped sections; elevenlabs: a plain prompt when no sections are given',
        }),
      ),
      duration: Type.Number({
        minimum: 3,
        maximum: 600,
        description: "The film's length in seconds",
      }),
      drop_at: Type.Optional(
        Type.Number({
          minimum: 0,
          description: 'Film second a drop must land on: the onset of the word the film turns on',
        }),
      ),
      out: Type.Optional(
        Type.String({
          description:
            'Fitted bed .mp3 (default audio/music.mp3; the raw take is kept as <name>.elevenlabs.mp3 or <name>.lyria.mp3)',
        }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const out = relativeIn(ws, p.out || 'audio/music.mp3', 'write')
      if (p.provider !== 'elevenlabs') {
        if (!p.prompt)
          return text(
            'pitch motion music needs --prompt (or --provider elevenlabs with --styles and --sections).',
          )
        return text(
          await hostAction(ws, 'lyria_music', {
            prompt: p.prompt,
            duration: p.duration,
            dropAt: p.drop_at,
            out,
          }),
        )
      }
      if (!p.sections?.length && !p.prompt)
        return text(
          'pitch motion music --provider elevenlabs needs --styles and --sections (or a --prompt).',
        )
      return text(
        await hostAction(ws, 'elevenlabs_music', {
          styles: p.styles,
          avoid: p.avoid,
          sections: p.sections,
          prompt: p.prompt,
          duration: p.duration,
          dropAt: p.drop_at,
          out,
        }),
      )
    },
  })

  commands.push({
    verb: 'sound',
    description:
      "Generate ONE isolated, product-specific sound with ElevenLabs Sound Effects — only for what the curated library cannot have (the product's own foley, a literal ambience). Whooshes, risers, impacts, sub drops and shutters come from pitch motion sfx (the Gakuyen pack). " +
      'One concise sound per call — the transient, its material, its length — never a soundscape. Reference the file in audio/sfx-cues.json with its event class; the build measures its onset and places it.',
    parameters: Type.Object({
      prompt: Type.String({ description: 'One sound event, at most 450 characters' }),
      out: Type.String({
        description: 'A unique workspace-relative .mp3, e.g. audio/generated-sfx/latch-click.mp3',
      }),
      duration: Type.Optional(Type.Number({ minimum: 0.5, maximum: 30, description: 'Seconds' })),
      influence: Type.Optional(
        Type.Number({ minimum: 0, maximum: 1, description: 'Prompt adherence (default 0.3)' }),
      ),
      loop: Type.Optional(
        Type.Boolean({ description: 'Seamless loop, for an ambient texture only' }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      return text(
        await hostAction(ws, 'elevenlabs_sound', {
          prompt: p.prompt,
          duration: p.duration,
          influence: p.influence,
          loop: p.loop,
          out: relativeIn(ws, p.out, 'write'),
        }),
      )
    },
  })

  commands.push({
    verb: 'align',
    description:
      'Word-level timestamps for the continuous narration read (local whisper.cpp) → audio/vo-words.json. ' +
      'Aligns the known script (audio/vo.txt) to the recording so every word has an onset. Required before ' +
      'pitch motion sync and by pitch motion audit whenever shots.js has audio.vo.',
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
        return text(await hostAction(ws, 'launch_align', { args: a }))
      } catch (err: any) {
        return text(String(err?.message || err))
      }
    },
  })

  commands.push({
    verb: 'sync',
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

  commands.push({
    verb: 'review',
    description:
      'A compact visual check: one settled frame per shot by default, tiled into contact sheets. Read each sheet once. Use shots and explicit times only for a specific unresolved layout or transition issue. Simplify the source copy before capturing pictures. Extra samples cost capture time and image tokens. This is not playback review; never render an MP4 for validation. The user owns launch export.',
    parameters: Type.Object({
      shots: Type.Optional(
        Type.Array(Type.String(), { description: 'Only these shot ids (default: every shot)' }),
      ),
      per_shot: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: 6,
          description: 'Frames per shot (default 1; increase only for a specific unresolved issue)',
        }),
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
      const out = await validateFilm('review.mjs', a, ws, outRel)
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

  commands.push({
    verb: 'audit',
    description:
      'Render validation and pacing diagnostics. Loads index.html?audit (optional drift and ambient off), samples every 0.25s, checks timeline validity, narration alignment, factory overruns, seek determinism and scene visibility. Pixel-change rate is not a storytelling score: default notes flag quiet stretches over 1.5s or fewer than 0.7 events/s; max_quiet and min_eps may be chosen for the treatment. Review notes against direction.md and reading time. Intentional stillness needs no fix or re-run; never add decorative motion to raise the count. No prescribed shot count, duration, effect source, cut style or sound dip. Fix ❌ rendering failures and re-run. After timing, cue or beat edits, use shots to sample only the affected shots. Writes frames in audit/. Audio-only changes need pitch motion mix, not a visual audit.',
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
          minimum: 0,
          description:
            'Quiet-stretch diagnostic threshold in seconds; choose for the treatment (default 1.5, not a failure)',
        }),
      ),
      min_eps: Type.Optional(
        Type.Number({
          minimum: 0,
          description:
            'Pixel-change events/s diagnostic threshold (default 0.7); 0 disables the rate note for a deliberately still treatment',
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
      if (p.max_quiet !== undefined) a.push(`--max-quiet=${p.max_quiet}`)
      if (p.min_eps !== undefined) a.push(`--min-eps=${p.min_eps}`)
      if (p.out) a.push('--out=' + relativeIn(ws, p.out, 'write'))
      try {
        return text(await validateFilm('audit.mjs', a, ws, p.out || 'audit'))
      } catch (err: any) {
        // A failed gate is a result, not a crash: hand the scorecard back verbatim.
        const out = `${err?.stdout ?? ''}\n${err?.stderr ?? ''}`.trim()
        if (out) return text(out)
        throw err
      }
    },
  })

  commands.push({
    verb: 'screenshot',
    description:
      'Capture the product: from a live URL, or a synthetic HTML template. For brand recon -> recon/screenshots/; ' +
      'for a detail shot, `selector` crops to the relevant control at 2×; keep an overview when the whole interface is the subject. With `layers`, cuts the screen into a ' +
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
        throw new Error("Provide either 'url' or 'html' to pitch motion screenshot.")
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

  commands.push({
    verb: 'inspect',
    description:
      'Explore a product URL in a browser without screenshots, font downloads or overwriting brand recon. Returns bounded readable text and real links (including docs/product pages), follows redirects and saves evidence under recon/pages/. Follow useful links autonomously until the selected workflow is understood; the page layout is not a video composition.',
    parameters: Type.Object({
      url: Type.String({
        description: 'Product, feature, documentation or other relevant HTTP(S) URL',
      }),
      max_chars: Type.Optional(
        Type.Integer({ minimum: 500, maximum: 12000, description: 'Text limit (default 5000)' }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx) {
      const args = [`--url=${p.url}`]
      if (p.max_chars) args.push(`--max-chars=${p.max_chars}`)
      return text(await hostAction(workspaceOf(ctx), 'launch_inspect', { args }))
    },
  })

  commands.push({
    verb: 'recon',
    description:
      'Measure brand identity from the live product page: palette, typography, CTA, logo and self-hosted fonts → recon/brand-tokens.md + .json. These are source facts, not a layout to copy. Run on the canonical brand page; explore further pages with pitch motion inspect without repeatedly harvesting fonts or replacing brand tokens.',
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

  commands.push({
    verb: 'image',
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

  commands.push({
    verb: 'check',
    description:
      'Fast compile check: links new js/shots/*.js and css/shots/*.css, loads the page and reports errors, valid durations, real shot start times and actionable factory overruns (over 1.1×; over 1.6× fails audit). Flags whole-screen UI for a delivery-size readability review; overviews are valid. For ads (audio.pace "ad") it also warns on pace (picture changes under 1.5/s, a still picture held past 1.5s, a clip reused across beats), a subtitle tier, and captions that sit where the last one did or cover what the shot shows. Does not prescribe word entrances or objects crossing cuts. Run after adding shots; address actual build problems and review content notes against the treatment.',
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
        if (out) return { ...text(head + out), isError: true }
        throw err
      }
    },
  })

  commands.push({
    verb: 'cues',
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

  commands.push({
    verb: 'sfx',
    description:
      'Query the curated SFX manifest or build the SFX bus. mode=list: the event vocabulary. ' +
      'mode=query: ranked, measured clips — pass every event the film needs in one call (event: "impact,whoosh_deep,chime"), not one call per event. ' +
      'mode=build: render audio/sfx_bus.wav from audio/sfx-cues.json with peak-safe gain staging. Read references/audio.md first. Cue sheet: {"duration":23.4,"cues":[{"t":6.4,"event":"impact","dur":0.8}]}, not a bare array. Transients land at t; a riser ENDS at t (dur is its approach, default at most 1.5s). Every other sound longer than 1.5s requires dur matching its animation. ' +
      'The studio pack (Gakuyen) ranks first and every clip carries its measured moment (`hit`), so t is the cut or word and the sound peaks there; pass a pack clip by its short id in "clip" (mode=list shows the suggested layers per moment). ' +
      'Density follows data/sfx-settings.json (heavy by default, a project may set "sfx-density" in audio/mix-settings.json): heavy layers a whoosh on every cut, a shutter per burst clip and stacked riser+impact+subdrop on big moments, with ~22 signature and ~48 texture cues per 30s (a sound on every picture change); different classes on one t are a layer, the same class within 120ms smears. The build must finish with no placement warnings.',
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

  commands.push({
    verb: 'mix',
    description:
      'Final mixdown to audio/mix.wav: the continuous narration read (shots.js audio.vo, placed at audio.voStart) over the music bed ' +
      'with ducking and a frequency carve, plus the SFX bus, then verified by extraction — fails if ' +
      'the voice is not clearly above the bed, or music-only SFX overpower the music in local 400ms windows. Pass music_only for a film without narration. ' +
      'Music-only defaults: bed -10dB, SFX -3dB, no automatic sidechain. Scheduled breath beats have smooth attack/release. ' +
      'Successful default-output mixes save gains to audio/mix-settings.json for automatic rebuilds. A level-only fix needs only this command.',
    parameters: Type.Object({
      duration: Type.Number({ description: 'Film duration in seconds (__DURATION())' }),
      music: Type.Optional(Type.String({ description: 'Music bed path, e.g. audio/music.mp3' })),
      sfx: Type.Optional(Type.String({ description: 'SFX bus path, e.g. audio/sfx_bus.wav' })),
      music_only: Type.Optional(Type.Boolean({ description: 'No narration in this film' })),
      bed_db: Type.Optional(
        Type.Number({ description: 'Bed attenuation in dB (default -13, or -10 music-only)' }),
      ),
      sfx_db: Type.Optional(
        Type.Number({ description: 'SFX bus trim in dB (default -3 music-only, 0 narrated)' }),
      ),
      no_breaths: Type.Optional(
        Type.Boolean({ description: 'Disable scheduled music dips; false re-enables them' }),
      ),
      duck: Type.Optional(
        Type.Number({
          minimum: 0,
          maximum: 24,
          description:
            'Maximum speech duck in dB (default 3 continuous, 9 otherwise; 0 disables it). Does not duck music against SFX.',
        }),
      ),
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
      if (p.sfx_db !== undefined) a.push('--sfx-db=' + p.sfx_db)
      if (p.no_breaths !== undefined) a.push('--no-breaths=' + p.no_breaths)
      if (p.duck !== undefined) a.push('--duck=' + p.duck)
      if (p.vo_map) a.push('--vo-map=' + relativeIn(ws, p.vo_map))
      if (p.out) a.push('--out=' + relativeIn(ws, p.out, 'write'))
      if (p.dry_run) a.push('--dry-run')
      return text(await runScript('mix.mjs', a, ws, 600_000))
    },
  })

  commands.push({
    verb: 'tighten',
    description:
      'Edit the breaths out of a narration read: every internal pause longer than --max (0.2s) is shortened to it, head and tail untouched, the original kept as <name>.untightened.<ext>. Short-form ads run the voice continuously (the reference ads pause for 0.3s+ about once per 30s). Run after pitch motion tts and before pitch motion align; re-align after any re-run.',
    parameters: Type.Object({
      vo: Type.Optional(Type.String({ description: 'Narration file (default audio/vo.wav)' })),
      max: Type.Optional(
        Type.Number({
          minimum: 0.05,
          maximum: 1,
          description: 'Longest pause to keep, seconds (default 0.2)',
        }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const a = [`--vo=${relativeIn(ws, p.vo || 'audio/vo.wav', 'write')}`]
      if (p.max != null) a.push(`--max=${p.max}`)
      return text(await runScript('tighten.mjs', a, ws, 120_000))
    },
  })

  /** A command's text plus the image it wrote, so the agent sees it without a second call. */
  const withImage = (out: string, ws: string, file: string | null) => {
    const abs = file ? resolveIn(ws, file) : null
    if (!abs || !existsSync(abs)) return text(out)
    return {
      content: [
        { type: 'text' as const, text: out },
        {
          type: 'image' as const,
          data: readFileSync(abs).toString('base64'),
          mimeType: 'image/jpeg',
        },
      ],
      details: { file },
    }
  }

  commands.push({
    verb: 'footage',
    description:
      'Prepare one clip of real footage (an upload, a stock download, a generated clip) for a `footage` shot: cuts the range the film uses, removes baked-in black bars, crops to the film frame (shots.js `format`) around --focus, and encodes a seekable silent WebM → assets/footage/<name>.webm, recorded in assets/footage/footage.json. Returns a five-frame strip of the RESULT: look at it — a subject cropped out or a clip that crosses a cut is re-prepared, not used. Inspect long sources first with pitch video frames --contact-sheet.',
    parameters: Type.Object({
      src: Type.String({ description: 'Workspace video, e.g. uploads/stock/club-ears.mp4' }),
      name: Type.String({ description: 'Readable slug for the clip, e.g. club-ears' }),
      in: Type.Optional(
        Type.Number({ minimum: 0, description: 'Source seconds to start at (default 0)' }),
      ),
      out: Type.Optional(Type.Number({ minimum: 0, description: 'Source seconds to end at' })),
      dur: Type.Optional(
        Type.Number({ minimum: 0.2, maximum: 60, description: 'Seconds to keep (instead of out)' }),
      ),
      focus: Type.Optional(
        Type.String({
          description:
            'x,y fractions of the source the crop keeps centred, e.g. 0.5,0.35 (default 0.5,0.5)',
        }),
      ),
      fit: Type.Optional(
        Type.Union([Type.Literal('cover'), Type.Literal('contain')], {
          description: 'cover (default) fills the frame; contain letterboxes',
        }),
      ),
      format: Type.Optional(
        Type.Union(
          [Type.Literal('16:9'), Type.Literal('9:16'), Type.Literal('1:1'), Type.Literal('4:5')],
          { description: 'Frame (default: shots.js format, else 16:9)' },
        ),
      ),
      fps: Type.Optional(
        Type.Integer({ minimum: 12, maximum: 60, description: 'Frame rate (default 30)' }),
      ),
      keep_bars: Type.Optional(
        Type.Boolean({ description: 'Keep black bars baked into the source' }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const a = ['--src=' + relativeIn(ws, p.src), '--name=' + p.name]
      for (const k of ['in', 'out', 'dur', 'focus', 'fit', 'format', 'fps'] as const)
        if (p[k] != null) a.push(`--${k}=${p[k]}`)
      if (p.keep_bars) a.push('--keep-bars')
      const out = await hostAction(ws, 'launch_footage', { args: a })
      const slug = String(p.name)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
      return withImage(out, ws, `assets/footage/${slug}.jpg`)
    },
  })

  commands.push({
    verb: 'stock',
    description:
      'Licensed stock footage and photos (Pexels) for shots that need a real-world picture nobody supplied. --mode search returns a numbered contact sheet: look at it and pick by what is visibly in the frame, not the title. --mode get downloads one result to uploads/stock/<name>.mp4|.jpg and records author, page and licence in uploads/stock/credits.json; then prepare a video with pitch motion footage. Search for the picture (subject, action, light, framing), not the idea. Identifiable people must not appear to endorse the product.',
    parameters: Type.Object({
      mode: Type.Union([Type.Literal('search'), Type.Literal('get')]),
      query: Type.Optional(
        Type.String({
          description:
            'search: what is in the frame, e.g. "close-up hand turning an hourglass, dark background"',
        }),
      ),
      kind: Type.Optional(
        Type.Union([Type.Literal('video'), Type.Literal('photo')], {
          description: 'default video',
        }),
      ),
      orientation: Type.Optional(
        Type.Union([Type.Literal('portrait'), Type.Literal('landscape'), Type.Literal('square')], {
          description: 'search: match the film frame',
        }),
      ),
      count: Type.Optional(
        Type.Integer({ minimum: 1, maximum: 15, description: 'search: results (default 9)' }),
      ),
      min_duration: Type.Optional(
        Type.Number({ minimum: 0, description: 'search: shortest video, seconds' }),
      ),
      pick: Type.Optional(
        Type.Integer({ minimum: 1, description: 'get: the number on the last search sheet' }),
      ),
      id: Type.Optional(
        Type.Integer({ minimum: 1, description: 'get: a Pexels id (with kind) instead of pick' }),
      ),
      name: Type.Optional(Type.String({ description: 'get: readable file name, e.g. club-ears' })),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      const a = [p.mode]
      if (p.query) a.push('--query=' + p.query)
      if (p.min_duration != null) a.push('--min-duration=' + p.min_duration)
      for (const k of ['kind', 'orientation', 'count', 'pick', 'id', 'name'] as const)
        if (p[k] != null) a.push(`--${k}=${p[k]}`)
      const out = await hostAction(ws, 'launch_stock', { args: a })
      return withImage(out, ws, p.mode === 'search' ? '.studio/stock/search.jpg' : null)
    },
  })

  commands.push({
    verb: 'find-audio',
    description:
      'Discover music candidates for any video. Respect an existing bed or user choice. List a small shuffled shortlist or use --random to import one candidate. Import only the candidate you will use or assess, not the entire shortlist. Optional pitch media review --purpose music analyzes actual sound when suitability is uncertain; it is not a routine gate. Filenames are opaque IDs, not moods. Reuse the chosen bed during edits.',
    parameters: Type.Object({
      dir: Type.Optional(
        Type.String({ description: "Directory to scan (default: the repo's assets/music)" }),
      ),
      max: Type.Optional(Type.Integer({ minimum: 1, description: 'Max entries (default 15)' })),
      random: Type.Optional(
        Type.Boolean({
          description: 'Randomly pick and import one track; max does not limit the pool',
        }),
      ),
      src: Type.Optional(
        Type.String({ description: 'Absolute path of a previously listed file to import' }),
      ),
      copy_to: Type.Optional(
        Type.String({
          description: 'Workspace-relative destination (random default: audio/music.<ext>)',
        }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      if (p.random && p.src) throw new Error('Choose either random or src, not both.')
      if (!p.random && (p.src || p.copy_to)) {
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
        if (st.isFile()) found.push({ p: fp, ms: st.size / 1e6, mtime: st.mtime })
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
          const fp = join(dp, f)
          const st = statSync(fp)
          if (st.isFile()) found.push({ p: fp, ms: st.size / 1e6, mtime: st.mtime })
        }
      }
      if (found.length === 0) return text(`No audio files found under ${root}`)
      if (p.random) {
        const selected = found[randomInt(found.length)]
        const src = resolveIn(ws, selected.p)
        const out = p.copy_to || `audio/music${extname(src).toLowerCase()}`
        const dest = resolveIn(ws, out, 'write')
        mkdirSync(dirname(dest), { recursive: true })
        copyFileSync(src, dest)
        return text(`Randomly selected ${basename(src)} from ${found.length} tracks -> ${out}`)
      }
      // Shuffle before truncating so every track can appear, even with --max 1.
      for (let i = found.length - 1; i > 0; i--) {
        const j = randomInt(i + 1)
        ;[found[i], found[j]] = [found[j], found[i]]
      }
      const lines = found
        .slice(0, max)
        .map(
          f =>
            `${f.p}  [${f.ms.toFixed(1)} MB]  ${f.mtime.toISOString().slice(0, 16).replace('T', ' ')}`,
        )
        .join('\n')
      return text(`Audio candidates under ${root}:\n${lines}`)
    },
  })

  commands.push({
    verb: 'verify-duration',
    description:
      'Measure the rendered MP4 duration with ffprobe. Compare the reported value with the authored timeline and any explicit exact delivery constraint, not an approximate runtime preference. This command measures length; it does not automatically compare or certify it.',
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

  commands.push({
    verb: 'schema',
    description:
      "The engine's shot schema in pieces: no arguments → the shot-type list and the sections; `types` → only those types' fields and DOM classes; `section` → named sections, one or several at once. Read common shot fields once with --section 'common shot fields'; it is not repeated with each type lookup. Request only capabilities used by the chosen treatment, and reuse sections already in context. Sections include format, footage, captions, audio effects, density layer, actors, narration spine, common shot fields, ui-frame, materials, render and grade, custom shot types, rules. Use this instead of reading engine files.",
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
      const out: string[] = []
      if (wanted.length) {
        for (const want of wanted) {
          const key = want
            .toLowerCase()
            .replace(/[^a-z ]/g, '')
            .trim()
          const hit =
            sections.get(key) ??
            [...sections.entries()].find(([k]) => k.includes(key) || key.includes(k))?.[1]
          out.push(hit ?? `No section "${want}". Sections: ${[...sections.keys()].join(', ')}`)
        }
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
        const uiFrameKey = [...sections.keys()].find(k => k.startsWith('uiframe'))
        const uiFrame =
          p.types.some((t: string) => /ui-frame/.test(t)) && uiFrameKey
            ? `\n\n${sections.get(uiFrameKey)}`
            : ''
        out.push(
          [
            'Shared fields: pitch motion schema --section "common shot fields" (read once).',
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

      if (out.length) return text(out.join('\n\n'))

      return text(
        `Shot types (pitch motion schema --types <type> for their fields):\n  ${[...types.keys()].join(', ')}\n\n` +
          `Sections (pitch motion schema --section <name>):\n  ${[...sections.keys()].filter(k => k !== 'intro').join(', ')}\n\n` +
          'Batch example: pitch motion schema --section "actors,density layer,custom shot types" --types line,logo-cta,ui-frame',
      )
    },
  })

  commands.push({
    verb: 'scaffold',
    description:
      'Write index.html — the thin shell that loads the GSAP vendor bundle, three.js and lottie-web, shots.js, the engine and ' +
      'every project shot type in js/shots/*.js and css/shots/*.css, in the one order that works — and, when there is none yet, ' +
      'a starter shots.js with the brand from recon (bg, ink, accent, the font and its self-hosted files) and a PLACEHOLDER ' +
      "opening shot built from the site's own h1, so the preview is never blank: replace it with your hook and keep adding " +
      'one shot at a time. Call this once instead of writing the page by hand. New type files after that need no ' +
      'scaffold call: pitch motion check links them. Pass --rive when a shot uses a .riv file, --p5 when a shot draws a p5.js canvas.',
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
      p5: Type.Optional(
        Type.Boolean({
          description: 'Load p5.js (1MB) for a generative canvas shot (default false).',
        }),
      ),
      format: Type.Optional(
        Type.Union(
          [Type.Literal('16:9'), Type.Literal('9:16'), Type.Literal('1:1'), Type.Literal('4:5')],
          {
            description:
              'The starter shots.js frame: 16:9 (default), 9:16 for Reels/TikTok/Shorts, 1:1, 4:5. Decide it before the first shot.',
          },
        ),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      const ws = workspaceOf(ctx)
      resolveIn(ws, 'index.html', 'write')
      const title = String(p.title ?? basename(ws))
      const files = writeShell(ws, { title, rive: Boolean(p.rive), p5: Boolean(p.p5) })
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
        writeFileSync(shotsPath, starterShots(tokens, p.format))
        starter = tokens
          ? "\nshots.js written with the brand recon measured and a placeholder opener from the site's h1 — it is playing now; replace it with your hook."
          : '\nshots.js written with a PLACEHOLDER brand (no recon/brand-tokens.json yet): run pitch motion recon, then put the measured values in brand.'
      }
      const linked = [...files.styles, ...files.scripts]
      return text(
        `index.html written (${GSAP_PLUGINS.length} GSAP plugins, three.js, lottie-web${p.rive ? ', rive' : ''}${p.p5 ? ', p5' : ''}${linked.length ? ` + ${linked.join(', ')}` : ''}).\n` +
          (vendor
            ? 'GSAP loads from the shared ../../assets/gsap/.'
            : '⚠ assets/gsap/gsap.min.js is missing — the page will not compile. Say so and stop.') +
          starter +
          '\nCustom shot types: one per file, js/shots/<type>.js (+ css/shots/<type>.css); pitch motion check links each new one.' +
          '\nNext: replace the placeholder opener and add ONE shot at a time — save and pitch motion check after each, so the user is watching a film that runs.',
      )
    },
  })
  return commands
}
