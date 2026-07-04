import { spawn } from 'node:child_process'

const port = process.argv[2] || '4098'

console.error('[bridge] starting opencode serve on port', port)
console.error('[bridge] PATH:', process.env.PATH ? 'set' : 'NOT SET')
console.error('[bridge] OPENCODE_CONFIG_CONTENT:', process.env.OPENCODE_CONFIG_CONTENT ? 'set' : 'NOT SET')

const proc = spawn('opencode', ['serve', '--hostname=127.0.0.1', `--port=${port}`], {
  env: {
    ...process.env,
    OPENCODE_CONFIG_CONTENT: process.env.OPENCODE_CONFIG_CONTENT || '{}',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

proc.stdout?.on('data', (chunk) => process.stdout.write(chunk))
proc.stderr?.on('data', (chunk) => process.stderr.write(chunk))
proc.on('exit', (code) => {
  console.error('[bridge] opencode exited with code', code)
  process.exit(code ?? 0)
})
proc.on('error', (err) => { console.error('[bridge] spawn error:', err.message); process.exit(1) })

process.on('SIGTERM', () => { proc.kill('SIGTERM') })
process.on('SIGINT', () => { proc.kill('SIGINT') })
