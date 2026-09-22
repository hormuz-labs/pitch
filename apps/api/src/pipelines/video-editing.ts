import { runVideoEditing } from '../render/video-editing/index.js'
import { registerHostAction } from '../studio/host-actions.js'

// Register on every role; heavy render/extraction work can run against a render-tier checkpoint.
// Schema validation, fast ffprobe inspections, and focus framing run locally.
const REMOTE_ACTIONS = new Set(['render', 'frames', 'analyze', 'preprocess'])

for (const action of [
  'capabilities',
  'probe',
  'frames',
  'focus',
  'analyze',
  'preprocess',
  'plan',
  'validate',
  'render',
  'verify',
]) {
  registerHostAction(
    `video_edit_${action}`,
    (ws, params, ctx) => runVideoEditing(ws.dir, action, params, ctx.signal),
    { remote: REMOTE_ACTIONS.has(action) },
  )
}
