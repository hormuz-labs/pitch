export interface PhaseUpdate {
  phase: string
  label: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt?: string
  completedAt?: string
  durationMs?: number
  retryDurationMs?: number
  retryCount?: number
  failedAttempts?: {
    startedAt?: string
    endedAt?: string
    durationMs: number
    status: 'completed' | 'failed'
  }[]
}

export interface StoryboardRect {
  leftPct: number
  topPct: number
  widthPct: number
  heightPct: number
}

export interface StoryboardEmphasis {
  phrase: string
  rect: StoryboardRect
  coordinateSpace: 'page' | 'viewport'
  style:
    | 'box'
    | 'circle'
    | 'underline'
    | 'highlighter'
    | 'arrow'
    | 'spotlight'
    | 'pulse'
    | 'bracket'
  zoom: number
}

export interface StoryboardScene {
  id: string
  pageIndex: number
  previewUrl: string
  enabled: boolean
  title: string
  screenText: string[]
  narration: string
  emphasis: StoryboardEmphasis[]
  estimatedDurationSec: number
}

export interface VideoStoryboard {
  revision: number
  approvedRevision?: number
  status: 'draft' | 'approved'
  transition: 'fade' | 'slide' | 'zoom'
  scenes: StoryboardScene[]
}

export interface Project {
  id: string
  userId: string
  status: 'PENDING' | 'PROCESSING' | 'AWAITING_REVIEW' | 'COMPLETED' | 'FAILED'
  videoUrl?: string
  pdfUrl?: string
  audioUrl?: string
  thumbnailUrl?: string
  parameters: Record<string, any> & {
    jobType?: 'video' | 'pdf' | 'enhance' | 'edit-recording'
    htmlUrl?: string
    topic?: string
    slideCount?: number
    slideHeadings?: string[]
    pdfGenerating?: boolean // true while a fresh server PDF is being regenerated after a save
    workflowStage?: 'PLANNING' | 'AWAITING_REVIEW' | 'RENDER_QUEUED' | 'RENDERING'
    storyboard?: VideoStoryboard
  }
  phases?: PhaseUpdate[] // real-time phase progress from SSE
  progress?: number // 0–100 weighted progress
  cost?: number // cost of opencode session in USD
  workerId?: string // id of the worker that processed the job
  rating?: string // 'up' or 'down' rating for the generated video
  feedback?: string // Optional text feedback from the user
  error?: string // Reason for failure, if any
  createdAt: string
  updatedAt: string
}

export interface LogEntry {
  timestamp: string
  message: string
  screenshot?: string
  type?: 'call' | 'response' | 'text' | 'info'
}
