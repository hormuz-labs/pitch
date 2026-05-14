export interface PhaseUpdate {
  phase: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  completedAt?: string;
}

export interface Project {
  id: string;
  userId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  videoUrl?: string;
  audioUrl?: string;
  parameters: Record<string, any>;
  phases?: PhaseUpdate[];    // real-time phase progress from SSE
  progress?: number;         // 0–100 weighted progress
  createdAt: string;
  updatedAt: string;
}

export interface LogEntry {
  timestamp: string;
  message: string;
  screenshot?: string;
  type?: 'call' | 'response' | 'text' | 'info';
}
