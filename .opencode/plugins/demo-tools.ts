import type { Plugin } from '@opencode-ai/plugin'
import { tool } from '@opencode-ai/plugin'
import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Simple mutex to serialize state reads/writes across concurrent tool calls.
let stateLock = Promise.resolve()
async function withStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = await new Promise<() => void>(resolve => {
    const prev = stateLock
    stateLock = prev.then(() => new Promise<void>(done => resolve(done)))
    prev.then(() => {})
  })
  try {
    return await fn()
  } finally {
    release()
  }
}

interface AudioClip {
  filePath: string
  absoluteTimestamp: number
}

interface ZoomEvent {
  type: 'in' | 'out'
  videoTimeSec: number
  x?: number
  y?: number
  zoom?: number
}

interface ClickEvent {
  videoTimeSec: number
  x: number
  y: number
}

interface TabEvent {
  tabId: number
  wallSec: number
}

interface SkillMetadata {
  name: string
  description: string
  path: string
}

interface DemoState {
  startTime: number
  endTime?: number
  audioClips: AudioClip[]
  zoomEvents: ZoomEvent[]
  clickEvents: ClickEvent[]
  tabEvents: TabEvent[]
  tabCreationTimes: Record<number, number>
  currentTabId: number
  lastTargetCoords: { ref: string; x: number; y: number } | null
}

interface DemoConfig {
  startTime: number
  skills: SkillMetadata[]
}

const GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview'

function parseMimeType(mimeType: string): {
  numChannels: number
  sampleRate: number
  bitsPerSample: number
} {
  const [_, ...params] = mimeType.split(';').map(s => s.trim())
  const options = { numChannels: 1, sampleRate: 24000, bitsPerSample: 16 }
  for (const param of params) {
    const [key, value] = param.split('=').map(s => s.trim())
    if (key === 'rate' && value) options.sampleRate = parseInt(value, 10)
  }
  return options
}

function createWavHeader(
  dataLength: number,
  options: { numChannels: number; sampleRate: number; bitsPerSample: number },
) {
  const { numChannels, sampleRate, bitsPerSample } = options
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const buffer = Buffer.alloc(44)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataLength, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataLength, 40)
  return buffer
}

function configPath(directory: string) {
  return path.join(directory, 'recordings', 'demo-config.json')
}

function statePath(directory: string) {
  return path.join(directory, 'recordings', 'demo-state.json')
}

