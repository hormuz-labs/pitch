# Dark Tech / Neon Glow Template Skill Reference

This document provides template-specific instructions, layout codes, and HTML/CSS renderers for the `DARK_TECH` theme.

---

## 🎨 Design Theme Specification

- **Palette**: Slate-900 `#0F172A`, Slate-800 card `#1E293B`, neon cyan `#06B6D4`, neon green `#10B981`, and secondary text slate `#94A3B8`.
- **Borders**: Sharp `2px solid #334155` with tech glows (`box-shadow: 0 0 15px rgba(6, 182, 212, 0.15)`).
- **Typography**: Industrial-grade monospaced text (`"Share Tech Mono"`, `"JetBrains Mono"`) for cyberpunk terminal aesthetic.
- **Images**: Treated with high contrast blue/cyan tint filter: `grayscale(100%) brightness(0.8) contrast(1.5) sepia(10%) hue-rotate(150deg);`.

---

## 📐 Layout Pools & Renderers

### 1. `TECH-COVER` (Cyber Cover)
```js
if (slide.layout === 'TECH-COVER') {
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content flex-center">
            <div class="terminal-header">[ SYSTEM INTAKE ACTIVE ]</div>
            <h1 class="tech-cover-title">${slide.title}</h1>
            <div class="tech-cover-subtitle">> ${slide.subtitle || ''}</div>
            <div class="tech-cover-footer">HOST: ${config.presenter} // TIMESTAMP: ${config.date}</div>
        </div>
    </div>`;
}
```

### 2. `DASHBOARD-GLANCE` (Overview Dashboard)
```js
if (slide.layout === 'DASHBOARD-GLANCE') {
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content">
            <div class="tech-badge">SYS.OVERVIEW</div>
            <h2 class="tech-title">// ${slide.title}</h2>
            <div class="tech-dashboard-grid">
                <div class="tech-dash-left">
                    ${slide.image ? `<img class="tech-dash-img" src="${slide.image}">` : '<div class="tech-img-placeholder"></div>'}
                </div>
                <div class="tech-dash-right">
                    <div class="terminal-box">
                        <div class="terminal-bar"><span class="term-dot"></span><span class="term-dot"></span><span class="term-dot"></span></div>
                        <ul class="tech-list">
                            ${(slide.bullets || []).map(b => `<li><span class="tech-prompt">></span> ${b}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}
```

### 3. `METRIC-GLOW` (Glowing Metric Cards)
```js
if (slide.layout === 'METRIC-GLOW') {
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content">
            <div class="tech-badge">SYS.TELEMETRY</div>
            <h2 class="tech-title">// ${slide.title}</h2>
            <div class="tech-metrics-row">
                ${(slide.stats || []).map(s => `
                <div class="tech-metric-card">
                    <div class="tech-metric-glow-bar"></div>
                    <div class="tech-metric-num">${s.value}</div>
                    <div class="tech-metric-label">&lt; ${s.label} &gt;</div>
                    ${s.description ? `<div class="tech-metric-desc">${s.description}</div>` : ''}
                </div>`).join('')}
            </div>
        </div>
    </div>`;
}
```

### 4. `GLOW-PANEL` (Double Column Panel Layout)
```js
if (slide.layout === 'GLOW-PANEL') {
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content">
            <div class="tech-badge">SYS.MODULES</div>
            <h2 class="tech-title">// ${slide.title}</h2>
            <div class="tech-panels-split">
                <div class="tech-panel-card">
                    <div class="tech-panel-header">&lt; MODULE_01 // INTENT &gt;</div>
                    <p class="tech-panel-text">${slide.body || ''}</p>
                </div>
                <div class="tech-panel-card card-accent-glow">
                    <div class="tech-panel-header color-accent">&lt; MODULE_02 // PARAMS &gt;</div>
                    <ul class="tech-list">
                        ${(slide.bullets || []).map(b => `<li><span class="tech-prompt">></span> ${b}</li>`).join('')}
                    </ul>
                </div>
            </div>
        </div>
    </div>`;
}
```

### 5. `CODE-SPLIT` (Code Block / Detail split)
```js
if (slide.layout === 'CODE-SPLIT') {
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content">
            <div class="tech-badge">SYS.CODE_EXEC</div>
            <h2 class="tech-title">// ${slide.title}</h2>
            <div class="tech-code-split">
                <div class="code-terminal">
                    <div class="terminal-bar"><span class="term-dot"></span><span class="term-dot"></span><span class="term-dot"></span></div>
                    <pre><code>${slide.codeSnippet || '// Run script:\n$ npm run deploy\n> deploy: ok\n> status: listening :3000\n> memory: 42MB'}</code></pre>
                </div>
                <div class="code-explain">
                    <ul class="tech-list">
                        ${(slide.bullets || []).map(b => `<li><span class="tech-prompt">></span> ${b}</li>`).join('')}
                    </ul>
                </div>
            </div>
        </div>
    </div>`;
}
```

### 6. `FLOW-STEPS` (Tech Pipeline / Workflow)
```js
if (slide.layout === 'FLOW-STEPS') {
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content">
            <div class="tech-badge">SYS.PIPELINE</div>
            <h2 class="tech-title">// ${slide.title}</h2>
            <div class="tech-pipeline-row">
                ${(slide.steps || []).map((step, idx) => `
                <div class="tech-pipeline-node">
                    <div class="node-index">#0${idx + 1}</div>
                    <div class="node-arrow-glow"></div>
                    <div class="node-heading">${step.heading || step.title}</div>
                    <div class="node-text">${step.text || step.description}</div>
                </div>`).join('')}
            </div>
        </div>
    </div>`;
}
```

### 7. `TECH-CLOSING` (Terminal Shutdown CTA)
```js
if (slide.layout === 'TECH-CLOSING') {
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content flex-center">
            <div class="closing-box">
                <h1 class="tech-closing-title">${slide.title}</h1>
                <p class="tech-closing-subtitle">> ${slide.subtitle || 'Connection closed.'}</p>
                <div class="closing-bracket">[ LOGOUT COMPLETE ]</div>
            </div>
        </div>
    </div>`;
}
```

---

## 🎨 Stylesheet Additions for Dark Tech

```css
/* Dark Tech Terminal Styles */
.tech-glow {
    font-family: var(--font-body);
    background-color: #0F172A;
    color: #94A3B8;
    position: relative;
    box-sizing: border-box;
}
.bg-dark-slate {
    background-color: #0F172A !important;
}
.tech-grid-lines {
    position: absolute;
    top: 0; left: 0; width: 100%; height: 100%;
    z-index: 1; pointer-events: none; opacity: 0.03;
    background-size: 30px 30px;
    background-image: linear-gradient(to right, #06B6D4 1px, transparent 1px),
                      linear-gradient(to bottom, #06B6D4 1px, transparent 1px);
}
.tech-content {
    padding: 60px 80px;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    z-index: 5; position: relative;
}
.terminal-header {
    font-family: var(--font-display);
    color: var(--primary);
    font-size: 14px; letter-spacing: 2px;
    margin-bottom: 20px;
}
.tech-cover-title {
    font-family: var(--font-display);
    font-size: 54px; font-weight: 700;
    color: #FFFFFF; line-height: 1.1;
    margin: 0; border: none; padding-left: 0;
    text-transform: uppercase; letter-spacing: -1px;
}
.tech-cover-subtitle {
    font-family: var(--font-body);
    font-size: 18px; color: var(--accent);
    margin-top: 20px;
}
.tech-cover-footer {
    position: absolute; bottom: 50px;
    font-size: 12px; color: #475569;
    font-family: var(--font-display);
    letter-spacing: 1px;
}
.tech-badge {
    align-self: flex-start;
    font-family: var(--font-display);
    font-size: 12px; font-weight: 700;
    letter-spacing: 2px; color: var(--primary);
    border: 1px dashed var(--primary);
    padding: 3px 8px; border-radius: 4px;
    margin-bottom: 16px;
}
.tech-title {
    font-family: var(--font-display);
    font-size: 30px; font-weight: 700;
    color: #FFFFFF; margin: 0 0 24px 0;
    border: none; padding-left: 0;
    text-transform: uppercase; letter-spacing: -0.5px;
}
.tech-dashboard-grid {
    display: flex; gap: 40px; height: 380px;
}
.tech-dash-left {
    flex: 1; border: 2px solid #334155; overflow: hidden; border-radius: 6px;
    box-shadow: 0 0 15px rgba(6, 182, 212, 0.1);
}
.tech-dash-img {
    width: 100%; height: 100%; object-fit: cover;
    filter: grayscale(100%) brightness(0.8) contrast(1.5) sepia(10%) hue-rotate(150deg);
}
.tech-img-placeholder {
    width: 100%; height: 100%; background: #1E293B;
}
.tech-dash-right {
    flex: 1.2; display: flex; flex-direction: column;
}
.terminal-box {
    background: #020617; border: 2px solid #334155; border-radius: 6px;
    flex: 1; padding: 20px; display: flex; flex-direction: column;
}
.terminal-bar {
    display: flex; gap: 6px; margin-bottom: 16px; border-bottom: 1px solid #1E293B;
    padding-bottom: 8px;
}
.term-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #334155;
}
.tech-list {
    list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 14px;
}
.tech-list li {
    font-family: var(--font-body); font-size: 15px; line-height: 1.5; color: #94A3B8;
    padding-left: 0 !important; margin-bottom: 0 !important;
}
.tech-list li::before {
    display: none !important;
}
.tech-prompt {
    color: var(--accent); font-weight: bold; margin-right: 8px;
}
.tech-metrics-row {
    display: flex; gap: 20px; height: 380px; align-items: center;
}
.tech-metric-card {
    flex: 1; background: #1E293B; border: 2px solid #334155;
    padding: 24px; border-radius: 6px; position: relative;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    display: flex; flex-direction: column; gap: 8px;
}
.tech-metric-glow-bar {
    position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: var(--primary); box-shadow: 0 0 10px var(--primary);
}
.tech-metric-num {
    font-family: var(--font-display); font-size: 44px;
    color: var(--primary); line-height: 1; text-shadow: 0 0 10px rgba(6, 182, 212, 0.3);
}
.tech-metric-label {
    font-family: var(--font-display); font-size: 13px; color: #FFFFFF;
}
.tech-metric-desc {
    font-size: 12px; line-height: 1.5; color: #64748B;
}
.tech-panels-split {
    display: flex; gap: 24px; height: 380px;
}
.tech-panel-card {
    flex: 1; background: #1E293B; border: 2px solid #334155;
    padding: 28px; border-radius: 6px;
}
.card-accent-glow {
    border-color: var(--accent) !important;
    box-shadow: 0 0 15px rgba(16, 185, 129, 0.1);
}
.tech-panel-header {
    font-family: var(--font-display); font-size: 15px;
    color: var(--primary); margin-bottom: 20px; border-bottom: 1px dashed #334155;
    padding-bottom: 10px;
}
.color-accent {
    color: var(--accent) !important;
}
.tech-panel-text {
    font-size: 14px; line-height: 1.6; color: #94A3B8; margin: 0;
}
.tech-code-split {
    display: flex; gap: 24px; height: 380px;
}
.code-terminal {
    flex: 1.2; background: #020617; border: 2px solid #334155; border-radius: 6px;
    padding: 20px; display: flex; flex-direction: column; overflow: hidden;
}
.code-terminal pre {
    margin: 0; flex: 1; overflow: auto;
}
.code-terminal code {
    font-family: var(--font-body); font-size: 13px; color: var(--accent); line-height: 1.5;
}
.code-explain {
    flex: 0.8; display: flex; align-items: center;
}
.tech-pipeline-row {
    display: flex; gap: 20px; height: 380px; padding-top: 40px;
}
.tech-pipeline-node {
    flex: 1; display: flex; flex-direction: column; gap: 12px; position: relative;
}
.node-index {
    font-family: var(--font-display); font-size: 13px; color: var(--accent);
}
.node-arrow-glow {
    height: 3px; background: #334155; margin-bottom: 12px; position: relative;
}
.tech-pipeline-node:not(:last-child) .node-arrow-glow::after {
    content: ""; position: absolute; right: -8px; top: -4px;
    border-top: 6px solid transparent; border-bottom: 6px solid transparent;
    border-left: 8px solid var(--accent);
}
.node-heading {
    font-family: var(--font-display); font-size: 15px; font-weight: bold; color: #FFFFFF;
}
.closing-box {
    text-align: center; border: 2px dashed var(--primary); padding: 50px 80px;
    background: #020617; border-radius: 6px;
    box-shadow: 0 0 20px rgba(6, 182, 212, 0.15);
}
.tech-closing-title {
    font-family: var(--font-display); font-size: 48px; color: #FFFFFF;
    margin: 0 0 16px 0 !important; border: none; padding-left: 0; text-transform: uppercase;
}
.tech-closing-subtitle {
    font-family: var(--font-body); font-size: 18px; color: var(--accent); margin: 0 0 30px 0;
}
.closing-bracket {
    font-family: var(--font-display); font-size: 13px; color: #475569;
}
```
