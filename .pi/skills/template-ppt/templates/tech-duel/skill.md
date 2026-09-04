# Tech Duel Template Skill Reference

Template-specific instructions, layout codes, and HTML/CSS renderers for the
`TECH_DUEL` theme — a high-contrast, two-sided comparison deck inspired by the
NVIDIA DGX Spark vs. AMD Threadripper PRO 7000 presentation.

Use this template for head-to-head technology, product, platform, or concept
comparisons. The agent must treat the topic as a **duel** and consistently
produce two-sided content: Product/Option A (green) vs. Product/Option B (red).

---

## 🎨 Design Theme Specification

- **Palette**: Deep obsidian `#0D1117` for dark slides, clean cloud `#F6F7F9`
  for content slides, duel green `#76B900` for Product A, duel red `#ED1C24`
  for Product B, charcoal `#1F2328` for body text, and slate `#656D76` for
  secondary text.
- **Borders**: Subtle 1px `#D0D7DE` borders on light cards; no borders on dark
  slides.
- **Typography**: Geometric display sans `"Outfit"` for headlines and labels;
  warm humanist sans `"Quattrocento Sans"` for body copy.
- **Images**: Clean product/technology photography; no filters. Dark slides use
  full-bleed images with gradient overlays. Light slides use contained images
  with rounded corners.

---

## 🧠 Content Generation Rules

1. **Always frame the topic as a two-sided comparison.** Identify an "Option A"
   and an "Option B" from the user's topic (e.g., "NVIDIA DGX Spark" vs.
   "Threadripper PRO 7000", "React" vs. "Vue", "Solar" vs. "Wind").
2. **Use real data.** Every spec, benchmark, price, and market claim must be
   grounded in the web search from Step 2 of the main skill.
3. **Keep the green/red assignment consistent:**
   - Product A (usually the first named, the newer/AI/cloud/integrated option)
     → green `#76B900`.
   - Product B (usually the incumbent/versatile/expansion option) → red
     `#ED1C24`.
4. **Slide rhythm:** alternate dark section dividers with light content slides.
   Never place two section dividers back-to-back.
5. **Minimum deck structure for any topic:**
   - DUEL-COVER
   - DUEL-TOC
   - DUEL-SECTION (Product Overview)
   - DUEL-PRODUCT-A
   - DUEL-PRODUCT-B
   - DUEL-SECTION (Architecture / Core Design)
   - DUEL-ARCH-A or DUEL-USECASE-A
   - DUEL-ARCH-B or DUEL-USECASE-B
   - DUEL-TAKEAWAYS or DUEL-CHART
   - DUEL-VALUE or DUEL-DECISION
   - DUEL-CLOSING
6. **Sources:** include a `source` field on every data-heavy slide.

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
        bg: '#F6F7F9',
        primary: '#76B900',
        secondary: '#ED1C24',
        accent: '#1F2328',
        muted: '#656D76',
        border: '#D0D7DE'
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

    const textC = 'rgba(31,35,40,0.85)';
    const gridC = 'rgba(31,35,40,0.08)';
    const tipBg = 'rgba(255,255,255,0.97)';
    const fontBody = 'Quattrocento Sans';

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

### 1. `DUEL-COVER` (Dark hero cover)

```js
if (slide.layout === 'DUEL-COVER') {
    return `
    <div class="slide duel-dark duel-cover">
        ${slide.image ? `<img class="duel-cover-bg" src="${getBase64Image(slide.image)}">` : ''}
        <div class="duel-cover-gradient"></div>
        <div class="duel-cover-bar"></div>
        <div class="duel-content duel-cover-content">
            <div class="duel-cover-kicker">Comparative Analysis</div>
            <h1 class="duel-cover-title">${slide.title}</h1>
            <div class="duel-cover-subtitle">${slide.subtitle || ''}</div>
            <div class="duel-cover-date">${config.date}</div>
            <div class="duel-cover-footer">${config.presenter}</div>
        </div>
    </div>`;
}
```

### 2. `DUEL-TOC` (Dark table of contents)

```js
if (slide.layout === 'DUEL-TOC') {
    return `
    <div class="slide duel-dark duel-toc">
        <div class="duel-content">
            <div class="duel-toc-kicker">Executive Overview</div>
            <h2 class="duel-toc-title">Table of Contents</h2>
            <div class="duel-toc-grid">
                ${(slide.sections || []).map(s => `
                <div class="duel-toc-item">
                    <div class="duel-toc-number">${s.number || s.num || ''}</div>
                    <div class="duel-toc-text">
                        <div class="duel-toc-section-title">${s.title}</div>
                        <div class="duel-toc-section-desc">${s.description || s.desc || ''}</div>
                    </div>
                </div>`).join('')}
            </div>
        </div>
    </div>`;
}
```

### 3. `DUEL-SECTION` (Dark section divider)

```js
if (slide.layout === 'DUEL-SECTION') {
    return `
    <div class="slide duel-dark duel-section">
        ${slide.image ? `<img class="duel-section-bg" src="${getBase64Image(slide.image)}">` : ''}
        <div class="duel-section-overlay"></div>
        <div class="duel-content duel-section-content">
            <div class="duel-section-number">${slide.number || slide.num || ''}</div>
            <div class="duel-section-line"></div>
            <h2 class="duel-section-title">${slide.title}</h2>
            <div class="duel-section-subtitle">${slide.subtitle || ''}</div>
        </div>
    </div>`;
}
```

### 4. `DUEL-PRODUCT-A` (Product A spec sheet — green)

