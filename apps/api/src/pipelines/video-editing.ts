import { runVideoEditing } from '../render/video-editing/index.js'
import { registerHostAction } from '../studio/host-actions.js'

// Register on every role; heavy work can run against a render-tier checkpoint.
for (const action of [
  'capabilities',
  'probe',
  'frames',
  'focus',
  'analyze',
  'validate',
  'render',
  'verify',
]) {
  registerHostAction(
    `video_edit_${action}`,
    (ws, params, ctx) => runVideoEditing(ws.dir, action, params, ctx.signal),
    { remote: action !== 'capabilities' },
  )
}
