/**
 * inject_template.js — Robust template injector (v2)
 *
 * Usage:
 *   node inject_template.js <base_builder_path> <skill_md_path> <output_path>
 *
 * What it does:
 *   1. Reads skill.md and extracts ALL ```js blocks in the "Layout Pools" section
 *      (between "## Layout Pools" and "## Stylesheet" headings).
 *   2. Extracts the LAST ```css block in the file (always the full stylesheet).
 *   3. Injects layouts right before the fallback handler in pdf-builder-template.js.
 *   4. Replaces the base renderChart() if the template provides its own.
 *   5. Injects CSS right before </style>.
 *
 * Robustness improvements over v1:
 *   - Section-aware extraction (not a single regex from first heading to first ---)
 *   - Uses the LAST css block (not the first match)
 *   - Hard-fails if layout code is empty (no silent fallback to broken slides)
 *   - Counts and reports extracted layout handlers for debugging
 *   - Normalizes line endings (CRLF → LF) before parsing
 */

'use strict';
const fs   = require('fs');
const path = require('path');

function injectTemplate(baseFile, skillMdFile, outputFile) {
    // ── Input validation ──────────────────────────────────────────────────────
    if (!fs.existsSync(baseFile)) {
        console.error(`ERROR: Base builder not found: ${baseFile}`);
        process.exit(1);
    }
    if (!fs.existsSync(skillMdFile)) {
        console.error(`ERROR: skill.md not found: ${skillMdFile}`);
        process.exit(1);
    }

    let baseCode = fs.readFileSync(baseFile, 'utf8').replace(/\r\n/g, '\n');
    const skillMd = fs.readFileSync(skillMdFile, 'utf8').replace(/\r\n/g, '\n');

    // ── Step 1: Extract JS layout blocks from "Layout Pools" section ──────────
    // Find the section header (supports emoji prefixes like "## 📐 Layout Pools")
    const layoutSectionRe = /^#{1,3}\s+(?:📐\s+)?Layout Pools[^\n]*/im;
    const layoutSectionMatch = skillMd.match(layoutSectionRe);

    let layoutsCode = '';
    if (layoutSectionMatch) {
        const sectionStart = skillMd.indexOf(layoutSectionMatch[0]);
        const afterSection = skillMd.slice(sectionStart);

        // Find where the stylesheet section begins (end of layout pools section)
        const stylesheetRe = /^#{1,3}\s+(?:🎨\s+)?Stylesheet/im;
        const stylesheetMatch = afterSection.match(stylesheetRe);
        const layoutSection = stylesheetMatch
            ? afterSection.slice(0, afterSection.indexOf(stylesheetMatch[0]))
            : afterSection;

        // Extract ALL ```js blocks within the layout section
        const jsBlocks = [...layoutSection.matchAll(/```js\n([\s\S]*?)```/g)];
        layoutsCode = jsBlocks.map(m => m[1]).join('\n');
        console.log(`[inject] Found Layout Pools section: extracted ${jsBlocks.length} JS block(s)`);
    } else {
        // Fallback: extract ALL ```js blocks from the entire file
        const jsBlocks = [...skillMd.matchAll(/```js\n([\s\S]*?)```/g)];
        layoutsCode = jsBlocks.map(m => m[1]).join('\n');
        console.warn(`[inject] Warning: "Layout Pools" section not found. ` +
            `Fell back to extracting ALL ${jsBlocks.length} JS blocks from file.`);
    }

    // Hard-fail if nothing extracted — prevents silent "Layout not implemented" breakage
    if (!layoutsCode.trim()) {
        console.error('[inject] ERROR: Zero JS code extracted from skill.md. ' +
            'Check that the skill.md has ```js code blocks in the Layout Pools section.');
        process.exit(1);
    }

    const handlerCount = (layoutsCode.match(/if\s*\(slide\.layout\s*===/g) || []).length;
    console.log(`[inject] Layout handlers detected: ${handlerCount}`);

    // ── Step 2: Extract CSS — always use the LAST ```css block ───────────────
    const cssBlocks = [...skillMd.matchAll(/```css\n([\s\S]*?)```/g)];
    let cssCode = '';
    if (cssBlocks.length > 0) {
        cssCode = cssBlocks[cssBlocks.length - 1][1]; // last block = full stylesheet
        console.log(`[inject] Found ${cssBlocks.length} CSS block(s), using the last one ` +
            `(${cssCode.split('\n').length} lines)`);
    } else {
        console.warn('[inject] Warning: No CSS blocks found in skill.md. ' +
            'Template will use base styles only.');
    }

    // ── Step 3: Inject layouts before the fallback handler ───────────────────
    const FALLBACK = 'return `<div class="slide"><div class="content"><h1>${slide.title}</h1>' +
        '<p>Layout ${slide.layout} not implemented</p></div></div>`;';

    if (!baseCode.includes(FALLBACK)) {
        console.error('[inject] ERROR: Fallback sentinel string not found in base builder. ' +
            'The pdf-builder-template.js may have been modified. Update FALLBACK string in inject_template.js.');
        process.exit(1);
    }

    baseCode = baseCode.replace(FALLBACK, layoutsCode + '\n        ' + FALLBACK);
    console.log('[inject] Layout code injected before fallback handler ✓');

    // ── Step 4: Replace base renderChart() if template provides its own ───────
    if (layoutsCode.includes('function renderChart(')) {
        // Remove the base renderChart from "let _chartSeq = 0;" up to and including
        // the closing brace of the function (ends with the return `...` line + "}")
        const chartFnRe = /let _chartSeq = 0;\s*\nfunction renderChart\([\s\S]*?<\\\/script>`;\s*\n}/m;
        if (chartFnRe.test(baseCode)) {
            baseCode = baseCode.replace(chartFnRe, '');
            console.log('[inject] Base renderChart() replaced with template-specific version ✓');
        } else {
            console.warn('[inject] Warning: Template has renderChart() but base function pattern not matched. ' +
                'Both may coexist — the template version will shadow the base via closure.');
        }
    }

    // ── Step 5: Inject CSS before </style> ───────────────────────────────────
    if (cssCode) {
        const STYLE_CLOSE = '</style>';
        if (!baseCode.includes(STYLE_CLOSE)) {
            console.error('[inject] ERROR: </style> sentinel not found in base builder.');
            process.exit(1);
        }
        const header = `/* ── Template Injected Styles (${path.basename(skillMdFile)}) ── */\n`;
        baseCode = baseCode.replace(STYLE_CLOSE, header + cssCode + '\n        ' + STYLE_CLOSE);
        console.log('[inject] Template CSS injected before </style> ✓');
    }

    // ── Step 6: Write output ──────────────────────────────────────────────────
    fs.writeFileSync(outputFile, baseCode, 'utf8');
    console.log(`\n✅ inject_template: ${path.basename(skillMdFile)} → ${outputFile}`);
    console.log(`   ${handlerCount} layout handler(s) injected`);
    console.log(`   ${cssCode.split('\n').length} CSS lines injected`);
}

// ── CLI entry ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length < 3) {
    console.error('Usage: node inject_template.js <base_builder_path> <skill_md_path> <output_path>');
    process.exit(1);
}

injectTemplate(args[0], args[1], args[2]);
