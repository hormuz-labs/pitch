# Startup Amplify Template Skill Reference

Template-specific instructions, layout codes, and HTML/CSS renderers for the
`STARTUP_AMPLIFY` theme — a light, card-based startup growth and GTM playbook
inspired by the *AMPLIFY YOUR STARTUP — Marketing, GTM & AI Automation* deck.

Use this template for startup growth, go-to-market strategy, AI automation,
marketing playbooks, and founder-oriented strategic decks. The agent must treat
the topic as a **startup growth playbook** with clear chapters, quantified
claims, frameworks, and actionable takeaways.

---

## 🎨 Design Theme Specification

- **Palette**: Light warm gray `#F4F4F4` canvas; charcoal `#2C2C2C` for primary
text; muted gray `#888888` for secondary text; teal `#00A3A1` primary accent;
orange `#E8762B` secondary accent; highlight red `#D91E18` for rules, stat
numbers, and emphasis; light pink/salmon `#FFD0CE` for subtle fills; blue
`#5B9BD5` for tertiary accents; white `#FFFFFF` for cards.
- **Rules**: 2px solid red `#D91E18` horizontal rules at the top and bottom of
cover, chapter, and most content slides.
- **Typography**: Display/title font `"Liter"` for headlines, chapter numbers,
and stat values; body font `"Inter"` for descriptions, bullets, and sources.
- **Images**: Clean, bright stock photography or product/UI shots; no filters.
Use sparingly — most slides are card and typography driven.

---

## 🧠 Content Generation Rules

1. **Frame every topic as a startup growth / strategic playbook.** Even
   non-business topics should be organized into chapters with a clear narrative:
   problem → strategy → execution → automation → outcomes.
2. **Use real data.** Every stat, benchmark, ROI claim, and market number must
   be grounded in the web search from Step 2 of the main skill.
3. **Include sources on data-heavy slides.** Any slide with statistics, charts,
   benchmarks, or research claims must include a `source` field.
4. **Slide rhythm:** alternate chapter divider slides with dense content slides.
   Never place two chapter dividers back-to-back.
5. **Minimum deck structure for any topic:**
   - AMP-COVER
   - AMP-TOC
   - AMP-CHAPTER (first chapter divider)
   - AMP-CONTENT-SPLIT or AMP-STAT-3COL
   - AMP-CHART (when data is available)
   - AMP-PLATFORM-3COL, AMP-GTM-FLOW, AMP-PROCESS-3COL, AMP-MOTION-3COL, or AMP-STATS-3BIG
   - AMP-TOOL-STACK, AMP-PRICING-3COL, AMP-STEPS-5COL, AMP-4PILLARS, or AMP-AARRR
   - AMP-TAKEAWAYS-6
   - AMP-CLOSING
6. **Quantified takeaways.** Closing and takeaway slides should include
   concrete next steps, metrics, or outcomes.

---

## 📐 Layout Pools & Renderers

### Chart helper

