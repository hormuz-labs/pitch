# Image Fetching — Unified Node.js Playwright Pipeline

Read this file before fetching images. This covers the high-fidelity Unsplash, Pinterest, and Dribbble image scraping pipeline.

---

## Setup

```bash
mkdir -p pptx/
```

---

## Scraper Script

Save as `.opencode/skills/ppt-generator/reference/scrape_images.js`.

```javascript
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PINTEREST_LIMIT = 5;
const DRIBBBLE_LIMIT = 5;
const UNSPLASH_LIMIT = 5;

function slugify(text) {
    return text.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
}

function slugifyTopic(text) {
    return text.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 40);
}

function getOutputDir(topic, keyword) {
    const rootPptxDir = path.resolve(__dirname, '../../../../pptx');
    const keywordSlug = slugify(keyword);
    
    if (topic) {
        const topicSlug = slugifyTopic(topic);
        const topicFolder = topicSlug.startsWith('ppt-') ? topicSlug : `ppt-${topicSlug}`;
        return path.join(rootPptxDir, topicFolder, 'images', keywordSlug);
    } else {
        return path.join(rootPptxDir, 'ppt-images', keywordSlug);
    }
}

function bestSrcset(srcset) {
    if (!srcset) return "";
    const parts = srcset.split(",").map(p => p.trim()).filter(Boolean);
    const candidates = [];
    for (const part of parts) {
        const tokens = part.split(/\s+/);
        if (tokens.length > 0) {
            const url = tokens[0];
            let w = 0;
            if (tokens.length > 1 && tokens[1].includes("w")) {
                w = parseInt(tokens[1].replace("w", ""), 10) || 0;
            }
            candidates.push({ w, url });
        }
    }
    if (candidates.length === 0) return "";
    candidates.sort((a, b) => b.w - a.w);
    return candidates[0].url;
}

async function download(page, url, dest) {
    try {
        const requestContext = page.context().request;
        const response = await requestContext.get(url, {
            headers: {
                'Referer': 'https://www.google.com/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        if (response.ok()) {
            const buffer = await response.body();
            if (buffer.length >= 5000) {
                fs.writeFileSync(dest, buffer);
                return true;
            }
        }
    } catch (e) {
        // Silently ignore download errors
    }
    return false;
}

async function scrapePinterest(page, keyword, outDir, limit = PINTEREST_LIMIT) {
    const collected = [];
    const encoded = encodeURIComponent(keyword);
    const url = `https://www.pinterest.com/search/pins/?q=${encoded}&rs=typed`;
    console.log(`  [Pinterest] Searching for '${keyword}'...`);
    try {
        await page.goto(url, { waitUntil: 'load', timeout: 25000 });
        try {
            await page.waitForSelector("img[src*='pinimg.com']", { timeout: 10000 });
        } catch (err) {
            // Fallback if the selector is slow
        }
        await page.waitForTimeout(3000);
        for (let j = 0; j < 2; j++) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
            await page.waitForTimeout(1500);
        }
        
        const imgElements = await page.$$("img[src*='pinimg.com']");
        let idx = 1;
        for (const img of imgElements) {
            if (collected.length >= limit) break;
            const src = await img.getAttribute("src") || "";
            const srcset = await img.getAttribute("srcset") || "";
            let finalUrl = srcset ? bestSrcset(srcset) : src;
            if (!finalUrl || finalUrl.toLowerCase().includes("gif")) continue;
            
            // Replaces sizes with originals (Pinterest original files)
            const originalUrl = finalUrl.replace(/\/(\d+x|564x|736x)\//, '/originals/');
            const dest = path.join(outDir, `pinterest_${String(idx).padStart(2, '0')}.jpg`);
            
            let success = await download(page, originalUrl, dest);
            if (!success) {
                // Fallback to high-res preview size (736x) if original fails
                const fallbackUrl = finalUrl.replace(/\/(\d+x|564x|736x)\//, '/736x/');
                success = await download(page, fallbackUrl, dest);
            }
            
            if (success) {
                collected.push(dest);
                idx++;
            }
        }
    } catch (e) {
        console.error(`  [Pinterest] Error for '${keyword}': ${e.message}`);
    }
    return collected;
}