```js
if (slide.layout === 'DUEL-PRODUCT-A') {
    return `
    <div class="slide duel-light duel-product">
        <div class="duel-accent-bar duel-bar-green"></div>
        <div class="duel-content duel-product-content">
            <h2 class="duel-product-title">${slide.title}</h2>
            <div class="duel-product-tagline">${slide.tagline || ''}</div>
            <div class="duel-product-grid">
                <div class="duel-product-left">
                    <div class="duel-product-image-wrap">
                        ${slide.image ? `<img class="duel-product-image" src="${getBase64Image(slide.image)}">` : '<div class="duel-product-image-placeholder"></div>'}
                    </div>
                    <div class="duel-product-badge duel-badge-green">${slide.badge || 'PRODUCT A'}</div>
                </div>
                <div class="duel-product-right">
                    <div class="duel-product-specs">
                        <div class="duel-specs-header">Key Specifications</div>
                        ${(slide.specs || []).map(s => `
                        <div class="duel-spec-row">
                            <span class="duel-spec-label">${s.label}:</span>
                            <span class="duel-spec-value">${s.value}</span>
                        </div>`).join('')}
                    </div>
                    <div class="duel-product-price">
                        <div class="duel-price-label">Pricing</div>
                        <div class="duel-price-value duel-green-text">${slide.price || ''}</div>
                        <div class="duel-price-note">${slide.priceNote || ''}</div>
                    </div>
                    <div class="duel-product-differentiator" style="border-left:4px solid #76B900;">
                        <div class="duel-diff-label duel-green-text">Key Differentiator</div>
                        <div class="duel-diff-text">${slide.differentiator || ''}</div>
                    </div>
                </div>
            </div>
            <div class="duel-product-bottom">
                <div class="duel-product-whatis">
                    <div class="duel-bottom-header duel-green-text">What ${slide.productName || 'it'} is — and isn't</div>
                    <p><strong>${slide.productName || 'Product A'} is:</strong> ${slide.whatItIs || ''}</p>
                    <p><strong>${slide.productName || 'Product A'} is NOT:</strong> ${slide.whatItIsnt || ''}</p>
                </div>
            </div>
            ${slide.source ? `<div class="duel-source">${slide.source}</div>` : ''}
        </div>
    </div>`;
}
```

### 5. `DUEL-PRODUCT-B` (Product B spec sheet — red)

```js
if (slide.layout === 'DUEL-PRODUCT-B') {
    return `
    <div class="slide duel-light duel-product">
        <div class="duel-accent-bar duel-bar-red"></div>
        <div class="duel-content duel-product-content">
            <h2 class="duel-product-title">${slide.title}</h2>
            <div class="duel-product-tagline">${slide.tagline || ''}</div>
            <div class="duel-product-grid">
                <div class="duel-product-left">
                    <div class="duel-product-image-wrap">
                        ${slide.image ? `<img class="duel-product-image" src="${getBase64Image(slide.image)}">` : '<div class="duel-product-image-placeholder"></div>'}
                    </div>
                    <div class="duel-product-badge duel-badge-red">${slide.badge || 'PRODUCT B'}</div>
                </div>
                <div class="duel-product-right">
                    <div class="duel-product-specs">
                        <div class="duel-specs-header">Key Specifications</div>
                        ${(slide.specs || []).map(s => `
                        <div class="duel-spec-row">
                            <span class="duel-spec-label">${s.label}:</span>
                            <span class="duel-spec-value">${s.value}</span>
                        </div>`).join('')}
                    </div>
                    <div class="duel-product-price">
                        <div class="duel-price-label">Pricing</div>
                        <div class="duel-price-value duel-red-text">${slide.price || ''}</div>
                        <div class="duel-price-note">${slide.priceNote || ''}</div>
                    </div>
                    <div class="duel-product-differentiator" style="border-left:4px solid #ED1C24;">
                        <div class="duel-diff-label duel-red-text">Key Differentiator</div>
                        <div class="duel-diff-text">${slide.differentiator || ''}</div>
                    </div>
                </div>
            </div>
            <div class="duel-product-bottom">
                <div class="duel-product-whatis">
                    <div class="duel-bottom-header duel-red-text">What ${slide.productName || 'it'} is — and isn't</div>
                    <p><strong>${slide.productName || 'Product B'} is:</strong> ${slide.whatItIs || ''}</p>
                    <p><strong>${slide.productName || 'Product B'} is NOT:</strong> ${slide.whatItIsnt || ''}</p>
                </div>
            </div>
            ${slide.source ? `<div class="duel-source">${slide.source}</div>` : ''}
        </div>
    </div>`;
}
```

### 6. `DUEL-ARCH-A` (Architecture / deep dive — green)

```js
if (slide.layout === 'DUEL-ARCH-A') {
    return `
    <div class="slide duel-light duel-arch">
        <div class="duel-accent-bar duel-bar-green"></div>
        <div class="duel-content duel-arch-content">
            <h2 class="duel-arch-title">${slide.title}</h2>
            <div class="duel-arch-top">
                <div class="duel-arch-blocks">
                    <div class="duel-arch-blocks-header">${slide.blocksTitle || 'Architecture'}</div>
                    <div class="duel-arch-blocks-grid">
                        ${(slide.blocks || []).map(b => `
                        <div class="duel-arch-block">
                            <div class="duel-arch-block-title duel-green-text">${b.title}</div>
                            <div class="duel-arch-block-items">${(b.items || []).map(i => `<div>${i}</div>`).join('')}</div>
                        </div>`).join('')}
                    </div>
                    ${slide.highlightBar ? `<div class="duel-arch-highlight duel-highlight-green">${slide.highlightBar}</div>` : ''}
                </div>
                <div class="duel-arch-metrics-panel">
                    <div class="duel-arch-metrics-header">Key Metrics</div>
                    <div class="duel-arch-metrics">
                        ${(slide.metrics || []).map(m => `
                        <div class="duel-arch-metric">
                            <div class="duel-arch-metric-value duel-green-text">${m.value}</div>
                            <div class="duel-arch-metric-label">${m.label}</div>
                        </div>`).join('')}
                    </div>
                </div>
            </div>
            <div class="duel-arch-bottom">
                <div class="duel-arch-bottom-header duel-green-text">${slide.bottomTitle || 'The Bottom Line'}</div>
                <p>${slide.bottomline || ''}</p>
            </div>
            ${slide.source ? `<div class="duel-source">${slide.source}</div>` : ''}
        </div>
    </div>`;
}
```

