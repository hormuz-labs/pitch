# Comic Pop / Marblism Template Skill Reference

This document provides template-specific instructions, layout codes, and HTML/CSS renderers for the `COMIC_POP` theme.

---

## 🎨 Design Theme Specification

- **Aesthetic**: Neo-brutalist comic-book inspired by [Marblism.com](https://www.marblism.com) — bold, playful, and professional.
- **Palette**: Warm cream canvas `#FFFDF5`, bold yellow accent `#FBCC00`, near-black ink `#191919`, white cards `#FFFFFF`, soft yellow tint `#FFF8D6`, muted body `#404040`.
- **Borders**: Thick `2.5px solid #191919` with **hard drop shadow** `4px 4px 0 #191919` on every card. No soft box-shadows.
- **Typography**:
  - Display titles: `"Bebas Neue"` — tall, compressed, all-caps, dramatic.
  - Body / bullets: `"Dancing Script"` — handwritten cursive, warm, legible at 17px+.
  - Labels / badges: `"Nunito"` — rounded sans-serif for monospace-like labels.
- **Background**: Warm cream `#FFFDF5` with a subtle radial dot pattern at 3% opacity.
- **Images**: **Primary: Gemini API**. You MUST write a custom Node.js script to call the Gemini API (`gemini-3.1-flash-image` with fallback to `gemini-2.5-flash-image`) to generate vector illustrations using the prompt: `"[topic] bold flat vector illustration, thick black ink outlines, vibrant yellow and cream palette, neo-brutalist graphic design, comic book style, professional business illustration, no photorealism"`. If the Gemini API fails, your **fallback is Pinterest** using the standard `scrape_images.js` script. Apply CSS `border: 2.5px solid #191919; box-shadow: 4px 4px 0 #191919;` to all image containers regardless of source.
- **Hard rule**: Every card element MUST have the hard drop shadow. No soft rounded shadows.
- **Hard rule**: No more than ONE pure yellow background card per row of cards.

---

## 📐 Layout Pools & Renderers

### Chart Helper (Comic Pop palette)
```js
function renderChart(slide) {
    const cid = 'chart_' + Math.random().toString(36).substr(2, 9);
    const type = (slide.chartType || 'column').toLowerCase();
    const raw = slide.chartData || { labels: [], datasets: [] };
    const labels = raw.labels || [];
    const rawDS = raw.datasets || [];

    /* ── Palette from spec_lock.md ── */
    const PALETTE = {
        bg: '#FFFDF5',
        secondaryBg: '#FFF8D6',
        primary: '#FBCC00',
        accent: '#191919',
        secondary: '#404040',
        border: '#191919',
        fontBody: '"Dancing Script", cursive',
        fontDisplay: '"Bebas Neue", sans-serif',
        fontLabel: '"Nunito", sans-serif'
    };

    function h2rgba(hex, a) {
        const h = (hex || '#888').replace('#', '');
        const pd = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
        return `rgba(${parseInt(pd.substr(0,2),16)||128},${parseInt(pd.substr(2,2),16)||128},${parseInt(pd.substr(4,2),16)||128},${a})`;
    }

    // Comic Pop chart palette: yellow-forward, ink borders
    const BG = [
        h2rgba(PALETTE.primary, 0.92),
        h2rgba(PALETTE.accent, 0.80),
        h2rgba(PALETTE.secondary, 0.75),
        h2rgba(PALETTE.primary, 0.60),
        h2rgba(PALETTE.accent, 0.55),
        h2rgba(PALETTE.secondary, 0.50),
        h2rgba(PALETTE.primary, 0.40),
        h2rgba(PALETTE.accent, 0.35),
    ];
    const BD = [
        PALETTE.accent, PALETTE.accent, PALETTE.secondary,
        PALETTE.accent, PALETTE.accent, PALETTE.secondary,
        PALETTE.accent, PALETTE.secondary,
    ];

    const isDark = !((function(hex){
        const h=(hex||'#000').replace('#','');
        const pd=h.length===3?h.split('').map(x=>x+x).join(''):h;
        return (parseInt(pd.substr(0,2),16)*299+parseInt(pd.substr(2,2),16)*587+parseInt(pd.substr(4,2),16)*114)/1000;
    })(PALETTE.bg) > 128);

    const textC = isDark ? 'rgba(255,255,255,0.87)' : 'rgba(25,25,25,0.87)';
    const gridC = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(25,25,25,0.06)';
    const tipBg = isDark ? 'rgba(25,25,25,0.95)' : 'rgba(255,253,245,0.97)';

    const fontLabel = 'Nunito';
    const tk  = `color:'${textC}',font:{family:'${fontLabel}',size:12}`;
    const tip = `tooltip:{backgroundColor:'${tipBg}',titleColor:'${textC}',bodyColor:'${textC}',borderColor:'${PALETTE.border}',borderWidth:1.5,padding:10}`;
    const leg = `legend:{labels:{color:'${textC}',font:{family:'${fontLabel}',size:13},padding:16}}`;
    const plug = `plugins:{${leg},${tip}}`;
    const cX = (s=false) => `x:{stacked:${s},ticks:{${tk}},grid:{color:'${gridC}'}}`;
    const cY = (s=false) => `y:{stacked:${s},ticks:{${tk}},grid:{color:'${gridC}'}}`;
    const baseOpts = `responsive:true,maintainAspectRatio:false,animation:{duration:0}`;

    let cjsType = 'bar', dsArr = [], optStr = '';

    switch (type) {

        case 'column':
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:2,borderRadius:4}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'column-stacked':
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:2,borderRadius:2}));
            optStr = `${baseOpts},${plug},scales:{${cX(true)},${cY(true)}}`;
            break;

        case 'column-100': {
            const tots = labels.map((_,ci)=>rawDS.reduce((s,d)=>s+(d.data[ci]||0),0));
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:(d.data||[]).map((v,ci)=>tots[ci]?+(v/tots[ci]*100).toFixed(1):0),backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:2,borderRadius:2}));
            optStr = `${baseOpts},${plug},scales:{${cX(true)},y:{stacked:true,max:100,ticks:{${tk},callback:function(v){return v+'%';}},grid:{color:'${gridC}'}}}`;
            break;
        }

        case 'bar':
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:2,borderRadius:4}));
            optStr = `indexAxis:'y',${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'bar-stacked':
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:2,borderRadius:2}));
            optStr = `indexAxis:'y',${baseOpts},${plug},scales:{${cX(true)},${cY(true)}}`;
            break;

        case 'line':
            cjsType = 'line';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:'transparent',borderColor:BD[i%BD.length],borderWidth:3,fill:false,tension:0.4,pointRadius:5,pointHoverRadius:8,pointBackgroundColor:BG[i%BG.length],pointBorderColor:BD[i%BD.length],pointBorderWidth:2}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'area':
            cjsType = 'line';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:3,fill:true,tension:0.4,pointRadius:4,pointHoverRadius:7}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'area-stacked':
            cjsType = 'line';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:2.5,fill:true,tension:0.4,pointRadius:3}));
            optStr = `${baseOpts},${plug},scales:{${cX()},y:{stacked:true,ticks:{${tk}},grid:{color:'${gridC}'}}}`;
            break;

        case 'pie': {
            cjsType = 'pie';
            const sd = rawDS[0]?.data||[];
            dsArr = [JSON.stringify({data:sd,backgroundColor:sd.map((_,i)=>BG[i%BG.length]),borderColor:sd.map((_,i)=>BD[i%BD.length]),borderWidth:2.5})];
            optStr = `${baseOpts},plugins:{legend:{position:'right',labels:{color:'${textC}',font:{family:'${fontLabel}',size:13},padding:20,boxWidth:16}},${tip}}`;
            break;
        }

        case 'donut': {
            cjsType = 'doughnut';
            const sd = rawDS[0]?.data||[];
            dsArr = [JSON.stringify({data:sd,backgroundColor:sd.map((_,i)=>BG[i%BG.length]),borderColor:sd.map((_,i)=>BD[i%BD.length]),borderWidth:2.5})];
            optStr = `cutout:'65%',${baseOpts},plugins:{legend:{position:'right',labels:{color:'${textC}',font:{family:'${fontLabel}',size:13},padding:20,boxWidth:16}},${tip}}`;
            break;
        }

        case 'scatter':
            cjsType = 'scatter';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],pointRadius:7,pointHoverRadius:10,borderWidth:2}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'bubble':
            cjsType = 'bubble';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:2}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'radar':
            cjsType = 'radar';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:2.5,pointRadius:5,pointHoverRadius:8}));
            optStr = `${baseOpts},${plug},scales:{r:{ticks:{${tk},backdropColor:'transparent'},grid:{color:'${gridC}'},angleLines:{color:'${gridC}'},pointLabels:{color:'${textC}',font:{family:'${fontLabel}',size:13}}}}`;
            break;

        case 'polar': {
            cjsType = 'polarArea';
            const sd = rawDS[0]?.data||[];
            dsArr = [JSON.stringify({data:sd,backgroundColor:sd.map((_,i)=>BG[i%BG.length]),borderColor:sd.map((_,i)=>BD[i%BD.length]),borderWidth:2})];
            optStr = `${baseOpts},plugins:{legend:{position:'right',labels:{color:'${textC}',font:{family:'${fontLabel}',size:13},padding:16}},${tip}},scales:{r:{ticks:{${tk},backdropColor:'transparent'},grid:{color:'${gridC}'}}}`;
            break;
        }

        case 'funnel': {
            const d0 = rawDS[0]||{data:[],label:'Value'};
            const pairs = labels.map((l,i)=>({l,v:d0.data[i]||0})).sort((a,b)=>b.v-a.v);
            const top = pairs[0]?.v||1;
            const fDS = JSON.stringify({label:d0.label||'Value',data:pairs.map(p=>p.v),backgroundColor:pairs.map((_,i)=>BG[Math.min(i,BG.length-1)]),borderColor:pairs.map((_,i)=>BD[Math.min(i,BD.length-1)]),borderWidth:2,borderRadius:4});
            return `<div style="position:relative;width:100%;height:100%;"><canvas id="${cid}"></canvas></div><script>(function(){var ctx=document.getElementById('${cid}');new Chart(ctx,{type:'bar',data:{labels:${JSON.stringify(pairs.map(p=>p.l))},datasets:[${fDS}]},options:{indexAxis:'y',${baseOpts},plugins:{legend:{display:false},tooltip:{backgroundColor:'${tipBg}',titleColor:'${textC}',bodyColor:'${textC}',borderColor:'${PALETTE.border}',borderWidth:1.5,callbacks:{label:function(c){return c.parsed.x+' ('+Math.round(c.parsed.x/${top}*100)+'%)';}}}},scales:{x:{ticks:{${tk}},grid:{color:'${gridC}'}},y:{ticks:{${tk}},grid:{display:false}}}}});})();<\/script>`;
        }

        case 'waterfall': {
            const d0 = rawDS[0]||{data:[],label:'Value'};
            const chgs = d0.data||[];
            let cum = 0;
            const floats = chgs.map(v=>{const s=cum;cum+=v;return [s,cum];});
            const wfDS = JSON.stringify({label:d0.label||'Value',data:floats,backgroundColor:chgs.map(v=>v>=0?BG[0]:h2rgba('#CC2222',0.85)),borderColor:chgs.map(v=>v>=0?BD[0]:PALETTE.accent),borderWidth:2,borderRadius:3});
            return `<div style="position:relative;width:100%;height:100%;"><canvas id="${cid}"></canvas></div><script>(function(){var ctx=document.getElementById('${cid}');new Chart(ctx,{type:'bar',data:{labels:${JSON.stringify(labels)},datasets:[${wfDS}]},options:{${baseOpts},plugins:{legend:{display:false},tooltip:{backgroundColor:'${tipBg}',titleColor:'${textC}',bodyColor:'${textC}',borderColor:'${PALETTE.border}',borderWidth:1.5}},scales:{x:{ticks:{${tk}},grid:{color:'${gridC}'}},y:{ticks:{${tk}},grid:{color:'${gridC}'}}}}});})();<\/script>`;
        }

        case 'combo':
            cjsType = 'bar';
            dsArr = rawDS.map((d,i)=>JSON.stringify({type:i===0?'bar':'line',label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:i===0?BG[0]:'transparent',borderColor:BD[i%BD.length],borderWidth:i===0?2:3,tension:0.4,pointRadius:i===0?0:5,fill:false,borderRadius:i===0?4:0,order:i===0?2:1}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        default:
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:2,borderRadius:4}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
    }

    return `<div style="position:relative;width:100%;height:100%;"><canvas id="${cid}"></canvas></div><script>(function(){var ctx=document.getElementById('${cid}');new Chart(ctx,{type:'${cjsType}',data:{labels:${JSON.stringify(labels)},datasets:[${dsArr.join(',')}]},options:{${optStr}}});})();<\/script>`;
}
```

---

### 1. `COMIC-COVER` (Bold Cover Slide)
```js
if (slide.layout === 'COMIC-COVER') {
    return `
    <div class="slide comic-pop">
        <div class="comic-dot-bg"></div>
        <div class="comic-cover-layout">
            <div class="comic-cover-left">
                <div class="comic-badge-lg">${slide.badge || '✦ PRESENTATION'}</div>
                <h1 class="comic-cover-title">${slide.title}</h1>
                <p class="comic-cover-subtitle">${slide.subtitle || ''}</p>
                <div class="comic-cover-meta">${config.presenter} &nbsp;·&nbsp; ${config.date}</div>
            </div>
            <div class="comic-cover-right">
                ${slide.image ? `<div class="comic-img-card"><img class="comic-img-fill" src="${slide.image}"></div>` : '<div class="comic-img-card comic-img-placeholder"><div class="comic-placeholder-icon">✦</div></div>'}
            </div>
        </div>
        <div class="comic-cover-stripe"></div>
    </div>`;
}
```

### 2. `COMIC-GLANCE` (Agenda / Overview)
```js
if (slide.layout === 'COMIC-GLANCE') {
    return `
    <div class="slide comic-pop">
        <div class="comic-dot-bg"></div>
        <div class="comic-content">
            <div class="comic-badge">${slide.badge || 'AT A GLANCE'}</div>
            <h2 class="comic-title">${slide.title}</h2>
            <div class="comic-glance-grid">
                <div class="comic-glance-left">
                    ${slide.image ? `<div class="comic-img-card comic-img-card-sm"><img class="comic-img-fill" src="${slide.image}"></div>` : '<div class="comic-img-card comic-img-card-sm comic-img-placeholder"><div class="comic-placeholder-icon">✦</div></div>'}
                </div>
                <div class="comic-glance-right">
                    <ul class="comic-list">
                        ${(slide.bullets || []).map((b, i) => `<li><span class="comic-bullet-num">${String(i+1).padStart(2,'0')}</span><span class="comic-bullet-text">${b}</span></li>`).join('')}
                    </ul>
                </div>
            </div>
        </div>
    </div>`;
}
```

### 3. `COMIC-STATS` (KPI / Metric Cards)
```js
if (slide.layout === 'COMIC-STATS') {
    return `
    <div class="slide comic-pop">
        <div class="comic-dot-bg"></div>
        <div class="comic-content">
            <div class="comic-badge">${slide.badge || 'KEY NUMBERS'}</div>
            <h2 class="comic-title">${slide.title}</h2>
            <div class="comic-stats-row">
                ${(slide.stats || []).map((s, i) => `
                <div class="comic-stat-card ${i === 0 ? 'comic-stat-card--yellow' : ''}">
                    <div class="comic-stat-value">${s.value}</div>
                    <div class="comic-stat-label">${s.label}</div>
                    ${s.description ? `<div class="comic-stat-desc">${s.description}</div>` : ''}
                </div>`).join('')}
            </div>
        </div>
    </div>`;
}
```

### 4. `COMIC-SPLIT` (Text + Image Split)
```js
if (slide.layout === 'COMIC-SPLIT') {
    return `
    <div class="slide comic-pop">
        <div class="comic-dot-bg"></div>
        <div class="comic-content">
            <div class="comic-badge">${slide.badge || 'DEEP DIVE'}</div>
            <h2 class="comic-title">${slide.title}</h2>
            <div class="comic-split-layout">
                <div class="comic-split-text">
                    ${slide.body ? `<p class="comic-body-lead">${slide.body}</p>` : ''}
                    <ul class="comic-list">
                        ${(slide.bullets || []).map(b => `<li><span class="comic-bullet-dot">◆</span><span class="comic-bullet-text">${b}</span></li>`).join('')}
                    </ul>
                </div>
                <div class="comic-split-visual">
                    ${slide.image ? `<div class="comic-img-card"><img class="comic-img-fill" src="${slide.image}"></div>` : '<div class="comic-img-card comic-img-placeholder"><div class="comic-placeholder-icon">✦</div></div>'}
                </div>
            </div>
        </div>
    </div>`;
}
```

### 5. `COMIC-QUOTE` (Full-Center Quote Box)
```js
if (slide.layout === 'COMIC-QUOTE') {
    return `
    <div class="slide comic-pop comic-quote-slide">
        <div class="comic-dot-bg"></div>
        <div class="comic-quote-center">
            <div class="comic-quote-box">
                <div class="comic-quote-mark">"</div>
                <p class="comic-quote-text">${slide.quote || slide.body || ''}</p>
                ${slide.author ? `<div class="comic-quote-author">— ${slide.author}</div>` : ''}
            </div>
            ${slide.subtitle ? `<div class="comic-quote-context">${slide.subtitle}</div>` : ''}
        </div>
    </div>`;
}
```

### 6. `COMIC-FLOW` (Step Pipeline / Process Flow)
```js
if (slide.layout === 'COMIC-FLOW') {
    return `
    <div class="slide comic-pop">
        <div class="comic-dot-bg"></div>
        <div class="comic-content">
            <div class="comic-badge">${slide.badge || 'HOW IT WORKS'}</div>
            <h2 class="comic-title">${slide.title}</h2>
            <div class="comic-flow-row">
                ${(slide.steps || []).map((step, idx, arr) => `
                <div class="comic-flow-node">
                    <div class="comic-flow-num">${String(idx + 1).padStart(2,'0')}</div>
                    <div class="comic-flow-card ${idx % 2 === 0 ? '' : 'comic-flow-card--yellow'}">
                        <div class="comic-flow-heading">${step.heading || step.title || ''}</div>
                        <div class="comic-flow-text">${step.text || step.description || ''}</div>
                    </div>
                    ${idx < arr.length - 1 ? '<div class="comic-flow-arrow">→</div>' : ''}
                </div>`).join('')}
            </div>
        </div>
    </div>`;
}
```

### 7. `COMIC-CHART` (Full-Width Chart)
```js
if (slide.layout === 'COMIC-CHART') {
    const chartHTML = renderChart(slide);
    return `
    <div class="slide comic-pop">
        <div class="comic-dot-bg"></div>
        <div class="comic-content">
            <div class="comic-badge">${slide.badge || 'THE DATA'}</div>
            <h2 class="comic-title">${slide.title}</h2>
            <div class="comic-chart-full">
                ${chartHTML}
            </div>
            ${slide.source ? `<div class="comic-chart-source">${slide.source}</div>` : ''}
        </div>
    </div>`;
}
```

### 8. `COMIC-SPLIT-CHART` (Context Bullets + Chart)
```js
if (slide.layout === 'COMIC-SPLIT-CHART') {
    const chartHTML = renderChart(slide);
    return `
    <div class="slide comic-pop">
        <div class="comic-dot-bg"></div>
        <div class="comic-content">
            <div class="comic-badge">${slide.badge || 'DATA + CONTEXT'}</div>
            <h2 class="comic-title">${slide.title}</h2>
            <div class="comic-split-chart-layout">
                <div class="comic-split-chart-left">
                    <ul class="comic-list">
                        ${(slide.bullets || []).map(b => `<li><span class="comic-bullet-dot">◆</span><span class="comic-bullet-text">${b}</span></li>`).join('')}
                    </ul>
                </div>
                <div class="comic-split-chart-right">
                    ${chartHTML}
                </div>
            </div>
            ${slide.source ? `<div class="comic-chart-source">${slide.source}</div>` : ''}
        </div>
    </div>`;
}
```

### 9. `COMIC-ICON-GRID` (2×3 Feature Grid)
```js
if (slide.layout === 'COMIC-ICON-GRID') {
    return `
    <div class="slide comic-pop">
        <div class="comic-dot-bg"></div>
        <div class="comic-content">
            <div class="comic-badge">${slide.badge || 'HIGHLIGHTS'}</div>
            <h2 class="comic-title">${slide.title}</h2>
            <div class="comic-icon-grid">
                ${(slide.items || []).slice(0, 6).map((item, i) => `
                <div class="comic-icon-card ${i === 1 || i === 4 ? 'comic-icon-card--yellow' : ''}">
                    ${item.icon ? `<div class="comic-icon-symbol">${item.icon}</div>` : ''}
                    <div class="comic-icon-heading">${item.heading || item.title || ''}</div>
                    <div class="comic-icon-text">${item.text || item.description || ''}</div>
                </div>`).join('')}
            </div>
        </div>
    </div>`;
}
```

### 10. `COMIC-COMPARE` (Side-by-Side Comparison)
```js
if (slide.layout === 'COMIC-COMPARE') {
    return `
    <div class="slide comic-pop">
        <div class="comic-dot-bg"></div>
        <div class="comic-content">
            <div class="comic-badge">${slide.badge || 'COMPARE'}</div>
            <h2 class="comic-title">${slide.title}</h2>
            <div class="comic-compare-row">
                <div class="comic-compare-panel">
                    <div class="comic-compare-header">${slide.leftTitle || 'Option A'}</div>
                    <ul class="comic-list">
                        ${(slide.leftBullets || []).map(b => `<li><span class="comic-bullet-dot">◆</span><span class="comic-bullet-text">${b}</span></li>`).join('')}
                    </ul>
                </div>
                <div class="comic-vs-badge">VS</div>
                <div class="comic-compare-panel comic-compare-panel--yellow">
                    <div class="comic-compare-header">${slide.rightTitle || 'Option B'}</div>
                    <ul class="comic-list">
                        ${(slide.rightBullets || []).map(b => `<li><span class="comic-bullet-dot">◆</span><span class="comic-bullet-text">${b}</span></li>`).join('')}
                    </ul>
                </div>
            </div>
        </div>
    </div>`;
}
```

### 11. `COMIC-FLOWCHART` (Complex Line Flowchart — SVG-based)

**Slide JSON format:**
```json
{
  "layout": "COMIC-FLOWCHART",
  "title": "How the Process Works",
  "badge": "PROCESS MAP",
  "nodes": [
    {"id": "start", "label": "Start", "type": "start"},
    {"id": "step1", "label": "Research Topic", "type": "step"},
    {"id": "decision1", "label": "Has Enough Data?", "type": "decision"},
    {"id": "step2a", "label": "Build Charts", "type": "step"},
    {"id": "step2b", "label": "Gather More Data", "type": "step"},
    {"id": "step3", "label": "Write Content", "type": "step"},
    {"id": "decision2", "label": "QA Pass?", "type": "decision"},
    {"id": "fix", "label": "Fix Issues", "type": "step"},
    {"id": "end", "label": "Final Output", "type": "end"}
  ],
  "edges": [
    {"from": "start", "to": "step1"},
    {"from": "step1", "to": "decision1"},
    {"from": "decision1", "to": "step2a", "label": "Yes"},
    {"from": "decision1", "to": "step2b", "label": "No"},
    {"from": "step2a", "to": "step3"},
    {"from": "step2b", "to": "step3"},
    {"from": "step3", "to": "decision2"},
    {"from": "decision2", "to": "end", "label": "Yes"},
    {"from": "decision2", "to": "fix", "label": "No"},
    {"from": "fix", "to": "step3"}
  ]
}
```

```js
if (slide.layout === 'COMIC-FLOWCHART') {
    const fcId = `fc_${Math.random().toString(36).substr(2,8)}`;
    const nodes = slide.nodes || [];
    const edges = slide.edges || [];
    const nodesJSON = JSON.stringify(nodes);
    const edgesJSON = JSON.stringify(edges);
    return `
    <div class="slide comic-pop">
        <div class="comic-dot-bg"></div>
        <div class="comic-content">
            <div class="comic-badge">${slide.badge || 'PROCESS MAP'}</div>
            <h2 class="comic-title">${slide.title}</h2>
            <div class="comic-flowchart-container" id="${fcId}_wrap">
                <svg class="comic-fc-svg" id="${fcId}_svg" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;"></svg>
                <div class="comic-fc-nodes" id="${fcId}_nodes" style="position:relative;width:100%;height:100%;"></div>
            </div>
        </div>
    </div>
    <script>
    (function() {
        var NODES = ${nodesJSON};
        var EDGES = ${edgesJSON};
        var wrap = document.getElementById('${fcId}_wrap');
        var nodesEl = document.getElementById('${fcId}_nodes');
        var svgEl = document.getElementById('${fcId}_svg');

        /* ── Auto-layout using rank-based positioning ── */
        // 1. Build adjacency + compute ranks (longest-path layering)
        var rankMap = {};
        var childMap = {};
        var inDegree = {};
        NODES.forEach(function(n) { inDegree[n.id] = 0; childMap[n.id] = []; });
        EDGES.forEach(function(e) {
            if (childMap[e.from]) childMap[e.from].push(e.to);
            if (e.to in inDegree) inDegree[e.to]++;
        });

        // BFS from root nodes (inDegree == 0)
        var queue = NODES.filter(function(n){ return inDegree[n.id] === 0; }).map(function(n){ return n.id; });
        NODES.forEach(function(n){ rankMap[n.id] = 0; });
        var visited = {};
        while (queue.length) {
            var cur = queue.shift();
            if (visited[cur]) continue;
            visited[cur] = true;
            (childMap[cur]||[]).forEach(function(ch){
                rankMap[ch] = Math.max(rankMap[ch]||0, (rankMap[cur]||0)+1);
                queue.push(ch);
            });
        }

        // 2. Group nodes by rank
        var layers = {};
        var maxRank = 0;
        NODES.forEach(function(n){
            var r = rankMap[n.id] || 0;
            if (r > maxRank) maxRank = r;
            if (!layers[r]) layers[r] = [];
            layers[r].push(n.id);
        });

        // 3. Compute canvas size
        var W = wrap.offsetWidth || 1100;
        var H = wrap.offsetHeight || 400;
        var colCount = maxRank + 1;
        var colW = W / colCount;

        // 4. Assign positions
        var posMap = {};
        for (var rank = 0; rank <= maxRank; rank++) {
            var nodesInRank = layers[rank] || [];
            var rowCount = nodesInRank.length;
            nodesInRank.forEach(function(nid, i) {
                var x = rank * colW + colW / 2;
                var y = (i + 1) * H / (rowCount + 1);
                posMap[nid] = { x: x, y: y };
            });
        }

        // 5. Node dimensions
        var NW = { 'step': 140, 'decision': 130, 'start': 100, 'end': 100 };
        var NH = { 'step': 52, 'decision': 52, 'start': 44, 'end': 44 };

        function getNodeType(nid) {
            var n = NODES.find(function(x){ return x.id === nid; });
            return n ? (n.type || 'step') : 'step';
        }
        function getNodeLabel(nid) {
            var n = NODES.find(function(x){ return x.id === nid; });
            return n ? n.label : nid;
        }
        function getNodeDims(type) {
            return { w: NW[type]||140, h: NH[type]||52 };
        }

        // 6. Render SVG edges
        var svgNS = 'http://www.w3.org/2000/svg';
        // defs: arrowhead
        var defs = document.createElementNS(svgNS, 'defs');
        var marker = document.createElementNS(svgNS, 'marker');
        marker.setAttribute('id', '${fcId}_arrow');
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '7');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '3.5');
        marker.setAttribute('orient', 'auto');
        var poly = document.createElementNS(svgNS, 'polygon');
        poly.setAttribute('points', '0 0, 10 3.5, 0 7');
        poly.setAttribute('fill', '#191919');
        marker.appendChild(poly);
        defs.appendChild(marker);
        svgEl.appendChild(defs);

        EDGES.forEach(function(e) {
            var fromPos = posMap[e.from];
            var toPos = posMap[e.to];
            if (!fromPos || !toPos) return;
            var fromType = getNodeType(e.from);
            var toType = getNodeType(e.to);
            var fd = getNodeDims(fromType);
            var td = getNodeDims(toType);

            // Source point: right side of from-node
            var x1 = fromPos.x + fd.w / 2;
            var y1 = fromPos.y;
            // Dest point: left side of to-node
            var x2 = toPos.x - td.w / 2;
            var y2 = toPos.y;

            // For backwards edges (loops), route via bottom
            var isLoop = (posMap[e.from].x >= posMap[e.to].x);
            var pathD;
            if (isLoop) {
                // loop-back: go down, then left, then up
                var loopY = Math.max(fromPos.y, toPos.y) + 60;
                pathD = 'M ' + (fromPos.x) + ' ' + (fromPos.y + fd.h/2)
                    + ' Q ' + fromPos.x + ' ' + loopY + ' ' + ((fromPos.x + toPos.x)/2) + ' ' + loopY
                    + ' Q ' + toPos.x + ' ' + loopY + ' ' + toPos.x + ' ' + (toPos.y + td.h/2);
            } else {
                // Normal: bezier from right to left
                var cx1 = x1 + (x2 - x1) * 0.5;
                var cx2 = x2 - (x2 - x1) * 0.5;
                pathD = 'M ' + x1 + ' ' + y1
                    + ' C ' + cx1 + ' ' + y1 + ', ' + cx2 + ' ' + y2 + ', ' + x2 + ' ' + y2;
            }

            var path = document.createElementNS(svgNS, 'path');
            path.setAttribute('d', pathD);
            path.setAttribute('stroke', '#191919');
            path.setAttribute('stroke-width', '2.5');
            path.setAttribute('fill', 'none');
            path.setAttribute('marker-end', 'url(#${fcId}_arrow)');
            svgEl.appendChild(path);

            // Edge label
            if (e.label) {
                var midX = isLoop ? (fromPos.x + toPos.x)/2 : (x1 + x2) / 2;
                var midY = isLoop ? Math.max(fromPos.y, toPos.y) + 45 : (y1 + y2) / 2 - 10;
                var txt = document.createElementNS(svgNS, 'text');
                txt.setAttribute('x', midX);
                txt.setAttribute('y', midY);
                txt.setAttribute('text-anchor', 'middle');
                txt.setAttribute('font-family', 'Nunito, sans-serif');
                txt.setAttribute('font-size', '12');
                txt.setAttribute('font-weight', '700');
                txt.setAttribute('fill', '#191919');
                var bg = document.createElementNS(svgNS, 'rect');
                bg.setAttribute('x', midX - 18);
                bg.setAttribute('y', midY - 14);
                bg.setAttribute('width', '36');
                bg.setAttribute('height', '18');
                bg.setAttribute('rx', '4');
                bg.setAttribute('fill', '#FBCC00');
                bg.setAttribute('stroke', '#191919');
                bg.setAttribute('stroke-width', '1.5');
                svgEl.appendChild(bg);
                txt.textContent = e.label;
                svgEl.appendChild(txt);
            }
        });

        // 7. Render HTML nodes
        NODES.forEach(function(n) {
            var pos = posMap[n.id];
            if (!pos) return;
            var type = n.type || 'step';
            var dims = getNodeDims(type);
            var el = document.createElement('div');
            el.className = 'comic-fc-node comic-fc-node--' + type;
            el.style.position = 'absolute';
            el.style.left = (pos.x - dims.w / 2) + 'px';
            el.style.top = (pos.y - dims.h / 2) + 'px';
            el.style.width = dims.w + 'px';
            el.style.minHeight = dims.h + 'px';
            el.textContent = n.label;
            nodesEl.appendChild(el);
        });
    })();
    <\/script>`;
}
```

### 12. `COMIC-IMPACT` (Full-Bleed Image Statement)
```js
if (slide.layout === 'COMIC-IMPACT') {
    return `
    <div class="slide comic-pop comic-impact-slide">
        <div class="comic-dot-bg" style="z-index:1;"></div>
        ${slide.image ? `<img class="comic-impact-bg" src="${slide.image}">` : '<div class="comic-impact-bg-placeholder"></div>'}
        <div class="comic-impact-overlay"></div>
        <div class="comic-impact-content">
            <div class="comic-impact-box">
                ${slide.badge ? `<div class="comic-badge comic-badge--impact">${slide.badge}</div>` : ''}
                <p class="comic-impact-statement">${slide.statement || slide.quote || slide.body || ''}</p>
                ${slide.attribution ? `<div class="comic-impact-attribution">— ${slide.attribution}</div>` : ''}
            </div>
        </div>
    </div>`;
}
```

### 13. `COMIC-CLOSING` (Thank You / CTA Slide)
```js
if (slide.layout === 'COMIC-CLOSING') {
    return `
    <div class="slide comic-pop comic-closing-slide">
        <div class="comic-dot-bg comic-dot-bg--dark"></div>
        <div class="comic-closing-card">
            <div class="comic-closing-badge">${slide.badge || '✦ THANK YOU'}</div>
            <h1 class="comic-closing-title">${slide.title}</h1>
            <p class="comic-closing-subtitle">${slide.subtitle || 'Let\'s build something great together.'}</p>
            <div class="comic-closing-divider"></div>
            <div class="comic-closing-meta">${config.presenter} &nbsp;·&nbsp; ${config.date}</div>
        </div>
    </div>`;
}
```

---

## 🎨 Stylesheet Additions for Comic Pop

```css
/* ════════════════════════════════════════════════════════════
   Comic Pop — Marblism-Inspired Neo-Brutalist Template
   Fonts: Bebas Neue (display), Dancing Script (body), Nunito (labels)
   ════════════════════════════════════════════════════════════ */

