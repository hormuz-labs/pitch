import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { splitWords } from './browser-command.ts'

const execFileAsync = promisify(execFile)

export interface AgentCommandOptions {
  cwd: string
  timeoutMs?: number
}

const DEFAULT_AGENT_COMMAND_TIMEOUT_MS = 45_000

/**
 * Run one playwright-cli command line. The line is split into words (quotes
 * group, nothing expands) and handed to the program directly — there is no
 * shell, so `$(…)` in a ref or a typed value stays text.
 */
export async function runAgentCommand(command: string, options: AgentCommandOptions) {
  const [program, ...args] = splitWords(command)
  if (program !== 'playwright-cli') throw new Error(`Not a browser command: ${command}`)
  try {
    return await execFileAsync(program, args, {
      cwd: options.cwd,
      timeout: options.timeoutMs ?? DEFAULT_AGENT_COMMAND_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      maxBuffer: 16 * 1024 * 1024,
      encoding: 'utf8',
    })
  } catch (error) {
    // playwright-cli writes actionable failures to stdout even on a nonzero
    // exit. The default message contains stderr only, hiding the actual cause.
    const failure = error as Error & { stdout?: string }
    if (failure instanceof Error && typeof failure.stdout === 'string' && failure.stdout.trim())
      failure.message += `\n${failure.stdout.trim().slice(0, 8000)}`
    throw error
  }
}
