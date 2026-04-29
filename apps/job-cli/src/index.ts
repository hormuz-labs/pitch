#!/usr/bin/env node
import { Command } from 'commander';
import * as db from '@saas/db';
import * as storage from '@saas/storage';
import { JobStatus } from '@saas/shared';
import dotenv from 'dotenv';

dotenv.config();

const program = new Command();

program
  .name('job-cli')
  .description('CLI to push video generation results to GCS and update DB')
  .version('1.0.0');

program
  .command('push')
  .description('Upload a video and update the job status')
  .requiredOption('-j, --job-id <string>', 'The ID of the job')
  .requiredOption('-f, --file <string>', 'Path to the local video file')
  .option('-b, --bucket <string>', 'GCS bucket name')
  .action(async (options) => {
    const { jobId, file, bucket } = options;
    console.log(`🚀 Processing job completion for ${jobId}...`);

    try {
      // 1. Upload to GCS
      const videoUrl = await storage.uploadFile(file, bucket);
      console.log(`✅ Uploaded to GCS: ${videoUrl}`);

      // 2. Update Database
      await db.updateJob(jobId, {
        status: JobStatus.COMPLETED,
        videoUrl,
      });
      console.log(`✅ Database updated for job ${jobId}`);
    } catch (error: any) {
      console.error(`❌ Error processing job ${jobId}:`, error.message);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Update the status of a job')
  .requiredOption('-j, --job-id <string>', 'The ID of the job')
  .requiredOption('-s, --status <string>', 'New status (PENDING, PROCESSING, COMPLETED, FAILED)')
  .action(async (options) => {
    const { jobId, status } = options;
    const jobStatus = status.toUpperCase() as JobStatus;
    
    if (!Object.values(JobStatus).includes(jobStatus)) {
      console.error(`❌ Invalid status: ${status}`);
      process.exit(1);
    }

    try {
      await db.updateJob(jobId, { status: jobStatus });
      console.log(`✅ Status for job ${jobId} updated to ${jobStatus}`);
    } catch (error: any) {
      console.error(`❌ Error updating job ${jobId}:`, error.message);
      process.exit(1);
    }
  });

program.parse();
