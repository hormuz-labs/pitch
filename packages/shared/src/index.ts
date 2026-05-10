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

export interface Job {
  id: string;
  userId: string;
  orgId: string;
  status: JobStatus;
  videoUrl?: string;
  audioUrl?: string;
  parameters: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateJobRequest {
  userId: string;
  orgId: string;
  parameters: Record<string, any>;
}

export interface UpdateJobRequest {
  status?: JobStatus;
  videoUrl?: string;
  audioUrl?: string;
}

export const QUEUE_NAME = 'video-generation';
export const JOB_UPDATES_CHANNEL = 'job-updates';
export * from './telegram.js';