/* Google Fonts import (injected into HTML head) */
/* @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Dancing+Script:wght@400;600;700&family=Nunito:wght@400;600;700;800&display=swap'); */

/* ── Base slide ── */
.comic-pop {
    font-family: var(--font-body);
    background-color: #FFFDF5;
    color: #191919;
    position: relative;
    box-sizing: border-box;
    overflow: hidden;
}

/* ── Dot background pattern (Marblism signature) ── */
.comic-dot-bg {
    position: absolute;
    top: 0; left: 0; width: 100%; height: 100%;
    z-index: 0; pointer-events: none;
    background-image: radial-gradient(circle, #191919 1px, transparent 1px);
    background-size: 24px 24px;
    opacity: 0.035;
}
.comic-dot-bg--dark {
    background-image: radial-gradient(circle, #FBCC00 1px, transparent 1px);
    opacity: 0.06;
}

/* ── Content wrapper ── */
.comic-content {
    padding: 56px 72px 48px 72px;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    position: relative;
    z-index: 2;
}

/* ── Badge / Section tag ── */
.comic-badge {
    align-self: flex-start;
    font-family: 'Nunito', sans-serif;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #191919;
    background: #FBCC00;
    border: 2px solid #191919;
    border-radius: 4px;
    padding: 4px 12px;
    margin-bottom: 14px;
    box-shadow: 2px 2px 0 #191919;
    line-height: 1.4;
}
.comic-badge-lg {
    align-self: flex-start;
    font-family: 'Nunito', sans-serif;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #191919;
    background: #FBCC00;
    border: 2.5px solid #191919;
    border-radius: 6px;
    padding: 6px 16px;
    margin-bottom: 20px;
    box-shadow: 3px 3px 0 #191919;
}

/* ── Titles ── */
.comic-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 42px;
    font-weight: 400; /* Bebas Neue is always bold by design */
    color: #191919;
    margin: 0 0 24px 0;
    border: none !important;
    padding-left: 0 !important;
    line-height: 1.05;
    letter-spacing: 0.5px;
}
.comic-cover-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 56px;
    line-height: 1.1;
    font-weight: 400;
    color: #191919;
    line-height: 1.0;
    margin: 0 0 16px 0;
    border: none !important;
    padding-left: 0 !important;
    letter-spacing: 1px;
}
.comic-cover-subtitle {
    font-family: 'Dancing Script', cursive;
    font-size: 24px;
    font-weight: 600;
    color: #404040;
    margin: 0 0 24px 0;
    line-height: 1.4;
}
.comic-cover-meta {
    font-family: 'Nunito', sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 1px;
    color: #404040;
    border-top: 2px solid #191919;
    padding-top: 12px;
    margin-top: auto;
    display: inline-block;
}

