import type { LogEntry } from '../types'

// Maps raw backend stage strings to human-readable UI labels.
// The backend emits these exact substrings inside progress text events.
const STAGE_LABELS: [string, string][] = [
  ['Generating Voiceover', '🎙️ Generating AI Voiceover...'],
  ['Transcribing', '📝 Transcribing audio...'],
  ['Rendering Frames', '🎞️ Rendering video frames...'],
  ['Encoding Final Video', '🎬 Encoding final video...'],
  ['Navigating', '🌐 Navigating to target site...'],
]

function labelStageMessage(raw: string): string {
  for (const [needle, label] of STAGE_LABELS) {
    if (raw.includes(needle)) return label
  }
  return raw
}

/**
 * Converts a raw opencode SSE event object into a LogEntry for the job log UI.
 * The backend sends three event shapes: tool calls, tool responses, and free text.
 * Returns null for unrecognised shapes so the caller can safely ignore them.
 */
export function parseSSELog(opencodeEvent: any): LogEntry | null {
  if (opencodeEvent.type === 'call' || opencodeEvent.call) {
    const toolCall = opencodeEvent.call || opencodeEvent
    let message = `Calling tool: ${toolCall.name}`
    if (toolCall.name === 'run_shell_command') message = `Running: ${toolCall.arguments?.command}`
    else if (toolCall.name === 'write_file')
      message = `Writing file: ${toolCall.arguments?.file_path}`

    const entry: LogEntry = { timestamp: new Date().toLocaleTimeString(), message, type: 'call' }

    // Screenshots are written to the demo/ directory by the agent; extract path from args
    const argsString = JSON.stringify(toolCall.arguments ?? {})
    const pngMatch = argsString.match(/demo\/[^"\s]+\.png/)
    if (pngMatch) entry.screenshot = `/${pngMatch[0]}`

    return entry
  }

  if (opencodeEvent.type === 'response' || opencodeEvent.output) {
    const response = opencodeEvent.response || opencodeEvent
    let message = 'Task step completed'
    if (Array.isArray(response.content)) {
      const textPart = response.content.find((p: any) => p.type === 'text')
      if (textPart?.text) {
        const lines = textPart.text.trim().split('\n')
        message = lines[lines.length - 1]
      }
    }
    return { timestamp: new Date().toLocaleTimeString(), message, type: 'response' }
  }

  if (opencodeEvent.type === 'text' || typeof opencodeEvent.text === 'string') {
    const raw =
      typeof opencodeEvent === 'string'
        ? opencodeEvent
        : (opencodeEvent.text ?? JSON.stringify(opencodeEvent))
    const message = labelStageMessage(raw)
    return { timestamp: new Date().toLocaleTimeString(), message, type: 'text' }
  }

  return null
}
