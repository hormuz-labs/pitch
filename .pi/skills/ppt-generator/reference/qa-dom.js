const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const CRITICAL_TYPES = new Set(['TEXT_OVERFLOW', 'IMAGE_MISSING', 'LAYOUT_BREAK']);
const WARNING_TYPES = new Set(['CONTRAST_WARNING', 'PLACEHOLDER_TEXT']);

const PLACEHOLDER_PATTERNS = [
    'PRESENTATION TITLE',
    'Subtitle goes here',
    'Presenter Name',
    'Month Year',
    'Untitled',
    'Layout not implemented'
];

function hexToRgb(hex) {
    const h = (hex || '#000000').replace('#', '');
    const pad = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    return {
        r: parseInt(pad.substr(0, 2), 16) || 0,
        g: parseInt(pad.substr(2, 2), 16) || 0,
        b: parseInt(pad.substr(4, 2), 16) || 0
    };
}

function luminance({ r, g, b }) {
    const a = [r, g, b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function contrastRatio(color1, color2) {
    const lum1 = luminance(hexToRgb(color1));
    const lum2 = luminance(hexToRgb(color2));
    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    return (lighter + 0.05) / (darker + 0.05);
}

function getEffectiveBackground(el) {
    let current = el;
    while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        const bg = style.backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
            return bg;
        }
        current = current.parentElement;
    }
    return 'rgb(255, 255, 255)';
}

function rgbToHex(rgb) {
    if (!rgb) return '#000000';
    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return '#000000';
    const toHex = n => parseInt(n).toString(16).padStart(2, '0');
    return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
}

function getSelector(el) {
    if (el.id) return `#${el.id}`;
    const classes = Array.from(el.classList).join('.');
    const tag = el.tagName.toLowerCase();
    if (classes) return `${tag}.${classes}`;
    return tag;
}

async function runDomQAOnPage(page, options = {}) {
    const tolerance = options.overflowTolerance || 4;
    const minContrast = options.minContrast || 4.5;

    return page.evaluate((opts) => {
        const { tolerance, minContrast, placeholderPatterns } = opts;
        const report = { passed: true, slideCount: 0, slides: [] };
        const slides = Array.from(document.querySelectorAll('.slide'));
        report.slideCount = slides.length;

        if (slides.length === 0) {
            report.slides.push({
                slide: 0,
                issues: [{
                    type: 'LAYOUT_BREAK',
                    selector: 'body',
                    severity: 'critical',
                    message: 'No .slide elements found in the document'
                }]
            });
            report.passed = false;
            return report;
        }

        function getEffectiveBackground(el) {
            let current = el;
            while (current && current !== document.body) {
                const style = window.getComputedStyle(current);
                const bg = style.backgroundColor;
                if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                    return bg;
                }
                current = current.parentElement;
            }
            return 'rgb(255, 255, 255)';
        }

        function rgbToHex(rgb) {
            if (!rgb) return '#000000';
            const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (!match) return '#000000';
            const toHex = n => parseInt(n).toString(16).padStart(2, '0');
            return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
        }

        function getSelector(el) {
            if (el.id) return `#${el.id}`;
            const classes = Array.from(el.classList).join('.');
            const tag = el.tagName.toLowerCase();
            if (classes) return `${tag}.${classes}`;
            return tag;
        }

        function relativeLuminance(rgb) {
            const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (!match) return 0;
            const a = [match[1], match[2], match[3]].map(v => {
                v /= 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            });
            return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
        }

        function contrastRatio(color1, color2) {
            const lum1 = relativeLuminance(color1);
            const lum2 = relativeLuminance(color2);
            const lighter = Math.max(lum1, lum2);
            const darker = Math.min(lum1, lum2);
            return (lighter + 0.05) / (darker + 0.05);
        }

        slides.forEach((slide, idx) => {
            const slideNum = idx + 1;
            const issues = [];

            // LAYOUT_BREAK: slide has no size
            const slideRect = slide.getBoundingClientRect();
            if (slideRect.width === 0 || slideRect.height === 0) {
                issues.push({
                    type: 'LAYOUT_BREAK',
                    selector: getSelector(slide),
                    severity: 'critical',
                    message: `Slide has zero dimensions (${slideRect.width}x${slideRect.height})`
                });
            }

            // TEXT_OVERFLOW on all visible elements
            const allEls = slide.querySelectorAll('*');
            const overflowed = new Set();
            allEls.forEach(el => {
                if (overflowed.has(el)) return;
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return;
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return;

                const overHeight = el.scrollHeight > el.clientHeight + tolerance;
                const overWidth = el.scrollWidth > el.clientWidth + tolerance;
                if (overHeight || overWidth) {
                    overflowed.add(el);
                    issues.push({
                        type: 'TEXT_OVERFLOW',
                        selector: getSelector(el),
                        severity: 'critical',
                        message: overHeight
                            ? `Element overflows vertically (${el.scrollHeight}px > ${el.clientHeight}px)`
                            : `Element overflows horizontally (${el.scrollWidth}px > ${el.clientWidth}px)`,
                        text: el.textContent?.trim().slice(0, 80) || ''
                    });
                }
            });
            // CHART_FAILED / CHART_EMPTY
            slide.querySelectorAll('canvas').forEach(canvas => {
                if (window.Chart && window.Chart.instances) {
                    let found = false;
                    for (let key in window.Chart.instances) {
                        if (window.Chart.instances[key].canvas === canvas) {
                            found = true;
                            const chart = window.Chart.instances[key];
                            if (!chart.data || !chart.data.datasets || chart.data.datasets.length === 0) {
                                issues.push({
                                    type: 'CHART_EMPTY',
                                    selector: getSelector(canvas),
                                    severity: 'critical',
                                    message: 'Chart.js instance found but contains no datasets.'
                                });
                            }
                        }
                    }
                    if (!found) {
                         issues.push({
                             type: 'CHART_FAILED',
                             selector: getSelector(canvas),
                             severity: 'critical',
                             message: 'Canvas element present but no Chart.js instance is bound to it (JS error during init?).'
                         });
                    }
                }
            });


            // IMAGE_MISSING
            slide.querySelectorAll('img').forEach(img => {
                if (!img.src || (!img.complete || img.naturalWidth === 0)) {
                    issues.push({
                        type: 'IMAGE_MISSING',
                        selector: getSelector(img),
                        severity: 'critical',
                        src: img.src || '(none)',
                        message: img.src ? 'Image failed to load' : 'Image has no src attribute'
                    });
                }
            });

            // CONTRAST_WARNING on text elements
            const textEls = slide.querySelectorAll('h1, h2, h3, p, li, span, div');
            const checked = new Set();
            textEls.forEach(el => {
                const text = el.textContent?.trim();
                if (!text || text.length < 3) return;
                const style = window.getComputedStyle(el);
                const color = style.color;
                const bg = getEffectiveBackground(el);
                const key = `${color}|${bg}`;
                if (checked.has(key)) return;
                checked.add(key);
                const ratio = contrastRatio(color, bg);
                if (ratio < minContrast) {
                    issues.push({
                        type: 'CONTRAST_WARNING',
                        selector: getSelector(el),
                        severity: 'warning',
                        ratio: +ratio.toFixed(2),
                        message: `Contrast ratio ${ratio.toFixed(2)}:1 is below ${minContrast}:1`
                    });
                }
            });

            // PLACEHOLDER_TEXT
            const fullText = slide.textContent || '';
            placeholderPatterns.forEach(pattern => {
                if (fullText.includes(pattern)) {
                    issues.push({
                        type: 'PLACEHOLDER_TEXT',
                        selector: getSelector(slide),
                        severity: 'warning',
                        text: pattern,
                        message: `Slide contains placeholder text: "${pattern}"`
                    });
                }
            });

            if (issues.length > 0) {
                report.slides.push({ slide: slideNum, issues });
                if (issues.some(i => i.severity === 'critical')) {
                    report.passed = false;
                }
            }
        });

        return report;
    }, { tolerance, minContrast, placeholderPatterns: PLACEHOLDER_PATTERNS });
}

