#!/usr/bin/env bun
import { Command } from 'commander';
import * as db from '@saas/db';
import * as storage from '@saas/storage';
import { getClerkUserEmail, sendJobCompleteEmail } from '@saas/email';
import { JobStatus, JOB_UPDATES_CHANNEL, sendTelegramMessage, PhaseUpdate, PHASE_WEIGHTS, PHASE_LABELS, type JobPhaseEvent } from '@saas/shared';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';

import { input, select } from '@inquirer/prompts';

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

    // Track every URL successfully uploaded so we can clean up on partial failure
    const uploadedUrls: string[] = [];

    try {
      // Fetch job to get userId and parameters for path prefix
      const job = await db.prisma.job.findUnique({ where: { id: jobId } });
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }
      
      const parameters = typeof job.parameters === 'string' ? JSON.parse(job.parameters) : job.parameters;
      const rawUrl = parameters?.url || 'untitled';
      const projectName = rawUrl.replace(/^https?:\/\//, '').split('/')[0].replace(/[^a-zA-Z0-9-]/g, '_');
      const prefix = `pitch/${job.userId}/${projectName}/videos`;

      // 1. Upload video to GCS/Storage
      const videoUrl = await storage.uploadFile(file, bucket, prefix);
      uploadedUrls.push(videoUrl);
      console.log(`✅ Video uploaded: ${videoUrl}`);

      // 2. Upload audio if provided
      let audioUrl: string | undefined;
      if (audio) {
        audioUrl = await storage.uploadFile(audio, bucket, prefix);
        uploadedUrls.push(audioUrl);
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

      // Fetch user profile for notification
      const userProfile = await db.prisma.userProfile.findUnique({ where: { id: updatedJob.userId } });
      const email = userProfile?.email || updatedJob.userId;
      const urlParam = updatedJob.parameters?.url || 'N/A';
      const instructions = updatedJob.parameters?.instructions ? `\nPrompt: <i>${updatedJob.parameters.instructions}</i>` : '';

      // Telegram hook
      await sendTelegramMessage(`✅ <b>Video Creation Completed</b>\nJob ID: <code>${jobId}</code>\nUser: ${email}\nTarget URL: ${urlParam}${instructions}\nOutput Video: ${videoUrl}`);

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

      // Clean up any files that were already uploaded to avoid orphaned objects
      for (const url of uploadedUrls) {
        try {
// @ts-ignore
          await storage.deleteFile(url, bucket);
          console.log(`🗑️  Cleaned up uploaded file: ${url}`);
        } catch (cleanupError: any) {
          console.warn(`⚠️  Failed to clean up file ${url}:`, cleanupError.message);
        }
      }

      // Mark job as FAILED and refund the credit
      try {
        const failedJob = await db.updateJob(jobId, { status: JobStatus.FAILED });
        await redis.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob));
        
        const userProfile = await db.prisma.userProfile.findUnique({ where: { id: failedJob.userId } });
        const email = userProfile?.email || failedJob.userId;
        const urlParam = failedJob.parameters?.url || 'N/A';
        const instructions = failedJob.parameters?.instructions ? `\nPrompt: <i>${failedJob.parameters.instructions}</i>` : '';

        await sendTelegramMessage(`❌ <b>Video Creation Failed</b> (CLI error)\nJob ID: <code>${jobId}</code>\nUser: ${email}\nTarget URL: ${urlParam}${instructions}\nError: ${error.message}`);
        
        const tenantId = failedJob.userId;
        await db.addCredits(tenantId, 3, 'job_failed_refund', jobId);
        console.log(`↩️  Credit refunded for tenant ${tenantId} due to failed job ${jobId}`);
      } catch (refundError: any) {
        console.warn(`⚠️  Failed to refund credit for job ${jobId}:`, refundError.message);
      }

      process.exit(1);
    }
  });

