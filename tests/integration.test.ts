import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import * as db from '../packages/db/src/index.js';
import { JobStatus, QUEUE_NAME } from '../packages/shared/src/index.js';
import http from 'http';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

describe.skip('Job Queue and Worker End-to-End Flow', () => {
  let redis: Redis;
  let queue: Queue;
  let dummyServer: http.Server;
  let workerProcess: ChildProcess;
  let receivedPayload: any = null;
  const TEST_DB_PATH = path.resolve(__dirname, '../test.sqlite');

  beforeAll(async () => {
    // 1. Setup Env Vars
    const dbUrl = `file:${TEST_DB_PATH}`;
    process.env.DATABASE_URL = dbUrl;
    process.env.REDIS_URL = 'redis://localhost:6379/2'; // Use DB 2 for tests
    process.env.OPENCODE_SERVER_URL = 'http://localhost:8081/generate';

    // Cleanup old test DB
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    
    // Push the schema to the newly created test database
    require('child_process').execSync(`bunx prisma db push`, { cwd: path.resolve(__dirname, '../packages/db'), env: { ...process.env, DATABASE_URL: dbUrl } });

    // 2. Setup Redis and Queue
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    await redis.flushdb(); // Clear test DB
    queue = new Queue(QUEUE_NAME, { connection: redis });

    // 3. Start a dummy OpenCode server to receive the webhook
    dummyServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        receivedPayload = JSON.parse(body);
        res.writeHead(200);
        res.end('OK');
      });
    });
    
    await new Promise<void>((resolve) => dummyServer.listen(8081, () => resolve()));

    // 4. Start the Worker as a child process using bun
    workerProcess = spawn('bun', ['apps/worker/src/index.ts'], {
      env: { ...process.env, DATABASE_URL: dbUrl }
    });

    // Wait a brief moment for worker to connect
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    workerProcess.kill();
    await queue.close();
    await redis.quit();
    dummyServer.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  it('should create a job in DB, process it via worker, and trigger OpenCode server', async () => {
    // 1. Create a job in the SQLite DB (simulating the API)
    const userId = 'user_123';
    const parameters = { prompt: 'A cinematic shot of a futuristic city' };
    
    // Need to initialize a client dynamically because db.ts caches it before env vars are set
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({ datasources: { db: { url: `file:${TEST_DB_PATH}` } } });
    
    const created = await prisma.job.create({
      data: {
        userId,
        status: JobStatus.PENDING,
        parameters: JSON.stringify(parameters),
      },
    });
    
    const jobRecord = {
      ...created,
      status: created.status as JobStatus,
      parameters: JSON.parse(created.parameters)
    };
    
    expect(jobRecord).toBeDefined();
    expect(jobRecord.userId).toBe(userId);
    expect(jobRecord.status).toBe(JobStatus.PENDING);

    // 2. Add job to the BullMQ queue (simulating the API)
    await queue.add('generate-video', { 
      jobId: jobRecord.id, 
      userId, 
      parameters 
    });

    // 3. Wait for the dummy server to receive the request from the Worker
    let retries = 10;
    while (!receivedPayload && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
      retries--;
    }

    // 4. Verify the worker successfully delegated the job
    expect(receivedPayload).toBeDefined();
    expect(receivedPayload.jobId).toBe(jobRecord.id);
    expect(receivedPayload.userId).toBe(userId);
    expect(receivedPayload.parameters.prompt).toBe(parameters.prompt);

    // 5. Verify the job still exists in the DB (CLI would update it to COMPLETED later)
    const fetchedJob = await prisma.job.findUnique({ where: { id: jobRecord.id } });
    expect(fetchedJob).not.toBeNull();
    expect(fetchedJob?.id).toBe(jobRecord.id);
    
    await prisma.$disconnect();
  });
});

