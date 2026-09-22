import path from 'node:path'
import type { Description, Output } from '../flows/types.js'
import type { Workspace } from '../studio/paths.js'
import type { ProjectRow } from './rows.js'

export const isPublicOutput = (output: Output): boolean => /^https?:\/\//i.test(output.url)

function localFile(ws: Workspace, output: Output): string | null {
  const prefix = `/files/projects/${encodeURIComponent(ws.internal)}/`
  if (!output.url.startsWith(prefix)) return null
  let rel: string
  try {
    rel = output.url
      .slice(prefix.length)
      .split('/')
      .map(segment => decodeURIComponent(segment))
      .join('/')
  } catch {
    return null
  }
  const root = path.resolve(ws.dir)
  const absolute = path.resolve(root, rel)
  return absolute.startsWith(`${root}${path.sep}`) ? absolute : null
}

const outputTime = (output: Output): number => Date.parse(output.createdAt) || 0

/** Upload the current local artifact so an unauthenticated share page can read it. */
export async function publishShareArtifact(
  project: ProjectRow,
  ws: Workspace,
  description: Description,
  upload: (file: string, prefix: string) => Promise<string>,
  record: (output: Output) => Promise<void>,
): Promise<Output> {
  const desiredKind =
    description.preview?.kind === 'deck' || description.preview?.kind === 'pdf'
      ? 'pdf'
      : description.preview
        ? 'video'
        : null
  const candidates = description.outputs
    .filter(output =>
      desiredKind ? output.kind === desiredKind : output.kind === 'video' || output.kind === 'pdf',
    )
    .sort((a, b) => outputTime(b) - outputTime(a))
  const local = candidates.find(output => localFile(ws, output))
  const published = project.outputs
    .filter(
      output =>
        isPublicOutput(output) &&
        (desiredKind
          ? output.kind === desiredKind
          : output.kind === 'video' || output.kind === 'pdf'),
    )
    .sort((a, b) => outputTime(b) - outputTime(a))[0]

  if (!local) {
    if (published) return published
    throw Object.assign(new Error('Render the project before sharing'), { status: 409 })
  }

  const matching = project.outputs.find(
    output =>
      isPublicOutput(output) &&
      output.kind === local.kind &&
      output.res === local.res &&
      outputTime(output) >= outputTime(local),
  )
  if (matching) return matching

  const file = localFile(ws, local)!
  const folder = local.kind === 'pdf' ? 'deck' : 'videos'
  const url = await upload(file, `pitch/${ws.userId}/${ws.name}/${folder}`)
  const output = { ...local, url, createdAt: new Date().toISOString() }
  await record(output)
  return output
}
