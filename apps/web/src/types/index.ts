export interface PhaseUpdate {
  phase: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  retryDurationMs?: number;
  retryCount?: number;
  failedAttempts?: { startedAt: string; endedAt: string; durationMs: number }[];
}

export interface Project {
  id: string;
  userId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  videoUrl?: string;
  audioUrl?: string;
  thumbnailUrl?: string;
  parameters: Record<string, any>;
  phases?: PhaseUpdate[];    // real-time phase progress from SSE
  progress?: number;         // 0–100 weighted progress
  cost?: number;             // cost of opencode session in USD
  workerId?: string;         // id of the worker that processed the job
  rating?: string;           // 'up' or 'down' rating for the generated video
  feedback?: string;         // Optional text feedback from the user
  createdAt: string;
  updatedAt: string;
}

export interface LogEntry {
  timestamp: string;
  message: string;
  screenshot?: string;
  type?: 'call' | 'response' | 'text' | 'info';
}