### 7. `DUEL-ARCH-B` (Architecture / deep dive — red)

```js
if (slide.layout === 'DUEL-ARCH-B') {
    return `
    <div class="slide duel-light duel-arch">
        <div class="duel-accent-bar duel-bar-red"></div>
        <div class="duel-content duel-arch-content">
            <h2 class="duel-arch-title">${slide.title}</h2>
            <div class="duel-arch-top">
                <div class="duel-arch-blocks">
                    <div class="duel-arch-blocks-header">${slide.blocksTitle || 'Architecture'}</div>
                    <div class="duel-arch-blocks-grid">
                        ${(slide.blocks || []).map(b => `
                        <div class="duel-arch-block">
                            <div class="duel-arch-block-title duel-red-text">${b.title}</div>
                            <div class="duel-arch-block-items">${(b.items || []).map(i => `<div>${i}</div>`).join('')}</div>
                        </div>`).join('')}
                    </div>
                    ${slide.highlightBar ? `<div class="duel-arch-highlight duel-highlight-red">${slide.highlightBar}</div>` : ''}
                </div>
                <div class="duel-arch-metrics-panel">
                    <div class="duel-arch-metrics-header">Key Metrics</div>
                    <div class="duel-arch-metrics">
                        ${(slide.metrics || []).map(m => `
                        <div class="duel-arch-metric">
                            <div class="duel-arch-metric-value duel-red-text">${m.value}</div>
                            <div class="duel-arch-metric-label">${m.label}</div>
                        </div>`).join('')}
                    </div>
                </div>
            </div>
            <div class="duel-arch-bottom">
                <div class="duel-arch-bottom-header duel-red-text">${slide.bottomTitle || 'The Bottom Line'}</div>
                <p>${slide.bottomline || ''}</p>
            </div>
            ${slide.source ? `<div class="duel-source">${slide.source}</div>` : ''}
        </div>
    </div>`;
}
```

### 8. `DUEL-TAKEAWAYS` (Side-by-side wins)

```js
if (slide.layout === 'DUEL-TAKEAWAYS') {
    return `
    <div class="slide duel-light duel-takeaways">
        <div class="duel-accent-bar duel-bar-gradient"></div>
        <div class="duel-content duel-takeaways-content">
            <h2 class="duel-takeaways-title">${slide.title}</h2>
            <div class="duel-takeaways-grid">
                <div class="duel-takeaways-col duel-takeaways-green">
                    <div class="duel-takeaways-col-header duel-green-text">${slide.leftTitle || 'Option A Wins On'}</div>
                    <ul class="duel-takeaways-list">
                        ${(slide.leftWins || slide.leftBullets || []).map(w => `
                        <li><span class="duel-takeaways-check duel-green-text">✓</span> ${w.text || w}</li>`).join('')}
                    </ul>
                </div>
                <div class="duel-takeaways-col duel-takeaways-red">
                    <div class="duel-takeaways-col-header duel-red-text">${slide.rightTitle || 'Option B Wins On'}</div>
                    <ul class="duel-takeaways-list">
                        ${(slide.rightWins || slide.rightBullets || []).map(w => `
                        <li><span class="duel-takeaways-check duel-red-text">✓</span> ${w.text || w}</li>`).join('')}
                    </ul>
                </div>
            </div>
            ${slide.source ? `<div class="duel-source">${slide.source}</div>` : ''}
        </div>
    </div>`;
}
```

### 9. `DUEL-CHART` (Benchmark / data slide)

```js
if (slide.layout === 'DUEL-CHART') {
    const chartHTML = renderChart(slide);
    return `
    <div class="slide duel-light duel-chart">
        <div class="duel-accent-bar duel-bar-gradient"></div>
        <div class="duel-content duel-chart-content">
            <h2 class="duel-chart-title">${slide.title}</h2>
            <div class="duel-chart-body">
                ${slide.bullets ? `
                <div class="duel-chart-text">
                    <ul class="duel-chart-list">
                        ${slide.bullets.map(b => `<li>${b}</li>`).join('')}
                    </ul>
                </div>` : ''}
                <div class="duel-chart-viz" style="${slide.bullets ? '' : 'width:100%;'}">
                    ${chartHTML}
                </div>
            </div>
            ${slide.source ? `<div class="duel-source">${slide.source}</div>` : ''}
        </div>
    </div>`;
}
```

### 10. `DUEL-USECASE-A` (Where Product A excels — green)

```js
if (slide.layout === 'DUEL-USECASE-A') {
    return `
    <div class="slide duel-light duel-usecase">
        <div class="duel-accent-bar duel-bar-green"></div>
        <div class="duel-content duel-usecase-content">
            <h2 class="duel-usecase-title">${slide.title}</h2>
            <div class="duel-usecase-grid">
                <div class="duel-usecase-main">
                    <div class="duel-usecase-header duel-green-text">Where ${slide.productName || 'Option A'} Excels</div>
                    ${(slide.useCases || []).map(u => `
                    <div class="duel-usecase-item">
                        <div class="duel-usecase-item-title">${u.title}</div>
                        <div class="duel-usecase-item-text">${u.text || u.description || ''}</div>
                    </div>`).join('')}
                </div>
                <div class="duel-usecase-scenarios">
                    <div class="duel-usecase-header duel-green-text">Real-World Deployment Scenarios</div>
                    ${(slide.scenarios || []).map(s => `
                    <div class="duel-scenario">
                        <div class="duel-scenario-role">${s.role || s.title}</div>
                        <div class="duel-scenario-fit duel-green-text">Best fit: ${s.bestFit || ''}</div>
                        <div class="duel-scenario-reason">${s.reason || ''}</div>
                    </div>`).join('')}
                </div>
            </div>
            ${slide.source ? `<div class="duel-source">${slide.source}</div>` : ''}
        </div>
    </div>`;
}
```

