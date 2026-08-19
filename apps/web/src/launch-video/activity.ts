export function describeLaunchVideoToolActivity(part: any): string {
  const name = String(part?.tool ?? part?.name ?? '')
  const command = String(part?.state?.input?.command ?? '')
  let label: string
  if (command.includes('capture.mjs')) {
    label = command.includes('--from=')
      ? 'Rendering the scene preview…'
      : 'Rendering the full video…'
  } else if (command.includes('ffmpeg')) label = 'Encoding the updated video…'
  else if (command.includes('get-font')) label = 'Checking the original website font…'
  else if (name === 'edit' || name === 'write' || name === 'patch') {
    label = 'Updating scene files…'
  } else if (name === 'read' || name === 'glob' || name === 'grep') {
    label = 'Inspecting the scene…'
  } else if (name === 'bash') label = 'Verifying the scene update…'
  else label = `Running ${name || 'the next step'}…`

  return part?.state?.status === 'completed' ? `✓ ${label.replace(/…$/, '')}` : label
}

export function launchVideoActivityStage(activity: string | null): {
  label: string
  progress: number
} {
  const text = activity?.toLowerCase() ?? ''
  if (text.includes('encoding')) return { label: 'Finalizing', progress: 94 }
  if (text.includes('full video')) return { label: 'Full render', progress: 80 }
  if (text.includes('scene preview')) return { label: 'Scene preview', progress: 58 }
  if (text.includes('updating scene')) return { label: 'Applying changes', progress: 38 }
  if (text.includes('checking') || text.includes('inspecting')) {
    return { label: 'Inspecting', progress: 24 }
  }
  if (text.includes('verifying')) return { label: 'Verifying', progress: 48 }
  return { label: 'Planning', progress: 12 }
}
