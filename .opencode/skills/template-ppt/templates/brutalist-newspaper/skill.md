# Brutalist Newspaper Template Skill Reference

This document provides template-specific instructions, layout codes, and HTML/CSS renderers for the `BRUTALIST_NEWSPAPER` theme.

---

## 🎨 Design Theme Specification

- **Palette**: Vintage newspaper stock `#F3EFE0`, slate ink `#111111`, primary pop `#CC2222` (maximum ONE usage per slide), and panel tint `#EAE6D5`.
- **Borders**: Sharp `3px solid #111111`. No rounded corners (`border-radius: 0px`).
- **Typography**: Display serif titles (`"IBM Plex Serif"`, Georgia) paired with clean grotesque body text (`"IBM Plex Sans"`, `"Microsoft YaHei"`) and monospaced labels (`"Courier New"`).
- **Images**: Apply halftone/high-contrast newsprint effect: `filter: grayscale(100%) contrast(1.4) brightness(0.95);`.

---

## 📐 Layout Pools & Renderers

Use these layout codes in the slide JSON. The renderers below must be copy-pasted directly into `pdf-builder.js` for PDF generation:

### 1. `NEWSPAPER-COVER` (Slide 1 Cover)
```js
if (slide.layout === 'NEWSPAPER-COVER') {
    return `
    <div class="slide brutalist-editorial">
        <!-- Vintage Halftone Grain Background -->
        <div class="news-grain"></div>
        <div class="news-header">
            <div class="header-left">VOL. CXXVI... No. 42,910</div>
            <div class="header-center">THE DAILY FORECAST</div>
            <div class="header-right">PRICE $1.50</div>
        </div>
        <div class="news-main-title-container">
            <h1 class="news-mega-title">${slide.title}</h1>
        </div>
        <div class="news-hero-section">
            <div class="news-hero-left">
                <p class="editorial-lead">${slide.subtitle || ''}</p>
                <div class="news-author">Reported by ${config.presenter} on ${config.date}</div>
            </div>
            <div class="news-hero-right">
                ${slide.image ? `<img class="news-hero-img" src="${slide.image}">` : '<div class="news-img-placeholder"></div>'}
            </div>
        </div>
    </div>`;
}
```

### 2. `GLANCE` (Overview/Summary or Agenda)
```js
if (slide.layout === 'GLANCE') {
    return `
    <div class="slide brutalist-editorial">
        <div class="news-grain"></div>
        <div class="section-tag">AT A GLANCE / SECTION BRIEF</div>
        <h2 class="slide-title-brutalist">${slide.title}</h2>
        <div class="glance-columns">
            <div class="glance-col-left">
                ${slide.image ? `<img class="glance-img" src="${slide.image}">` : '<div class="news-img-placeholder"></div>'}
            </div>
            <div class="glance-col-right">
                <ul class="brutalist-list">
                    ${(slide.bullets || []).map(b => `<li><span class="bullet-tag">◆</span> ${b}</li>`).join('')}
                </ul>
            </div>
        </div>
    </div>`;
}
```

### 3. `DATA-TABLE` (Statistics / KPI Bulletins)
```js
if (slide.layout === 'DATA-TABLE') {
    return `
    <div class="slide brutalist-editorial">
        <div class="news-grain"></div>
        <div class="section-tag">STATISTICAL BULLETIN</div>
        <h2 class="slide-title-brutalist">${slide.title}</h2>
        <div class="stats-table-container">
            ${(slide.stats || []).map(s => `
            <div class="stats-table-row">
                <div class="stat-big-val">${s.value}</div>
                <div class="stat-labels-col">
                    <div class="stat-row-label">${s.label}</div>
                    ${s.description ? `<div class="stat-row-desc">${s.description}</div>` : ''}
                </div>
            </div>`).join('')}
        </div>
    </div>`;
}
```

