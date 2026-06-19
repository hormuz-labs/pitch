import pino from 'pino';

/**
 * Creates a structured pino logger bound to a specific service.
 * Logs as JSON to stdout — picked up by the Loki Docker logging driver.
 * Every log line carries `service`, `env`, and any extra `bindings` as
 * indexed Loki labels / structured fields.
 */
export function createLogger(service: string, bindings: Record<string, string> = {}) {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    base: {
      service,
      env: process.env.NODE_ENV || 'production',
      ...bindings,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;

export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

// ── Phase Progress Tracking ───────────────────────────────────────────────────

/**
 * Represents the state of a single video generation phase.
 * Persisted as JSON in Job.phases and broadcast over SSE.
 */
export interface PhaseUpdate {
  phase: string;           // e.g. "flow_validation"
  label: string;           // Human-readable: "Flow Validation"
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;      // ISO timestamp, set when status = 'running'
  completedAt?: string;    // ISO timestamp, set when status = 'completed'
  durationMs?: number;     // Explicit duration passed from the worker
  retryDurationMs?: number; // Total time spent in failed attempts
  retryCount?: number;     // Number of failed attempts
  failedAttempts?: { startedAt?: string; endedAt?: string; durationMs: number; status: 'completed' | 'failed' }[];
}

/**
 * SSE event payload for a phase progress update.
 * type = 'phase_update' distinguishes it from full job object updates.
 */
export interface JobPhaseEvent {
  type: 'phase_update';
  jobId: string;
  userId: string;
  phase: PhaseUpdate;
  allPhases: PhaseUpdate[];
  progress: number;        // 0–100 weighted sum of completed phases
}

/**
 * The contribution of each phase to overall progress (must sum to 100).
 * Heavier phases (recording, voiceover) contribute more %.
 */
// PDF-specific phase weights and labels
export const PDF_PHASE_WEIGHTS: Record<string, number> = {
  pdf_research:   15,
  pdf_writing:    25,
  pdf_images:     30,
  pdf_build:      20,
  pdf_qa:          5,
  pdf_upload:      5,
};

export const PDF_PHASE_LABELS: Record<string, string> = {
  pdf_research:  'Researching Topic',
  pdf_writing:   'Writing Slides',
  pdf_images:    'Fetching Images',
  pdf_build:     'Building PDF',
  pdf_qa:        'Quality Check',
  pdf_upload:    'Uploading',
};

/**
 * The contribution of each phase to overall progress (must sum to 100).
 * Heavier phases (recording, voiceover) contribute more %.
 */
export const PHASE_WEIGHTS: Record<string, number> = {
  workspace_init:         10,
  video_recording:        70,
  ffmpeg_postprocessing:  20,
  ...PDF_PHASE_WEIGHTS,
};

/** Human-readable label for each phase key */
export const PHASE_LABELS: Record<string, string> = {
  workspace_init:         'Workspace Initialization',
  video_recording:        'Video Recording',
  ffmpeg_postprocessing:  'FFmpeg Post-Processing',
  ...PDF_PHASE_LABELS,
};

export interface Job {
  id: string;
  userId: string;
  status: JobStatus;
  videoUrl?: string;
  pdfUrl?: string;
  audioUrl?: string;
  thumbnailUrl?: string;
  parameters: Record<string, any>;
  phases?: PhaseUpdate[];  // parsed from DB JSON string
  progress?: number;       // 0–100 computed
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateJobRequest {
  userId: string;
  parameters: Record<string, any>;
}

export interface UpdateJobRequest {
  status?: JobStatus;
  videoUrl?: string;
  audioUrl?: string;
}

export const QUEUE_NAME = 'video-generation';
export const JOB_UPDATES_CHANNEL = 'job-updates';
export const JOB_CANCELLATIONS_CHANNEL = 'job-cancellations';
export * from './telegram.js';
export * from './manager-client.js';
