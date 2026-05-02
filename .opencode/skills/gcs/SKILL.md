---
name: gcs
description: >
  Provides instructions for the agent on how to use the job-cli tool to finalize video generation tasks.
  Use this skill whenever you need to upload a generated video to Google Cloud Storage (GCS) and update
  the corresponding job status in the SQLite database to COMPLETED or FAILED. Triggers on requests to
  "upload the video", "update the job status", "finish the generation task", or "push to GCS".
compatibility: "Requires the job-cli executable to be built in the monorepo. System: bun. Env: DB_PATH (optional), GCS_BUCKET (optional)."
---

# Video Job Updater Skill

## Description
This skill provides instructions for the agent on how to use the `job-cli` tool to finalize video generation tasks. The CLI is responsible for uploading generated video files to Google Cloud Storage (GCS) and updating the corresponding job status in the SQLite database to `COMPLETED`.

## Prerequisites
Before using the `job-cli`, ensure the following:
- You have successfully generated the video file and know its local path on the filesystem.
- You have the `jobId` associated with the video generation request (this is provided in the initial task payload).
- You are operating from the root of the monorepo (`/workspace`).

## Using the CLI

The `job-cli` is an executable script located within the monorepo. Since the project uses Bun/TypeScript, you can execute the CLI directly via `bun`.

### Command: `push`

This is the primary command you will use. It uploads the local video to GCS and automatically updates the database job status to `COMPLETED` with the new GCS URL.

**Syntax:**
```bash
pnpm run job-cli push --job-id <JOB_ID> --file <PATH_TO_VIDEO>
```

**Options:**
- `-j, --job-id <string>`: **(Required)** The unique identifier of the job you are completing.
- `-f, --file <string>`: **(Required)** The absolute or relative path to the generated `.mp4` (or other video format) file on the local disk.
- `-b, --bucket <string>`: *(Optional)* The GCS bucket name. If omitted, it defaults to the environment variable `GCS_BUCKET` or `default-bucket`.

**Example Usage:**
```bash
# Assuming you just generated a video at /tmp/output-123.mp4 for job 'xyz789'
pnpm run job-cli push --job-id xyz789 --file /tmp/output-123.mp4
```

### Command: `status`

If you encounter an error during video generation and need to explicitly mark a job as failed (without uploading a video), use the `status` command.

**Syntax:**
```bash
pnpm run job-cli status --job-id <JOB_ID> --status <STATUS>
```

**Options:**
- `-j, --job-id <string>`: **(Required)** The unique identifier of the job.
- `-s, --status <string>`: **(Required)** The new status. Valid options are `PENDING`, `PROCESSING`, `COMPLETED`, or `FAILED`.

**Example Usage:**
```bash
# Mark a job as failed
pnpm run job-cli status --job-id xyz789 --status FAILED
```

## Troubleshooting & Important Notes
1. **Database Path:** The CLI uses the local SQLite database. Ensure it executes in the context where `database.sqlite` is accessible (usually the monorepo root).
2. **Missing Dependencies:** If the CLI fails to run due to missing packages, ensure you have run `bun install` in the monorepo root.
3. **Storage Errors:** The storage logic is currently stubbed out in `packages/storage/src/index.ts`. It will simulate an upload and return a mock Google Cloud Storage URL. When real GCS credentials are added, the CLI will naturally begin uploading real files.
