import type { FlowId } from '../lib/studio-api'
import { AnimatedIcon } from './AnimatedIcon'

/** Small flow glyphs for the "New" group, flow badges and the flow picker. */
export const FlowGlyph = ({
  flow,
  active = false,
  size = 13,
}: {
  flow: FlowId
  active?: boolean
  size?: number
}) => {
  switch (flow) {
    case 'studio':
    case 'launch-video':
      return (
        <AnimatedIcon active={active} size={size}>
          <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
          <path d="m6.2 5.3 3.1 3.9" />
          <path d="m12.4 3.4 3.1 4" />
          <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </AnimatedIcon>
      )
    case 'demo-video':
      return (
        <AnimatedIcon active={active} size={size}>
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </AnimatedIcon>
      )
    case 'deck':
      return (
        <AnimatedIcon active={active} size={size}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </AnimatedIcon>
      )
    case 'recording-edit':
      return (
        <AnimatedIcon active={active} size={size}>
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <line x1="20" y1="4" x2="8.12" y2="15.88" />
          <line x1="14.47" y1="14.48" x2="20" y2="20" />
          <line x1="8.12" y1="8.12" x2="12" y2="12" />
        </AnimatedIcon>
      )
  }
}
