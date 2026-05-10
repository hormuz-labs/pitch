#!/usr/bin/env node
import { Command } from 'commander';
import * as db from '@saas/db';
import * as storage from '@saas/storage';
import { getClerkUserEmail, sendJobCompleteEmail } from '@saas/email';
import { JobStatus, JOB_UPDATES_CHANNEL, sendTelegramMessage } from '@saas/shared';
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
      // 1. Upload video to GCS/Storage
      const videoUrl = await storage.uploadFile(file, bucket);
      uploadedUrls.push(videoUrl);
      console.log(`✅ Video uploaded: ${videoUrl}`);

      // 2. Upload audio if provided
      let audioUrl: string | undefined;
      if (audio) {
        audioUrl = await storage.uploadFile(audio, bucket);
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
        
        const tenantId = failedJob.orgId || failedJob.userId;
        await db.addCredits(tenantId, 1, 'job_failed_refund', jobId);
        console.log(`↩️  Credit refunded for tenant ${tenantId} due to failed job ${jobId}`);
      } catch (refundError: any) {
        console.warn(`⚠️  Failed to refund credit for job ${jobId}:`, refundError.message);
      }

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

      // Refund 1 credit if the job is being marked as FAILED
      if (jobStatus === JobStatus.FAILED) {
        try {
          const tenantId = updatedJob.orgId || updatedJob.userId;
          await db.addCredits(tenantId, 1, 'job_failed_refund', jobId);
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
  .description('Add credits to a tenant (orgId or userId)')
  .option('-t, --tenant <string>', 'Tenant ID (orgId or userId)')
  .option('-n, --amount <number>', 'Number of credits to add', parseInt)
  .option('-r, --reason <string>', 'Reason for adjustment')
  .action(async (options) => {
    try {
      const tenant = options.tenant || await input({ message: 'Enter Tenant ID (orgId or userId):' });
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
  .description('Remove credits from a tenant (orgId or userId)')
  .option('-t, --tenant <string>', 'Tenant ID (orgId or userId)')
  .option('-n, --amount <number>', 'Number of credits to remove', parseInt)
  .option('-r, --reason <string>', 'Reason for adjustment')
  .action(async (options) => {
    try {
      const tenant = options.tenant || await input({ message: 'Enter Tenant ID (orgId or userId):' });
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
  .option('-t, --tenant <string>', 'Tenant ID (orgId or userId)')
  .action(async (options) => {
    try {
      const tenant = options.tenant || await input({ message: 'Enter Tenant ID (orgId or userId):' });
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

program.parse();