/* ── Cover layout ── */
.comic-cover-layout {
    display: flex;
    gap: 48px;
    height: 100%;
    align-items: center;
    padding: 60px 72px;
    position: relative;
    z-index: 2;
    box-sizing: border-box;
}
.comic-cover-left {
    flex: 1.1;
    display: flex;
    flex-direction: column;
    justify-content: center;
}
.comic-cover-right {
    flex: 0.9;
    height: 520px;
}
.comic-cover-stripe {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 8px;
    background: #191919;
    z-index: 3;
}

/* ── Image cards (comic-style hard shadow) ── */
.comic-img-card {
    width: 100%;
    height: 100%;
    border: 2.5px solid #191919;
    border-radius: 12px;
    box-shadow: 6px 6px 0 #191919;
    overflow: hidden;
    background: #FFF8D6;
}
.comic-img-card-sm {
    border-radius: 10px;
    box-shadow: 4px 4px 0 #191919;
}
.comic-img-fill {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}
.comic-img-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #FFF8D6;
}
.comic-placeholder-icon {
    font-size: 48px;
    color: #FBCC00;
    text-shadow: 2px 2px 0 #191919;
}

/* ── Generic comic card (for standalone components) ── */
.comic-card {
    background: #FFFFFF;
    border: 2.5px solid #191919;
    border-radius: 12px;
    box-shadow: 4px 4px 0 #191919;
    padding: 24px;
}
.comic-card--yellow {
    background: #FBCC00;
}
.comic-card--cream {
    background: #FFF8D6;
}

