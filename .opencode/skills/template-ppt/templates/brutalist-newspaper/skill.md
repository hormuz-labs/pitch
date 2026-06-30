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

### Chart Helper
```js
/**
 * Chart renderer for Brutalist Newspaper.
 * Supports all 17 chart types: column, column-stacked, column-100,
 * bar, bar-stacked, line, area, area-stacked, pie, donut, scatter,
 * bubble, radar, polar, funnel, waterfall, combo.
 * Returns <canvas> + inline Chart.js init script.
 */
let _chartSeq = 0;
function renderChart(slide) {
    const cid = `chart_${++_chartSeq}`;
    const type = (slide.chartType || 'column').toLowerCase();
    const raw = slide.chartData || { labels: [], datasets: [] };
    const labels = raw.labels || [];
    const rawDS = raw.datasets || [];

    // Palette strictly from spec_lock.md
    const PALETTE = {
        bg: '#F3EFE0',
        secondaryBg: '#EAE6D5',
        primary: '#CC2222',
        secondary: '#333333',
        accent: '#111111',
        border: '#111111'
    };

    function hexToRgba(hex, alpha) {
        const h = (hex || '#888888').replace('#', '');
        const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
        const r = parseInt(full.substr(0, 2), 16) || 0;
        const g = parseInt(full.substr(2, 2), 16) || 0;
        const b = parseInt(full.substr(4, 2), 16) || 0;
        return `rgba(${r},${g},${b},${alpha})`;
    }

    const BG = [
        hexToRgba(PALETTE.primary, 0.90),
        hexToRgba(PALETTE.secondary, 0.85),
        hexToRgba(PALETTE.accent, 0.80),
        hexToRgba(PALETTE.primary, 0.60),
        hexToRgba(PALETTE.secondary, 0.60),
        hexToRgba(PALETTE.accent, 0.55),
        hexToRgba(PALETTE.primary, 0.40),
        hexToRgba(PALETTE.secondary, 0.40),
    ];
    const BD = [
        PALETTE.primary, PALETTE.secondary, PALETTE.accent,
        PALETTE.primary, PALETTE.secondary, PALETTE.accent,
        PALETTE.primary, PALETTE.secondary,
    ];

    const isDark = !((function(hex) {
        const h = (hex || '#000').replace('#', '');
        const pd = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
        return (parseInt(pd.substr(0, 2), 16) * 299 + parseInt(pd.substr(2, 2), 16) * 587 + parseInt(pd.substr(4, 2), 16) * 114) / 1000;
    })(PALETTE.bg) > 128);

    const textC = isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.80)';
    const gridC = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
    const tipBg = isDark ? 'rgba(10,10,20,0.92)' : hexToRgba(PALETTE.bg, 0.97);

    // Body font from spec_lock.md typography
    const fontBody = "'IBM Plex Sans', 'Microsoft YaHei', sans-serif";

    const tk = `color:'${textC}',font:{family:'${fontBody}',size:12}`;
    const tip = `tooltip:{backgroundColor:'${tipBg}',titleColor:'${textC}',bodyColor:'${textC}',borderColor:'${PALETTE.border}',borderWidth:1,padding:10}`;
    const leg = `legend:{labels:{color:'${textC}',font:{family:'${fontBody}',size:13},padding:16}}`;
    const plug = `plugins:{${leg},${tip}}`;
    const cX = (s = false) => `x:{stacked:${s},ticks:{${tk}},grid:{color:'${gridC}'}}`;
    const cY = (s = false) => `y:{stacked:${s},ticks:{${tk}},grid:{color:'${gridC}'}}`;
    const baseOpts = `responsive:true,maintainAspectRatio:false,animation:{duration:0}`;

    let cjsType = 'bar';
    let dsArr = [];
    let optStr = '';

    switch (type) {
        case 'column':
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: BG[i % BG.length], borderColor: BD[i % BD.length], borderWidth: 1.5, borderRadius: 0 }));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'column-stacked':
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: BG[i % BG.length], borderColor: BD[i % BD.length], borderWidth: 1.5, borderRadius: 0 }));
            optStr = `${baseOpts},${plug},scales:{${cX(true)},${cY(true)}}`;
            break;

        case 'column-100': {
            const tots = labels.map((_, ci) => rawDS.reduce((s, d) => s + (d.data[ci] || 0), 0));
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: (d.data || []).map((v, ci) => tots[ci] ? +(v / tots[ci] * 100).toFixed(1) : 0), backgroundColor: BG[i % BG.length], borderColor: BD[i % BD.length], borderWidth: 1.5, borderRadius: 0 }));
            optStr = `${baseOpts},${plug},scales:{${cX(true)},y:{stacked:true,max:100,ticks:{${tk},callback:function(v){return v+'%';}},grid:{color:'${gridC}'}}}`;
            break;
        }

        case 'bar':
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: BG[i % BG.length], borderColor: BD[i % BD.length], borderWidth: 1.5, borderRadius: 0 }));
            optStr = `indexAxis:'y',${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'bar-stacked':
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: BG[i % BG.length], borderColor: BD[i % BD.length], borderWidth: 1.5, borderRadius: 0 }));
            optStr = `indexAxis:'y',${baseOpts},${plug},scales:{${cX(true)},${cY(true)}}`;
            break;

        case 'line':
            cjsType = 'line';
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: 'transparent', borderColor: BD[i % BD.length], borderWidth: 2.5, fill: false, tension: 0.4, pointRadius: 4, pointHoverRadius: 7 }));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'area':
            cjsType = 'line';
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: BG[i % BG.length], borderColor: BD[i % BD.length], borderWidth: 2.5, fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 6 }));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'area-stacked':
            cjsType = 'line';
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: BG[i % BG.length], borderColor: BD[i % BD.length], borderWidth: 2, fill: true, tension: 0.4, pointRadius: 3 }));
            optStr = `${baseOpts},${plug},scales:{${cX()},y:{stacked:true,ticks:{${tk}},grid:{color:'${gridC}'}}}`;
            break;

        case 'pie': {
            cjsType = 'pie';
            const sd = rawDS[0]?.data || [];
            dsArr = [JSON.stringify({ data: sd, backgroundColor: sd.map((_, i) => BG[i % BG.length]), borderColor: sd.map((_, i) => BD[i % BD.length]), borderWidth: 2 })];
            optStr = `${baseOpts},plugins:{legend:{position:'right',labels:{color:'${textC}',font:{family:'${fontBody}',size:13},padding:20,boxWidth:16}},${tip}}`;
            break;
        }

        case 'donut': {
            cjsType = 'doughnut';
            const sd = rawDS[0]?.data || [];
            dsArr = [JSON.stringify({ data: sd, backgroundColor: sd.map((_, i) => BG[i % BG.length]), borderColor: sd.map((_, i) => BD[i % BD.length]), borderWidth: 2 })];
            optStr = `cutout:'65%',${baseOpts},plugins:{legend:{position:'right',labels:{color:'${textC}',font:{family:'${fontBody}',size:13},padding:20,boxWidth:16}},${tip}}`;
            break;
        }

        case 'scatter':
            cjsType = 'scatter';
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: BG[i % BG.length], borderColor: BD[i % BD.length], pointRadius: 6, pointHoverRadius: 9 }));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'bubble':
            cjsType = 'bubble';
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: BG[i % BG.length], borderColor: BD[i % BD.length], borderWidth: 1.5 }));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'radar':
            cjsType = 'radar';
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: BG[i % BG.length], borderColor: BD[i % BD.length], borderWidth: 2, pointRadius: 4, pointHoverRadius: 7 }));
            optStr = `${baseOpts},${plug},scales:{r:{ticks:{${tk},backdropColor:'transparent'},grid:{color:'${gridC}'},angleLines:{color:'${gridC}'},pointLabels:{color:'${textC}',font:{family:'${fontBody}',size:13}}}}`;
            break;

        case 'polar': {
            cjsType = 'polarArea';
            const sd = rawDS[0]?.data || [];
            dsArr = [JSON.stringify({ data: sd, backgroundColor: sd.map((_, i) => BG[i % BG.length]), borderWidth: 1.5 })];
            optStr = `${baseOpts},plugins:{legend:{position:'right',labels:{color:'${textC}',font:{family:'${fontBody}',size:13},padding:16}},${tip}},scales:{r:{ticks:{${tk},backdropColor:'transparent'},grid:{color:'${gridC}'}}}`;
            break;
        }

        case 'funnel': {
            const d0 = rawDS[0] || { data: [], label: 'Value' };
            const pairs = labels.map((l, i) => ({ l, v: d0.data[i] || 0 })).sort((a, b) => b.v - a.v);
            const top = pairs[0]?.v || 1;
            const fDS = JSON.stringify({ label: d0.label || 'Value', data: pairs.map(p => p.v), backgroundColor: pairs.map((_, i) => BG[Math.min(i, BG.length - 1)]), borderColor: pairs.map((_, i) => BD[Math.min(i, BD.length - 1)]), borderWidth: 1.5, borderRadius: 0 });
            return `<div style="position:relative;width:100%;height:100%;"><canvas id="${cid}"></canvas></div><script>(function(){var ctx=document.getElementById('${cid}');new Chart(ctx,{type:'bar',data:{labels:${JSON.stringify(pairs.map(p => p.l))},datasets:[${fDS}]},options:{indexAxis:'y',${baseOpts},plugins:{legend:{display:false},tooltip:{backgroundColor:'${tipBg}',titleColor:'${textC}',bodyColor:'${textC}',borderColor:'${PALETTE.border}',borderWidth:1,callbacks:{label:function(c){return c.parsed.x+' ('+Math.round(c.parsed.x/${top}*100)+'%)';}}}},scales:{x:{ticks:{${tk}},grid:{color:'${gridC}'}},y:{ticks:{${tk}},grid:{display:false}}}}});})();<\/script>`;
        }

        case 'waterfall': {
            const d0 = rawDS[0] || { data: [], label: 'Value' };
            const chgs = d0.data || [];
            let cum = 0;
            const floats = chgs.map(v => { const s = cum; cum += v; return [s, cum]; });
            const wfDS = JSON.stringify({ label: d0.label || 'Value', data: floats, backgroundColor: chgs.map(v => v >= 0 ? BG[0] : BG[1]), borderColor: chgs.map(v => v >= 0 ? BD[0] : BD[1]), borderWidth: 1.5, borderRadius: 0 });
            return `<div style="position:relative;width:100%;height:100%;"><canvas id="${cid}"></canvas></div><script>(function(){var ctx=document.getElementById('${cid}');new Chart(ctx,{type:'bar',data:{labels:${JSON.stringify(labels)},datasets:[${wfDS}]},options:{${baseOpts},plugins:{legend:{display:false},tooltip:{backgroundColor:'${tipBg}',titleColor:'${textC}',bodyColor:'${textC}',borderColor:'${PALETTE.border}',borderWidth:1}},scales:{x:{ticks:{${tk}},grid:{color:'${gridC}'}},y:{ticks:{${tk}},grid:{color:'${gridC}'}}}}});})();<\/script>`;
        }

        case 'combo':
            cjsType = 'bar';
            dsArr = rawDS.map((d, i) => JSON.stringify({ type: i === 0 ? 'bar' : 'line', label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: i === 0 ? BG[0] : 'transparent', borderColor: BD[i % BD.length], borderWidth: i === 0 ? 1.5 : 2.5, tension: 0.4, pointRadius: i === 0 ? 0 : 5, fill: false, borderRadius: i === 0 ? 0 : 0, order: i === 0 ? 2 : 1 }));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        default:
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: BG[i % BG.length], borderColor: BD[i % BD.length], borderWidth: 1.5, borderRadius: 0 }));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
    }

    return `<div style="position:relative;width:100%;height:100%;"><canvas id="${cid}"></canvas></div><script>(function(){var ctx=document.getElementById('${cid}');new Chart(ctx,{type:'${cjsType}',data:{labels:${JSON.stringify(labels)},datasets:[${dsArr.join(',')}]},options:{${optStr}}});})();<\/script>`;
}
```

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

### 8. `CHART-EDITORIAL` (Full-Width Chart)
```js
if (slide.layout === 'CHART-EDITORIAL') {
    const chartHTML = renderChart(slide);
    return `
    <div class="slide brutalist-editorial">
        <div class="news-grain"></div>
        <div class="section-tag">EDITORIAL CHART</div>
        <h2 class="slide-title-brutalist">${slide.title}</h2>
        <div class="chart-editorial-container">
            ${chartHTML}
        </div>
        ${slide.source ? `<div class="chart-source-brutalist">${slide.source}</div>` : ''}
    </div>`;
}
```

### 9. `SPLIT-CHART` (Context + Chart)
```js
if (slide.layout === 'SPLIT-CHART') {
    const chartHTML = renderChart(slide);
    return `
    <div class="slide brutalist-editorial">
        <div class="news-grain"></div>
        <div class="section-tag">DATA DISPATCH</div>
        <h2 class="slide-title-brutalist">${slide.title}</h2>
        <div class="split-chart-grid">
            <div class="split-chart-text">
                <ul class="brutalist-list">
                    ${(slide.bullets || []).map(b => `<li><span class="bullet-tag">◆</span> ${b}</li>`).join('')}
                </ul>
            </div>
            <div class="split-chart-visual">
                ${chartHTML}
            </div>
        </div>
        ${slide.source ? `<div class="chart-source-brutalist">${slide.source}</div>` : ''}
    </div>`;
}
```

### 10. `ICON-GRID` (2×3 Editorial Grid)
```js
if (slide.layout === 'ICON-GRID') {
    return `
    <div class="slide brutalist-editorial">
        <div class="news-grain"></div>
        ${slide.badge ? `<div class="section-tag">${slide.badge}</div>` : '<div class="section-tag">EDITORIAL GRID</div>'}
        <h2 class="slide-title-brutalist">${slide.title}</h2>
        ${slide.subtitle ? `<p class="icon-grid-subtitle">${slide.subtitle}</p>` : ''}
        <div class="icon-editorial-grid">
            ${(slide.items || []).map(item => `
            <div class="icon-editorial-card">
                ${item.icon ? `<div class="icon-editorial-icon">${item.icon}</div>` : ''}
                <div class="icon-editorial-heading">${item.heading || item.title}</div>
                <div class="icon-editorial-text">${item.text || item.description}</div>
            </div>`).join('')}
        </div>
    </div>`;
}
```

### 11. `COMPARE-PANEL` (Side-by-Side Comparison)
```js
if (slide.layout === 'COMPARE-PANEL') {
    return `
    <div class="slide brutalist-editorial">
        <div class="news-grain"></div>
        <div class="section-tag">COMPARE / DEBATE</div>
        <h2 class="slide-title-brutalist">${slide.title}</h2>
        <div class="compare-panels-grid">
            <div class="compare-panel-left">
                <div class="compare-panel-title">${slide.leftTitle || 'POSITION A'}</div>
                <ul class="compare-panel-list">
                    ${(slide.leftBullets || []).map(b => `<li>• ${b}</li>`).join('')}
                </ul>
            </div>
            <div class="compare-panel-right">
                <div class="compare-panel-title">${slide.rightTitle || 'POSITION B'}</div>
                <ul class="compare-panel-list">
                    ${(slide.rightBullets || []).map(b => `<li>• ${b}</li>`).join('')}
                </ul>
            </div>
        </div>
    </div>`;
}
```

### 12. `IMPACT-STATEMENT` (Full-Bleed Statement)
```js
if (slide.layout === 'IMPACT-STATEMENT') {
    return `
    <div class="slide brutalist-editorial impact-slide">
        <div class="news-grain"></div>
        ${slide.image ? `<img class="impact-bg-img" src="${slide.image}">` : ''}
        <div class="impact-overlay"></div>
        <div class="impact-content">
            <div class="impact-stamp">BREAKING</div>
            <p class="impact-statement-text">${slide.statement || slide.quote || slide.body || ''}</p>
            ${slide.attribution ? `<div class="impact-attribution">— ${slide.attribution}</div>` : ''}
        </div>
    </div>`;
}
```

### 13. `CLOSING-EDITORIAL` (Last Slide CTA)
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
    padding: 120px 72px 60px 72px;
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

/* ── Chart layouts ── */
.chart-editorial-container {
    height: 380px; border: 3px solid #111111; padding: 20px; background: #EAE6D5;
}
.split-chart-grid {
    display: flex; gap: 40px; height: 380px;
}
.split-chart-text {
    width: 40%; display: flex; align-items: center;
}
.split-chart-visual {
    flex: 1; border: 3px solid #111111; padding: 16px; background: #EAE6D5;
}
.chart-source-brutalist {
    font-family: "Courier New", monospace; font-size: 12px; color: #333333;
    text-align: right; margin-top: 12px; letter-spacing: 0.03em;
}

/* ── Icon grid layout ── */
.icon-grid-subtitle {
    font-family: "IBM Plex Serif", Georgia, serif; font-size: 20px; font-style: italic;
    color: #333333; margin: -16px 0 24px 0; line-height: 1.4;
}
.icon-editorial-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; height: 380px;
}
.icon-editorial-card {
    border: 3px solid #111111; background: #EAE6D5; padding: 24px;
    display: flex; flex-direction: column; gap: 12px;
}
.icon-editorial-icon {
    font-size: 32px; line-height: 1;
}
.icon-editorial-heading {
    font-family: "IBM Plex Serif", Georgia, serif; font-size: 20px; font-weight: bold;
    color: #111111; line-height: 1.2;
}
.icon-editorial-text {
    font-family: "IBM Plex Sans", "Microsoft YaHei", sans-serif; font-size: 15px;
    line-height: 1.45; color: #333333;
}

/* ── Compare layout ── */
.compare-panels-grid {
    display: flex; gap: 40px; height: 380px;
}
.compare-panel-left, .compare-panel-right {
    flex: 1; border: 3px solid #111111; padding: 32px;
    display: flex; flex-direction: column; gap: 20px;
}
.compare-panel-left {
    background: #EAE6D5;
}
.compare-panel-right {
    background: #111111; color: #F3EFE0;
}
.compare-panel-title {
    font-family: "IBM Plex Serif", Georgia, serif; font-size: 28px; font-weight: bold;
    border-bottom: 2px solid; padding-bottom: 8px;
}
.compare-panel-right .compare-panel-title {
    border-color: #F3EFE0;
}
.compare-panel-list {
    list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px;
}
.compare-panel-list li {
    font-family: "IBM Plex Sans", "Microsoft YaHei", sans-serif; font-size: 17px;
    line-height: 1.45; padding-left: 0 !important; margin-bottom: 0 !important;
}
.compare-panel-right .compare-panel-list li {
    color: #F3EFE0;
}
.compare-panel-list li::before {
    display: none !important;
}

/* ── Impact layout ── */
.impact-slide {
    position: relative; overflow: hidden;
}
.impact-bg-img {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    object-fit: cover; filter: grayscale(100%) contrast(1.4) brightness(0.95); z-index: 1;
}
.impact-overlay {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(17,17,17,0.72); z-index: 2;
}
.impact-content {
    position: relative; z-index: 5; height: 100%; display: flex; flex-direction: column;
    justify-content: center; align-items: center; text-align: center; padding: 80px 120px;
}
.impact-stamp {
    font-family: "Oswald", sans-serif; font-size: 18px; font-weight: bold;
    letter-spacing: 3px; color: #F3EFE0; background: #CC2222;
    padding: 6px 16px; margin-bottom: 30px;
}
.impact-statement-text {
    font-family: "IBM Plex Serif", Georgia, serif; font-size: 42px; font-weight: bold;
    line-height: 1.2; color: #F3EFE0; margin: 0 0 24px 0;
}
.impact-attribution {
    font-family: "Courier New", monospace; font-size: 15px; font-weight: bold;
    color: #EAE6D5; text-transform: uppercase; letter-spacing: 1.5px;
}
```
