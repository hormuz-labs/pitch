import { chromium } from 'playwright';
import { DemoConfig, DemoStep } from './types';

export async function pass1(config: DemoConfig, startUrl: string, demoSteps: DemoStep[]) {
  console.log("== Pass 1: Generic Flow Validation ==");
  const VIDEO_WIDTH = config.width || 1920;
  const VIDEO_HEIGHT = config.height || 1080;
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT } });
  const page = await context.newPage();
  
  await page.goto(startUrl);
  await page.waitForLoadState('networkidle');

  for (const step of demoSteps) {
    if (step.selector) {
      console.log(`Validating step: ${step.id}`);
      const loc = page.locator(step.selector).first();
      await loc.waitFor({ state: 'visible', timeout: 5000 });
      await loc.scrollIntoViewIfNeeded();
      
      if (step.action === 'click') {
        await loc.click();
      } else if (step.action === 'type') {
        await loc.fill(step.value!);
      }
      
      await page.waitForTimeout(1000); 
    }
  }

  await browser.close();
  console.log("✅ Flow validated successfully.");
}