```js
let _chartSeq = 0;
function renderChart(slide) {
    const cid = `chart_${++_chartSeq}`;
    const type = (slide.chartType || 'column').toLowerCase();
    const raw = slide.chartData || { labels: [], datasets: [] };
    const labels = raw.labels || [];
    const rawDS = raw.datasets || [];

    const PALETTE = {
        bg: '#F4F4F4',
        primary: '#00A3A1',
        secondary: '#E8762B',
        accent: '#2C2C2C',
        muted: '#888888',
        border: '#CCCCCC',
        highlight: '#D91E18',
        blue: '#5B9BD5'
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
        hexToRgba(PALETTE.highlight, 0.80),
        hexToRgba(PALETTE.blue, 0.75),
        hexToRgba(PALETTE.primary, 0.55),
        hexToRgba(PALETTE.secondary, 0.55),
        hexToRgba(PALETTE.highlight, 0.50),
        hexToRgba(PALETTE.blue, 0.45),
    ];
    const BD = [
        PALETTE.primary, PALETTE.secondary, PALETTE.highlight, PALETTE.blue,
        PALETTE.primary, PALETTE.secondary, PALETTE.highlight, PALETTE.blue,
    ];

    const textC = 'rgba(44,44,44,0.85)';
    const gridC = 'rgba(44,44,44,0.08)';
    const tipBg = 'rgba(255,255,255,0.97)';
    const fontBody = 'Inter';

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
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: BG[i % BG.length], borderColor: BD[i % BD.length], borderWidth: 1.5, borderRadius: 4 }));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'column-stacked':
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: BG[i % BG.length], borderColor: BD[i % BD.length], borderWidth: 1.5, borderRadius: 2 }));
            optStr = `${baseOpts},${plug},scales:{${cX(true)},${cY(true)}}`;
            break;

        case 'column-100': {
            const tots = labels.map((_, ci) => rawDS.reduce((s, d) => s + (d.data[ci] || 0), 0));
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: (d.data || []).map((v, ci) => tots[ci] ? +(v / tots[ci] * 100).toFixed(1) : 0), backgroundColor: BG[i % BG.length], borderColor: BD[i % BD.length], borderWidth: 1.5, borderRadius: 2 }));
            optStr = `${baseOpts},${plug},scales:{${cX(true)},y:{stacked:true,max:100,ticks:{${tk},callback:function(v){return v+'%';}},grid:{color:'${gridC}'}}}`;
            break;
        }

        case 'bar':
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: BG[i % BG.length], borderColor: BD[i % BD.length], borderWidth: 1.5, borderRadius: 4 }));
            optStr = `indexAxis:'y',${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'bar-stacked':
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: BG[i % BG.length], borderColor: BD[i % BD.length], borderWidth: 1.5, borderRadius: 2 }));
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
            const fDS = JSON.stringify({ label: d0.label || 'Value', data: pairs.map(p => p.v), backgroundColor: pairs.map((_, i) => BG[Math.min(i, BG.length - 1)]), borderColor: pairs.map((_, i) => BD[Math.min(i, BD.length - 1)]), borderWidth: 1.5, borderRadius: 4 });
            return `<div style="position:relative;width:100%;height:100%;"><canvas id="${cid}"></canvas></div><script>(function(){var ctx=document.getElementById('${cid}');new Chart(ctx,{type:'bar',data:{labels:${JSON.stringify(pairs.map(p => p.l))},datasets:[${fDS}]},options:{indexAxis:'y',${baseOpts},plugins:{legend:{display:false},tooltip:{backgroundColor:'${tipBg}',titleColor:'${textC}',bodyColor:'${textC}',borderColor:'${PALETTE.border}',borderWidth:1,callbacks:{label:function(c){return c.parsed.x+' ('+Math.round(c.parsed.x/${top}*100)+'%)';}}}},scales:{x:{ticks:{${tk}},grid:{color:'${gridC}'}},y:{ticks:{${tk}},grid:{display:false}}}}});})();<\/script>`;
        }

        case 'waterfall': {
            const d0 = rawDS[0] || { data: [], label: 'Value' };
            const chgs = d0.data || [];
            let cum = 0;
            const floats = chgs.map(v => { const s = cum; cum += v; return [s, cum]; });
            const wfDS = JSON.stringify({ label: d0.label || 'Value', data: floats, backgroundColor: chgs.map(v => v >= 0 ? BG[0] : BG[1]), borderColor: chgs.map(v => v >= 0 ? BD[0] : BD[1]), borderWidth: 1.5, borderRadius: 3 });
            return `<div style="position:relative;width:100%;height:100%;"><canvas id="${cid}"></canvas></div><script>(function(){var ctx=document.getElementById('${cid}');new Chart(ctx,{type:'bar',data:{labels:${JSON.stringify(labels)},datasets:[${wfDS}]},options:{${baseOpts},plugins:{legend:{display:false},tooltip:{backgroundColor:'${tipBg}',titleColor:'${textC}',bodyColor:'${textC}',borderColor:'${PALETTE.border}',borderWidth:1}},scales:{x:{ticks:{${tk}},grid:{color:'${gridC}'}},y:{ticks:{${tk}},grid:{color:'${gridC}'}}}}});})();<\/script>`;
        }

        case 'combo':
            cjsType = 'bar';
            dsArr = rawDS.map((d, i) => JSON.stringify({ type: i === 0 ? 'bar' : 'line', label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: i === 0 ? BG[0] : 'transparent', borderColor: BD[i % BD.length], borderWidth: i === 0 ? 1.5 : 2.5, tension: 0.4, pointRadius: i === 0 ? 0 : 5, fill: false, borderRadius: i === 0 ? 4 : 0, order: i === 0 ? 2 : 1 }));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        default:
            dsArr = rawDS.map((d, i) => JSON.stringify({ label: d.label || `Series ${i + 1}`, data: d.data || [], backgroundColor: BG[i % BG.length], borderColor: BD[i % BD.length], borderWidth: 1.5, borderRadius: 4 }));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
    }

    return `<div style="position:relative;width:100%;height:100%;"><canvas id="${cid}"></canvas></div><script>(function(){var ctx=document.getElementById('${cid}');new Chart(ctx,{type:'${cjsType}',data:{labels:${JSON.stringify(labels)},datasets:[${dsArr.join(',')}]},options:{${optStr}}});})();<\/script>`;
}
```

### 1. `AMP-COVER` — centered title + subtitle + date/presenter + 3 stats below

```js
if (slide.layout === 'AMP-COVER') {
    return `
    <div class="slide amp-cover">
        <div class="amp-rule amp-rule-top"></div>
        <div class="amp-cover-content">
            <h1 class="amp-cover-title">${slide.title}</h1>
            <div class="amp-cover-subtitle">${slide.subtitle || ''}</div>
            <div class="amp-cover-meta">${config.date} | ${config.presenter}</div>
            <div class="amp-cover-stats">
                ${(slide.stats || []).map(s => `
                <div class="amp-cover-stat">
                    <div class="amp-cover-stat-value">${s.value}</div>
                    <div class="amp-cover-stat-label">${s.label}</div>
                </div>`).join('')}
            </div>
        </div>
        <div class="amp-rule amp-rule-bottom"></div>
    </div>`;
}
```

### 2. `AMP-TOC` — "CONTENTS" + 3 chapter rows

```js
if (slide.layout === 'AMP-TOC') {
    return `
    <div class="slide amp-toc">
        <div class="amp-content">
            <h2 class="amp-toc-title">CONTENTS</h2>
            <div class="amp-toc-rows">
                ${(slide.sections || []).map(s => `
                <div class="amp-toc-row">
                    <div class="amp-toc-num">${s.number || s.num || ''}</div>
                    <div class="amp-toc-text">
                        <div class="amp-toc-chapter-title">${s.title}</div>
                        <div class="amp-toc-chapter-desc">${s.description || s.desc || ''}</div>
                    </div>
                    <div class="amp-toc-page">${s.page || ''}</div>
                </div>`).join('')}
            </div>
            <div class="amp-footer">
                <span>${config.presenter} | ${config.date}</span>
                <span class="amp-footer-page">02</span>
            </div>
        </div>
    </div>`;
}
```

### 3. `AMP-CHAPTER` — chapter divider

```js
if (slide.layout === 'AMP-CHAPTER') {
    return `
    <div class="slide amp-chapter">
        <div class="amp-rule amp-rule-top"></div>
        <div class="amp-chapter-number">${slide.number || slide.num || ''}</div>
        <div class="amp-content amp-chapter-content">
            <div class="amp-chapter-kicker">CHAPTER ${slide.number || slide.num || ''}</div>
            <h2 class="amp-chapter-title">${slide.title}</h2>
            <div class="amp-chapter-subtitle">${slide.subtitle || ''}</div>
        </div>
        <div class="amp-rule amp-rule-bottom"></div>
    </div>`;
}
```

### 4. `AMP-CONTENT-SPLIT` — title + left bullets + right info cards

```js
if (slide.layout === 'AMP-CONTENT-SPLIT') {
    return `
    <div class="slide amp-content">
        <div class="amp-content-header">
            <h2 class="amp-slide-title">${slide.title}</h2>
            <div class="amp-slide-subtitle">${slide.subtitle || ''}</div>
        </div>
        <div class="amp-split">
            <div class="amp-split-left">
                ${slide.image ? `<img class="amp-split-img" src="${getBase64Image(slide.image)}">` : ''}
                ${(slide.bullets || []).length > 0 ? `
                <ul class="amp-split-bullets">
                    ${slide.bullets.map(b => `<li>${b}</li>`).join('')}
                </ul>` : ''}
            </div>
            <div class="amp-split-right">
                ${(slide.cards || []).map(c => `
                <div class="amp-info-card">
                    <div class="amp-info-card-title">${c.title}</div>
                    <div class="amp-info-card-body">${c.body || c.text || ''}</div>
                </div>`).join('')}
            </div>
        </div>
        ${slide.insight ? `
        <div class="amp-insight-bar">
            <strong>Key insight:</strong> ${slide.insight}
        </div>` : ''}
        ${slide.source ? `<div class="amp-source">${slide.source}</div>` : ''}
    </div>`;
}
```

### 5. `AMP-STAT-3COL` — title + 3 big stat cards

```js
if (slide.layout === 'AMP-STAT-3COL') {
    return `
    <div class="slide amp-content">
        <div class="amp-content-header">
            <h2 class="amp-slide-title">${slide.title}</h2>
            <div class="amp-slide-subtitle">${slide.subtitle || ''}</div>
        </div>
        <div class="amp-stat3-grid">
            ${(slide.stats || []).map(s => `
            <div class="amp-stat3-card">
                <div class="amp-stat3-value">${s.value}</div>
                <div class="amp-stat3-label">${s.label}</div>
                <div class="amp-stat3-desc">${s.description || ''}</div>
            </div>`).join('')}
        </div>
        ${slide.insight ? `
        <div class="amp-insight-bar">
            <strong>Key insight:</strong> ${slide.insight}
        </div>` : ''}
        ${slide.source ? `<div class="amp-source">${slide.source}</div>` : ''}
    </div>`;
}
```

### 6. `AMP-CHART` — title + chart area + right-side bullet cards

```js
if (slide.layout === 'AMP-CHART') {
    const chartHTML = renderChart(slide);
    return `
    <div class="slide amp-content">
        <div class="amp-content-header">
            <h2 class="amp-slide-title">${slide.title}</h2>
            <div class="amp-slide-subtitle">${slide.subtitle || ''}</div>
        </div>
        <div class="amp-chart-wrap">
            <div class="amp-chart-viz">
                ${chartHTML}
            </div>
            <div class="amp-chart-cards">
                ${(slide.cards || []).map(c => `
                <div class="amp-chart-card">
                    <div class="amp-chart-card-title">${c.title}</div>
                    <div class="amp-chart-card-body">${c.body || c.text || ''}</div>
                </div>`).join('')}
            </div>
        </div>
        <div class="amp-stat3-grid amp-chart-bottom">
            ${(slide.bottomStats || []).map(s => `
            <div class="amp-stat3-card">
                <div class="amp-stat3-value">${s.value}</div>
                <div class="amp-stat3-label">${s.label}</div>
            </div>`).join('')}
        </div>
        ${slide.source ? `<div class="amp-source">${slide.source}</div>` : ''}
    </div>`;
}
```

### 7. `AMP-PLATFORM-3COL` — 3 platform cards

```js
if (slide.layout === 'AMP-PLATFORM-3COL') {
    return `
    <div class="slide amp-content">
        <div class="amp-content-header">
            <h2 class="amp-slide-title">${slide.title}</h2>
            <div class="amp-slide-subtitle">${slide.subtitle || ''}</div>
        </div>
        <div class="amp-platform-flow">
            ${(slide.platforms || []).map((p, i) => `
            <div class="amp-platform-card">
                <div class="amp-platform-title">${p.title}</div>
                <div class="amp-platform-desc">${p.description || p.desc || ''}</div>
            </div>
            ${i < (slide.platforms || []).length - 1 ? '<div class="amp-platform-connector"></div>' : ''}`).join('')}
        </div>
        <div class="amp-stat3-grid">
            ${(slide.stats || []).map(s => `
            <div class="amp-stat3-card">
                <div class="amp-stat3-value">${s.value}</div>
                <div class="amp-stat3-label">${s.label}</div>
            </div>`).join('')}
        </div>
        ${slide.insight ? `
        <div class="amp-insight-bar">
            <strong>Key insight:</strong> ${slide.insight}
        </div>` : ''}
        ${slide.source ? `<div class="amp-source">${slide.source}</div>` : ''}
    </div>`;
}
```

### 8. `AMP-GTM-FLOW` — central GTM node + 5 surrounding nodes

```js
if (slide.layout === 'AMP-GTM-FLOW') {
    return `
    <div class="slide amp-content">
        <div class="amp-content-header">
            <h2 class="amp-slide-title">${slide.title}</h2>
            <div class="amp-slide-subtitle">${slide.subtitle || ''}</div>
        </div>
        <div class="amp-gtm-flow">
            <div class="amp-gtm-center">
                <div class="amp-gtm-node amp-gtm-core">${slide.centerLabel || 'GTM'}</div>
            </div>
            <div class="amp-gtm-nodes">
                ${(slide.nodes || []).map((n, i) => `
                <div class="amp-gtm-node amp-gtm-outer" data-pos="${i}">
                    <div class="amp-gtm-node-title">${n.title}</div>
                    <div class="amp-gtm-node-sub">${n.subtitle || n.desc || ''}</div>
                </div>`).join('')}
            </div>
        </div>
        <div class="amp-gtm-details">
            <div class="amp-gtm-detail-col">
                ${(slide.leftDetails || []).map(d => `
                <div class="amp-gtm-detail">
                    <strong>${d.title}</strong> ${d.body || d.text || ''}
                </div>`).join('')}
            </div>
            <div class="amp-gtm-detail-col">
                ${(slide.rightDetails || []).map(d => `
                <div class="amp-gtm-detail">
                    <strong>${d.title}</strong> ${d.body || d.text || ''}
                </div>`).join('')}
            </div>
        </div>
        ${slide.insight ? `
        <div class="amp-insight-bar">
            <strong>Key insight:</strong> ${slide.insight}
        </div>` : ''}
        ${slide.source ? `<div class="amp-source">${slide.source}</div>` : ''}
    </div>`;
}
```

### 9. `AMP-PROCESS-3COL` — 3 numbered phase cards

```js
if (slide.layout === 'AMP-PROCESS-3COL') {
    return `
    <div class="slide amp-content">
        <div class="amp-content-header">
            <h2 class="amp-slide-title">${slide.title}</h2>
            <div class="amp-slide-subtitle">${slide.subtitle || ''}</div>
        </div>
        <div class="amp-process-header">
            ${(slide.phases || []).map((p, i) => `
            <div class="amp-process-tab ${i === (slide.activePhase || 2) - 1 ? 'amp-process-tab-active' : ''}">
                <div class="amp-process-tab-num">${p.number || p.num || String(i + 1).padStart(2, '0')}</div>
                <div class="amp-process-tab-title">${p.title}</div>
                <div class="amp-process-tab-range">${p.range || ''}</div>
            </div>`).join('')}
        </div>
        <div class="amp-process-cards">
            ${(slide.phases || []).map(p => `
            <div class="amp-process-card">
                <ul class="amp-process-list">
                    ${(p.items || []).map(item => `
                    <li><strong>${item.title || item.heading}</strong> ${item.body || item.text || ''}</li>`).join('')}
                </ul>
            </div>`).join('')}
        </div>
        ${slide.insight ? `
        <div class="amp-insight-bar">
            <strong>Framework application:</strong> ${slide.insight}
        </div>` : ''}
        ${slide.source ? `<div class="amp-source">${slide.source}</div>` : ''}
    </div>`;
}
```

### 10. `AMP-MOTION-3COL` — 3 motion cards + 3 detail cards below

```js
if (slide.layout === 'AMP-MOTION-3COL') {
    return `
    <div class="slide amp-content">
        <div class="amp-content-header">
            <h2 class="amp-slide-title">${slide.title}</h2>
            <div class="amp-slide-subtitle">${slide.subtitle || ''}</div>
        </div>
        <div class="amp-motion-top">
            ${(slide.motions || []).map((m, i) => `
            <div class="amp-motion-card ${i === 0 ? 'amp-motion-card-red' : ''}">
                <div class="amp-motion-acv">${m.acv || m.badge || ''}</div>
                <div class="amp-motion-title">${m.title}</div>
                <div class="amp-motion-sub">${m.subtitle || m.desc || ''}</div>
            </div>`).join('')}
        </div>
        <div class="amp-motion-bottom">
            ${(slide.details || []).map(d => `
            <div class="amp-motion-detail">
                <div class="amp-motion-detail-title">${d.title}</div>
                <div class="amp-motion-detail-body">${d.body || d.text || ''}</div>
            </div>`).join('')}
        </div>
        ${slide.insight ? `
        <div class="amp-insight-bar">
            <strong>Heuristic for choosing:</strong> ${slide.insight}
        </div>` : ''}
        ${slide.source ? `<div class="amp-source">${slide.source}</div>` : ''}
    </div>`;
}
```

### 11. `AMP-STATS-3BIG` — 3 big stat callouts + right text panel

```js
if (slide.layout === 'AMP-STATS-3BIG') {
    return `
    <div class="slide amp-content">
        <div class="amp-content-header">
            <h2 class="amp-slide-title">${slide.title}</h2>
            <div class="amp-slide-subtitle">${slide.subtitle || ''}</div>
        </div>
        <div class="amp-stats-big-wrap">
            <div class="amp-stats-big-left">
                ${(slide.stats || []).map(s => `
                <div class="amp-stats-big-item">
                    <div class="amp-stats-big-value">${s.value}</div>
                    <div class="amp-stats-big-label">${s.label}</div>
                    <div class="amp-stats-big-sub">${s.description || ''}</div>
                </div>`).join('')}
            </div>
            <div class="amp-stats-big-right">
                <div class="amp-stats-big-right-title">${slide.panelTitle || ''}</div>
                <div class="amp-stats-big-cards">
                    ${(slide.panelCards || []).map(c => `
                    <div class="amp-stats-big-card">
                        <div class="amp-stats-big-card-title">${c.title}</div>
                        <div class="amp-stats-big-card-body">${c.body || c.text || ''}</div>
                    </div>`).join('')}
                </div>
                ${slide.panelText ? `<div class="amp-stats-big-paneltext">${slide.panelText}</div>` : ''}
            </div>
        </div>
        ${slide.source ? `<div class="amp-source">${slide.source}</div>` : ''}
    </div>`;
}
```

### 12. `AMP-TOOL-STACK` — pipeline flow + tool list cards

```js
if (slide.layout === 'AMP-TOOL-STACK') {
    return `
    <div class="slide amp-content">
        <div class="amp-content-header">
            <h2 class="amp-slide-title">${slide.title}</h2>
            <div class="amp-slide-subtitle">${slide.subtitle || ''}</div>
        </div>
        <div class="amp-tool-pipeline">
            ${(slide.pipeline || []).map((step, i) => `
            <div class="amp-tool-step ${step.highlight ? 'amp-tool-step-highlight' : ''}">
                <div class="amp-tool-step-title">${step.title}</div>
                <div class="amp-tool-step-tools">${step.tools || ''}</div>
            </div>
            ${i < (slide.pipeline || []).length - 1 ? '<div class="amp-tool-arrow">→</div>' : ''}`).join('')}
        </div>
        <div class="amp-tool-grid">
            <div class="amp-tool-list">
                ${(slide.tools || []).map(t => `
                <div class="amp-tool-card ${t.accent === 'teal' ? 'amp-tool-card-teal' : ''}">
                    <div class="amp-tool-card-title">${t.title}</div>
                    <div class="amp-tool-card-body">${t.body || t.text || ''}</div>
                </div>`).join('')}
            </div>
            ${slide.featureCard ? `
            <div class="amp-tool-feature">
                <div class="amp-tool-feature-title">${slide.featureCard.title}</div>
                <div class="amp-tool-feature-body">${slide.featureCard.body || slide.featureCard.text || ''}</div>
            </div>` : ''}
        </div>
        ${slide.insight ? `
        <div class="amp-insight-bar">
            <strong>Key insight:</strong> ${slide.insight}
        </div>` : ''}
        ${slide.source ? `<div class="amp-source">${slide.source}</div>` : ''}
    </div>`;
}
```

### 13. `AMP-PRICING-3COL` — 3 pricing/feature cards

```js
if (slide.layout === 'AMP-PRICING-3COL') {
    return `
    <div class="slide amp-content">
        <div class="amp-content-header">
            <h2 class="amp-slide-title">${slide.title}</h2>
            <div class="amp-slide-subtitle">${slide.subtitle || ''}</div>
        </div>
        <div class="amp-pricing-grid">
            ${(slide.cards || []).map((c, i) => `
            <div class="amp-pricing-card ${i === 1 ? 'amp-pricing-card-featured' : ''}">
                <div class="amp-pricing-top" style="background: ${c.accent || '#D91E18'};">
                    <div class="amp-pricing-name">${c.title}</div>
                    <div class="amp-pricing-price">${c.price}</div>
                </div>
                <div class="amp-pricing-body">
                    <div class="amp-pricing-desc">${c.description || c.desc || ''}</div>
                    <ul class="amp-pricing-features">
                        ${(c.features || []).map(f => `<li>${f}</li>`).join('')}
                    </ul>
                    <div class="amp-pricing-bestfor">${c.bestFor || ''}</div>
                </div>
            </div>`).join('')}
        </div>
        ${slide.source ? `<div class="amp-source">${slide.source}</div>` : ''}
    </div>`;
}
```

### 14. `AMP-STEPS-5COL` — 5 numbered step cards

```js
if (slide.layout === 'AMP-STEPS-5COL') {
    return `
    <div class="slide amp-content">
        <div class="amp-content-header">
            <h2 class="amp-slide-title">${slide.title}</h2>
            <div class="amp-slide-subtitle">${slide.subtitle || ''}</div>
        </div>
        <div class="amp-steps-flow">
            ${(slide.steps || []).map((s, i) => `
            <div class="amp-step-card">
                <div class="amp-step-num">${s.number || s.num || String(i + 1).padStart(2, '0')}</div>
                <div class="amp-step-title">${s.title}</div>
                <div class="amp-step-body">${s.body || s.text || ''}</div>
            </div>
            ${i < (slide.steps || []).length - 1 ? '<div class="amp-step-connector"></div>' : ''}`).join('')}
        </div>
        ${slide.insight ? `
        <div class="amp-insight-bar">
            <strong>Key insight:</strong> ${slide.insight}
        </div>` : ''}
        ${slide.source ? `<div class="amp-source">${slide.source}</div>` : ''}
    </div>`;
}
```

### 15. `AMP-4PILLARS` — 4 pillar cards + central unified engine label

```js
if (slide.layout === 'AMP-4PILLARS') {
    return `
    <div class="slide amp-content">
        <div class="amp-content-header">
            <h2 class="amp-slide-title">${slide.title}</h2>
            <div class="amp-slide-subtitle">${slide.subtitle || ''}</div>
        </div>
        <div class="amp-pillars">
            ${(slide.pillars || []).map((p, i) => `
            <div class="amp-pillar-card" data-pos="${i}">
                <div class="amp-pillar-icon">${p.icon || ''}</div>
                <div class="amp-pillar-title">${p.title}</div>
                <div class="amp-pillar-body">${p.body || p.text || ''}</div>
            </div>`).join('')}
            <div class="amp-pillar-center">
                <div class="amp-pillar-center-label">${slide.centerLabel || 'Unified Engine'}</div>
            </div>
        </div>
        ${slide.source ? `<div class="amp-source">${slide.source}</div>` : ''}
    </div>`;
}
```

### 16. `AMP-AARRR` — AARRR framework + metrics cards

```js
if (slide.layout === 'AMP-AARRR') {
    return `
    <div class="slide amp-content">
        <div class="amp-content-header">
            <h2 class="amp-slide-title">${slide.title}</h2>
            <div class="amp-slide-subtitle">${slide.subtitle || ''}</div>
        </div>
        <div class="amp-aarrr-flow">
            ${(slide.stages || []).map((s, i) => `
            <div class="amp-aarrr-stage">
                <div class="amp-aarrr-letter">${s.letter}</div>
                <div class="amp-aarrr-name">${s.title}</div>
                <div class="amp-aarrr-metric">${s.metric || ''}</div>
            </div>
            ${i < (slide.stages || []).length - 1 ? '<div class="amp-aarrr-arrow">→</div>' : ''}`).join('')}
        </div>
        <div class="amp-aarrr-cards">
            ${(slide.cards || []).map(c => `
            <div class="amp-aarrr-card">
                <div class="amp-aarrr-card-title">${c.title}</div>
                <div class="amp-aarrr-card-body">${c.body || c.text || ''}</div>
            </div>`).join('')}
        </div>
        ${slide.source ? `<div class="amp-source">${slide.source}</div>` : ''}
    </div>`;
}
```

### 17. `AMP-TAKEAWAYS-6` — 6 takeaway cards in 2×3 grid

```js
if (slide.layout === 'AMP-TAKEAWAYS-6') {
    return `
    <div class="slide amp-content">
        <div class="amp-content-header">
            <h2 class="amp-slide-title">${slide.title}</h2>
            <div class="amp-slide-subtitle">${slide.subtitle || ''}</div>
        </div>
        <div class="amp-takeaways-grid">
            ${(slide.items || []).map(item => `
            <div class="amp-takeaway-card">
                <div class="amp-takeaway-title">${item.title}</div>
                <div class="amp-takeaway-body">${item.body || item.text || ''}</div>
            </div>`).join('')}
        </div>
        ${slide.source ? `<div class="amp-source">${slide.source}</div>` : ''}
    </div>`;
}
```

### 18. `AMP-CLOSING` — CTA + next-step cards + question prompt

```js
if (slide.layout === 'AMP-CLOSING') {
    return `
    <div class="slide amp-closing">
        <div class="amp-rule amp-rule-top"></div>
        <div class="amp-closing-content">
            <h2 class="amp-closing-title">${slide.title}</h2>
            <div class="amp-closing-subtitle">${slide.subtitle || ''}</div>
            <div class="amp-closing-cards">
                ${(slide.nextSteps || []).map(n => `
                <div class="amp-closing-card">
                    <div class="amp-closing-card-title">${n.title}</div>
                    <div class="amp-closing-card-body">${n.body || n.text || ''}</div>
                </div>`).join('')}
            </div>
            <div class="amp-closing-prompt">${slide.prompt || 'Questions?'}</div>
            <div class="amp-closing-footer">${config.presenter} | ${config.date}</div>
        </div>
        <div class="amp-rule amp-rule-bottom"></div>
    </div>`;
}
```

---

## 🎨 Stylesheet Additions for Startup Amplify

```css
/* ── Startup Amplify Core ── */
.amp-cover, .amp-chapter, .amp-closing {
    background-color: #F4F4F4;
    color: #2C2C2C;
}
.amp-content {
    background-color: #F4F4F4;
    color: #2C2C2C;
    padding: 40px 60px;
    height: 100%;
    box-sizing: border-box;
    position: relative;
}
.amp-rule {
    position: absolute;
    left: 0;
    width: 100%;
    height: 2px;
    background: #D91E18;
    z-index: 10;
}
.amp-rule-top { top: 0; }
.amp-rule-bottom { bottom: 0; }
.amp-content-header { margin-bottom: 24px; }
.amp-slide-title {
    font-family: var(--font-display);
    font-size: 26px;
    color: #2C2C2C;
    margin: 0 0 6px 0;
    border: none;
    padding: 0;
    line-height: 1.25;
    font-weight: 700;
}
.amp-slide-subtitle {
    font-family: var(--font-body);
    font-size: 14px;
    color: #888888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.amp-source {
    position: absolute;
    bottom: 18px;
    left: 60px;
    font-size: 11px;
    color: #888888;
    font-family: var(--font-body);
}
.amp-insight-bar {
    margin-top: 18px;
    background: #FFFFFF;
    border-left: 4px solid #D91E18;
    padding: 14px 18px;
    font-family: var(--font-body);
    font-size: 13px;
    color: #2C2C2C;
    line-height: 1.5;
}
.amp-insight-bar strong { color: #D91E18; font-weight: 700; }

/* ── AMP-COVER ── */
.amp-cover { position: relative; overflow: hidden; }
.amp-cover-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    height: 100%;
    box-sizing: border-box;
    padding: 60px;
}
.amp-cover-title {
    font-family: var(--font-display);
    font-size: 48px;
    color: #2C2C2C;
    margin: 0;
    border: none;
    padding: 0;
    line-height: 1.2;
    font-weight: 700;
}
.amp-cover-subtitle {
    font-family: var(--font-display);
    font-size: 24px;
    color: #2C2C2C;
    margin-top: 14px;
}
.amp-cover-meta {
    font-family: var(--font-body);
    font-size: 14px;
    color: #888888;
    margin-top: 14px;
}
.amp-cover-stats {
    display: flex;
    gap: 60px;
    margin-top: 44px;
}
.amp-cover-stat { text-align: left; min-width: 180px; }
.amp-cover-stat-value {
    font-family: var(--font-display);
    font-size: 38px;
    color: #2C2C2C;
    line-height: 1.2;
    font-weight: 700;
}
.amp-cover-stat:nth-child(2) .amp-cover-stat-value { color: #D91E18; }
.amp-cover-stat-label {
    font-family: var(--font-body);
    font-size: 13px;
    color: #888888;
    margin-top: 6px;
}

/* ── AMP-TOC ── */
.amp-toc { background: #F4F4F4; }
.amp-toc-title {
    font-family: var(--font-display);
    font-size: 32px;
    color: #2C2C2C;
    margin: 0 0 36px 0;
    border: none;
    padding: 0;
}
.amp-toc-rows { display: flex; flex-direction: column; gap: 26px; }
.amp-toc-row {
    display: flex;
    align-items: center;
    gap: 24px;
    padding-bottom: 24px;
    border-bottom: 1px solid #CCCCCC;
}
.amp-toc-num {
    font-family: var(--font-display);
    font-size: 48px;
    color: #2C2C2C;
    line-height: 1.2;
    min-width: 84px;
    font-weight: 700;
}
.amp-toc-text { flex: 1; }
.amp-toc-chapter-title {
    font-family: var(--font-display);
    font-size: 22px;
    color: #2C2C2C;
    font-weight: 700;
}
.amp-toc-chapter-desc {
    font-family: var(--font-body);
    font-size: 14px;
    color: #888888;
    margin-top: 4px;
}
.amp-toc-page {
    font-family: var(--font-display);
    font-size: 18px;
    color: #D91E18;
    font-weight: 700;
}
.amp-footer {
    position: absolute;
    bottom: 18px;
    left: 60px;
    right: 60px;
    display: flex;
    justify-content: space-between;
    font-family: var(--font-body);
    font-size: 11px;
    color: #888888;
}

/* ── AMP-CHAPTER ── */
.amp-chapter { position: relative; overflow: hidden; }
.amp-chapter-number {
    position: absolute;
    right: 60px;
    top: 50%;
    transform: translateY(-50%);
    font-family: var(--font-display);
    font-size: 140px;
    color: #D91E18;
    line-height: 1.4;
    font-weight: 700;
    opacity: 0.95;
}
.amp-chapter-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
    padding-left: 60px;
}
.amp-chapter-kicker {
    font-family: var(--font-body);
    font-size: 12px;
    color: #888888;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 12px;
}
.amp-chapter-title {
    font-family: var(--font-display);
    font-size: 44px;
    color: #2C2C2C;
    margin: 0;
    border: none;
    padding: 0;
    line-height: 1.2;
    max-width: 820px;
    font-weight: 700;
}
.amp-chapter-subtitle {
    font-family: var(--font-body);
    font-size: 17px;
    color: #888888;
    margin-top: 16px;
    max-width: 720px;
    line-height: 1.45;
}

/* ── AMP-CONTENT-SPLIT ── */
.amp-split { display: flex; gap: 40px; height: 360px; }
.amp-split-left { flex: 1.1; display: flex; flex-direction: column; gap: 16px; }
.amp-split-img { width: 100%; height: 180px; object-fit: cover; border-radius: 8px; }
.amp-split-bullets { list-style: none; padding: 0; margin: 0; }
.amp-split-bullets li {
    font-family: var(--font-body);
    font-size: 14px;
    color: #2C2C2C;
    line-height: 1.55;
    margin-bottom: 10px;
    padding-left: 18px;
    position: relative;
}
.amp-split-bullets li::before {
    content: "■";
    position: absolute;
    left: 0;
    color: #2C2C2C;
    font-size: 8px;
    top: 4px;
}
.amp-split-right { flex: 1; display: flex; flex-direction: column; gap: 16px; }
.amp-info-card {
    background: #FFFFFF;
    border-left: 4px solid #D91E18;
    padding: 14px 18px;
    border-radius: 0 8px 8px 0;
}
.amp-info-card-title {
    font-family: var(--font-display);
    font-size: 13px;
    color: #888888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
    font-weight: 700;
}
.amp-info-card-body {
    font-family: var(--font-body);
    font-size: 14px;
    color: #2C2C2C;
    line-height: 1.5;
}

/* ── AMP-STAT-3COL ── */
.amp-stat3-grid { display: flex; gap: 28px; margin-top: 8px; }
.amp-stat3-card { flex: 1; }
.amp-stat3-value {
    font-family: var(--font-display);
    font-size: 40px;
    color: #D91E18;
    line-height: 1.2;
    font-weight: 700;
}
.amp-stat3-label {
    font-family: var(--font-body);
    font-size: 14px;
    color: #2C2C2C;
    margin-top: 8px;
    font-weight: 700;
}
.amp-stat3-desc {
    font-family: var(--font-body);
    font-size: 13px;
    color: #888888;
    margin-top: 4px;
    line-height: 1.45;
}

/* ── AMP-CHART ── */
.amp-chart-wrap { display: flex; gap: 32px; height: 360px; }
.amp-chart-wrap > * { min-height: 0; }
.amp-chart-viz { flex: 1.1; background: #FFFFFF; border-radius: 8px; padding: 16px; position: relative; overflow: hidden; }
.amp-chart-viz canvas { position: absolute; top: 0; left: 0; width: 100% !important; height: 100% !important; }
.amp-chart-cards { flex: 0.9; display: flex; flex-direction: column; gap: 16px; overflow: hidden; }
.amp-chart-card {
    background: #FFFFFF;
    border-left: 4px solid #D91E18;
    padding: 14px 18px;
    border-radius: 0 8px 8px 0;
}
.amp-chart-card-title {
    font-family: var(--font-display);
    font-size: 13px;
    color: #888888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
    font-weight: 700;
}
.amp-chart-card-body {
    font-family: var(--font-body);
    font-size: 13px;
    color: #2C2C2C;
    line-height: 1.45;
}
.amp-chart-bottom { margin-top: 18px; }

/* ── AMP-PLATFORM-3COL ── */
.amp-platform-flow { display: flex; align-items: stretch; gap: 0; margin-bottom: 24px; }
.amp-platform-card {
    flex: 1;
    background: #FFFFFF;
    border: 1px solid #CCCCCC;
    border-radius: 8px;
    padding: 20px;
    text-align: center;
}
.amp-platform-title {
    font-family: var(--font-display);
    font-size: 18px;
    color: #2C2C2C;
    margin-bottom: 8px;
    font-weight: 700;
}
.amp-platform-desc {
    font-family: var(--font-body);
    font-size: 13px;
    color: #888888;
    line-height: 1.5;
}
.amp-platform-connector {
    width: 40px;
    height: 2px;
    background: #D91E18;
    align-self: center;
}

/* ── AMP-GTM-FLOW ── */
.amp-gtm-flow { position: relative; height: 260px; margin-bottom: 20px; }
.amp-gtm-center { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 2; }
.amp-gtm-core {
    width: 120px;
    height: 80px;
    background: #D91E18;
    color: #FFFFFF;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 700;
    border-radius: 4px;
}
.amp-gtm-nodes { position: relative; width: 100%; height: 100%; }
.amp-gtm-outer {
    position: absolute;
    width: 180px;
    background: #FFFFFF;
    border: 1px solid #CCCCCC;
    border-radius: 8px;
    padding: 14px;
    text-align: center;
}
.amp-gtm-outer[data-pos="0"] { left: 50%; top: 10px; transform: translateX(-50%); }
.amp-gtm-outer[data-pos="1"] { right: 80px; top: 90px; }
.amp-gtm-outer[data-pos="2"] { right: 80px; bottom: 10px; }
.amp-gtm-outer[data-pos="3"] { left: 80px; bottom: 10px; }
.amp-gtm-outer[data-pos="4"] { left: 80px; top: 90px; }
.amp-gtm-node-title {
    font-family: var(--font-display);
    font-size: 14px;
    color: #2C2C2C;
    font-weight: 700;
    margin-bottom: 4px;
}
.amp-gtm-node-sub {
    font-family: var(--font-body);
    font-size: 12px;
    color: #888888;
}
.amp-gtm-details { display: flex; gap: 24px; }
.amp-gtm-detail-col { flex: 1; display: flex; flex-direction: column; gap: 12px; }
.amp-gtm-detail {
    background: #FFFFFF;
    border-left: 4px solid #D91E18;
    padding: 10px 14px;
    border-radius: 0 8px 8px 0;
    font-family: var(--font-body);
    font-size: 13px;
    color: #2C2C2C;
    line-height: 1.45;
}
.amp-gtm-detail strong { color: #D91E18; }

/* ── AMP-PROCESS-3COL ── */
.amp-process-header { display: flex; gap: 20px; margin-bottom: 16px; }
.amp-process-tab {
    flex: 1;
    background: #FFFFFF;
    border: 1px solid #CCCCCC;
    border-radius: 8px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.amp-process-tab-active {
    background: #D91E18;
    color: #FFFFFF;
    border-color: #D91E18;
}
.amp-process-tab-num {
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 700;
}
.amp-process-tab-title {
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 700;
}
.amp-process-tab-range {
    font-family: var(--font-body);
    font-size: 12px;
    color: inherit;
    opacity: 0.85;
}
.amp-process-tab-active .amp-process-tab-title,
.amp-process-tab-active .amp-process-tab-num { color: #FFFFFF; }
.amp-process-tab-active .amp-process-tab-range { color: #FFD0CE; }
.amp-process-cards { display: flex; gap: 20px; height: 260px; }
.amp-process-card {
    flex: 1;
    background: #FFFFFF;
    border: 1px solid #CCCCCC;
    border-top: 5px solid #D91E18;
    border-radius: 0 0 8px 8px;
    padding: 16px;
    overflow: hidden;
}
.amp-process-list { list-style: none; padding: 0; margin: 0; }
.amp-process-list li {
    font-family: var(--font-body);
    font-size: 13px;
    color: #2C2C2C;
    line-height: 1.45;
    margin-bottom: 10px;
}
.amp-process-list li strong { color: #D91E18; font-weight: 700; }

/* ── AMP-MOTION-3COL ── */
.amp-motion-top { display: flex; gap: 24px; margin-bottom: 20px; }
.amp-motion-card {
    flex: 1;
    background: #2C2C2C;
    color: #FFFFFF;
    border-radius: 8px;
    padding: 18px;
    text-align: center;
}
.amp-motion-card-red { background: #D91E18; }
.amp-motion-acv {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 6px;
}
.amp-motion-title {
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 4px;
}
.amp-motion-sub {
    font-family: var(--font-body);
    font-size: 12px;
    color: #CCCCCC;
}
.amp-motion-card-red .amp-motion-sub { color: #FFD0CE; }
.amp-motion-bottom { display: flex; gap: 24px; }
.amp-motion-detail {
    flex: 1;
    background: #FFFFFF;
    border: 1px solid #CCCCCC;
    border-radius: 8px;
    padding: 16px;
}
.amp-motion-detail-title {
    font-family: var(--font-display);
    font-size: 14px;
    color: #D91E18;
    font-weight: 700;
    margin-bottom: 6px;
}
.amp-motion-detail-body {
    font-family: var(--font-body);
    font-size: 13px;
    color: #2C2C2C;
    line-height: 1.5;
}

/* ── AMP-STATS-3BIG ── */
.amp-stats-big-wrap { display: flex; gap: 40px; height: 440px; }
.amp-stats-big-left { width: 34%; display: flex; flex-direction: column; gap: 20px; }
.amp-stats-big-item { padding-bottom: 16px; border-bottom: 1px solid #CCCCCC; }
.amp-stats-big-value {
    font-family: var(--font-display);
    font-size: 48px;
    color: #D91E18;
    line-height: 1.2;
    font-weight: 700;
}
.amp-stats-big-label {
    font-family: var(--font-display);
    font-size: 14px;
    color: #2C2C2C;
    margin-top: 6px;
    font-weight: 700;
}
.amp-stats-big-sub {
    font-family: var(--font-body);
    font-size: 12px;
    color: #888888;
    margin-top: 4px;
    line-height: 1.4;
}
.amp-stats-big-right { flex: 1; display: flex; flex-direction: column; gap: 14px; }
.amp-stats-big-right-title {
    font-family: var(--font-display);
    font-size: 16px;
    color: #2C2C2C;
    font-weight: 700;
}
.amp-stats-big-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.amp-stats-big-card {
    background: #FFFFFF;
    border-left: 4px solid #D91E18;
    padding: 14px;
    border-radius: 0 8px 8px 0;
}
.amp-stats-big-card-title {
    font-family: var(--font-display);
    font-size: 14px;
    color: #D91E18;
    font-weight: 700;
    margin-bottom: 6px;
}
.amp-stats-big-card-body {
    font-family: var(--font-body);
    font-size: 13px;
    color: #2C2C2C;
    line-height: 1.45;
}
.amp-stats-big-paneltext {
    background: #FFFFFF;
    border: 1px solid #CCCCCC;
    border-radius: 8px;
    padding: 14px;
    font-family: var(--font-body);
    font-size: 13px;
    color: #2C2C2C;
    line-height: 1.5;
}

/* ── AMP-TOOL-STACK ── */
.amp-tool-pipeline { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.amp-tool-step {
    flex: 1;
    background: #FFFFFF;
    border: 1px solid #CCCCCC;
    border-radius: 8px;
    padding: 12px;
    text-align: center;
}
.amp-tool-step-highlight {
    background: #D91E18;
    color: #FFFFFF;
    border-color: #D91E18;
}
.amp-tool-step-title {
    font-family: var(--font-display);
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 4px;
}
.amp-tool-step-tools {
    font-family: var(--font-body);
    font-size: 11px;
    color: inherit;
    opacity: 0.85;
}
.amp-tool-arrow {
    font-family: var(--font-display);
    font-size: 20px;
    color: #D91E18;
    font-weight: 700;
}
.amp-tool-grid { display: flex; gap: 24px; }
.amp-tool-list { flex: 1; display: flex; flex-direction: column; gap: 12px; }
.amp-tool-card {
    background: #FFFFFF;
    border-left: 4px solid #D91E18;
    padding: 12px 16px;
    border-radius: 0 8px 8px 0;
}
.amp-tool-card-teal { border-left-color: #00A3A1; }
.amp-tool-card-title {
    font-family: var(--font-display);
    font-size: 14px;
    color: #D91E18;
    font-weight: 700;
    margin-bottom: 4px;
}
.amp-tool-card-teal .amp-tool-card-title { color: #00A3A1; }
.amp-tool-card-body {
    font-family: var(--font-body);
    font-size: 13px;
    color: #2C2C2C;
    line-height: 1.45;
}
.amp-tool-feature {
    width: 38%;
    background: #FFFFFF;
    border-left: 4px solid #00A3A1;
    padding: 16px;
    border-radius: 0 8px 8px 0;
}
.amp-tool-feature-title {
    font-family: var(--font-display);
    font-size: 15px;
    color: #00A3A1;
    font-weight: 700;
    margin-bottom: 8px;
}
.amp-tool-feature-body {
    font-family: var(--font-body);
    font-size: 13px;
    color: #2C2C2C;
    line-height: 1.5;
}

/* ── AMP-PRICING-3COL ── */
.amp-pricing-grid { display: flex; gap: 24px; align-items: stretch; }
.amp-pricing-card {
    flex: 1;
    background: #FFFFFF;
    border: 1px solid #CCCCCC;
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
.amp-pricing-card-featured {
    border: 2px solid #00A3A1;
    transform: scale(1.02);
}
.amp-pricing-top {
    padding: 18px;
    text-align: center;
    color: #FFFFFF;
}
.amp-pricing-name {
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 6px;
}
.amp-pricing-price {
    font-family: var(--font-display);
    font-size: 26px;
    font-weight: 700;
}
.amp-pricing-body { padding: 18px; flex: 1; display: flex; flex-direction: column; }
.amp-pricing-desc {
    font-family: var(--font-body);
    font-size: 13px;
    color: #2C2C2C;
    line-height: 1.5;
    margin-bottom: 12px;
}
.amp-pricing-features { list-style: none; padding: 0; margin: 0 0 12px 0; flex: 1; }
.amp-pricing-features li {
    font-family: var(--font-body);
    font-size: 13px;
    color: #2C2C2C;
    line-height: 1.4;
    margin-bottom: 6px !important;
    padding-left: 16px;
    position: relative;
}
.amp-pricing-features li::before {
    content: "✓";
    position: absolute;
    left: 0;
    color: #00A3A1;
    font-weight: 700;
    font-size: 12px;
    top: 1px;
}
.amp-pricing-bestfor {
    font-family: var(--font-body);
    font-size: 12px;
    color: #888888;
    margin-top: auto;
}

/* ── AMP-STEPS-5COL ── */
.amp-steps-flow { display: flex; align-items: stretch; gap: 0; }
.amp-step-card {
    flex: 1;
    background: #FFFFFF;
    border: 1px solid #CCCCCC;
    border-radius: 8px;
    padding: 16px;
    text-align: center;
}
.amp-step-num {
    font-family: var(--font-display);
    font-size: 26px;
    color: #D91E18;
    font-weight: 700;
    margin-bottom: 8px;
}
.amp-step-title {
    font-family: var(--font-display);
    font-size: 14px;
    color: #2C2C2C;
    font-weight: 700;
    margin-bottom: 6px;
}
.amp-step-body {
    font-family: var(--font-body);
    font-size: 12px;
    color: #888888;
    line-height: 1.45;
}
.amp-step-connector {
    width: 24px;
    height: 2px;
    background: #D91E18;
    align-self: center;
}

/* ── AMP-4PILLARS ── */
.amp-pillars { position: relative; height: 440px; }
.amp-pillar-card {
    position: absolute;
    width: 220px;
    background: #FFFFFF;
    border: 1px solid #CCCCCC;
    border-top: 5px solid #00A3A1;
    border-radius: 0 0 8px 8px;
    padding: 18px;
}
.amp-pillar-card[data-pos="0"] { left: 60px; top: 60px; }
.amp-pillar-card[data-pos="1"] { right: 60px; top: 60px; }
.amp-pillar-card[data-pos="2"] { left: 60px; bottom: 60px; }
.amp-pillar-card[data-pos="3"] { right: 60px; bottom: 60px; }
.amp-pillar-icon {
    font-size: 28px;
    margin-bottom: 8px;
}
.amp-pillar-title {
    font-family: var(--font-display);
    font-size: 16px;
    color: #2C2C2C;
    font-weight: 700;
    margin-bottom: 6px;
}
.amp-pillar-body {
    font-family: var(--font-body);
    font-size: 12px;
    color: #888888;
    line-height: 1.45;
}
.amp-pillar-center {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 180px;
    height: 100px;
    background: #D91E18;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: #FFFFFF;
}
.amp-pillar-center-label {
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.3;
}

/* ── AMP-AARRR ── */
.amp-aarrr-flow { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
.amp-aarrr-stage {
    flex: 1;
    background: #FFFFFF;
    border: 1px solid #CCCCCC;
    border-radius: 8px;
    padding: 14px 8px;
    text-align: center;
}
.amp-aarrr-letter {
    font-family: var(--font-display);
    font-size: 24px;
    color: #D91E18;
    font-weight: 700;
    line-height: 1.2;
}
.amp-aarrr-name {
    font-family: var(--font-display);
    font-size: 13px;
    color: #2C2C2C;
    font-weight: 700;
    margin-top: 6px;
}
.amp-aarrr-metric {
    font-family: var(--font-body);
    font-size: 11px;
    color: #888888;
    margin-top: 4px;
}
.amp-aarrr-arrow {
    font-family: var(--font-display);
    font-size: 20px;
    color: #D91E18;
    font-weight: 700;
}
.amp-aarrr-cards { display: flex; gap: 18px; }
.amp-aarrr-card {
    flex: 1;
    background: #FFFFFF;
    border-left: 4px solid #00A3A1;
    padding: 14px;
    border-radius: 0 8px 8px 0;
}
.amp-aarrr-card-title {
    font-family: var(--font-display);
    font-size: 14px;
    color: #00A3A1;
    font-weight: 700;
    margin-bottom: 6px;
}
.amp-aarrr-card-body {
    font-family: var(--font-body);
    font-size: 13px;
    color: #2C2C2C;
    line-height: 1.45;
}

/* ── AMP-TAKEAWAYS-6 ── */
.amp-takeaways-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.amp-takeaway-card {
    background: #FFFFFF;
    border: 1px solid #CCCCCC;
    border-top: 5px solid #D91E18;
    border-radius: 0 0 8px 8px;
    padding: 18px;
}
.amp-takeaway-title {
    font-family: var(--font-display);
    font-size: 15px;
    color: #2C2C2C;
    font-weight: 700;
    margin-bottom: 8px;
}
.amp-takeaway-body {
    font-family: var(--font-body);
    font-size: 13px;
    color: #888888;
    line-height: 1.5;
}

/* ── AMP-CLOSING ── */
.amp-closing { position: relative; overflow: hidden; }
.amp-closing-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    height: 100%;
    box-sizing: border-box;
    padding: 60px;
}
.amp-closing-title {
    font-family: var(--font-display);
    font-size: 54px;
    color: #2C2C2C;
    margin: 0;
    border: none;
    padding: 0;
    line-height: 1.3;
    font-weight: 700;
}
.amp-closing-subtitle {
    font-family: var(--font-body);
    font-size: 18px;
    color: #888888;
    margin-top: 16px;
    max-width: 720px;
    line-height: 1.5;
}
.amp-closing-cards { display: flex; gap: 28px; margin-top: 40px; }
.amp-closing-card {
    width: 220px;
    background: #FFFFFF;
    border: 1px solid #CCCCCC;
    border-top: 5px solid #00A3A1;
    border-radius: 0 0 8px 8px;
    padding: 20px;
}
.amp-closing-card-title {
    font-family: var(--font-display);
    font-size: 16px;
    color: #2C2C2C;
    font-weight: 700;
    margin-bottom: 8px;
}
.amp-closing-card-body {
    font-family: var(--font-body);
    font-size: 13px;
    color: #888888;
    line-height: 1.5;
}
.amp-closing-prompt {
    font-family: var(--font-display);
    font-size: 24px;
    color: #D91E18;
    margin-top: 36px;
    font-weight: 700;
}
.amp-closing-footer {
    font-family: var(--font-body);
    font-size: 12px;
    color: #888888;
    margin-top: 24px;
}
```
