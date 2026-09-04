const fs = require('fs');
const path = require('path');
require('dotenv').config();
/**
 * The browser is the CloakBrowser over CDP — the studio image has no Chromium.
 * The tool that runs this script points STUDIO_BROWSER_LIB at the library that
 * connects to it and serves local files into it.
 */
async function studioBrowserLib() {
    const lib = process.env.STUDIO_BROWSER_LIB;
    if (!lib) throw new Error('STUDIO_BROWSER_LIB is not set — run this through its pdf_* tool, never by hand.');
    return import(lib);
}

const PINTEREST_LIMIT = 2;
const UNSPLASH_LIMIT = 1;

const GEMINI_PRIMARY_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash-image';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

function buildGeminiPrompt(keyword, richPrompt) {
    const base = richPrompt && richPrompt.trim()
        ? richPrompt.trim()
        : `A high-quality, photorealistic image of ${keyword}`;
    const suffix = 'suitable for a presentation slide, clean composition with space for text overlay, professional lighting, 16:9 sensibility, no watermarks.';
    return `${base}, ${suffix}`;
}

async function callGeminiImageApi(prompt, model) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not set in environment');
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                responseModalities: ['TEXT', 'IMAGE']
            }
        })
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${text}`);
    }
    return response.json();
}

function extractImageFromGeminiResponse(data) {
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
            return {
                mimeType: part.inlineData.mimeType || 'image/png',
                data: Buffer.from(part.inlineData.data, 'base64')
            };
        }
    }
    return null;
}

async function generateGeminiImage(keyword, richPrompt, outDir, index) {
    const prompt = buildGeminiPrompt(keyword, richPrompt);
    const promptFile = path.join(outDir, 'gemini_prompt.txt');
    fs.writeFileSync(promptFile, prompt);

    // Named by what Gemini actually returned: it usually answers with JPEG
    // bytes, and a .png that is not a PNG confuses every size probe after it.
    const destFor = mimeType =>
        path.join(outDir, `gemini_${String(index).padStart(2, '0')}.${/jpe?g/i.test(mimeType) ? 'jpg' : 'png'}`);
    let dest = destFor('image/png');
    console.log(`  [Gemini] Generating image for '${keyword}'...`);

    const models = [GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL];
    let lastError = null;
    for (const model of models) {
        try {
            const data = await callGeminiImageApi(prompt, model);
            const image = extractImageFromGeminiResponse(data);
            if (!image) {
                throw new Error('No image part found in Gemini response');
            }
            dest = destFor(image.mimeType);
            fs.writeFileSync(dest, image.data);
            console.log(`  ✓ Gemini:  1 image (${model})`);
            return dest;
        } catch (e) {
            lastError = e;
            console.error(`  [Gemini] Model ${model} failed: ${e.message}`);
        }
    }

    console.error(`  [Gemini] All models failed for '${keyword}': ${lastError?.message}`);
    return null;
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
    console.log(`  ✓ Pinterest: ${collected.length} images`);
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
    console.log(`  ✓ Unsplash:  ${collected.length} images`);
    return collected;
}

async function scrapeAll(topic, keywords, richPromptMap = {}, engineOrder = null) {
    // Default: Pinterest first, then Gemini fallback generation.
    // --engine-order can override this (e.g. "gemini,pinterest" for comic-pop).
    const order = engineOrder || ["pinterest", "gemini"];
    const results = {};
    // Pinterest and Unsplash are exactly the kind of wall a plain headless
    // Chromium loses to, so scrape through the CloakBrowser and leave its
    // fingerprint alone — no user-agent override, that is what gets caught.
    const { openStudioBrowser } = await studioBrowserLib();
    const browser = await openStudioBrowser({ viewport: { width: 1440, height: 900 } });
    const context = browser.context;
    
    for (const kw of keywords) {
        const outDir = getOutputDir(topic, kw);
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        
        console.log(`\n🔍 Scraping images for: '${kw}'`);
        console.log(`  Writing to: ${outDir}`);
        console.log(`  Engine order: ${order.join(' → ')}`);
        const page = await context.newPage();
        
        let allImages = [];
        const richPrompt = richPromptMap[kw];
        
        for (const engine of order) {
            if (allImages.length >= PINTEREST_LIMIT) break;
            
            if (engine === 'pinterest') {
                const imgs = await scrapePinterest(page, kw, outDir, PINTEREST_LIMIT - allImages.length);
                allImages = allImages.concat(imgs);
            } else if (engine === 'unsplash') {
                const imgs = await scrapeUnsplash(page, kw, outDir, Math.min(UNSPLASH_LIMIT, PINTEREST_LIMIT - allImages.length));
                allImages = allImages.concat(imgs);
            } else if (engine === 'gemini') {
                while (allImages.length < PINTEREST_LIMIT) {
                    const generated = await generateGeminiImage(kw, richPrompt, outDir, allImages.length + 1);
                    if (!generated) break;
                    allImages.push(generated);
                }
            }
        }
        
        await page.close();
        
        results[kw] = allImages;
    }
    
    await browser.close();
    return results;
}

function parseArgs(args) {
    let engineOrder = null;
    const richPromptMap = {};
    const cleaned = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--engine-order') {
            engineOrder = args[i + 1].split(',').map(s => s.trim().toLowerCase());
            i++;
        } else if (args[i] === '--rich-prompt') {
            const arg = args[i + 1];
            if (arg) {
                const separator = arg.indexOf('::');
                if (separator !== -1) {
                    const keyword = arg.slice(0, separator).trim();
                    const prompt = arg.slice(separator + 2).trim();
                    if (keyword && prompt) {
                        richPromptMap[keyword] = prompt;
                    }
                }
            }
            i++; // skip the value
        } else {
            cleaned.push(args[i]);
        }
    }
    return { richPromptMap, cleaned, engineOrder };
}

if (require.main === module) {
    const rawArgs = process.argv.slice(2);
    const { richPromptMap, cleaned: args, engineOrder } = parseArgs(rawArgs);
    let topic = null;
    let keywords = [];

    // Parse --topic
    if (args.includes('--topic')) {
        const topicIdx = args.indexOf('--topic');
        topic = args[topicIdx + 1] || null;
    } else if (args.includes('-t')) {
        const topicIdx = args.indexOf('-t');
        topic = args[topicIdx + 1] || null;
    }

    // Parse --keywords (stop at the next flag)
    if (args.includes('--keywords')) {
        const kwIdx = args.indexOf('--keywords');
        keywords = [];
        for (let i = kwIdx + 1; i < args.length; i++) {
            if (args[i].startsWith('--')) break;
            keywords.push(args[i]);
        }
    } else {
        let tempArgs = [...args];
        if (topic) {
            const tIdx = tempArgs.indexOf('--topic');
            if (tIdx !== -1) {
                tempArgs.splice(tIdx, 2);
            } else {
                const tShortIdx = tempArgs.indexOf('-t');
                if (tShortIdx !== -1) {
                    tempArgs.splice(tShortIdx, 2);
                }
            }
        }
        keywords = tempArgs.filter(a => !a.startsWith('-'));
    }

    if (keywords.length === 0) {
        console.log('Usage: node scrape_images.js --topic "topic-name" --keywords "keyword1" "keyword2" [--rich-prompt "keyword1::rich prompt" --rich-prompt "keyword2::rich prompt"]');
        process.exit(1);
    }

    scrapeAll(topic, keywords, richPromptMap, engineOrder)
        .then(results => {
            console.log('\n📦 Final image manifest:');
            for (const [kw, paths] of Object.entries(results)) {
                console.log(`  [${kw}] -> ${paths.length} files`);
                for (const p of paths) {
                    console.log(`    - ${path.basename(p)}`);
                }
            }
        })
        .catch(err => {
            console.error('Fatal error during scraping:', err);
            process.exit(1);
        });
}
