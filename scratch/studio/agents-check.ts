import path from 'node:path'
import { DefaultResourceLoader } from '@earendil-works/pi-coding-agent'
import { loadAgentSpec } from '../../apps/worker/src/pi.ts'
const root = path.resolve(import.meta.dirname, '../..')
for (const agent of ['demo-generator', 'recording-editor', 'pdf-generator', 'ppt-enhancer'] as const) {
  const spec = loadAgentSpec(root, agent)
  const allowedExt = new Set(spec.extensions.map(p => path.resolve(p)))
  const allowedSkills = new Set(spec.skills.map(p => path.resolve(p)))
  const rl = new DefaultResourceLoader({
    cwd: root, agentDir: path.join(process.env.HOME!, '.pi/agent'),
    additionalExtensionPaths: spec.extensions, additionalSkillPaths: spec.skills,
    noContextFiles: true, noPromptTemplates: true, noThemes: true,
    extensionsOverride: (base: any) => ({ ...base, extensions: base.extensions.filter((e: any) => allowedExt.has(path.resolve(e.resolvedPath ?? e.path))) }),
    skillsOverride: (base: any) => ({ ...base, skills: base.skills.filter((s: any) => { const f = path.resolve(s.filePath ?? s.path ?? ''); return [...allowedSkills].some(d => f === d || f.startsWith(d + path.sep)) }) }),
    appendSystemPromptOverride: () => [spec.prompt],
  })
  await rl.reload()
  const ext: any = rl.getExtensions()
  const tools = ext.extensions.flatMap((e: any) => [...e.tools.keys()])
  const skills = (rl.getSkills() as any).skills.map((s: any) => s.name)
  console.log(agent, '| builtins:', spec.tools.join(',') || '(none)', '| ext tools:', tools.join(','), '| skills:', skills.join(','), '| errors:', JSON.stringify(ext.errors), '| prompt chars:', spec.prompt.length, '| append:', (rl.getAppendSystemPrompt?.() ?? []).length)
}
