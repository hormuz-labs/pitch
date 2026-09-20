import type { Output, ProjectDetail } from './types'

/**
 * Files the export menu may download directly. A deck's workspace PDF is the
 * current render; previously published rows can lag behind later live edits.
 * HTML is a source/preview artifact, not a user-facing export.
 */
export function downloadableOutputs(project: ProjectDetail | null | undefined): Output[] {
  if (!project) return []
  if (project.description.preview?.kind === 'deck') {
    return project.description.outputs.filter(output => output.kind === 'pdf')
  }
  const eligible = [...project.outputs, ...project.description.outputs].filter(
    (output, index, all) =>
      (output.kind === 'video' || output.kind === 'pdf') &&
      all.findIndex(candidate => candidate.url === output.url) === index,
  )
  const newestVideo = eligible
    .filter(output => output.kind === 'video')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
  return [
    ...(newestVideo ? [newestVideo] : []),
    ...eligible.filter(output => output.kind === 'pdf'),
  ]
}
