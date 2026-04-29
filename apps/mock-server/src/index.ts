import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../');

const app = express();
app.use(express.json());

app.post('/generate', (req, res) => {
  console.log('[Mock OpenCode] Received task:', req.body);
  const { jobId } = req.body;
  
  res.sendStatus(200);

  console.log(`[Mock OpenCode] Simulating processing for ${jobId}...`);
  setTimeout(() => {
    console.log(`[Mock OpenCode] Processing complete for ${jobId}. Calling job-cli...`);
    const jobCliPath = path.join(rootDir, 'apps/job-cli/src/index.ts');
    const cmd = `bun ${jobCliPath} push --job-id ${jobId} --file /tmp/mock_video_${jobId}.mp4`;
    
    exec(cmd, { cwd: rootDir }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Mock OpenCode] error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`[Mock OpenCode] stderr: ${stderr}`);
      }
      console.log(`[Mock OpenCode] job-cli output:\n${stdout}`);
    });
  }, 3000);
});

const PORT = 4096;
app.listen(PORT, () => {
  console.log(`[Mock OpenCode] Server running on http://localhost:${PORT}`);
});