/* ── Lists ── */
.comic-list {
    list-style: none;
    padding: 0; margin: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.comic-list li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-family: 'Dancing Script', cursive;
    font-size: 19px;
    font-weight: 600;
    line-height: 1.35;
    color: #191919;
    padding-left: 0 !important;
    margin-bottom: 0 !important;
}
.comic-list li::before {
    display: none !important;
}
.comic-bullet-dot {
    color: #FBCC00;
    font-size: 14px;
    line-height: 1.6;
    flex-shrink: 0;
    text-shadow: 1px 1px 0 #191919;
}
.comic-bullet-num {
    font-family: 'Nunito', sans-serif;
    font-size: 13px;
    font-weight: 800;
    background: #FBCC00;
    color: #191919;
    border: 2px solid #191919;
    border-radius: 4px;
    padding: 2px 6px;
    min-width: 28px;
    text-align: center;
    box-shadow: 2px 2px 0 #191919;
    flex-shrink: 0;
}
.comic-bullet-text {
    flex: 1;
}

/* ── Body text ── */
.comic-body-lead {
    font-family: 'Dancing Script', cursive;
    font-size: 21px;
    font-weight: 600;
    color: #191919;
    line-height: 1.45;
    margin: 0 0 16px 0;
}

/* ── Glance layout ── */
.comic-glance-grid {
    display: flex;
    gap: 40px;
    flex: 1;
    min-height: 0;
}
.comic-glance-left {
    flex: 0.9;
}
.comic-glance-right {
    flex: 1.1;
    display: flex;
    align-items: center;
}

