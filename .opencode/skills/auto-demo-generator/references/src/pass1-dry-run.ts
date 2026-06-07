import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DemoConfig, DemoStep } from './types';
import { cloakLaunchOptions } from './cloak-launcher';

function preflight(config: DemoConfig): void {
  if (!config.startUrl) throw new Error('[pass1-dry-run] config.startUrl is required.');
  if (!config.steps || config.steps.length === 0) throw new Error('[pass1-dry-run] config.steps is empty.');
}

export async function pass1(config: DemoConfig, startUrl: string, demoSteps: DemoStep[]) {
  preflight(config);
  console.log("== Pass 1: Flow Validation (Dry Run) ==");
  const VIDEO_WIDTH = config.width || 1920;
  const VIDEO_HEIGHT = config.height || 1080;
  const browser = await chromium.launch(cloakLaunchOptions());
  const context = await browser.newContext({ viewport: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT } });

  // If a CloakBrowser profile exists, load its storage_state.json to restore
  // cookies so the automation runs as an authenticated user.
  const PROFILE_ROOT = process.env.CLOAK_PROFILE_ROOT || path.join(os.homedir(), '.cloak-profiles');
  const safe = config.userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const profileDir = path.join(PROFILE_ROOT, `user-${safe}`);
  if (fs.existsSync(profileDir)) {
    const storageFile = path.join(profileDir, 'storage_state.json');
    if (fs.existsSync(storageFile)) {
      try {
        const state = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
        if (state.cookies?.length) {
          await context.addCookies(state.cookies);
          console.log(`[pass1] Restored ${state.cookies.length} cookies from ${storageFile}`);
        }
      } catch (e) {
        console.warn(`[pass1] Failed to load storage state:`, e);
      }
    } else {
      console.log(`[pass1] No storage_state.json found at ${storageFile} — proceeding unauthenticated`);
    }
  }

  const page = await context.newPage();
  await page.goto(startUrl, { waitUntil: 'load' });
  await page.waitForTimeout(5000);
  let prevUrl = page.url();

  for (const step of demoSteps) {
    if (step.selector) {
      console.log(`Validating step: ${step.id} — locating: ${step.selector}`);
      const loc = page.locator(step.selector).first();
      await loc.waitFor({ state: 'attached', timeout: 20000 });
      await loc.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);

      if (step.action === 'click') {
        if (step.selector && step.selector.startsWith('a >> text=')) {
          await page.waitForTimeout(500);
          await loc.scrollIntoViewIfNeeded();
          await loc.click().catch(() => loc.click({ force: true }));
          for (let i = 0; i < 20; i++) {
            if (page.url() !== prevUrl) break;
            await page.waitForTimeout(100);
          }
        } else {
          await loc.click({ force: true });
        }
        await page.waitForTimeout(600);
        const newUrl = page.url();
        if (newUrl !== prevUrl) {
          console.log(`  → Navigated to: ${newUrl}`);
          await page.waitForTimeout(5000);
          prevUrl = newUrl;
        }
      } else if (step.action === 'type') {
        await loc.fill(step.value!);
        await page.waitForTimeout(800);
      }

      await page.waitForTimeout(400);
    }
  }

  await browser.close();
  console.log("✅ Flow validated successfully.");
}