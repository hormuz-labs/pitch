import fs from 'fs';
import path from 'path';

export async function uploadFile(localPath: string, bucket?: string) {
  // For local development, we copy the file to apps/web/public/videos
  const filename = path.basename(localPath);
  const targetDir = path.resolve(process.cwd(), 'apps/web/public/videos');
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const targetPath = path.join(targetDir, filename);
  console.log(`[Storage] Copying ${localPath} to ${targetPath}`);
  
  fs.copyFileSync(localPath, targetPath);
  
  // Return the public URL path relative to the web app
  return `/videos/${filename}`;
}
