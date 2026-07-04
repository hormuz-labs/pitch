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

### Chart helper (used by chart layouts)

```js
let _chartSeq = 0;
function renderChart(slide) {
    const cid = `chart_${++_chartSeq}`;
    const type = (slide.chartType || 'column').toLowerCase();
    const raw = slide.chartData || { labels: [], datasets: [] };
    const labels = raw.labels || [];
    const rawDS = raw.datasets || [];

    /* ── Palette from spec_lock.md ── */
    function h2rgba(hex, a) {
        const h = (hex || '#888').replace('#', '');
        const pd = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
        return `rgba(${parseInt(pd.substr(0,2),16)||128},${parseInt(pd.substr(2,2),16)||128},${parseInt(pd.substr(4,2),16)||128},${a})`;
    }

    const themeObj = {
        primary: '#004080',
        secondary: '#555555',
        accent: '#1A1A1A',
        bg: '#F8F9FA',
        border: '#E9ECEF',
        fontBody: '"Inter", sans-serif'
    };

    const BG = [
        h2rgba(themeObj.primary,0.90), h2rgba(themeObj.secondary,0.85),
        h2rgba(themeObj.accent,0.80),  h2rgba(themeObj.primary,0.60),
        h2rgba(themeObj.secondary,0.60), h2rgba(themeObj.accent,0.55),
        h2rgba(themeObj.primary,0.40),  h2rgba(themeObj.secondary,0.40),
    ];
    const BD = [
        themeObj.primary, themeObj.secondary, themeObj.accent,
        themeObj.primary, themeObj.secondary, themeObj.accent,
        themeObj.primary, themeObj.secondary,
    ];

    const isDark = !((function(hex){
        const h=(hex||'#000').replace('#','');
        const pd=h.length===3?h.split('').map(x=>x+x).join(''):h;
        return (parseInt(pd.substr(0,2),16)*299+parseInt(pd.substr(2,2),16)*587+parseInt(pd.substr(4,2),16)*114)/1000;
    })(themeObj.bg) > 128);

    const textC = isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.80)';
    const gridC = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
    const tipBg = isDark ? 'rgba(10,10,20,0.92)'   : 'rgba(255,255,255,0.97)';

    const fontBodyClean = (function(fontString) {
        if (!fontString) return 'Inter';
        const clean = fontString.split(',')[0].replace(/['"]/g, '').trim();
        const fallbacks = {
            'cursorgothic': 'Outfit',
            'linear display': 'Outfit',
            'ferrarisans': 'Barlow',
            'geist': 'Inter',
            'circular': 'Inter',
            'coinbase display': 'Inter',
            'sf pro display': 'Inter',
            'sf pro text': 'Inter',
            'sst': 'Inter',
            'optimistic': 'Inter',
            'gt walsheim': 'Manrope',
            'super sans vf': 'Manrope',
            'abcdiatype': 'Manrope',
            'ibm plex sans': 'IBM Plex Sans',
            'd-din': 'Bebas Neue',
            'd-din-bold': 'Bebas Neue',
            'bugatti display': 'Playfair Display',
            'sohne-var': 'Plus Jakarta Sans',
            'salesforce-avant-garde': 'Plus Jakarta Sans',
            'sodosans': 'Inter',
            'lander grande': 'Playfair Display'
        };
        const lowerClean = clean.toLowerCase();
        for (const [key, val] of Object.entries(fallbacks)) {
            if (lowerClean.includes(key)) return val;
        }
        return clean;
    })(themeObj.fontBody);

    const tk  = `color:'${textC}',font:{family:'${fontBodyClean}',size:12}`;
    const tip = `tooltip:{backgroundColor:'${tipBg}',titleColor:'${textC}',bodyColor:'${textC}',borderColor:'${themeObj.primary}',borderWidth:1,padding:10}`;
    const leg = `legend:{labels:{color:'${textC}',font:{family:'${fontBodyClean}',size:13},padding:16}}`;
    const plug = `plugins:{${leg},${tip}}`;
    const cX = (s=false) => `x:{stacked:${s},ticks:{${tk}},grid:{color:'${gridC}'}}`;
    const cY = (s=false) => `y:{stacked:${s},ticks:{${tk}},grid:{color:'${gridC}'}}`;
    const baseOpts = `responsive:true,maintainAspectRatio:false,animation:{duration:0}`;

    /* ── Build per-type config ── */
    let cjsType = 'bar', dsArr = [], optStr = '';

    switch (type) {

        case 'column':
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:1.5,borderRadius:4}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'column-stacked':
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:1.5,borderRadius:2}));
            optStr = `${baseOpts},${plug},scales:{${cX(true)},${cY(true)}}`;
            break;

        case 'column-100': {
            const tots = labels.map((_,ci)=>rawDS.reduce((s,d)=>s+(d.data[ci]||0),0));
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:(d.data||[]).map((v,ci)=>tots[ci]?+(v/tots[ci]*100).toFixed(1):0),backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:1.5,borderRadius:2}));
            optStr = `${baseOpts},${plug},scales:{${cX(true)},y:{stacked:true,max:100,ticks:{${tk},callback:function(v){return v+'%';}},grid:{color:'${gridC}'}}}`;
            break;
        }

        case 'bar':
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:1.5,borderRadius:4}));
            optStr = `indexAxis:'y',${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'bar-stacked':
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:1.5,borderRadius:2}));
            optStr = `indexAxis:'y',${baseOpts},${plug},scales:{${cX(true)},${cY(true)}}`;
            break;

        case 'line':
            cjsType = 'line';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:'transparent',borderColor:BD[i%BD.length],borderWidth:2.5,fill:false,tension:0.4,pointRadius:4,pointHoverRadius:7}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'area':
            cjsType = 'line';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:2.5,fill:true,tension:0.4,pointRadius:3,pointHoverRadius:6}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'area-stacked':
            cjsType = 'line';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:2,fill:true,tension:0.4,pointRadius:3}));
            optStr = `${baseOpts},${plug},scales:{${cX()},y:{stacked:true,ticks:{${tk}},grid:{color:'${gridC}'}}}`;
            break;

        case 'pie': {
            cjsType = 'pie';
            const sd = rawDS[0]?.data||[];
            dsArr = [JSON.stringify({data:sd,backgroundColor:sd.map((_,i)=>BG[i%BG.length]),borderColor:sd.map((_,i)=>BD[i%BD.length]),borderWidth:2})];
            optStr = `${baseOpts},plugins:{legend:{position:'right',labels:{color:'${textC}',font:{family:'${fontBodyClean}',size:13},padding:20,boxWidth:16}},${tip}}`;
            break;
        }

        case 'donut': {
            cjsType = 'doughnut';
            const sd = rawDS[0]?.data||[];
            dsArr = [JSON.stringify({data:sd,backgroundColor:sd.map((_,i)=>BG[i%BG.length]),borderColor:sd.map((_,i)=>BD[i%BD.length]),borderWidth:2})];
            optStr = `cutout:'65%',${baseOpts},plugins:{legend:{position:'right',labels:{color:'${textC}',font:{family:'${fontBodyClean}',size:13},padding:20,boxWidth:16}},${tip}}`;
            break;
        }

        case 'scatter':
            cjsType = 'scatter';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],pointRadius:6,pointHoverRadius:9}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'bubble':
            cjsType = 'bubble';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:1.5}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'radar':
            cjsType = 'radar';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:2,pointRadius:4,pointHoverRadius:7}));
            optStr = `${baseOpts},${plug},scales:{r:{ticks:{${tk},backdropColor:'transparent'},grid:{color:'${gridC}'},angleLines:{color:'${gridC}'},pointLabels:{color:'${textC}',font:{family:'${fontBodyClean}',size:13}}}}`;
            break;

        case 'polar': {
            cjsType = 'polarArea';
            const sd = rawDS[0]?.data||[];
            dsArr = [JSON.stringify({data:sd,backgroundColor:sd.map((_,i)=>BG[i%BG.length]),borderWidth:1.5})];
            optStr = `${baseOpts},plugins:{legend:{position:'right',labels:{color:'${textC}',font:{family:'${fontBodyClean}',size:13},padding:16}},${tip}},scales:{r:{ticks:{${tk},backdropColor:'transparent'},grid:{color:'${gridC}'}}}`;
            break;
        }

        case 'funnel': {
            const d0 = rawDS[0]||{data:[],label:'Value'};
            const pairs = labels.map((l,i)=>({l,v:d0.data[i]||0})).sort((a,b)=>b.v-a.v);
            const top = pairs[0]?.v||1;
            const fDS = JSON.stringify({label:d0.label||'Value',data:pairs.map(p=>p.v),backgroundColor:pairs.map((_,i)=>BG[Math.min(i,BG.length-1)]),borderColor:pairs.map((_,i)=>BD[Math.min(i,BD.length-1)]),borderWidth:1.5,borderRadius:4});
            return `<div style="position:relative;width:100%;height:100%;"><canvas id="${cid}"></canvas></div><script>(function(){var ctx=document.getElementById('${cid}');new Chart(ctx,{type:'bar',data:{labels:${JSON.stringify(pairs.map(p=>p.l))},datasets:[${fDS}]},options:{indexAxis:'y',${baseOpts},plugins:{legend:{display:false},tooltip:{backgroundColor:'${tipBg}',titleColor:'${textC}',bodyColor:'${textC}',borderColor:'${themeObj.primary}',borderWidth:1,callbacks:{label:function(c){return c.parsed.x+' ('+Math.round(c.parsed.x/${top}*100)+'%)';}}}},scales:{x:{ticks:{${tk}},grid:{color:'${gridC}'}},y:{ticks:{${tk}},grid:{display:false}}}}});})();<\/script>`;
        }

        case 'waterfall': {
            const d0 = rawDS[0]||{data:[],label:'Value'};
            const chgs = d0.data||[];
            let cum = 0;
            const floats = chgs.map(v=>{const s=cum;cum+=v;return [s,cum];});
            const wfDS = JSON.stringify({label:d0.label||'Value',data:floats,backgroundColor:chgs.map(v=>v>=0?BG[0]:BG[1]),borderColor:chgs.map(v=>v>=0?BD[0]:BD[1]),borderWidth:1.5,borderRadius:3});
            return `<div style="position:relative;width:100%;height:100%;"><canvas id="${cid}"></canvas></div><script>(function(){var ctx=document.getElementById('${cid}');new Chart(ctx,{type:'bar',data:{labels:${JSON.stringify(labels)},datasets:[${wfDS}]},options:{${baseOpts},plugins:{legend:{display:false},tooltip:{backgroundColor:'${tipBg}',titleColor:'${textC}',bodyColor:'${textC}',borderColor:'${themeObj.primary}',borderWidth:1}},scales:{x:{ticks:{${tk}},grid:{color:'${gridC}'}},y:{ticks:{${tk}},grid:{color:'${gridC}'}}}}});})();<\/script>`;
        }

        case 'combo':
            cjsType = 'bar';
            dsArr = rawDS.map((d,i)=>JSON.stringify({type:i===0?'bar':'line',label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:i===0?BG[0]:'transparent',borderColor:BD[i%BD.length],borderWidth:i===0?1.5:2.5,tension:0.4,pointRadius:i===0?0:5,fill:false,borderRadius:i===0?4:0,order:i===0?2:1}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        default:
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:1.5,borderRadius:4}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
    }

    return `<div style="position:relative;width:100%;height:100%;"><canvas id="${cid}"></canvas></div><script>(function(){var ctx=document.getElementById('${cid}');new Chart(ctx,{type:'${cjsType}',data:{labels:${JSON.stringify(labels)},datasets:[${dsArr.join(',')}]},options:{${optStr}}});})();<\/script>`;
}
```

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

### 8. `CHART-CLEAN` (Full-width Chart)
```js
if (slide.layout === 'CHART-CLEAN') {
    const chartHTML = renderChart(slide);
    return `
    <div class="slide corp-minimal">
        <div class="corp-content">
            <h2 class="corp-title">${slide.title}</h2>
            <div class="corp-chart-full">
                ${chartHTML}
            </div>
            ${slide.source ? `<div class="corp-chart-source">${slide.source}</div>` : ''}
        </div>
    </div>`;
}
```

### 9. `SPLIT-CHART-CLEAN` (Bullets + Chart)
```js
if (slide.layout === 'SPLIT-CHART-CLEAN') {
    const chartHTML = renderChart(slide);
    return `
    <div class="slide corp-minimal">
        <div class="corp-content">
            <h2 class="corp-title">${slide.title}</h2>
            <div class="corp-split-chart">
                <div class="corp-split-chart-left">
                    <ul class="corp-bullets">
                        ${(slide.bullets || []).map(b => `<li>${b}</li>`).join('')}
                    </ul>
                </div>
                <div class="corp-split-chart-right">
                    ${chartHTML}
                </div>
            </div>
            ${slide.source ? `<div class="corp-chart-source">${slide.source}</div>` : ''}
        </div>
    </div>`;
}
```

### 10. `ICON-GRID-CLEAN` (Icon Grid)
```js
if (slide.layout === 'ICON-GRID-CLEAN') {
    return `
    <div class="slide corp-minimal">
        <div class="corp-content">
            <div class="corp-badge">${slide.badge || 'HIGHLIGHTS'}</div>
            <h2 class="corp-title">${slide.title}</h2>
            <div class="corp-icon-grid">
                ${(slide.items || []).slice(0, 6).map(item => `
                <div class="corp-icon-grid-item">
                    <div class="corp-icon-grid-icon">${item.icon || ''}</div>
                    <div class="corp-icon-grid-heading">${item.heading || item.title}</div>
                    <div class="corp-icon-grid-text">${item.text || item.description}</div>
                </div>`).join('')}
            </div>
        </div>
    </div>`;
}
```

### 11. `COMPARE-CLEAN` (Side-by-side Comparison)
```js
if (slide.layout === 'COMPARE-CLEAN') {
    return `
    <div class="slide corp-minimal">
        <div class="corp-content">
            <div class="corp-badge">COMPARE</div>
            <h2 class="corp-title">${slide.title}</h2>
            <div class="corp-compare-row">
                <div class="corp-compare-panel corp-compare-left">
                    <div class="corp-compare-title">${slide.leftTitle || 'Option A'}</div>
                    <ul class="corp-bullets">
                        ${(slide.leftBullets || []).map(b => `<li>${b}</li>`).join('')}
                    </ul>
                </div>
                <div class="corp-compare-panel corp-compare-right">
                    <div class="corp-compare-title">${slide.rightTitle || 'Option B'}</div>
                    <ul class="corp-bullets">
                        ${(slide.rightBullets || []).map(b => `<li>${b}</li>`).join('')}
                    </ul>
                </div>
            </div>
        </div>
    </div>`;
}
```

### 12. `IMPACT-CLEAN` (Full-bleed Impact Statement)
```js
if (slide.layout === 'IMPACT-CLEAN') {
    return `
    <div class="slide corp-minimal corp-impact-slide">
        ${slide.image ? `<img class="corp-impact-bg" src="${slide.image}">` : ''}
        <div class="corp-impact-overlay"></div>
        <div class="corp-content corp-impact-content">
            <div class="corp-impact-statement">${slide.statement}</div>
            ${slide.attribution ? `<div class="corp-impact-attribution">${slide.attribution}</div>` : ''}
        </div>
    </div>`;
}
```

### 13. `CLOSING-CLEAN` (Thank you Slide)
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

/* ── Chart layouts ── */
.corp-chart-full {
    flex: 1;
    min-height: 0;
    position: relative;
    background: #FFFFFF;
    border: 1px solid #E9ECEF;
    border-radius: 8px;
    padding: 16px;
}
.corp-chart-source {
    font-size: 12px;
    color: #555555;
    text-align: right;
    margin-top: 8px;
    font-family: var(--font-body);
}
.corp-split-chart {
    display: flex;
    gap: 32px;
    flex: 1;
    min-height: 0;
}
.corp-split-chart-left {
    width: 40%;
    display: flex;
    flex-direction: column;
    justify-content: center;
}
.corp-split-chart-right {
    flex: 1;
    min-height: 0;
    position: relative;
    background: #FFFFFF;
    border: 1px solid #E9ECEF;
    border-radius: 8px;
    padding: 16px;
}

/* ── Icon grid layout ── */
.corp-icon-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    flex: 1;
}
.corp-icon-grid-item {
    background: #FFFFFF;
    border: 1px solid #E9ECEF;
    border-radius: 8px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.corp-icon-grid-icon {
    font-size: 28px;
    line-height: 1;
    color: #004080;
}
.corp-icon-grid-heading {
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 700;
    color: #1A1A1A;
}
.corp-icon-grid-text {
    font-size: 13px;
    line-height: 1.5;
    color: #555555;
}

/* ── Compare layout ── */
.corp-compare-row {
    display: flex;
    gap: 24px;
    flex: 1;
}
.corp-compare-panel {
    flex: 1;
    background: #FFFFFF;
    border: 1px solid #E9ECEF;
    border-radius: 8px;
    padding: 28px;
}
.corp-compare-left {
    border-left: 4px solid #004080;
}
.corp-compare-right {
    border-left: 4px solid #555555;
}
.corp-compare-title {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 700;
    color: #1A1A1A;
    margin-bottom: 16px;
    border-bottom: 1px solid #E9ECEF;
    padding-bottom: 8px;
}

/* ── Impact layout ── */
.corp-impact-slide {
    position: relative;
    overflow: hidden;
}
.corp-impact-bg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 1;
}
.corp-impact-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 64, 128, 0.72);
    z-index: 2;
}
.corp-impact-content {
    position: relative;
    z-index: 3;
    justify-content: center;
    align-items: center;
    text-align: center;
    color: #FFFFFF;
}
.corp-impact-statement {
    font-family: var(--font-display);
    font-size: 44px;
    font-weight: 700;
    color: #FFFFFF;
    line-height: 1.2;
    max-width: 900px;
}
.corp-impact-attribution {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.8);
    margin-top: 24px;
    font-family: var(--font-body);
}
```
