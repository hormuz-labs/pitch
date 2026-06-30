const fs = require('fs');
const path = require('path');

function injectTemplate(baseFile, skillMdFile, outputFile) {
    if (!fs.existsSync(baseFile) || !fs.existsSync(skillMdFile)) {
        console.error("Missing input files.");
        process.exit(1);
    }

    let baseCode = fs.readFileSync(baseFile, 'utf8');
    const skillMd = fs.readFileSync(skillMdFile, 'utf8');

    // Extract Layout Code (everything between "### Chart Helper" or "### 1. " and the next "---")
    const layoutsMatch = skillMd.match(/### (?:Chart Helper|1\.\s.*?)\n([\s\S]*?)---/);
    let layoutsCode = "";
    if (layoutsMatch) {
        const jsBlocks = [...layoutsMatch[1].matchAll(/```js\n([\s\S]*?)```/g)];
        layoutsCode = jsBlocks.map(match => match[1]).join('\n');
    } else {
        console.warn("Could not find layout renderers in skill.md");
    }

    // Extract CSS Code
    const cssMatch = skillMd.match(/\/\*.*?Styles.*?\*\/\n([\s\S]*?)```/i);
    let cssCode = "";
    if (cssMatch) {
        cssCode = cssMatch[1];
    } else {
        // Fallback for CSS matching
        const fallbackCssMatch = skillMd.match(/```css\n([\s\S]*?)```/);
        if (fallbackCssMatch) {
            cssCode = fallbackCssMatch[1];
        } else {
            console.warn("Could not find CSS block in skill.md");
        }
    }

    // Inject layouts right before the fallback string in base builder
    const fallbackStr = 'return `<div class="slide"><div class="content"><h1>${slide.title}</h1><p>Layout ${slide.layout} not implemented</p></div></div>`;';
    baseCode = baseCode.replace(fallbackStr, layoutsCode + "\n        " + fallbackStr);

    // Remove the base renderChart function if the template injects its own
    if (layoutsCode.includes('function renderChart')) {
        baseCode = baseCode.replace(/let _chartSeq = 0;\nfunction renderChart[\s\S]*?<\/script>`;\n}/m, '');
    }

    // Inject CSS right before </style>
    baseCode = baseCode.replace('</style>', `/* Template Injected Styles */\n${cssCode}\n        </style>`);

    fs.writeFileSync(outputFile, baseCode, 'utf8');
    console.log(`Successfully injected template layouts and CSS into ${outputFile}`);
}

const args = process.argv.slice(2);
if (args.length < 3) {
    console.error("Usage: node inject_template.js <base_builder_path> <skill_md_path> <output_path>");
    process.exit(1);
}

injectTemplate(args[0], args[1], args[2]);
