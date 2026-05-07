#!/usr/bin/env node
import { Command } from 'commander';
import * as db from '@saas/db';
import * as storage from '@saas/storage';
import { getClerkUserEmail, sendJobCompleteEmail } from '@saas/email';
import { JobStatus, JOB_UPDATES_CHANNEL } from '@saas/shared';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
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
  .option('-a, --audio <string>', 'Path to the local audio file')
  .option('-b, --bucket <string>', 'GCS bucket name')
  .action(async (options) => {
    const { jobId, file, audio, bucket } = options;
    console.log(`🚀 Processing job completion for ${jobId}...`);

    try {
      // 1. Upload video to GCS/Storage
      const videoUrl = await storage.uploadFile(file, bucket);
      console.log(`✅ Video uploaded: ${videoUrl}`);

      // 2. Upload audio if provided
      let audioUrl: string | undefined;
      if (audio) {
        audioUrl = await storage.uploadFile(audio, bucket);
        console.log(`✅ Audio uploaded: ${audioUrl}`);
      }

      // 3. Update Database
      const updatedJob = await db.updateJob(jobId, {
        status: JobStatus.COMPLETED,
        videoUrl,
        audioUrl
      });
      
      // 4. Notify subscribers
      await redis.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob));
      
      console.log(`✅ Database updated for job ${jobId}`);

      // 5. Send email notification to the user
      try {
        const userEmail = await getClerkUserEmail(updatedJob.userId);
        if (userEmail && videoUrl) {
          await sendJobCompleteEmail({ to: userEmail, jobId, videoUrl });
        }
      } catch (emailError: any) {
        // Email failure should never block job completion
        console.warn(`⚠️  Email notification failed for job ${jobId}:`, emailError.message);
      }

      process.exit(0);
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
      const updatedJob = await db.updateJob(jobId, { status: jobStatus });
      
      // Notify subscribers
      await redis.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob));
      
      console.log(`✅ Status for job ${jobId} updated to ${jobStatus}`);
      process.exit(0);
    } catch (error: any) {
      console.error(`❌ Error updating job ${jobId}:`, error.message);
      process.exit(1);
    }
  });

program.parse();
