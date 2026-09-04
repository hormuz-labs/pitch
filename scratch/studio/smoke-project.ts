/**
 * Studio smoke test through the project service (no HTTP): grants a test
 * user credits + onboarding, creates a project for a flow, streams its
 * events, and prints the description when the first turn ends.
 *
 *   DATABASE_URL=… bun scratch/studio/smoke-project.ts <flow> "<prompt>" [optionsJson]
 */
import path from 'node:path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(import.meta.dirname, '../../.env') })
process.env.PREVIEW_COOKIE_SECRET ??= 'dev-preview-secret'

const db = await import('@saas/db')
await import('../../apps/studio/src/flows/launch-video/index.ts')
await import('../../apps/studio/src/flows/deck/index.ts')
await import('../../apps/studio/src/flows/demo-video/index.ts')
await import('../../apps/studio/src/flows/recording-edit/index.ts')
const { createProject, getProject } = await import('../../apps/studio/src/projects/service.ts')
const { onProjectEvent } = await import('../../apps/studio/src/studio/events.ts')

const userId = process.env.SMOKE_USER ?? 'user_smoke'
const flow = (process.argv[2] ?? 'launch-video') as any
const prompt = process.argv[3] ?? 'A 12-second, music-only teaser for https://example.com — six shots, no narration, keep it minimal.'
const options = JSON.parse(process.argv[4] ?? '{"narration":false,"resolution":"720p"}')

await db.prisma.userProfile.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: `${userId}@example.test` } })
await db.prisma.onboardingSurvey.upsert({ where: { userId }, update: {}, create: { userId, creationGoal: 'test', role: 'dev', teamSize: '1', monthlyVolume: '1', discoverySource: 'test' } })
if ((await db.getCreditBalance(userId)) < 20) await db.addCredits(userId, 50, 'promo', 'smoke test credits')

const started = Date.now()
console.log(`creating ${flow} project…`)
const project = await createProject(userId, { flow, prompt, options })
console.log('project', project.id, project.name, 'status', project.status)
const off = onProjectEvent(project.id, ev => {
  const t = ((Date.now() - started) / 1000).toFixed(1)
  if (ev.type === 'delta') return
  if (ev.type === 'entry') console.log(`[${t}s] ${ev.entry.role}: ${ev.entry.text.slice(0, 120)}`)
  else if (ev.type === 'update') console.log(`[${t}s] tool ${ev.entry.tool?.status}: ${ev.entry.text.slice(0, 100)}`)
  else if (ev.type === 'preview') console.log(`[${t}s] preview ok=${ev.ok} files=${JSON.stringify(ev.files)} ${ev.error ?? ''}`)
  else console.log(`[${t}s] ${ev.type} ${JSON.stringify({ ...ev, type: undefined, project: undefined }).slice(0, 160)}`)
  if (ev.type === 'idle') {
    setTimeout(async () => {
      const detail = await getProject(userId, project.id)
      console.log('detail:', JSON.stringify({ status: detail.status, outputs: detail.outputs, description: detail.description }, null, 1).slice(0, 1500))
      off()
      process.exit(0)
    }, 3000)
  }
})