async function scrapeDribbble(page, keyword, outDir, limit = DRIBBBLE_LIMIT) {
    const collected = [];
    const encoded = encodeURIComponent(keyword);
    const url = `https://dribbble.com/search/${encoded}`;
    console.log(`  [Dribbble] Searching for '${keyword}'...`);
    try {
        await page.goto(url, { waitUntil: 'load', timeout: 25000 });
        try {
            await page.waitForSelector(".shot-thumbnail img, .shots-grid img", { timeout: 10000 });
        } catch (err) {
            // Fallback if selector is slow
        }
        await page.waitForTimeout(2000);
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
        await page.waitForTimeout(1500);
        
        const imgElements = await page.$$(".shot-thumbnail img, [data-thumbnail-src], .shots-grid img");
        let idx = 1;
        for (const img of imgElements) {
            if (collected.length >= limit) break;
            let src = await img.getAttribute("data-thumbnail-src") || await img.getAttribute("src") || "";
            if (!src || src.toLowerCase().includes("gif") || src.startsWith("data:")) continue;
            
            // Standard size replace for high quality Dribbble image
            src = src.replace(/\/\d+x\d+\//, '/800x600/');
            const dest = path.join(outDir, `dribbble_${String(idx).padStart(2, '0')}.jpg`);
            
            if (await download(page, src, dest)) {
                collected.push(dest);
                idx++;
            }
        }
    } catch (e) {
        console.error(`  [Dribbble] Error for '${keyword}': ${e.message}`);
    }
    return collected;
}

async function scrapeUnsplash(page, keyword, outDir, limit = UNSPLASH_LIMIT) {
    const collected = [];
    const url = `https://unsplash.com/s/photos/${encodeURIComponent(keyword)}`;
    console.log(`  [Unsplash] Searching for '${keyword}'...`);
    try {
        await page.goto(url, { waitUntil: 'load', timeout: 25000 });
        try {
            await page.waitForSelector('img', { timeout: 10000 });
        } catch (err) {
            // Fallback if selector is slow
        }
        await page.waitForTimeout(2000);
        
        const images = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img'))
                .map(img => img.src)
                .filter(src => src && src.includes('images.unsplash.com') && src.includes('photo-'));
        });
        
        let idx = 1;
        for (let i = 0; i < images.length; i++) {
            if (collected.length >= limit) break;
            const finalUrl = images[i].split('?')[0] + "?auto=format&fit=crop&q=80&w=1280&h=720";
            const dest = path.join(outDir, `unsplash_${String(idx).padStart(2, '0')}.jpg`);
            
            if (await download(page, finalUrl, dest)) {
                collected.push(dest);
                idx++;
            }
        }
    } catch (e) {
        console.error(`  [Unsplash] Error for '${keyword}': ${e.message}`);
    }
    return collected;
}

async function scrapeAll(topic, keywords) {
    const results = {};
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    for (const kw of keywords) {
        const outDir = getOutputDir(topic, kw);
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        
        console.log(`\n🔍 Scraping images for: '${kw}'`);
        console.log(`  Writing to: ${outDir}`);
        const page = await context.newPage();
        
        // Scrape from Unsplash
        const uImgs = await scrapeUnsplash(page, kw, outDir, UNSPLASH_LIMIT);
        console.log(`  ✓ Unsplash:  ${uImgs.length} images`);
        
        // Scrape from Pinterest
        const pImgs = await scrapePinterest(page, kw, outDir, PINTEREST_LIMIT);
        console.log(`  ✓ Pinterest: ${pImgs.length} images`);
        
        // Scrape from Dribbble
        const dImgs = await scrapeDribbble(page, kw, outDir, DRIBBBLE_LIMIT);
        console.log(`  ✓ Dribbble:  ${dImgs.length} images`);
        
        await page.close();
        results[kw] = [...uImgs, ...pImgs, ...dImgs];
    }
    
    await browser.close();
    return results;
}
```

---

## Execution Command

Run the script by passing the topic with the `--topic` flag and keywords after the `--keywords` flag:

```bash
node .opencode/skills/ppt-generator/reference/scrape_images.js --topic "topic name" --keywords "keyword one" "keyword two"
```

This will automatically download images into:
`pptx/ppt-<topic-slug>/images/<keyword-slug>/`

---

## Fallback

If the scrapers fail to retrieve images for any reason, the `pdf-builder.js` will automatically use a colored placeholder box with the keyword text to maintain the slide deck layout.