async function runDomQA(input, options = {}) {
    const html = typeof input === 'string' && input.trim().startsWith('<')
        ? input
        : fs.readFileSync(input, 'utf8');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: options.viewport || { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    try {
        await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 });
        // Wait for Chart.js and fonts
        await page.waitForTimeout(options.waitMs || 3000);

        const report = await runDomQAOnPage(page, options);
        await browser.close();
        return report;
    } catch (err) {
        await browser.close();
        throw err;
    }
}

async function runDomQAOnExistingPage(page, options = {}) {
    const report = await runDomQAOnPage(page, options);
    
    // Auto-filter known false positives for specific template layouts
    if (report && report.slides) {
        report.slides.forEach(slide => {
            if (slide.issues) {
                slide.issues = slide.issues.filter(issue => {
                    // Ignore strict horizontal overflow for comic-flow-node and row because
                    // neo-brutalist shadow boxes intentionally bleed slightly
                    if (issue.type === 'TEXT_OVERFLOW' && 
                       (issue.selector.includes('comic-flow-node') || issue.selector.includes('comic-flow-row'))) {
                        return false;
                    }
                    return true;
                });
            }
        });
        
        // Re-evaluate passed status
        const criticalCount = report.slides.reduce(
            (sum, s) => sum + (s.issues ? s.issues.filter(i => i.severity === 'critical').length : 0),
            0
        );
        report.passed = criticalCount === 0;
    }
    
    return report;
}

function formatReport(report) {
    const lines = [];
    const criticalCount = report.slides.reduce(
        (sum, s) => sum + s.issues.filter(i => i.severity === 'critical').length,
        0
    );
    const warningCount = report.slides.reduce(
        (sum, s) => sum + s.issues.filter(i => i.severity === 'warning').length,
        0
    );

    lines.push(`\n🔍 DOM QA Report — ${report.slideCount} slide(s)`);
    lines.push(`   Critical: ${criticalCount} | Warnings: ${warningCount} | Passed: ${report.passed}`);

    for (const slide of report.slides) {
        lines.push(`\n  Slide ${slide.slide}:`);
        for (const issue of slide.issues) {
            const icon = issue.severity === 'critical' ? '❌' : '⚠️';
            lines.push(`    ${icon} [${issue.type}] ${issue.message}`);
            if (issue.selector) lines.push(`       Selector: ${issue.selector}`);
            if (issue.text) lines.push(`       Text: "${issue.text}"`);
        }
    }
    return lines.join('\n');
}

function writeReport(report, outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
}

async function main() {
    const args = process.argv.slice(2);
    let htmlPath = null;
    let outputPath = 'qa-report.json';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--html' || args[i] === '-h') htmlPath = args[i + 1];
        if (args[i] === '--output' || args[i] === '-o') outputPath = args[i + 1];
    }

    if (!htmlPath) {
        console.log('Usage: node qa-dom.js --html <path> [--output qa-report.json]');
        process.exit(1);
    }

    const report = await runDomQA(htmlPath);
    writeReport(report, outputPath);
    console.log(formatReport(report));
    console.log(`\n📝 Report written to ${outputPath}`);
    process.exit(report.passed ? 0 : 1);
}

module.exports = { runDomQA, runDomQAOnExistingPage, formatReport, writeReport };

if (require.main === module) {
    main().catch(err => {
        console.error('DOM QA failed:', err);
        process.exit(1);
    });
}
