# Minimal Corporate Template Skill Reference

This document provides template-specific instructions, layout codes, and HTML/CSS renderers for the `MINIMAL_CORPORATE` theme.

---

## 🎨 Design Theme Specification

- **Palette**: Clean off-white background `#F8F9FA`, card background `#FFFFFF`, deep corporate navy `#004080`, charcoal title text `#1A1A1A`, and slate body text `#555555`.
- **Borders**: Thin elegant borders `1px solid #E9ECEF` with soft `8px` rounded corners.
- **Typography**: Geometric display headers (`"Montserrat"`, sans-serif) paired with high-legibility body text (`"Inter"`, sans-serif).
- **Images**: Crisp, high-end stock photos, naturally lit, uncluttered.

---

## 📐 Layout Pools & Renderers

### 1. `COVER` (Title Slide)
```js
if (slide.layout === 'COVER' && config.template === 'MINIMAL_CORPORATE') {
    return `
    <div class="slide corp-minimal">
        <div class="corp-cover-accent"></div>
        <div class="corp-content flex-center">
            <h1 class="corp-cover-title">${slide.title}</h1>
            <div class="corp-cover-subtitle">${slide.subtitle || ''}</div>
            <div class="corp-cover-footer">${config.presenter} | ${config.date}</div>
        </div>
    </div>`;
}
```

### 2. `TOC` (Agenda Slide)
```js
if (slide.layout === 'TOC') {
    return `
    <div class="slide corp-minimal">
        <div class="corp-content">
            <div class="corp-badge">AGENDA</div>
            <h2 class="corp-title">${slide.title}</h2>
            <div class="corp-toc-grid">
                ${(slide.bullets || []).map((b, idx) => `
                <div class="corp-toc-item">
                    <div class="corp-toc-num">${String(idx + 1).padStart(2, '0')}</div>
                    <div class="corp-toc-text">${b}</div>
                </div>`).join('')}
            </div>
        </div>
    </div>`;
}
```

### 3. `BRIEF-EXPLAIN` (Split Description + Image)
```js
if (slide.layout === 'BRIEF-EXPLAIN') {
    return `
    <div class="slide corp-minimal">
        <div class="corp-content">
            <div class="corp-badge">OVERVIEW</div>
            <h2 class="corp-title">${slide.title}</h2>
            <div class="corp-brief-split">
                <div class="corp-brief-left">
                    <p class="corp-brief-lead">${slide.body || ''}</p>
                    <ul class="corp-bullets">
                        ${(slide.bullets || []).map(b => `<li>${b}</li>`).join('')}
                    </ul>
                </div>
                <div class="corp-brief-right">
                    ${slide.image ? `<img class="corp-split-img" src="${slide.image}">` : '<div class="corp-img-placeholder"></div>'}
                </div>
            </div>
        </div>
    </div>`;
}
```

### 4. `METRIC-ROW` (Key Stat Row)
```js
if (slide.layout === 'METRIC-ROW') {
    return `
    <div class="slide corp-minimal">
        <div class="corp-content">
            <div class="corp-badge">KEY METRICS</div>
            <h2 class="corp-title">${slide.title}</h2>
            <div class="corp-metrics-row">
                ${(slide.stats || []).map(s => `
                <div class="corp-metric-card">
                    <div class="corp-metric-num">${s.value}</div>
                    <div class="corp-metric-label">${s.label}</div>
                    ${s.description ? `<div class="corp-metric-desc">${s.description}</div>` : ''}
                </div>`).join('')}
            </div>
        </div>
    </div>`;
}
```

### 5. `SPLIT-COL` (Balanced Double Column)
```js
if (slide.layout === 'SPLIT-COL') {
    return `
    <div class="slide corp-minimal">
        <div class="corp-content">
            <div class="corp-badge">COMPARATIVE ANALYSIS</div>
            <h2 class="corp-title">${slide.title}</h2>
            <div class="corp-split-columns">
                <div class="corp-column-card">
                    <div class="corp-col-header">${slide.col1Title || 'OBJECTIVE A'}</div>
                    <ul class="corp-bullets">
                        ${(slide.col1Bullets || slide.bullets || []).slice(0, 3).map(b => `<li>${b}</li>`).join('')}
                    </ul>
                </div>
                <div class="corp-column-card">
                    <div class="corp-col-header">${slide.col2Title || 'OBJECTIVE B'}</div>
                    <ul class="corp-bullets">
                        ${(slide.col2Bullets || []).slice(0, 3).map(b => `<li>${b}</li>`).join('')}
                    </ul>
                </div>
            </div>
        </div>
    </div>`;
}
```