### 11. `DUEL-USECASE-B` (Where Product B excels — red)

```js
if (slide.layout === 'DUEL-USECASE-B') {
    return `
    <div class="slide duel-light duel-usecase">
        <div class="duel-accent-bar duel-bar-red"></div>
        <div class="duel-content duel-usecase-content">
            <h2 class="duel-usecase-title">${slide.title}</h2>
            <div class="duel-usecase-grid">
                <div class="duel-usecase-main">
                    <div class="duel-usecase-header duel-red-text">Where ${slide.productName || 'Option B'} Excels</div>
                    ${(slide.useCases || []).map(u => `
                    <div class="duel-usecase-item">
                        <div class="duel-usecase-item-title">${u.title}</div>
                        <div class="duel-usecase-item-text">${u.text || u.description || ''}</div>
                    </div>`).join('')}
                </div>
                <div class="duel-usecase-scenarios">
                    <div class="duel-usecase-header duel-red-text">Real-World Deployment Scenarios</div>
                    ${(slide.scenarios || []).map(s => `
                    <div class="duel-scenario">
                        <div class="duel-scenario-role">${s.role || s.title}</div>
                        <div class="duel-scenario-fit duel-red-text">Best fit: ${s.bestFit || ''}</div>
                        <div class="duel-scenario-reason">${s.reason || ''}</div>
                    </div>`).join('')}
                </div>
            </div>
            ${slide.source ? `<div class="duel-source">${slide.source}</div>` : ''}
        </div>
    </div>`;
}
```

### 12. `DUEL-PRICE` (Price & value breakdown)

```js
if (slide.layout === 'DUEL-PRICE') {
    return `
    <div class="slide duel-light duel-price">
        <div class="duel-accent-bar duel-bar-gradient"></div>
        <div class="duel-content duel-price-content">
            <h2 class="duel-price-title">${slide.title}</h2>
            <div class="duel-price-grid">
                ${(slide.cards || []).map((c, i) => `
                <div class="duel-price-card ${i === 0 ? 'duel-price-card-green' : i === 1 ? 'duel-price-card-red' : 'duel-price-card-neutral'}">
                    <div class="duel-price-card-title">${c.title}</div>
                    <div class="duel-price-card-price">${c.price}</div>
                    <div class="duel-price-card-note">${c.note || ''}</div>
                    <ul class="duel-price-card-list">
                        ${(c.items || []).map(item => `<li>${item}</li>`).join('')}
                    </ul>
                </div>`).join('')}
            </div>
            ${slide.insight ? `
            <div class="duel-price-insight">
                <div class="duel-price-insight-header">Key Insight</div>
                <p>${slide.insight}</p>
            </div>` : ''}
            ${slide.source ? `<div class="duel-source">${slide.source}</div>` : ''}
        </div>
    </div>`;
}
```

### 13. `DUEL-VALUE` (Value proposition comparison)

```js
if (slide.layout === 'DUEL-VALUE') {
    return `
    <div class="slide duel-light duel-value">
        <div class="duel-accent-bar duel-bar-gradient"></div>
        <div class="duel-content duel-value-content">
            <h2 class="duel-value-title">${slide.title}</h2>
            <div class="duel-value-grid">
                <div class="duel-value-col duel-value-green">
                    <div class="duel-value-col-title duel-green-text">${slide.leftTitle || 'Option A Value Proposition'}</div>
                    <div class="duel-value-subhead">Strengths</div>
                    <ul class="duel-value-list">
                        ${(slide.leftStrengths || []).map(s => `<li>${s}</li>`).join('')}
                    </ul>
                    <div class="duel-value-subhead">Weaknesses</div>
                    <ul class="duel-value-list duel-value-weak">
                        ${(slide.leftWeaknesses || []).map(s => `<li>${s}</li>`).join('')}
                    </ul>
                </div>
                <div class="duel-value-col duel-value-red">
                    <div class="duel-value-col-title duel-red-text">${slide.rightTitle || 'Option B Value Proposition'}</div>
                    <div class="duel-value-subhead">Strengths</div>
                    <ul class="duel-value-list">
                        ${(slide.rightStrengths || []).map(s => `<li>${s}</li>`).join('')}
                    </ul>
                    <div class="duel-value-subhead">Weaknesses</div>
                    <ul class="duel-value-list duel-value-weak">
                        ${(slide.rightWeaknesses || []).map(s => `<li>${s}</li>`).join('')}
                    </ul>
                </div>
            </div>
            ${slide.verdict ? `
            <div class="duel-value-verdict">
                <div class="duel-value-verdict-header">Value Verdict by Use Case</div>
                <p>${slide.verdict}</p>
            </div>` : ''}
            ${slide.source ? `<div class="duel-source">${slide.source}</div>` : ''}
        </div>
    </div>`;
}
```

### 14. `DUEL-DECISION` (Choose your platform)