/* ── Stats layout ── */
.comic-stats-row {
    display: flex;
    gap: 20px;
    flex: 1;
    align-items: stretch;
}
.comic-stat-card {
    flex: 1;
    background: #FFFFFF;
    border: 2.5px solid #191919;
    border-radius: 12px;
    box-shadow: 4px 4px 0 #191919;
    padding: 28px 24px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    position: relative;
    overflow: hidden;
}
.comic-stat-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 5px;
    background: #191919;
}
.comic-stat-card--yellow {
    background: #FBCC00;
}
.comic-stat-value {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 52px;
    line-height: 1.1;
    font-weight: 400;
    color: #191919;
    line-height: 1.0;
    letter-spacing: 0.5px;
}
.comic-stat-card--yellow .comic-stat-value {
    color: #191919;
}
.comic-stat-label {
    font-family: 'Nunito', sans-serif;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #191919;
}
.comic-stat-desc {
    font-family: 'Dancing Script', cursive;
    font-size: 16px;
    font-weight: 500;
    color: #404040;
    line-height: 1.4;
}

/* ── Split layout ── */
.comic-split-layout {
    display: flex;
    gap: 40px;
    flex: 1;
    min-height: 0;
}
.comic-split-text {
    flex: 1.1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 16px;
}
.comic-split-visual {
    flex: 0.9;
}

