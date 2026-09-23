import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export interface AgentCommandOptions {
  cwd: string
  timeoutMs?: number
}

const DEFAULT_AGENT_COMMAND_TIMEOUT_MS = 45_000

export async function runAgentCommand(command: string, options: AgentCommandOptions) {
  try {
    return await execAsync(command, {
      cwd: options.cwd,
      timeout: options.timeoutMs ?? DEFAULT_AGENT_COMMAND_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    })
  } catch (error) {
    // playwright-cli writes actionable failures to stdout even on a nonzero
    // exit. exec's default message contains stderr only, hiding the actual cause.
    const failure = error as Error & { stdout?: string }
    if (failure instanceof Error && typeof failure.stdout === 'string' && failure.stdout.trim())
      failure.message += `\n${failure.stdout.trim().slice(0, 8000)}`
    throw error
  }
}
