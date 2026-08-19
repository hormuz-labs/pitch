import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export interface AgentCommandOptions {
  cwd: string
  timeoutMs?: number
}

const DEFAULT_AGENT_COMMAND_TIMEOUT_MS = 45_000

export function runAgentCommand(command: string, options: AgentCommandOptions) {
  return execAsync(command, {
    cwd: options.cwd,
    timeout: options.timeoutMs ?? DEFAULT_AGENT_COMMAND_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  })
}
