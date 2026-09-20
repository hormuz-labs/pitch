/**
 * The shapes the studio and its clients agree on: what a workspace contains
 * (Description), and what a turn carries with it (TurnInput).
 *
 * The `Flow` interface that used to live here is gone — there is one agent
 * now (see ../agent/), and what a project is making is decided per turn
 * rather than fixed when it was created.
 */

export interface Scene {
  id: string
  index: number
  start: number
  end: number
  dur: number
  label?: string | null
  type?: string | null
}

export interface Slide {
  index: number
  title?: string | null
}

export interface Output {
  kind: 'video' | 'pdf' | 'html' | 'thumbnail'
  url: string
  res?: string
  label?: string
  createdAt: string
}

export type Preview =
  | { kind: 'html'; url: string }
  | { kind: 'deck'; url: string }
  | { kind: 'video'; url: string }
  | { kind: 'pdf'; url: string; path: string; pages: number }
  | { kind: 'browser'; streamId: string }
  | null

export interface Description {
  preview: Preview
  audioUrl?: string | null
  scenes?: Scene[]
  slides?: Slide[]
  duration?: number
  /** Outputs found in the workspace (local URLs); the project row holds the published ones. */
  outputs: Output[]
  /** Why the preview cannot load right now (e.g. shots.js does not evaluate). */
  error?: string | null
  /** Flow-specific extras the UI may show (e.g. storyboard, recording state). */
  extra?: Record<string, unknown>
}

export interface TurnInput {
  /** The project's first conversational turn, which may not be its first actionable request. */
  first: boolean
  options: Record<string, any>
  targets?: Array<Record<string, any>>
  scene?: string | null
  slide?: number | null
}

export interface UploadRef {
  url: string
  name: string
  type: string
  size: number
}
