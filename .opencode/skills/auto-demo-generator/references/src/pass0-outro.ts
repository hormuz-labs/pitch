import fs from 'fs';
import path from 'path';
import { DemoConfig } from './types';
import { buildOutroCardHtml } from './outro-card';
import { openBrowser } from './browser';

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
  const w = config.width || 1920;
  const h = config.height || 1080;

  let displayUrl = config.outroUrl;
  if (!displayUrl && config.startUrl) {
    const urlObj = new URL(config.startUrl.startsWith('http') ? config.startUrl : `https://${config.startUrl}`);
    displayUrl = urlObj.hostname.replace('www.', '');
  }
  if (!displayUrl) displayUrl = 'ui.shadcn.com';

  const html = buildOutroCardHtml({
    companyName: config.companyName,
    url: displayUrl,
    thanksText: config.outroText || 'Thanks for watching',
    width: w,
    height: h,
    bg: config.outroBg || '#0A0A0A',
    textColor: config.outroTextColor || '#F5F5F5',
    logoDataUrl,
  });

  const outroSession = await openBrowser({
    contextOptions: {
      recordVideo: { dir: demoDir, size: { width: w, height: h } },
      viewport: { width: w, height: h },
    },
  });
  const outroContext = outroSession.context;
  const outroPage = await outroContext.newPage();

  const finalBg = config.outroBg || '#0A0A0A';
  await outroPage.goto('data:text/html,' + encodeURIComponent(`<html><body style="background:${finalBg};"></body></html>`));
  await outroPage.waitForTimeout(100);

  await outroPage.goto('data:text/html,' + encodeURIComponent(html));
  await outroPage.waitForTimeout(3000);
  await outroContext.close();
  await outroSession.close();

  const outroVideoPath = path.resolve(demoDir, 'outro.webm');
  const files = fs.readdirSync(demoDir).filter(f => f.endsWith('.webm') && !f.includes('intro'));
  const latestWebm = files.sort((a, b) => fs.statSync(path.join(demoDir, b)).mtimeMs - fs.statSync(path.join(demoDir, a)).mtimeMs)[0];
  if (!latestWebm) throw new Error('[generate-outro] No .webm output found in demo dir after recording.');
  fs.renameSync(path.join(demoDir, latestWebm), outroVideoPath);
  fs.writeFileSync(outroPathFile, outroVideoPath);
  console.log(`✅ Outro recorded: ${outroVideoPath}`);
}
