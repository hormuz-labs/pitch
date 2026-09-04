/**
 * Studio smoke test: drive one launch-video session end to end without the
 * HTTP layer — proves pi boots, the Gondolin sandbox mounts the workspace,
 * host tools run, the watcher sees saves, and the flow follows the job.
 *
 *   DATABASE_URL=… REDIS_URL=… bun scratch/studio/smoke.ts [name] [prompt]
 */
import path from 'node:path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(import.meta.dirname, '../../.env') })

const { registerLaunchVideoFlow, promptLaunchVideo } = await import('../../apps/api/src/lib/launch-video/flow.ts')
const { subscribe } = await import('../../apps/api/src/lib/studio/session.ts')
const { launchWorkspace } = await import('../../apps/api/src/lib/launch-video/paths.ts')
const { getProject } = await import('../../apps/api/src/lib/launch-video/projects.ts')

const userId = process.env.SMOKE_USER ?? 'user_smoke'
const name = process.argv[2] ?? 'smoke'
const text =
  process.argv[3] ??
  'A 12-second, music-only teaser for https://example.com — six shots, no narration, keep it minimal.'

await registerLaunchVideoFlow()
const ws = launchWorkspace(userId, name)
const started = Date.now()
const { unsubscribe } = await subscribe(ws, ev => {
  const t = ((Date.now() - started) / 1000).toFixed(1)
  if (ev.type === 'delta') return
  if (ev.type === 'entry') console.log(`[${t}s] ${ev.entry.role}: ${ev.entry.text.slice(0, 120)}`)
  else if (ev.type === 'update') console.log(`[${t}s] tool ${ev.entry.tool?.status}: ${ev.entry.text.slice(0, 100)}`)
  else console.log(`[${t}s] ${ev.type} ${JSON.stringify({ ...ev, type: undefined }).slice(0, 160)}`)
  if (ev.type === 'idle' || ev.type === 'error') {
    setTimeout(async () => {
      console.log('project:', JSON.stringify(await getProject(userId, name), null, 1)?.slice(0, 800))
      unsubscribe()
      process.exit(0)
    }, 2000)
  }
})
await promptLaunchVideo(userId, name, text, { narration: false, resolution: '720p' }, null)
console.log('prompt sent; waiting for the turn to finish…')