function readConfig(directory: string): DemoConfig {
  const p = configPath(directory)
  if (!fs.existsSync(p)) {
    throw new Error(`Demo config not found at ${p}. Make sure index.ts wrote it before prompting.`)
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

function readState(directory: string): DemoState {
  const p = statePath(directory)
  if (!fs.existsSync(p)) {
    const cfg = readConfig(directory)
    return {
      startTime: cfg.startTime,
      audioClips: [],
      zoomEvents: [],
      clickEvents: [],
      tabEvents: [{ tabId: 0, wallSec: 0 }],
      tabCreationTimes: { 0: 0 },
      currentTabId: 0,
      lastTargetCoords: null,
    }
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

function writeState(directory: string, state: DemoState) {
  const p = statePath(directory)
  fs.writeFileSync(p, JSON.stringify(state, null, 2))
}

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return match ? content.slice(match[0].length).trim() : content.trim()
}

async function speak(directory: string, text: string, state: DemoState) {
  if (!text) return
  console.log(`[Narrator]: ${text}`)
  const audioDir = path.join(directory, 'recordings', 'audio')
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true })
  const clipId = state.audioClips.length
  const audioFilePath = path.join(audioDir, `clip_${clipId}.wav`)
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) throw new Error('No Gemini API key found')
    const ttsUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`
    const ttsRes = await fetch(ttsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GEMINI_TTS_MODEL,
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: {
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
        },
      }),
    })
    if (!ttsRes.ok) throw new Error(`TTS API failed: ${ttsRes.status} ${await ttsRes.text()}`)
    const ttsData = await ttsRes.json()
    const inlineData =
      ttsData.candidates?.[0]?.content?.parts?.[0]?.inlineData || ttsData.inlineData
    if (!inlineData?.data) throw new Error('TTS response missing inlineData')
    const rawPcmBuffer = Buffer.from(inlineData.data, 'base64')
    const responseMimeType = inlineData.mimeType || 'audio/pcm;rate=24000'
    const options = parseMimeType(responseMimeType)
    const finalAudioBuffer = Buffer.concat([
      createWavHeader(rawPcmBuffer.length, options),
      rawPcmBuffer,
    ])
    const byteRate = options.sampleRate * options.numChannels * (options.bitsPerSample / 8)
    const durationSecs = rawPcmBuffer.length / byteRate
    fs.writeFileSync(audioFilePath, finalAudioBuffer)
    const playStartTime = Date.now()
    state.audioClips.push({ filePath: audioFilePath, absoluteTimestamp: playStartTime })
    if (durationSecs > 0) await new Promise(resolve => setTimeout(resolve, durationSecs * 1000))
  } catch (e) {
    console.error(`Error speaking: ${e}`)
  }
}

const plugin: Plugin = async input => {
  const { directory } = input

  // All playwright-cli commands must run from the session directory so that
  // files like demo.webm, snapshots, and traces are written where the worker
  // expects them (targetDir), not from the OpenCode server's process cwd.
  const run = (command: string) => execAsync(command, { cwd: directory })

  const disabledTools = new Set([
    'bash',
    'read',
    'glob',
    'grep',
    'edit',
    'write',
    'webfetch',
    'websearch',
    'todowrite',
    'skill',
    'apply_patch',
    'task',
  ])

  return {
    tool: {
      demo_bash: tool({
        description: 'Execute a bash command (e.g. playwright-cli commands).',
        args: {
          command: tool.schema.string().describe('The bash command to execute'),
        },
        async execute(args) {
          return withStateLock(async () => {
            const cmd = args.command
            console.log(`[bash]: ${cmd}`)

            const state = readState(directory)
            const nowSec = (Date.now() - state.startTime) / 1000

            // Tab tracking must happen BEFORE exec
            if (cmd.startsWith('playwright-cli tab-new')) {
              const newTabId = Math.max(0, ...Object.keys(state.tabCreationTimes).map(Number)) + 1
              state.tabCreationTimes[newTabId] = nowSec
              state.tabEvents.push({ tabId: newTabId, wallSec: nowSec })
              state.currentTabId = newTabId
            } else if (cmd.startsWith('playwright-cli tab-select')) {
              const match = cmd.match(/tab-select (\d+)/)
              if (match) {
                const selectId = parseInt(match[1]!, 10)
                state.tabEvents.push({ tabId: selectId, wallSec: nowSec })
                state.currentTabId = selectId
              }
            }

            // Stamp click events/sounds when the click is dispatched, not after the
            // command returns. This keeps audio+cursor aligned with the visual click
            // even when the action triggers a slow page transition.
            let clickTimestamp: number | null = null
            let clickCoords: { x: number; y: number } | null = null
            if (cmd.includes('click ') || cmd.includes('dblclick ')) {
              const parts = cmd.split(' ')
              const ref = parts.find(p => p.startsWith('e') && /^\d+$/.test(p.slice(1)))
              if (ref) {
                if (state.lastTargetCoords && state.lastTargetCoords.ref === ref) {
                  clickCoords = { x: state.lastTargetCoords.x, y: state.lastTargetCoords.y }
                } else {
                  // No matching zoom_in target — look up the ref's bounding box from a
                  // snapshot so every ref-based click still gets a cursor overlay.
                  try {
                    const { stdout } = await run(`playwright-cli snapshot "${ref}" --boxes --json`)
                    const parsed = JSON.parse(stdout)
                    const text = parsed.snapshot || stdout
                    const regex = new RegExp(
                      `\\[ref=${ref}\\].*?\\[box=([\\d.]+),([\\d.]+),([\\d.]+),([\\d.]+)\\]`,
                    )
                    const m = text.match(regex)
                    if (m) {
                      clickCoords = {
                        x: parseFloat(m[1]!) + parseFloat(m[3]!) / 2,
                        y: parseFloat(m[2]!) + parseFloat(m[4]!) / 2,
                      }
                      state.lastTargetCoords = { ref, ...clickCoords }
                    }
                  } catch (_e) {
                    // ignore lookup failure
                  }
                }
                if (clickCoords) {
                  clickTimestamp = Date.now()
                  const videoTimeSec = (clickTimestamp - state.startTime) / 1000
                  state.clickEvents.push({ videoTimeSec, x: clickCoords.x, y: clickCoords.y })
                  state.audioClips.push({
                    filePath: path.join(directory, 'assets', 'sounds', 'click.mp3'),
                    absoluteTimestamp: clickTimestamp,
                  })
                }
              }
            }

            // If the agent closes the browser themselves, save the video first.
            if (cmd.trim().startsWith('playwright-cli close')) {
              try {
                await run('playwright-cli video-stop')
                state.endTime = Date.now()
              } catch (_e) {}
            }

            const result = await run(cmd)

            writeState(directory, state)
            return { output: JSON.stringify(result) }
          })
        },
      }),

      narrate: tool({
        description:
          'Speak a natural, conversational voiceover to the user. Use this tool to guide the user through the demo.',
        args: {
          text: tool.schema.string().describe('The text to be spoken'),
        },
        async execute(args) {
          return withStateLock(async () => {
            const state = readState(directory)
            await speak(directory, args.text, state)
            writeState(directory, state)
            return { output: `spoken: ${args.text}` }
          })
        },
      }),

      zoom_in: tool({
        description:
          'Zoom the camera to focus on a specific element. ' +
          "Pass the element's ref exactly as it appears (e.g. 'e53'). " +
          'Always pair with a zoom_out call once the result of the action is visible.',
        args: {
          target: tool.schema
            .string()
            .describe("Element ref from snapshot (e.g. 'e53'). Do NOT include [ref=...]."),
          zoom: tool.schema.number().min(1.2).max(4).optional().describe('Zoom level (1.2-4).'),
        },
        async execute(args) {
          return withStateLock(async () => {
            const target = args.target
            const zoom = args.zoom || 2
            const state = readState(directory)
            let cx = 960,
              cy = 540
            try {
              const { stdout } = await run(`playwright-cli snapshot "${target}" --boxes --json`)
              const parsed = JSON.parse(stdout)
              const text = parsed.snapshot || stdout
              const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              const regex = new RegExp(
                `\\[ref=${escapedTarget}\\].*?\\[box=([\\d.]+),([\\d.]+),([\\d.]+),([\\d.]+)\\]`,
              )
              const m = text.match(regex)
              if (m) {
                cx = parseFloat(m[1]!) + parseFloat(m[3]!) / 2
                cy = parseFloat(m[2]!) + parseFloat(m[4]!) / 2
                console.log(
                  `zoom_in target=${target} -> bbox cx=${cx.toFixed(0)} cy=${cy.toFixed(0)}`,
                )
                state.lastTargetCoords = { ref: target, x: cx, y: cy }
              } else {
                console.warn(`zoom_in target=${target} - no bounding box found`)
              }
            } catch (_e) {
              console.warn(`zoom_in target=${target} - snapshot failed`)
            }
            const videoTimeSec = (Date.now() - state.startTime) / 1000
            state.zoomEvents.push({ type: 'in', videoTimeSec, x: cx, y: cy, zoom })
            await new Promise(r => setTimeout(r, 250))
            writeState(directory, state)
            return {
              output: JSON.stringify({ status: 'zoomed_in', videoTimeSec, x: cx, y: cy, zoom }),
            }
          })
        },
      }),

      zoom_out: tool({
        description: 'Zoom the camera back out to the full view.',
        args: {},
        async execute() {
          return withStateLock(async () => {
            const state = readState(directory)
            const videoTimeSec = (Date.now() - state.startTime) / 1000
            state.zoomEvents.push({ type: 'out', videoTimeSec })
            writeState(directory, state)
            return { output: JSON.stringify({ status: 'zoomed_out', videoTimeSec }) }
          })
        },
      }),

      load_skill: tool({
        description: 'Load a skill to get specialized instructions',
        args: {
          name: tool.schema.string().describe('The name of the skill to load'),
        },
        async execute(args) {
          const _state = readState(directory)
          const { skills } = readConfig(directory)
          const skill = skills.find(s => s.name.toLowerCase() === args.name.toLowerCase())
          if (!skill) return { output: `Skill '${args.name}' not found` }
          const content = await fs.promises.readFile(`${skill.path}/SKILL.md`, 'utf-8')
          return {
            output: JSON.stringify({
              skillDirectory: skill.path,
              content: stripFrontmatter(content),
            }),
          }
        },
      }),

      read_file: tool({
        description: 'Read a file from the filesystem',
        args: {
          path: tool.schema.string().describe('The path to the file'),
        },
        async execute(args) {
          const content = await fs.promises.readFile(args.path, 'utf-8')
          return { output: content }
        },
      }),
    },

    async 'permission.ask'(input: any, output: any) {
      const toolName = input.tool as string | undefined
      if (toolName && disabledTools.has(toolName)) {
        output.status = 'deny'
        console.log(`[permission.ask] Denied built-in tool: ${toolName}`)
      }
    },
  }
}

export default plugin
