import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { DemoConfig } from './types';
import { buildOutroCardHtml } from './outro-card';

export async function generateOutro(
  config: DemoConfig,
  demoDir: string
): Promise<void> {
  const outroPathFile = path.join(demoDir, 'outro-path.txt');
  if (fs.existsSync(outroPathFile)) {
    const existingPath = fs.readFileSync(outroPathFile, 'utf8').trim();
    if (fs.existsSync(existingPath)) {
      console.log('⏭️  [generate-outro] Outro already exists — skipping.');
      return;
    }
  }

  const iconsDir = path.join(demoDir, 'assets', 'icons');
  const iconFiles = fs.existsSync(iconsDir) ? fs.readdirSync(iconsDir).filter(f => f.startsWith('logo.')) : [];
  const existingLogoPath = iconFiles.length > 0 ? path.join(iconsDir, iconFiles[0]) : null;

  let logoDataUrl = '';
  if (existingLogoPath) {
    const ext = path.extname(existingLogoPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.webp': 'image/webp', '.svg': 'image/svg+xml',
    };
    const mime = mimeMap[ext] || 'image/png';
    logoDataUrl = `data:${mime};base64,${fs.readFileSync(existingLogoPath).toString('base64')}`;
  }

  if (!config.companyName) throw new Error('config.companyName is required');
  if (!config.width || !config.height) throw new Error('config.width and config.height are required');

  const html = buildOutroCardHtml({
    companyName: config.companyName,
    url: 'ui.shadcn.com',
    width: config.width,
    height: config.height,
    bg: '#0A0A0A',
    textColor: '#F5F5F5',
    logoDataUrl,
  });

  const outroBrowser = await chromium.launch({ headless: true });
  const outroContext = await outroBrowser.newContext({
    recordVideo: { dir: demoDir, size: { width: config.width || 1920, height: config.height || 1080 } },
    viewport: { width: config.width || 1920, height: config.height || 1080 },
  });
  const outroPage = await outroContext.newPage();

  await outroPage.setContent('<html><body style="background:#0A0A0A;"></body></html>');
  await outroPage.waitForTimeout(100);

  await outroPage.setContent(html);
  await outroPage.waitForTimeout(3000);
  await outroContext.close();
  await outroBrowser.close();

  const outroVideoPath = path.resolve(demoDir, 'outro.webm');
  const files = fs.readdirSync(demoDir).filter(f => f.endsWith('.webm') && !f.includes('intro'));
  const latestWebm = files.sort((a, b) => fs.statSync(path.join(demoDir, b)).mtimeMs - fs.statSync(path.join(demoDir, a)).mtimeMs)[0];
  if (latestWebm) {
    const fullPath = path.join(demoDir, latestWebm);
    fs.renameSync(fullPath, outroVideoPath);
    fs.writeFileSync(outroPathFile, outroVideoPath);
    console.log(`✅ Outro recorded: ${outroVideoPath}`);
  } else {
    console.log('⚠️  Outro video file not found.');
  }
}
