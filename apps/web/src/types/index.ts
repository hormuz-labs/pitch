export interface Project {
  id: string;
  userId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  videoUrl?: string;
  audioUrl?: string;
  parameters: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface LogEntry {
  timestamp: string;
  message: string;
  screenshot?: string;
  type?: 'call' | 'response' | 'text' | 'info';
}