### 4. `SPLIT-PANEL` (Topic Explanatory)
```js
if (slide.layout === 'SPLIT-PANEL') {
    return `
    <div class="slide brutalist-editorial">
        <div class="news-grain"></div>
        <div class="section-tag">SPECIAL FOCUS</div>
        <h2 class="slide-title-brutalist">${slide.title}</h2>
        <div class="split-panel-grid">
            <div class="panel-desc">
                <p class="panel-para">${slide.body || ''}</p>
                <ul class="panel-sub-list">
                    ${(slide.bullets || []).map(b => `<li>• ${b}</li>`).join('')}
                </ul>
            </div>
            <div class="panel-visual">
                ${slide.image ? `<img class="panel-img" src="${slide.image}">` : '<div class="news-img-placeholder"></div>'}
            </div>
        </div>
    </div>`;
}
```

### 5. `QUOTE-STAMP` (Expert Opinion / Focus Statement)
```js
if (slide.layout === 'QUOTE-STAMP') {
    return `
    <div class="slide brutalist-editorial flex-center-brutalist">
        <div class="news-grain"></div>
        <div class="quote-stamp-box">
            <div class="quote-large-mark">“</div>
            <p class="quote-text-brutalist">${slide.quote || slide.body || ''}</p>
            ${slide.author ? `<div class="quote-author-brutalist">— ${slide.author}</div>` : ''}
        </div>
    </div>`;
}
```

### 6. `DENSE-LIST` (Detailed Concept Breakdown)
```js
if (slide.layout === 'DENSE-LIST') {
    return `
    <div class="slide brutalist-editorial">
        <div class="news-grain"></div>
        <div class="section-tag">INVESTIGATIVE BREAKDOWN</div>
        <h2 class="slide-title-brutalist">${slide.title}</h2>
        <div class="dense-list-grid">
            ${(slide.items || []).map((item, idx) => `
            <div class="dense-list-card">
                <div class="card-num">${String(idx + 1).padStart(2, '0')}</div>
                <div class="card-title">${item.heading || item.title}</div>
                <div class="card-desc">${item.text || item.description}</div>
            </div>`).join('')}
        </div>
    </div>`;
}
```

### 7. `TIMELINE-GRID` (Milestones / Chronology)
```js
if (slide.layout === 'TIMELINE-GRID') {
    return `
    <div class="slide brutalist-editorial">
        <div class="news-grain"></div>
        <div class="section-tag">CHRONOLOGICAL DISPATCH</div>
        <h2 class="slide-title-brutalist">${slide.title}</h2>
        <div class="timeline-row">
            ${(slide.steps || []).map((step, idx) => `
            <div class="timeline-node">
                <div class="node-year">${step.year || step.date || `PHASE ${idx + 1}`}</div>
                <div class="node-heading">${step.heading || step.title}</div>
                <div class="node-text">${step.text || step.description}</div>
            </div>`).join('')}
        </div>
    </div>`;
}
```

### 8. `CLOSING-EDITORIAL` (Last Slide CTA)
```js
if (slide.layout === 'CLOSING-EDITORIAL') {
    return `
    <div class="slide brutalist-editorial flex-center-brutalist bg-black-editorial">
        <div class="news-grain"></div>
        <div class="closing-card-brutalist">
            <h1 class="closing-title">${slide.title}</h1>
            <p class="closing-subtitle">${slide.subtitle || 'End of Dispatch'}</p>
            <div class="closing-border-line"></div>
            <div class="closing-contact">${config.presenter} | ${config.date}</div>
        </div>
    </div>`;
}
```

---

## 🎨 Stylesheet Additions for Brutalist Newspaper

Include the following CSS classes in the HTML template styles under the brutalist stylesheet block:

