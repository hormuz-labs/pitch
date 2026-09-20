export type FlowId = 'studio' | 'launch-video' | 'demo-video' | 'deck' | 'recording-edit'
export interface Output {
  kind: 'video' | 'pdf' | 'html' | 'thumbnail'
  url: string
  res?: string
  label?: string
  createdAt: string
}
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
export type Preview =
  | { kind: 'html' | 'deck' | 'video'; url: string }
  | { kind: 'pdf'; url: string; path: string; pages: number }
  | { kind: 'browser'; streamId: string }
  | null
export interface Description {
  preview: Preview
  audioUrl?: string | null
  scenes?: Scene[]
  slides?: Slide[]
  duration?: number
  outputs: Output[]
  error?: string | null
  extra?: Record<string, unknown>
}
export interface ProjectSummary {
  id: string
  userId: string
  flow: FlowId
  name: string
  title: string
  prompt: string
  options: Record<string, unknown>
  creditsCharged: number
  outputs: Output[]
  thumbnailUrl: string | null
  lastError: string | null
  isPublic: boolean
  shareSlug: string | null
  pinnedAt: string | null
  lastActivityAt: string
  createdAt: string
  updatedAt: string
  status: 'empty' | 'working' | 'ready' | 'failed'
  busy: boolean
}
export interface ProjectDetail extends ProjectSummary {
  description: Description
}
export interface StudioModel {
  spec: string
  label: string
  creditMultiplier: number
  estimatedCredits: number
  harnessCredits: number
  videoCreditsPer30Seconds?: number
}
export interface MusicTrack {
  name: string
  file: string
  url: string
  duration: number | null
}
export interface AskQuestion {
  id: string
  bind?: 'videoType' | 'durationSeconds'
  question: string
  options: { id: string; label: string; hint?: string }[]
  multi?: boolean
}
export interface Ask {
  intro?: string
  questions: AskQuestion[]
}
export interface AskAnswer {
  askEntryId: string
  selections: Array<{ questionId: string; optionIds: string[]; customText?: string }>
}
export interface Entry {
  id: string
  role: 'user' | 'assistant' | 'thinking' | 'tool' | 'question' | 'credit'
  text: string
  tool?: { name: string; status: 'running' | 'done' | 'error' }
  ask?: Ask
  at?: number
  sessionEntryId?: string
  checkpointId?: string
  pending?: 'queued' | 'steering' | 'cancelled'
}
export interface ExportStatus {
  format?: string
  filename?: string
  running: boolean
  res: string | null
  url: string | null
  progress: number
  stage: string
  error: string | null
  startedAt: number | null
  finishedAt: number | null
}
export interface UploadRef {
  url: string
  name: string
  type: string
  size: number
}
export interface Asset {
  path: string
  name: string
  kind: 'image' | 'video' | 'audio' | 'pdf' | 'other'
  origin: 'upload' | 'generated' | 'harvested'
  size: number
  mtime: string
  url: string
  thumbUrl: string | null
  pages?: number
}
export type StudioEvent =
  | { type: 'hello' | 'status'; busy: boolean; activeModel?: string | null }
  | { type: 'entry'; entry: Entry }
  | { type: 'delta'; id: string; delta: string }
  | { type: 'update'; entry: Entry }
  | { type: 'tool'; name: string; args: Record<string, unknown> }
  | { type: 'idle'; aborted?: boolean; failed?: boolean; busy?: boolean }
  | { type: 'reset'; entries: Entry[] }
  | { type: 'assets'; files: string[] }
  | { type: 'error'; message: string }
  | { type: 'credit_exhausted'; message: string }
  | { type: 'credit_balance'; balance: number; pending?: boolean }
  | ({ type: 'preview'; ok: boolean; files: string[] } & Partial<Description>)
  | { type: 'project'; project: ProjectSummary }
  | { type: 'deleted' }
export interface SelectedElement {
  sceneId: string | null
  slide?: number | null
  shotType?: string | null
  tagName: string
  className: string
  id: string
  text: string
  selector: string
  html?: string
  mark?: number
  time?: number
  endTime?: number
  asset?: string
  assetOrigin?: string
  page?: number
}
export interface Target extends SelectedElement {
  ref: number
}
export interface PlayerCtrl {
  seek(seconds: number): void
  pause?(): void
}