/* ── Quote layout ── */
.comic-quote-slide {
    display: flex;
    align-items: center;
    justify-content: center;
}
.comic-quote-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 60px;
    position: relative;
    z-index: 2;
    gap: 24px;
}
.comic-quote-box {
    background: #FFFFFF;
    border: 2.5px solid #191919;
    border-radius: 16px;
    box-shadow: 6px 6px 0 #191919;
    padding: 52px 60px 44px 60px;
    max-width: 950px;
    text-align: center;
    position: relative;
}
.comic-quote-mark {
    position: absolute;
    top: -5px;
    left: 40px;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 60px;
    color: #FBCC00;
    line-height: 1;
    text-shadow: 3px 3px 0 #191919;
}
.comic-quote-text {
    font-family: 'Dancing Script', cursive;
    font-size: 30px;
    font-weight: 700;
    color: #191919;
    line-height: 1.4;
    margin: 0 0 20px 0;
    position: relative;
    z-index: 2;
}
.comic-quote-author {
    font-family: 'Nunito', sans-serif;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 1px;
    color: #404040;
    text-transform: uppercase;
}
.comic-quote-context {
    font-family: 'Dancing Script', cursive;
    font-size: 17px;
    font-weight: 500;
    color: #404040;
    text-align: center;
}

/* ── Flow / Pipeline layout ── */
.comic-flow-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 -10px;
    overflow: hidden;
    flex-wrap: nowrap;
    width: 100%;
    flex: 1;
    padding-top: 2px;
}
.comic-flow-node {
    flex: 1 1 0;
    min-width: 0;
    padding: 0 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    position: relative;
}
.comic-flow-num {
    font-family: 'Nunito', sans-serif;
    font-size: 11px;
    font-weight: 800;
    color: #404040;
    letter-spacing: 1px;
}
.comic-flow-card {
    background: #FFFFFF;
    border: 2.5px solid #191919;
    border-radius: 10px;
    box-shadow: 3px 3px 0 #191919;
    padding: 4px 6px;
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.comic-flow-card--yellow {
    background: #FFF8D6;
}
.comic-flow-heading {
    font-family: 'Nunito', sans-serif;
    font-size: 13px;
    font-weight: 800;
    color: #191919;
    line-height: 1.2;
}
.comic-flow-text {
    font-family: 'Dancing Script', cursive;
    font-size: 15px;
    font-weight: 500;
    color: #404040;
    line-height: 1.3;
}
.comic-flow-arrow {
    font-size: 24px;
    color: #FBCC00;
    text-shadow: 1px 1px 0 #191919;
    font-weight: 900;
    position: absolute;
    right: 0px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 3;
}

/* ── Chart layouts ── */
.comic-chart-full {
    flex: 1;
    min-height: 0;
    position: relative;
    background: #FFFFFF;
    border: 2.5px solid #191919;
    border-radius: 12px;
    box-shadow: 4px 4px 0 #191919;
    padding: 16px;
    margin-top: 4px;
}
.comic-chart-source {
    font-family: 'Nunito', sans-serif;
    font-size: 11px;
    font-weight: 600;
    color: #404040;
    text-align: right;
    margin-top: 8px;
    letter-spacing: 0.5px;
}
.comic-split-chart-layout {
    display: flex;
    gap: 32px;
    flex: 1;
    min-height: 0;
}
.comic-split-chart-left {
    width: 38%;
    display: flex;
    flex-direction: column;
    justify-content: center;
}
.comic-split-chart-right {
    flex: 1;
    min-height: 0;
    position: relative;
    background: #FFFFFF;
    border: 2.5px solid #191919;
    border-radius: 12px;
    box-shadow: 4px 4px 0 #191919;
    padding: 16px;
}

/* ── Icon grid layout ── */
.comic-icon-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
    flex: 1;
    align-content: stretch;
}
.comic-icon-card {
    background: #FFFFFF;
    border: 2.5px solid #191919;
    border-radius: 12px;
    box-shadow: 4px 4px 0 #191919;
    padding: 22px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.comic-icon-card--yellow {
    background: #FFF8D6;
}
.comic-icon-symbol {
    font-size: 30px;
    line-height: 1;
    filter: drop-shadow(1px 1px 0 #191919);
}
.comic-icon-heading {
    font-family: 'Nunito', sans-serif;
    font-size: 15px;
    font-weight: 800;
    color: #191919;
    line-height: 1.2;
}
.comic-icon-text {
    font-family: 'Dancing Script', cursive;
    font-size: 16px;
    font-weight: 500;
    color: #404040;
    line-height: 1.35;
}

/* ── Compare layout ── */
.comic-compare-row {
    display: flex;
    gap: 0;
    flex: 1;
    align-items: stretch;
    position: relative;
}
.comic-compare-panel {
    flex: 1;
    background: #FFFFFF;
    border: 2.5px solid #191919;
    border-radius: 12px;
    box-shadow: 4px 4px 0 #191919;
    padding: 28px 26px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.comic-compare-panel--yellow {
    background: #FFF8D6;
    margin-left: 40px;
}
.comic-compare-header {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 28px;
    color: #191919;
    border-bottom: 2.5px solid #191919;
    padding-bottom: 10px;
    line-height: 1;
}
.comic-vs-badge {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 5;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 22px;
    background: #FBCC00;
    border: 2.5px solid #191919;
    border-radius: 50%;
    width: 44px; height: 44px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 3px 3px 0 #191919;
    color: #191919;
}

/* ── Flowchart layout ── */
.comic-flowchart-container {
    flex: 1;
    min-height: 0;
    position: relative;
    width: 100%;
}
/* Node base styles */
.comic-fc-node {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-family: 'Dancing Script', cursive;
    font-size: 14px;
    font-weight: 700;
    color: #191919;
    background: #FFFFFF;
    border: 2.5px solid #191919;
    border-radius: 8px;
    box-shadow: 3px 3px 0 #191919;
    padding: 6px 10px;
    box-sizing: border-box;
    line-height: 1.25;
    z-index: 10;
}
.comic-fc-node--start {
    background: #FBCC00;
    border-radius: 50px;
    font-family: 'Nunito', sans-serif;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 1px;
    text-transform: uppercase;
}
.comic-fc-node--end {
    background: #191919;
    color: #FBCC00;
    border-radius: 50px;
    font-family: 'Nunito', sans-serif;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 1px;
    text-transform: uppercase;
}
.comic-fc-node--decision {
    background: #FFF8D6;
    border-radius: 0;
    clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
    box-shadow: none;
    border: none;
    padding: 14px 20px;
    font-family: 'Nunito', sans-serif;
    font-size: 11px;
    font-weight: 800;
}
/* Decision nodes use a wrapper that renders as diamond */
.comic-fc-node--decision::after {
    content: '';
    position: absolute;
    inset: -3px;
    clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
    border: 2.5px solid #191919;
    z-index: -1;
}

/* ── Impact layout ── */
.comic-impact-slide {
    position: relative;
    overflow: hidden;
}
.comic-impact-bg {
    position: absolute;
    top: 0; left: 0; width: 100%; height: 100%;
    object-fit: cover;
    z-index: 1;
    filter: brightness(0.65) contrast(1.2);
}
.comic-impact-bg-placeholder {
    position: absolute;
    top: 0; left: 0; width: 100%; height: 100%;
    background: #191919;
    z-index: 1;
}
.comic-impact-overlay {
    position: absolute;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(25, 25, 25, 0.55);
    z-index: 2;
}
.comic-impact-content {
    position: relative;
    z-index: 5;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 60px;
}
.comic-impact-box {
    background: rgba(255, 253, 245, 0.95);
    border: 2.5px solid #191919;
    border-radius: 16px;
    box-shadow: 6px 6px 0 rgba(25,25,25,0.7);
    padding: 48px 56px;
    max-width: 900px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
}
.comic-badge--impact {
    font-size: 11px;
    margin-bottom: 0;
}
.comic-impact-statement {
    font-family: 'Dancing Script', cursive;
    font-size: 34px;
    font-weight: 700;
    color: #191919;
    line-height: 1.35;
    margin: 0;
}
.comic-impact-attribution {
    font-family: 'Nunito', sans-serif;
    font-size: 13px;
    font-weight: 700;
    color: #404040;
    letter-spacing: 1px;
}

/* ── Closing layout ── */
.comic-closing-slide {
    background: #191919 !important;
    display: flex;
    align-items: center;
    justify-content: center;
}
.comic-closing-card {
    background: #FFFDF5;
    border: 2.5px solid #FBCC00;
    border-radius: 20px;
    box-shadow: 8px 8px 0 rgba(251,204,0,0.5);
    padding: 56px 72px;
    max-width: 800px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    position: relative;
    z-index: 2;
}
.comic-closing-badge {
    font-family: 'Nunito', sans-serif;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #191919;
    background: #FBCC00;
    border: 2px solid #191919;
    border-radius: 4px;
    padding: 5px 14px;
    box-shadow: 2px 2px 0 #191919;
}
.comic-closing-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 48px;
    line-height: 1.1;
    font-weight: 400;
    color: #191919;
    margin: 0 !important;
    border: none !important;
    padding-left: 0 !important;
    line-height: 1.0;
    letter-spacing: 1px;
}
.comic-closing-subtitle {
    font-family: 'Dancing Script', cursive;
    font-size: 26px;
    font-weight: 600;
    color: #404040;
    margin: 0;
    line-height: 1.4;
}
.comic-closing-divider {
    width: 80px;
    height: 3px;
    background: #FBCC00;
    border: 1px solid #191919;
    border-radius: 2px;
    margin: 8px auto;
}
.comic-closing-meta {
    font-family: 'Nunito', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: #404040;
    letter-spacing: 0.5px;
}

/* ── Flex center utility ── */
.flex-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}
```

---

## 📷 Image Generation Instructions (Google Imagen / Gemini Only)

**No Pinterest. No Unsplash.** All images for this template MUST be generated via the Gemini API using `GEMINI_API_KEY`.

When generating image prompts for this template, use the following base style appended to every keyword:

```
"[TOPIC KEYWORD], bold flat vector illustration, thick black ink outlines 2-3px, vibrant colors with yellow #FBCC00 accent, warm cream background #FFFDF5, neo-brutalist graphic design, comic book inspired, professional business style, clean composition, no photorealism, no gradients, Marblism brand aesthetic"
```

Examples by topic type:
- **Technology**: `"AI robot assistant, bold flat vector illustration, thick ink outlines, yellow and black color scheme, comic book style, white background"`
- **Business**: `"Team collaboration meeting, bold flat illustration, thick ink outlines, warm cream background, professional comic-book business style"`
- **Finance**: `"Growth chart and coins, bold flat illustration, yellow accent, thick ink outlines, neo-brutalist design"`
- **Health**: `"Human wellness concept, bold flat vector, thick outlines, vibrant but clean, comic book healthcare illustration"`

The `scrape_images.js` script will automatically use Gemini to generate images since Pinterest/Unsplash will return 0 results when the `--rich-prompt` flag includes these unique style descriptors.

---

## 📋 Copy Style Rules

1. **Cover titles**: All-caps, punchy, 3–6 words max.
2. **Subtitles**: Sentence-case, warm and conversational (Dancing Script suits this).
3. **Bullet points**: Start with a strong verb or noun. Keep to 1–2 lines max.
4. **Stats**: Large numbers only. Labels in ALL CAPS via Nunito.
5. **Flowchart labels**: Short — max 4 words per node. Decision nodes must be yes/no questions.
6. **Impact statements**: Quotation-style, punchy, attributable to a source if possible.

---

## ✅ QA Rules (template-specific)

- ✅ Every card must have `box-shadow: N N 0 #191919` (hard shadow, no blur)
- ✅ Dot background must be visible but subtle (opacity 0.035 max)
- ✅ Body text is always `Dancing Script`, cursive
- ✅ Labels/badges always `Nunito`, sans-serif
- ✅ Titles always `Bebas Neue`, sans-serif
- ✅ No more than 1 pure yellow card background per row
- ✅ All flowchart nodes must be positioned without overlap
- ✅ Flowchart edges must have arrowheads
- ✅ `#FBCC00` used consistently — never replaced with other yellows