program
  .command('thumbnail')
  .description('Upload a thumbnail image and update the job record immediately')
  .requiredOption('-j, --job-id <string>', 'The ID of the job')
  .requiredOption('-f, --file <string>', 'Path to the local thumbnail image (jpg/png)')
  .option('-b, --bucket <string>', 'Storage bucket name')
  .action(async (options) => {
    const { jobId, file, bucket } = options;
    console.log(`🖼️  Uploading thumbnail for job ${jobId}...`);

    try {
      const job = await db.prisma.job.findUnique({ where: { id: jobId } });
      if (!job) throw new Error(`Job ${jobId} not found`);

      const parameters = typeof job.parameters === 'string' ? JSON.parse(job.parameters) : job.parameters;
      const rawUrl = parameters?.url || 'untitled';
      const projectName = rawUrl.replace(/^https?:\/\//, '').split('/')[0].replace(/[^a-zA-Z0-9-]/g, '_');
      const prefix = `pitch/${job.userId}/${projectName}/thumbnails`;

      const thumbnailUrl = await storage.uploadFile(file, bucket, prefix);
      console.log(`✅ Thumbnail uploaded: ${thumbnailUrl}`);

      const updatedJob = await db.updateJob(jobId, { thumbnailUrl });
      await redis.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob));

      console.log(`✅ Job ${jobId} thumbnailUrl updated`);
      await redis.quit();
      process.exit(0);
    } catch (error: any) {
      console.error(`❌ Failed to upload thumbnail for job ${jobId}:`, error.message);
      await redis.quit().catch(() => {});
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

      const userProfile = await db.prisma.userProfile.findUnique({ where: { id: updatedJob.userId } });
      const email = userProfile?.email || updatedJob.userId;
      const urlParam = updatedJob.parameters?.url || 'N/A';
      const instructions = updatedJob.parameters?.instructions ? `\nPrompt: <i>${updatedJob.parameters.instructions}</i>` : '';

      if (jobStatus === JobStatus.COMPLETED) {
        await sendTelegramMessage(`✅ <b>Video Creation Completed</b> (Status manual update)\nJob ID: <code>${jobId}</code>\nUser: ${email}\nTarget URL: ${urlParam}${instructions}`);
      } else if (jobStatus === JobStatus.FAILED) {
        await sendTelegramMessage(`❌ <b>Video Creation Failed</b> (Status manual update)\nJob ID: <code>${jobId}</code>\nUser: ${email}\nTarget URL: ${urlParam}${instructions}`);
      }

      // Refund 3 credits if the job is being marked as FAILED
      if (jobStatus === JobStatus.FAILED) {
        try {
          const tenantId = updatedJob.userId;
          await db.addCredits(tenantId, 3, 'job_failed_refund', jobId);
          console.log(`↩️  Credit refunded for tenant ${tenantId} due to failed job ${jobId}`);
        } catch (refundError: any) {
          console.warn(`⚠️  Failed to refund credit for job ${jobId}:`, refundError.message);
        }
      }
      
      console.log(`✅ Status for job ${jobId} updated to ${jobStatus}`);
      process.exit(0);
    } catch (error: any) {
      console.error(`❌ Error updating job ${jobId}:`, error.message);
      process.exit(1);
    }
  });

// ─── Credits commands ─────────────────────────────────────────────────────────

const creditsCmd = program
  .command('credits')
  .description('Manage credit balances for tenants');

creditsCmd
  .command('add')
  .description('Add credits to a tenant (userId)')
  .option('-t, --tenant <string>', 'Tenant ID (userId)')
  .option('-n, --amount <number>', 'Number of credits to add', parseInt)
  .option('-r, --reason <string>', 'Reason for adjustment')
  .action(async (options) => {
    try {
      const tenant = options.tenant || await input({ message: 'Enter Tenant ID (userId):' });
      const amountStr = options.amount !== undefined ? options.amount : await input({ 
        message: 'Enter amount of credits to add:', 
        validate: (value) => !isNaN(parseInt(value)) ? true : 'Please enter a valid number' 
      });
      const amount = typeof amountStr === 'number' ? amountStr : parseInt(amountStr, 10);
      const reason = options.reason || await input({ message: 'Reason for adjustment:', default: 'admin_adjustment' });

      const newBalance = await db.addCredits(tenant, amount, reason);
      console.log(`✅ Added ${amount} credit(s) to tenant ${tenant}. New balance: ${newBalance}`);
      process.exit(0);
    } catch (error: any) {
      console.error(`❌ Failed to add credits:`, error.message);
      process.exit(1);
    }
  });

creditsCmd
  .command('remove')
  .description('Remove credits from a tenant (userId)')
  .option('-t, --tenant <string>', 'Tenant ID (userId)')
  .option('-n, --amount <number>', 'Number of credits to remove', parseInt)
  .option('-r, --reason <string>', 'Reason for adjustment')
  .action(async (options) => {
    try {
      const tenant = options.tenant || await input({ message: 'Enter Tenant ID (userId):' });
      const amountStr = options.amount !== undefined ? options.amount : await input({ 
        message: 'Enter amount of credits to remove:', 
        validate: (value) => !isNaN(parseInt(value)) ? true : 'Please enter a valid number' 
      });
      const amount = typeof amountStr === 'number' ? amountStr : parseInt(amountStr, 10);
      const reason = options.reason || await input({ message: 'Reason for adjustment:', default: 'admin_adjustment' });

      const newBalance = await db.deductCredit(tenant, amount, reason);
      console.log(`✅ Removed ${amount} credit(s) from tenant ${tenant}. New balance: ${newBalance}`);
      process.exit(0);
    } catch (error: any) {
      console.error(`❌ Failed to remove credits:`, error.message);
      process.exit(1);
    }
  });