```css
/* Brutalist Editorial Styles */
.brutalist-editorial {
    font-family: var(--font-body);
    color: #111111;
    background-color: #F3EFE0;
    box-sizing: border-box;
}
.bg-black-editorial {
    background-color: #111111 !important;
    color: #F3EFE0 !important;
}
.news-grain {
    position: absolute;
    top: 0; left: 0; width: 100%; height: 100%;
    z-index: 1; pointer-events: none; opacity: 0.04;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
}
.news-header {
    position: absolute;
    top: 30px; left: 60px; right: 60px;
    display: flex; justify-content: space-between;
    border-bottom: 2px solid #111111;
    font-family: "Courier New", monospace;
    font-size: 13px; font-weight: bold;
    padding-bottom: 6px; z-index: 5;
}
.news-mega-title {
    font-family: var(--font-display);
    font-size: 58px; font-weight: 900;
    text-transform: uppercase;
    letter-spacing: -1.5px;
    border: none !important;
    padding-left: 0 !important;
    margin: 0 !important;
    line-height: 0.95;
    text-align: center;
}
.news-main-title-container {
    margin-top: 55px;
    padding-top: 15px; padding-bottom: 12px;
    border-bottom: 4px double #111111;
    z-index: 5; position: relative;
}
.news-hero-section {
    display: flex; gap: 40px; margin-top: 30px; height: 380px; z-index: 5; position: relative;
}
.news-hero-left {
    flex: 1.2; display: flex; flex-direction: column; justify-content: space-between;
}
.editorial-lead {
    font-family: var(--font-title);
    font-size: 26px; line-height: 1.25;
    font-style: italic; color: #222222;
    margin: 0;
}
.news-author {
    font-family: "Courier New", monospace;
    font-size: 13px; font-weight: bold;
    border-top: 2px solid #111111;
    padding-top: 12px; margin-top: 20px;
}
.news-hero-right {
    flex: 1; border: 3px solid #111111; overflow: hidden;
}
.news-hero-img {
    width: 100%; height: 100%; object-fit: cover;
    filter: grayscale(100%) contrast(1.4) brightness(0.95);
}
.news-img-placeholder {
    width: 100%; height: 100%; background: #EAE6D5;
}
.section-tag {
    position: absolute; top: 40px; left: 72px;
    font-family: "Courier New", monospace;
    font-size: 13px; font-weight: bold;
    border: 1px solid #111111;
    padding: 3px 8px; background: #CC2222; color: #F3EFE0;
}
.slide-title-brutalist {
    margin-top: 10px; margin-bottom: 30px;
    font-family: var(--font-title); font-size: 38px;
    font-weight: 800; border: none !important;
    padding-left: 0 !important; line-height: 1.1;
    text-transform: none; letter-spacing: -0.5px;
    border-bottom: 2px solid #111111 !important;
    padding-bottom: 10px !important;
}
.glance-columns {
    display: flex; gap: 40px; height: 380px;
}
.glance-col-left {
    flex: 1; border: 3px solid #111111; overflow: hidden;
}
.glance-img {
    width: 100%; height: 100%; object-fit: cover;
    filter: grayscale(100%) contrast(1.4) brightness(0.95);
}
.glance-col-right {
    flex: 1.2; display: flex; align-items: center;
}
.brutalist-list {
    margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 16px;
}
.brutalist-list li {
    font-family: var(--font-body); font-size: 21px; line-height: 1.4;
    padding-left: 0 !important; margin-bottom: 0 !important;
}
.brutalist-list li::before {
    display: none !important;
}
.bullet-tag {
    color: #CC2222; font-size: 18px; margin-right: 8px;
}
.stats-table-container {
    display: flex; flex-direction: column; border-top: 3px solid #111111; height: 380px; overflow: hidden;
}
.stats-table-row {
    flex: 1; display: flex; border-bottom: 2px solid #111111; align-items: center;
}
.stats-table-row:last-child {
    border-bottom: none;
}
.stat-big-val {
    width: 250px; font-family: var(--font-display); font-size: 76px;
    font-weight: 900; color: #CC2222; text-align: left;
    letter-spacing: -2px; border-right: 3px solid #111111;
    padding-right: 20px; line-height: 1;
}
.stat-labels-col {
    padding-left: 30px; display: flex; flex-direction: column; gap: 6px;
}
.stat-row-label {
    font-family: var(--font-title); font-size: 24px; font-weight: bold; color: #111111;
}
.stat-row-desc {
    font-family: var(--font-body); font-size: 16px; color: #444444; line-height: 1.4;
}
.split-panel-grid {
    display: flex; gap: 40px; height: 385px;
}
.panel-desc {
    flex: 1.1; display: flex; flex-direction: column; gap: 16px; justify-content: center;
}
.panel-para {
    font-family: var(--font-title); font-size: 22px; line-height: 1.4; font-style: italic; margin: 0;
}
.panel-sub-list {
    list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px;
}
.panel-sub-list li {
    font-family: var(--font-body); font-size: 17px; line-height: 1.4; color: #333333;
    padding-left: 0 !important; margin-bottom: 0 !important;
}
.panel-sub-list li::before {
    display: none !important;
}
.panel-visual {
    flex: 0.9; border: 3px solid #111111; overflow: hidden;
}
.panel-img {
    width: 100%; height: 100%; object-fit: cover;
    filter: grayscale(100%) contrast(1.4) brightness(0.95);
}
.flex-center-brutalist {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.quote-stamp-box {
    width: 900px; border: 3px solid #111111; background-color: #EAE6D5;
    padding: 60px; text-align: center; position: relative;
}
.quote-large-mark {
    position: absolute; top: -35px; left: 40px; font-family: var(--font-title);
    font-size: 120px; font-weight: bold; color: #CC2222; line-height: 1;
}
.quote-text-brutalist {
    font-family: var(--font-title); font-size: 28px; line-height: 1.4;
    font-style: italic; color: #111111; margin: 0 0 24px 0; z-index: 2; position: relative;
}
.quote-author-brutalist {
    font-family: "Courier New", monospace; font-size: 15px; font-weight: bold;
    text-transform: uppercase; letter-spacing: 1.5px;
}
.dense-list-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; height: 380px;
}
.dense-list-card {
    border: 3px solid #111111; background: #EAE6D5; padding: 24px;
    display: flex; flex-direction: column; gap: 14px;
}
.card-num {
    font-family: "Courier New", monospace; font-size: 14px; font-weight: bold;
    color: #CC2222; border-bottom: 2px solid #111111; padding-bottom: 6px; width: fit-content;
}
.card-title {
    font-family: var(--font-title); font-size: 22px; font-weight: bold; color: #111111; line-height: 1.2;
}
.card-desc {
    font-family: var(--font-body); font-size: 15px; line-height: 1.45; color: #333333;
}
.timeline-row {
    display: flex; gap: 20px; height: 380px; border-top: 3px solid #111111; padding-top: 30px;
}
.timeline-node {
    flex: 1; display: flex; flex-direction: column; gap: 12px;
}
.node-year {
    font-family: "Oswald", sans-serif; font-size: 24px; font-weight: bold;
    color: #CC2222; border-bottom: 2px solid #111111; padding-bottom: 6px;
}
.node-heading {
    font-family: var(--font-title); font-size: 19px; font-weight: bold; line-height: 1.2;
}
.node-text {
    font-family: var(--font-body); font-size: 14px; line-height: 1.4; color: #444444;
}
.closing-card-brutalist {
    text-align: center; border: 3px solid #F3EFE0; padding: 60px 80px; background: #111111; width: 800px;
}
.closing-title {
    font-family: var(--font-display); font-size: 64px; font-weight: 900;
    text-transform: uppercase; letter-spacing: -1px; color: #F3EFE0; border: none !important;
    padding-left: 0 !important; margin: 0 0 16px 0 !important; line-height: 1;
}
.closing-subtitle {
    font-family: var(--font-title); font-size: 22px; font-style: italic; color: #CC2222; margin: 0 0 40px 0;
}
.closing-border-line {
    border-bottom: 2px double #F3EFE0; margin-bottom: 24px;
}
.closing-contact {
    font-family: "Courier New", monospace; font-size: 14px; font-weight: bold; color: #A8A495;
}
```