```js
if (slide.layout === 'DUEL-DECISION') {
    return `
    <div class="slide duel-light duel-decision">
        <div class="duel-accent-bar duel-bar-gradient"></div>
        <div class="duel-content duel-decision-content">
            <h2 class="duel-decision-title">${slide.title}</h2>
            <div class="duel-decision-grid">
                <div class="duel-decision-col duel-decision-green">
                    <div class="duel-decision-col-header duel-green-text">Choose ${slide.leftTitle || 'Option A'} if you...</div>
                    ${(slide.leftReasons || []).map(r => `
                    <div class="duel-decision-reason">
                        <div class="duel-decision-reason-title">${r.title}</div>
                        <div class="duel-decision-reason-text">${r.text || r.description || ''}</div>
                    </div>`).join('')}
                </div>
                <div class="duel-decision-col duel-decision-red">
                    <div class="duel-decision-col-header duel-red-text">Choose ${slide.rightTitle || 'Option B'} if you...</div>
                    ${(slide.rightReasons || []).map(r => `
                    <div class="duel-decision-reason">
                        <div class="duel-decision-reason-title">${r.title}</div>
                        <div class="duel-decision-reason-text">${r.text || r.description || ''}</div>
                    </div>`).join('')}
                </div>
            </div>
            ${slide.biggerPicture ? `
            <div class="duel-decision-bigpicture">
                <div class="duel-decision-bigpicture-header">The Bigger Picture</div>
                <p>${slide.biggerPicture}</p>
            </div>` : ''}
            ${slide.quote ? `
            <div class="duel-decision-quote">
                <span class="duel-decision-quote-mark">“</span>${slide.quote}${slide.attribution ? `<span class="duel-decision-quote-attribution"> — ${slide.attribution}</span>` : ''}
            </div>` : ''}
            ${slide.source ? `<div class="duel-source">${slide.source}</div>` : ''}
        </div>
    </div>`;
}
```

### 15. `DUEL-CLOSING` (Dark closing / thank you)

```js
if (slide.layout === 'DUEL-CLOSING') {
    return `
    <div class="slide duel-dark duel-closing">
        ${slide.image ? `<img class="duel-closing-bg" src="${getBase64Image(slide.image)}">` : ''}
        <div class="duel-closing-overlay"></div>
        <div class="duel-content duel-closing-content">
            <div class="duel-closing-bar"></div>
            <h2 class="duel-closing-title">${slide.title}</h2>
            <div class="duel-closing-statement">${slide.statement || slide.subtitle || ''}</div>
            <div class="duel-closing-thankyou">Thank You</div>
            <div class="duel-closing-footer">
                <span>${config.date}</span>
                <span class="duel-closing-separator">|</span>
                <span>${config.presenter}</span>
            </div>
        </div>
    </div>`;
}
```

---

## 🎨 Stylesheet Additions for Tech Duel