### 6. `DENSE-GRID` (Multi-card Grid)
```js
if (slide.layout === 'DENSE-GRID') {
    return `
    <div class="slide corp-minimal">
        <div class="corp-content">
            <div class="corp-badge">DETAILED BREAKDOWN</div>
            <h2 class="corp-title">${slide.title}</h2>
            <div class="corp-dense-grid">
                ${(slide.items || []).map(item => `
                <div class="corp-grid-card">
                    <div class="corp-grid-title">${item.heading || item.title}</div>
                    <div class="corp-grid-desc">${item.text || item.description}</div>
                </div>`).join('')}
            </div>
        </div>
    </div>`;
}
```

### 7. `TIMELINE-CLEAN` (Horizontal Milestones)
```js
if (slide.layout === 'TIMELINE-CLEAN') {
    return `
    <div class="slide corp-minimal">
        <div class="corp-content">
            <div class="corp-badge">MILESTONES</div>
            <h2 class="corp-title">${slide.title}</h2>
            <div class="corp-timeline">
                <div class="corp-timeline-line"></div>
                ${(slide.steps || []).map((step, idx) => `
                <div class="corp-timeline-node">
                    <div class="corp-node-dot"></div>
                    <div class="corp-node-year">${step.year || step.date || `PHASE ${idx + 1}`}</div>
                    <div class="corp-node-title">${step.heading || step.title}</div>
                    <div class="corp-node-desc">${step.text || step.description}</div>
                </div>`).join('')}
            </div>
        </div>
    </div>`;
}
```

### 8. `CLOSING-CLEAN` (Thank you Slide)
```js
if (slide.layout === 'CLOSING-CLEAN') {
    return `
    <div class="slide corp-minimal corp-closing-bg">
        <div class="corp-content flex-center">
            <h1 class="corp-closing-title">${slide.title}</h1>
            <p class="corp-closing-subtitle">${slide.subtitle || 'Thank you for your attention'}</p>
            <div class="corp-closing-line"></div>
            <div class="corp-closing-footer">${config.presenter} | ${config.date}</div>
        </div>
    </div>`;
}
```

---

## 🎨 Stylesheet Additions for Minimal Corporate

