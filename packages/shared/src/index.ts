export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface Job {
  id: string;
  userId: string;
  status: JobStatus;
  videoUrl?: string;
  parameters: Record<string, any>;
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
}

export const QUEUE_NAME = 'video-generation';