```css
/* ── Tech Duel Core ── */
.duel-dark {
    background-color: #0D1117;
    color: #E6EDF3;
}
.duel-light {
    background-color: #F6F7F9;
    color: #1F2328;
}
.duel-content {
    padding: 52px 70px;
    height: 100%;
    box-sizing: border-box;
    position: relative;
    z-index: 5;
}
.duel-green-text { color: #76B900 !important; }
.duel-red-text { color: #ED1C24 !important; }

/* ── Accent bars ── */
.duel-accent-bar {
    position: absolute;
    top: 0;
    left: 70px;
    right: 70px;
    height: 5px;
    z-index: 10;
}
.duel-bar-green { background: #76B900; }
.duel-bar-red { background: #ED1C24; }
.duel-bar-gradient { background: linear-gradient(90deg, #76B900 0%, #ED1C24 100%); }

/* ── Sources ── */
.duel-source {
    position: absolute;
    bottom: 18px;
    left: 70px;
    font-size: 10px;
    color: #656D76;
    font-family: var(--font-body);
}

/* ── DUEL-COVER ── */
.duel-cover {
    position: relative;
    overflow: hidden;
}
.duel-cover-bg {
    position: absolute;
    top: 0;
    right: 0;
    width: 55%;
    height: 100%;
    object-fit: cover;
    z-index: 1;
}
.duel-cover-gradient {
    position: absolute;
    top: 0;
    left: 0;
    width: 75%;
    height: 100%;
    background: linear-gradient(90deg, #0D1117 0%, #0D1117 55%, rgba(13,17,23,0.6) 75%, rgba(13,17,23,0) 100%);
    z-index: 2;
}
.duel-cover-bar {
    position: absolute;
    left: 70px;
    top: 210px;
    width: 7px;
    height: 280px;
    background: #76B900;
    z-index: 5;
}
.duel-cover-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-left: 100px;
}
.duel-cover-kicker {
    font-family: var(--font-label);
    font-size: 13px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #76B900;
    margin-bottom: 14px;
    font-weight: 700;
}
.duel-cover-title {
    font-family: var(--font-display);
    font-size: 54px;
    line-height: 1.1;
    color: #76B900;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: -1px;
    max-width: 720px;
    border: none;
    padding: 0;
}
.duel-cover-subtitle {
    font-family: var(--font-body);
    font-size: 20px;
    color: #E6EDF3;
    margin-top: 20px;
    max-width: 600px;
    line-height: 1.5;
}
.duel-cover-date {
    font-family: var(--font-label);
    font-size: 13px;
    color: #76B900;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-top: 30px;
    font-weight: 700;
}
.duel-cover-footer {
    position: absolute;
    bottom: 36px;
    left: 100px;
    font-size: 12px;
    color: #656D76;
    letter-spacing: 0.5px;
}

/* ── DUEL-TOC ── */
.duel-toc-kicker {
    font-family: var(--font-label);
    font-size: 13px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #76B900;
    margin-bottom: 8px;
    font-weight: 700;
}
.duel-toc-title {
    font-family: var(--font-display);
    font-size: 48px;
    color: #E6EDF3;
    margin: 0 0 40px 0;
    text-transform: uppercase;
    letter-spacing: -0.5px;
    border: none;
    padding: 0;
}
.duel-toc-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px 50px;
}
.duel-toc-item {
    display: flex;
    align-items: flex-start;
    gap: 14px;
}
.duel-toc-number {
    font-family: var(--font-display);
    font-size: 26px;
    color: #76B900;
    line-height: 1;
    font-weight: 800;
    min-width: 46px;
}
.duel-toc-section-title {
    font-family: var(--font-display);
    font-size: 16px;
    color: #E6EDF3;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 700;
    margin-bottom: 3px;
}
.duel-toc-section-desc {
    font-family: var(--font-body);
    font-size: 12px;
    color: #9BA3AB;
    line-height: 1.35;
}

/* ── DUEL-SECTION ── */
.duel-section {
    position: relative;
    overflow: hidden;
}
.duel-section-bg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 1;
    opacity: 0.35;
}
.duel-section-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, rgba(13,17,23,0.94) 0%, rgba(13,17,23,0.75) 50%, rgba(13,17,23,0.25) 100%);
    z-index: 2;
}
.duel-section-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
}
.duel-section-number {
    font-family: var(--font-display);
    font-size: 32px;
    color: #76B900;
    line-height: 1em;
    font-weight: 800;
    height: 1em;
    overflow: hidden;
    display: flex;
    align-items: center;
}
.duel-section-line {
    width: 60px;
    height: 5px;
    background: #76B900;
    margin: 16px 0 22px 0;
}
.duel-section-title {
    font-family: var(--font-display);
    font-size: 42px;
    color: #E6EDF3;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: -0.5px;
    border: none;
    padding: 0;
    max-width: 700px;
}
.duel-section-subtitle {
    font-family: var(--font-body);
    font-size: 17px;
    color: #656D76;
    margin-top: 14px;
    font-style: italic;
    max-width: 650px;
}

/* ── DUEL-PRODUCT ── */
.duel-product-content { padding-top: 60px; }
.duel-product-title {
    font-family: var(--font-display);
    font-size: 28px;
    color: #1F2328;
    margin: 0;
    text-transform: none;
    letter-spacing: -0.3px;
    border: none;
    padding: 0;
    line-height: 1.2;
}
.duel-product-tagline {
    font-family: var(--font-body);
    font-size: 15px;
    color: #656D76;
    margin-top: 6px;
    margin-bottom: 20px;
}
.duel-product-grid {
    display: flex;
    gap: 34px;
    height: 320px;
}
.duel-product-left {
    width: 34%;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.duel-product-image-wrap {
    flex: 1;
    border-radius: 8px;
    overflow: hidden;
    background: #EAECEF;
}
.duel-product-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.duel-product-image-placeholder {
    width: 100%;
    height: 100%;
    background: #EAECEF;
}
.duel-product-badge {
    display: inline-block;
    padding: 6px 12px;
    border-radius: 5px;
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: #0D1117;
    width: fit-content;
}
.duel-badge-green { background: #76B900; }
.duel-badge-red { background: #ED1C24; }
.duel-product-right {
    flex: 1;
    display: grid;
    grid-template-columns: 1.3fr 0.7fr;
    gap: 16px;
}
.duel-product-specs {
    background: #fff;
    border: 1px solid #D0D7DE;
    border-radius: 8px;
    padding: 16px;
}
.duel-specs-header {
    font-family: var(--font-label);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #656D76;
    margin-bottom: 10px;
    font-weight: 700;
}
.duel-spec-row {
    font-family: var(--font-body);
    font-size: 13px;
    line-height: 1.7;
    color: #1F2328;
}
.duel-spec-label {
    font-weight: 700;
    color: inherit;
}
.duel-spec-value {
    color: #656D76;
}
.duel-product-price {
    background: #fff;
    border: 1px solid #D0D7DE;
    border-radius: 8px;
    padding: 16px;
}
.duel-price-label {
    font-family: var(--font-label);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #656D76;
    margin-bottom: 6px;
    font-weight: 700;
}
.duel-price-value {
    font-family: var(--font-display);
    font-size: 32px;
    font-weight: 800;
    line-height: 1;
    margin-bottom: 6px;
}
.duel-price-note {
    font-family: var(--font-body);
    font-size: 11px;
    color: #656D76;
    line-height: 1.4;
}
.duel-product-differentiator {
    grid-column: 1 / -1;
    background: #fff;
    border-left: 4px solid;
    border-radius: 0 8px 8px 0;
    padding: 14px 16px;
}
.duel-product-right .duel-product-differentiator {
    border-left-color: inherit;
}
.duel-diff-label {
    font-family: var(--font-label);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 700;
    margin-bottom: 4px;
}
.duel-diff-text {
    font-family: var(--font-body);
    font-size: 12px;
    color: #1F2328;
    line-height: 1.5;
}
.duel-product-bottom {
    margin-top: 18px;
    background: #fff;
    border: 1px solid #D0D7DE;
    border-radius: 8px;
    padding: 16px;
}
.duel-bottom-header {
    font-family: var(--font-label);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 700;
    margin-bottom: 8px;
}
.duel-product-whatis p {
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.55;
    color: #1F2328;
    margin: 0 0 8px 0;
}
.duel-product-whatis p:last-child { margin-bottom: 0; }

/* ── DUEL-ARCH ── */
.duel-arch-content { padding-top: 60px; }
.duel-arch-title {
    font-family: var(--font-display);
    font-size: 28px;
    color: #1F2328;
    margin: 0 0 18px 0;
    border: none;
    padding: 0;
    line-height: 1.2;
}
.duel-arch-top {
    display: flex;
    gap: 28px;
    height: 330px;
}
.duel-arch-blocks {
    flex: 1.3;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.duel-arch-blocks-header {
    font-family: var(--font-label);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #656D76;
    font-weight: 700;
}
.duel-arch-blocks-grid {
    display: flex;
    gap: 14px;
}
.duel-arch-block {
    flex: 1;
    background: #fff;
    border: 1px solid #D0D7DE;
    border-radius: 8px;
    padding: 14px;
    text-align: center;
}
.duel-arch-block-title {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 8px;
}
.duel-arch-block-items {
    font-family: var(--font-body);
    font-size: 12px;
    color: #656D76;
    line-height: 1.5;
}
.duel-arch-highlight {
    padding: 10px 14px;
    border-radius: 6px;
    font-family: var(--font-body);
    font-size: 12px;
    color: #fff;
    font-weight: 700;
    text-align: center;
}
.duel-highlight-green { background: #76B900; }
.duel-highlight-red { background: #ED1C24; }
.duel-arch-metrics-panel {
    flex: 0.9;
    background: #fff;
    border: 1px solid #D0D7DE;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
}
.duel-arch-metrics-header {
    font-family: var(--font-label);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #656D76;
    font-weight: 700;
    margin-bottom: 14px;
}
.duel-arch-metrics {
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
    justify-content: center;
}
.duel-arch-metric {
    text-align: center;
}
.duel-arch-metric-value {
    font-family: var(--font-display);
    font-size: 34px;
    font-weight: 800;
    line-height: 1;
    margin-bottom: 4px;
}
.duel-arch-metric-label {
    font-family: var(--font-body);
    font-size: 12px;
    color: #656D76;
}
.duel-arch-bottom {
    margin-top: 16px;
    background: #fff;
    border: 1px solid #D0D7DE;
    border-radius: 8px;
    padding: 14px 16px;
}
.duel-arch-bottom-header {
    font-family: var(--font-label);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 700;
    margin-bottom: 6px;
}
.duel-arch-bottom p {
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.55;
    color: #1F2328;
    margin: 0;
}

/* ── DUEL-TAKEAWAYS ── */
.duel-takeaways-content { padding-top: 60px; }
.duel-takeaways-title {
    font-family: var(--font-display);
    font-size: 28px;
    color: #1F2328;
    margin: 0 0 22px 0;
    border: none;
    padding: 0;
    line-height: 1.2;
}
.duel-takeaways-grid {
    display: flex;
    gap: 28px;
    height: 440px;
}
.duel-takeaways-col {
    flex: 1;
    background: #fff;
    border: 1px solid #D0D7DE;
    border-top: 5px solid;
    border-radius: 0 0 8px 8px;
    padding: 18px;
}
.duel-takeaways-green { border-top-color: #76B900; }
.duel-takeaways-red { border-top-color: #ED1C24; }
.duel-takeaways-col-header {
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 14px;
}
.duel-takeaways-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.duel-takeaways-list li {
    font-family: var(--font-body);
    font-size: 13px;
    line-height: 1.5;
    color: #1F2328;
    padding-left: 0 !important;
    margin-bottom: 0 !important;
}
.duel-takeaways-list li::before { display: none !important; }
.duel-takeaways-check {
    font-weight: 800;
    margin-right: 6px;
}

/* ── DUEL-CHART ── */
.duel-chart-content { padding-top: 60px; }
.duel-chart-title {
    font-family: var(--font-display);
    font-size: 28px;
    color: #1F2328;
    margin: 0 0 18px 0;
    border: none;
    padding: 0;
    line-height: 1.2;
}
.duel-chart-body {
    display: flex;
    gap: 28px;
    height: 430px;
}
.duel-chart-text {
    width: 34%;
    display: flex;
    flex-direction: column;
    justify-content: center;
}
.duel-chart-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
}
.duel-chart-list li {
    font-family: var(--font-body);
    font-size: 14px;
    line-height: 1.5;
    color: #1F2328;
    padding-left: 0 !important;
    margin-bottom: 0 !important;
}
.duel-chart-list li::before { display: none !important; }
.duel-chart-viz {
    flex: 1;
    background: #fff;
    border: 1px solid #D0D7DE;
    border-radius: 8px;
    padding: 16px;
    position: relative;
}

/* ── DUEL-USECASE ── */
.duel-usecase-content { padding-top: 60px; }
.duel-usecase-title {
    font-family: var(--font-display);
    font-size: 28px;
    color: #1F2328;
    margin: 0 0 18px 0;
    border: none;
    padding: 0;
    line-height: 1.2;
}
.duel-usecase-grid {
    display: flex;
    gap: 28px;
    height: 440px;
}
.duel-usecase-main {
    flex: 1;
    background: #fff;
    border: 1px solid #D0D7DE;
    border-radius: 8px;
    padding: 18px;
    overflow: hidden;
}
.duel-usecase-scenarios {
    flex: 1;
    background: #fff;
    border: 1px solid #D0D7DE;
    border-radius: 8px;
    padding: 18px;
    overflow: hidden;
}
.duel-usecase-header {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 14px;
}
.duel-usecase-item {
    margin-bottom: 14px;
}
.duel-usecase-item:last-child { margin-bottom: 0; }
.duel-usecase-item-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    color: #1F2328;
    margin-bottom: 3px;
}
.duel-usecase-item-text {
    font-family: var(--font-body);
    font-size: 12px;
    color: #656D76;
    line-height: 1.45;
}
.duel-scenario {
    margin-bottom: 14px;
}
.duel-scenario:last-child { margin-bottom: 0; }
.duel-scenario-role {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    color: #1F2328;
}
.duel-scenario-fit {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 700;
    margin: 2px 0;
}
.duel-scenario-reason {
    font-family: var(--font-body);
    font-size: 12px;
    color: #656D76;
    line-height: 1.45;
}

/* ── DUEL-PRICE ── */
.duel-price-content { padding-top: 60px; }
.duel-price-title {
    font-family: var(--font-display);
    font-size: 28px;
    color: #1F2328;
    margin: 0 0 22px 0;
    border: none;
    padding: 0;
    line-height: 1.2;
}
.duel-price-grid {
    display: flex;
    gap: 20px;
    height: 330px;
}
.duel-price-card {
    flex: 1;
    background: #fff;
    border: 1px solid #D0D7DE;
    border-top: 5px solid #656D76;
    border-radius: 0 0 8px 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
}
.duel-price-card-green { border-top-color: #76B900; }
.duel-price-card-red { border-top-color: #ED1C24; }
.duel-price-card-neutral { border-top-color: #656D76; }
.duel-price-card-title {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #656D76;
    margin-bottom: 6px;
}
.duel-price-card-price {
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 800;
    color: #1F2328;
    line-height: 1;
    margin-bottom: 4px;
}
.duel-price-card-note {
    font-family: var(--font-body);
    font-size: 11px;
    color: #656D76;
    line-height: 1.4;
    margin-bottom: 12px;
}
.duel-price-card-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.duel-price-card-list li {
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.45;
    color: #1F2328;
    padding-left: 0 !important;
    margin-bottom: 0 !important;
}
.duel-price-card-list li::before { display: none !important; }
.duel-price-insight {
    margin-top: 16px;
    background: #fff;
    border: 1px solid #D0D7DE;
    border-radius: 8px;
    padding: 14px 16px;
}
.duel-price-insight-header {
    font-family: var(--font-label);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #656D76;
    font-weight: 700;
    margin-bottom: 6px;
}
.duel-price-insight p {
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.55;
    color: #1F2328;
    margin: 0;
}

/* ── DUEL-VALUE ── */
.duel-value-content { padding-top: 60px; }
.duel-value-title {
    font-family: var(--font-display);
    font-size: 28px;
    color: #1F2328;
    margin: 0 0 18px 0;
    border: none;
    padding: 0;
    line-height: 1.2;
}
.duel-value-grid {
    display: flex;
    gap: 24px;
    height: 360px;
}
.duel-value-col {
    flex: 1;
    background: #fff;
    border: 1px solid #D0D7DE;
    border-top: 5px solid;
    border-radius: 0 0 8px 8px;
    padding: 16px;
    overflow: hidden;
}
.duel-value-green { border-top-color: #76B900; }
.duel-value-red { border-top-color: #ED1C24; }
.duel-value-col-title {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 10px;
}
.duel-value-subhead {
    font-family: var(--font-label);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #656D76;
    font-weight: 700;
    margin: 10px 0 6px 0;
}
.duel-value-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.duel-value-list li {
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.45;
    color: #1F2328;
    padding-left: 0 !important;
    margin-bottom: 0 !important;
}
.duel-value-list li::before { display: none !important; }
.duel-value-weak li { color: #656D76; }
.duel-value-verdict {
    margin-top: 14px;
    background: #fff;
    border: 1px solid #D0D7DE;
    border-radius: 8px;
    padding: 12px 16px;
}
.duel-value-verdict-header {
    font-family: var(--font-label);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #656D76;
    font-weight: 700;
    margin-bottom: 4px;
}
.duel-value-verdict p {
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.5;
    color: #1F2328;
    margin: 0;
}

/* ── DUEL-DECISION ── */
.duel-decision-content { padding-top: 60px; }
.duel-decision-title {
    font-family: var(--font-display);
    font-size: 28px;
    color: #1F2328;
    margin: 0 0 18px 0;
    border: none;
    padding: 0;
    line-height: 1.2;
}
.duel-decision-grid {
    display: flex;
    gap: 24px;
    height: 340px;
}
.duel-decision-col {
    flex: 1;
    background: #fff;
    border: 1px solid #D0D7DE;
    border-top: 5px solid;
    border-radius: 0 0 8px 8px;
    padding: 16px;
    overflow: hidden;
}
.duel-decision-green { border-top-color: #76B900; }
.duel-decision-red { border-top-color: #ED1C24; }
.duel-decision-col-header {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
}
.duel-decision-reason {
    margin-bottom: 12px;
}
.duel-decision-reason:last-child { margin-bottom: 0; }
.duel-decision-reason-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    color: #1F2328;
    margin-bottom: 2px;
}
.duel-decision-reason-text {
    font-family: var(--font-body);
    font-size: 11px;
    color: #656D76;
    line-height: 1.45;
}
.duel-decision-bigpicture {
    margin-top: 14px;
    background: #fff;
    border: 1px solid #D0D7DE;
    border-radius: 8px;
    padding: 12px 16px;
}
.duel-decision-bigpicture-header {
    font-family: var(--font-label);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #656D76;
    font-weight: 700;
    margin-bottom: 4px;
}
.duel-decision-bigpicture p {
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.5;
    color: #1F2328;
    margin: 0;
}
.duel-decision-quote {
    margin-top: 12px;
    font-family: var(--font-body);
    font-size: 13px;
    font-style: italic;
    color: #656D76;
    line-height: 1.5;
    padding-left: 16px;
    border-left: 3px solid #D0D7DE;
}
.duel-decision-quote-mark {
    font-size: 24px;
    color: #76B900;
    margin-right: 4px;
    line-height: 1;
}
.duel-decision-quote-attribution {
    font-style: normal;
    font-weight: 700;
    color: #1F2328;
}

/* ── DUEL-CLOSING ── */
.duel-closing {
    position: relative;
    overflow: hidden;
}
.duel-closing-bg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 1;
    opacity: 0.15;
}
.duel-closing-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(circle at center, rgba(13,17,23,0.5) 0%, rgba(13,17,23,0.88) 70%);
    z-index: 2;
}
.duel-closing-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    z-index: 5;
}
.duel-closing-bar {
    width: 80px;
    height: 5px;
    background: #76B900;
    margin-bottom: 24px;
}
.duel-closing-title {
    font-family: var(--font-display);
    font-size: 42px;
    color: #E6EDF3;
    margin: 0 0 14px 0;
    text-transform: uppercase;
    letter-spacing: -0.5px;
    border: none;
    padding: 0;
    max-width: 900px;
    line-height: 1.15;
}
.duel-closing-statement {
    font-family: var(--font-body);
    font-size: 18px;
    color: #656D76;
    max-width: 800px;
    line-height: 1.5;
    margin-bottom: 30px;
}
.duel-closing-thankyou {
    font-family: var(--font-display);
    font-size: 64px;
    color: #76B900;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 4px;
    margin-bottom: 30px;
}
.duel-closing-footer {
    font-family: var(--font-body);
    font-size: 12px;
    color: #656D76;
    letter-spacing: 1px;
}
.duel-closing-separator {
    margin: 0 12px;
    color: #76B900;
}
```