```css
/* Minimal Corporate Styles */
.corp-minimal {
    font-family: var(--font-body);
    background-color: #F8F9FA;
    color: #555555;
    position: relative;
    box-sizing: border-box;
}
.corp-content {
    padding: 60px 80px;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
}
.corp-cover-accent {
    position: absolute;
    top: 0; left: 0; right: 0; height: 6px;
    background: var(--primary);
}
.corp-cover-title {
    font-family: var(--font-display);
    font-size: 54px; font-weight: 700;
    color: #1A1A1A; line-height: 1.15;
    margin: 0; border: none; padding-left: 0;
    text-transform: none; letter-spacing: -0.5px;
}
.corp-cover-subtitle {
    font-family: var(--font-body);
    font-size: 20px; color: #555555;
    margin-top: 16px; font-weight: 400;
}
.corp-cover-footer {
    position: absolute; bottom: 50px;
    font-size: 13px; color: #888888;
    font-family: var(--font-body);
    letter-spacing: 0.5px;
}
.corp-badge {
    align-self: flex-start;
    font-family: var(--font-display);
    font-size: 11px; font-weight: 700;
    letter-spacing: 1.5px; color: var(--primary);
    background: rgba(0, 64, 128, 0.06);
    padding: 4px 10px; border-radius: 4px;
    margin-bottom: 12px;
}
.corp-title {
    font-family: var(--font-display);
    font-size: 32px; font-weight: 700;
    color: #1A1A1A; margin: 0 0 28px 0;
    border: none; padding-left: 0;
    text-transform: none; letter-spacing: -0.5px;
}
.corp-toc-grid {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-top: 10px;
}
.corp-toc-item {
    display: flex; gap: 16px; align-items: center;
    background: #FFFFFF; border: 1px solid #E9ECEF;
    padding: 20px; border-radius: 8px;
}
.corp-toc-num {
    font-family: var(--font-display);
    font-size: 20px; font-weight: 700;
    color: var(--primary);
}
.corp-toc-text {
    font-family: var(--font-body);
    font-size: 16px; font-weight: 600;
    color: #333333;
}
.corp-brief-split {
    display: flex; gap: 48px; height: 380px;
}
.corp-brief-left {
    flex: 1.2; display: flex; flex-direction: column; justify-content: center;
}
.corp-brief-lead {
    font-size: 18px; line-height: 1.6;
    color: #333333; margin: 0 0 16px 0;
}
.corp-bullets {
    list-style: none; padding: 0; margin: 0;
}
.corp-bullets li {
    position: relative; padding-left: 20px;
    font-size: 15px; line-height: 1.6;
    margin-bottom: 10px;
}
.corp-bullets li::before {
    content: ""; position: absolute; left: 0; top: 9px;
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--primary);
}
.corp-brief-right {
    flex: 0.8; border-radius: 8px; overflow: hidden;
    border: 1px solid #E9ECEF;
}
.corp-split-img {
    width: 100%; height: 100%; object-fit: cover;
}
.corp-img-placeholder {
    width: 100%; height: 100%; background: #F1F3F5;
}
.corp-metrics-row {
    display: flex; gap: 20px; height: 380px; align-items: center;
}
.corp-metric-card {
    flex: 1; background: #FFFFFF; border: 1px solid #E9ECEF;
    padding: 24px; border-radius: 8px;
    display: flex; flex-direction: column; gap: 8px;
}
.corp-metric-num {
    font-family: var(--font-display); font-size: 48px;
    font-weight: 700; color: var(--primary); line-height: 1;
}
.corp-metric-label {
    font-family: var(--font-display); font-size: 14px;
    font-weight: 700; color: #1A1A1A;
}
.corp-metric-desc {
    font-size: 13px; line-height: 1.5; color: #666666;
}
.corp-split-columns {
    display: flex; gap: 24px; height: 380px;
}
.corp-column-card {
    flex: 1; background: #FFFFFF; border: 1px solid #E9ECEF;
    padding: 28px; border-radius: 8px;
}
.corp-col-header {
    font-family: var(--font-display); font-size: 18px;
    font-weight: 700; color: #1A1A1A; margin-bottom: 16px;
    border-bottom: 2px solid var(--primary); padding-bottom: 8px;
}
.corp-dense-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; height: 380px;
}
.corp-grid-card {
    background: #FFFFFF; border: 1px solid #E9ECEF;
    padding: 20px; border-radius: 8px;
    display: flex; flex-direction: column; gap: 10px;
}
.corp-grid-title {
    font-family: var(--font-display); font-size: 16px;
    font-weight: 700; color: #1A1A1A;
}
.corp-grid-desc {
    font-size: 13px; line-height: 1.5; color: #666666;
}
.corp-timeline {
    position: relative; display: flex; gap: 20px; height: 380px;
    padding-top: 40px;
}
.corp-timeline-line {
    position: absolute; top: 48px; left: 0; right: 0; height: 2px;
    background: #E9ECEF; z-index: 1;
}
.corp-timeline-node {
    flex: 1; display: flex; flex-direction: column; gap: 12px;
    position: relative; z-index: 2;
}
.corp-node-dot {
    width: 16px; height: 16px; border-radius: 50%;
    background: #FFFFFF; border: 3px solid var(--primary);
    margin-bottom: 12px;
}
.corp-node-year {
    font-family: var(--font-display); font-size: 18px;
    font-weight: 700; color: var(--primary);
}
.corp-node-title {
    font-family: var(--font-display); font-size: 15px;
    font-weight: 700; color: #1A1A1A;
}
.corp-node-desc {
    font-size: 13px; line-height: 1.45; color: #666666;
}
.corp-closing-bg {
    background-color: #004080 !important;
    color: rgba(255, 255, 255, 0.7) !important;
}
.corp-closing-title {
    font-family: var(--font-display); font-size: 54px;
    font-weight: 700; color: #FFFFFF; border: none;
    padding-left: 0; text-align: center;
}
.corp-closing-subtitle {
    font-size: 20px; color: rgba(255, 255, 255, 0.8);
    margin-top: 12px;
}
.corp-closing-line {
    width: 80px; height: 2px; background: rgba(255,255,255,0.3);
    margin: 30px auto;
}
.corp-closing-footer {
    position: absolute; bottom: 50px; font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
}
```