creditsCmd
  .command('balance')
  .description('Check the credit balance for a tenant')
  .option('-t, --tenant <string>', 'Tenant ID (userId)')
  .action(async (options) => {
    try {
      const tenant = options.tenant || await input({ message: 'Enter Tenant ID (userId):' });
      const balance = await db.getCreditBalance(tenant);
      const transactions = await db.getCreditTransactions(tenant);
      console.log(`\nTenant: ${tenant}`);
      console.log(`Balance: ${balance} credit(s)\n`);
      if (transactions.length > 0) {
        console.log('Transaction History:');
        transactions.forEach(tx => {
          const sign = tx.delta > 0 ? '+' : '';
          console.log(`  ${tx.createdAt.toISOString()}  ${sign}${tx.delta}  ${tx.reason}${tx.jobId ? `  (job: ${tx.jobId})` : ''}`);
        });
      } else {
        console.log('No transactions yet.');
      }
      process.exit(0);
    } catch (error: any) {
      console.error(`❌ Failed to fetch balance:`, error.message);
      process.exit(1);
    }
  });

// ─── Phase Progress Command ───────────────────────────────────────────────────
// The OpenCode agent calls this CLI at the START and END of every pipeline phase.
// Example:
//   bun apps/job-cli/src/index.ts phase --job-id <ID> --phase flow_validation --status running
//   bun apps/job-cli/src/index.ts phase --job-id <ID> --phase flow_validation --status completed

program
  .command('phase')
  .description('Report a phase progress update for a running job')
  .requiredOption('-j, --job-id <string>', 'The ID of the job')
  .requiredOption('-p, --phase <string>', `Phase key. One of: ${Object.keys(PHASE_LABELS).join(', ')}`)
  .requiredOption('-s, --status <string>', 'Phase status: running | completed | failed')
  .action(async (options) => {
    const { jobId, phase: phaseKey, status } = options;

    const validStatuses = ['running', 'completed', 'failed'];
    if (!validStatuses.includes(status)) {
      console.error(`❌ Invalid status "${status}". Must be one of: ${validStatuses.join(', ')}`);
      process.exit(1);
    }

    if (!PHASE_LABELS[phaseKey]) {
      console.warn(`⚠️  Unknown phase key "${phaseKey}". Valid keys: ${Object.keys(PHASE_LABELS).join(', ')}`);
      // Don't exit — allow unknown phases to pass through gracefully
    }

    try {
      // 1. Load the job to get userId and current phases
      const job = await db.prisma.job.findUnique({ where: { id: jobId } });
      if (!job) {
        console.error(`❌ Job ${jobId} not found`);
        process.exit(1);
      }

      // 2. Parse existing phases (or start fresh)
      const currentPhases: PhaseUpdate[] = job.phases ? JSON.parse(job.phases as string) : [];

      // 3. Upsert this phase
      const updatedPhase: PhaseUpdate = {
        phase: phaseKey,
        label: PHASE_LABELS[phaseKey] ?? phaseKey,
        status: status as PhaseUpdate['status'],
        ...(status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
      };

      const existingIdx = currentPhases.findIndex(p => p.phase === phaseKey);
      const newPhases: PhaseUpdate[] = existingIdx >= 0
        ? currentPhases.map((p, i) => (i === existingIdx ? updatedPhase : p))
        : [...currentPhases, updatedPhase];

      // 4. Compute weighted progress from completed phases
      const progress = newPhases
        .filter(p => p.status === 'completed')
        .reduce((acc, p) => acc + (PHASE_WEIGHTS[p.phase] ?? 0), 0);

      // 5. Persist to DB (using raw prisma — system-level, no auth check needed)
      await db.prisma.job.update({
        where: { id: jobId },
        data: { phases: JSON.stringify(newPhases) },
      });

      // 6. Broadcast phase_update over the existing SSE channel
      const event: JobPhaseEvent = {
        type: 'phase_update',
        jobId,
        userId: job.userId,
        phase: updatedPhase,
        allPhases: newPhases,
        progress,
      };
      await redis.publish(JOB_UPDATES_CHANNEL, JSON.stringify(event));

      const emoji = status === 'completed' ? '✅' : status === 'failed' ? '❌' : '🔄';
      console.log(`${emoji} Phase [${phaseKey}] → ${status} (progress: ${progress}%) for job ${jobId}`);

      await redis.quit();
      process.exit(0);
    } catch (error: any) {
      console.error(`❌ Failed to update phase for job ${jobId}:`, error.message);
      // Non-fatal: don't block the pipeline on a reporting failure
      await redis.quit().catch(() => {});
      process.exit(0); // exit 0 so the agent script continues
    }
  });

program.parse();


